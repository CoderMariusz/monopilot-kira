import { randomUUID } from 'node:crypto';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';

export const COMPLIANCE_DOC_WRITE_PERMISSION = 'npd.compliance_doc.write';
export const COMPLIANCE_DOC_MAX_BYTES = 20 * 1024 * 1024;
export const COMPLIANCE_DOC_SIGNED_URL_TTL_SECONDS = 900;
export const COMPLIANCE_DOC_APP_VERSION = 'compliance-doc-actions-v1';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_DOC_TYPES = new Set(['CoA', 'SDS', 'Spec', 'Cert', 'Other']);

export type QueryResult<T> = { rows: T[]; rowCount?: number | null };
export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type StorageOperationResult<T = unknown> = Promise<{ data: T | null; error: unknown }>;
type ComplianceDocsStorageClient = {
  storage: {
    createBucket(
      bucket: string,
      options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] },
    ): StorageOperationResult<{ name: string }>;
    from(bucket: string): {
      upload(
        path: string,
        body: ArrayBuffer,
        options: { contentType: string; upsert: boolean },
      ): StorageOperationResult<{ path: string }>;
      remove(paths: string[]): StorageOperationResult;
      createSignedUrl(path: string, expiresIn: number): StorageOperationResult<{ signedUrl: string }>;
    };
  };
};

export type ComplianceDocDto = {
  id: string;
  productCode: string;
  docType: string;
  title: string;
  mimeType: string;
  fileSizeBytes: number;
  versionNumber: number;
  expiresAt: string | null;
  uploadedAt: string;
  uploadedByUser: string;
};

export type UploadDocResult =
  | { ok: true; docId: string; versionNumber: number }
  | {
      ok: false;
      code:
        | 'INVALID_INPUT'
        | 'FILE_TOO_LARGE'
        | 'UNSUPPORTED_MIME_TYPE'
        | 'FORBIDDEN'
        | 'PRODUCT_NOT_FOUND'
        | 'STORAGE_FAILED'
        | 'PERSISTENCE_FAILED';
    };

type ParsedUploadDoc = {
  productCode: string;
  docType: string;
  title: string;
  file: File;
  mimeType: string;
  fileSizeBytes: number;
  expiresAt: string | null;
};

export async function uploadDoc(formData: FormData): Promise<UploadDocResult> {
  'use server';

  const parsed = parseUploadDoc(formData);
  if (!parsed.ok) return parsed.result;

  return withOrgContext<UploadDocResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;

    try {
      if (!(await hasComplianceDocWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const product = await queryClient.query<{ product_code: string }>(
        `select product_code
           from public.product
          where org_id = app.current_org_id()
            and product_code = $1
          limit 1`,
        [parsed.value.productCode],
      );
      if (!product.rows[0]) return { ok: false, code: 'PRODUCT_NOT_FOUND' };

      const nextVersion = await queryClient.query<{ version_number: number }>(
        `select coalesce(max(version_number), 0) + 1 as version_number
           from public.compliance_docs
          where org_id = app.current_org_id()
            and product_code = $1
            and doc_type = $2`,
        [parsed.value.productCode, parsed.value.docType],
      );
      const versionNumber = Number(nextVersion.rows[0]?.version_number ?? 1);
      const docId = randomUUID();
      const filePath = buildFilePath(parsed.value, docId, versionNumber);
      const bucket = complianceDocsBucket(orgId);

      const storageAdmin = await createComplianceDocsStorageAdmin();
      await ensureComplianceDocsBucket(storageAdmin, bucket);
      const bytes = await parsed.value.file.arrayBuffer();
      const { error: storageError } = await storageAdmin.storage
        .from(bucket)
        .upload(filePath, bytes, {
          contentType: parsed.value.mimeType,
          upsert: false,
        });
      if (storageError) return { ok: false, code: 'STORAGE_FAILED' };

      let inserted: QueryResult<{ id: string; version_number: number }>;
      try {
        inserted = await queryClient.query<{ id: string; version_number: number }>(
          `insert into public.compliance_docs
             (id, org_id, product_code, doc_type, title, file_path, mime_type,
              file_size_bytes, version_number, expires_at, uploaded_by_user,
              created_by_user, app_version)
           values
             ($1::uuid, app.current_org_id(), $2, $3, $4, $5, $6,
              $7::bigint, $8::integer, $9::date, $10::uuid, $10::uuid, $11)
           returning id, version_number`,
          [
            docId,
            parsed.value.productCode,
            parsed.value.docType,
            parsed.value.title,
            filePath,
            parsed.value.mimeType,
            parsed.value.fileSizeBytes,
            versionNumber,
            parsed.value.expiresAt,
            userId,
            COMPLIANCE_DOC_APP_VERSION,
          ],
        );
      } catch (error) {
        await deleteUploadedComplianceDoc(storageAdmin, bucket, filePath);
        throw error;
      }
      const row = inserted.rows[0];
      if (!row) {
        await deleteUploadedComplianceDoc(storageAdmin, bucket, filePath);
        return { ok: false, code: 'PERSISTENCE_FAILED' };
      }

      await emitComplianceDocOutbox(queryClient, {
        orgId,
        eventType: 'compliance_doc.uploaded',
        docId: row.id,
        productCode: parsed.value.productCode,
        actorUserId: userId,
        payload: {
          doc_type: parsed.value.docType,
          version_number: row.version_number,
          mime_type: parsed.value.mimeType,
          file_size_bytes: parsed.value.fileSizeBytes,
        },
      });

      revalidateLocalized(`/npd/fg/${parsed.value.productCode}/docs`, 'page');
      return { ok: true, docId: row.id, versionNumber: row.version_number };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILED' };
    }
  });
}

async function ensureComplianceDocsBucket(admin: ComplianceDocsStorageClient, bucket: string): Promise<void> {
  const { error } = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: COMPLIANCE_DOC_MAX_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  });
  if (error && !isBucketAlreadyExistsError(error)) throw error;
}

export async function createComplianceDocsStorageAdmin(): Promise<ComplianceDocsStorageClient> {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function isBucketAlreadyExistsError(error: unknown): boolean {
  const candidate = error as { statusCode?: string | number; status?: string | number; message?: string; name?: string };
  const status = String(candidate.statusCode ?? candidate.status ?? '');
  const message = String(candidate.message ?? candidate.name ?? '').toLowerCase();
  return status === '409' || message.includes('already exists') || message.includes('duplicate');
}

async function deleteUploadedComplianceDoc(
  supabase: ComplianceDocsStorageClient,
  bucket: string,
  filePath: string,
): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([filePath]);
  } catch {
    // Preserve the DB persistence failure result; cleanup is best-effort.
  }
}

function parseUploadDoc(formData: FormData | null | undefined): { ok: true; value: ParsedUploadDoc } | { ok: false; result: UploadDocResult } {
  if (!formData || typeof formData.get !== 'function') return { ok: false, result: { ok: false, code: 'INVALID_INPUT' } };
  const productCode = normalizeText(formData.get('productCode'));
  const docType = normalizeText(formData.get('docType'));
  const title = normalizeText(formData.get('title'));
  const file = formData.get('file');
  const expiresAt = normalizeOptionalDate(formData.get('expiresAt'));

  if (!productCode || !docType || !title || !file || !(file instanceof File)) {
    return { ok: false, result: { ok: false, code: 'INVALID_INPUT' } };
  }
  if (!ALLOWED_DOC_TYPES.has(docType) || title.length < 3 || title.length > 300) {
    return { ok: false, result: { ok: false, code: 'INVALID_INPUT' } };
  }
  if (file.size > COMPLIANCE_DOC_MAX_BYTES) return { ok: false, result: { ok: false, code: 'FILE_TOO_LARGE' } };
  if (file.size <= 0) return { ok: false, result: { ok: false, code: 'INVALID_INPUT' } };
  if (!ALLOWED_MIME_TYPES.has(file.type)) return { ok: false, result: { ok: false, code: 'UNSUPPORTED_MIME_TYPE' } };
  if (expiresAt === false) return { ok: false, result: { ok: false, code: 'INVALID_INPUT' } };

  return {
    ok: true,
    value: {
      productCode,
      docType,
      title,
      file,
      mimeType: file.type,
      fileSizeBytes: file.size,
      expiresAt,
    },
  };
}

export async function hasComplianceDocWritePermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, COMPLIANCE_DOC_WRITE_PERMISSION],
  );
  return (rowCount ?? rows.length) > 0;
}

export function complianceDocsBucket(orgId: string): string {
  return `org-${orgId}-compliance-docs`;
}

export function mapDocRow(row: {
  id: string;
  product_code: string;
  doc_type: string;
  title: string;
  mime_type: string;
  file_size_bytes: number | string;
  version_number: number;
  expires_at: string | null;
  uploaded_at: string;
  uploaded_by_user: string;
}): ComplianceDocDto {
  return {
    id: row.id,
    productCode: row.product_code,
    docType: row.doc_type,
    title: row.title,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    versionNumber: row.version_number,
    expiresAt: row.expires_at,
    uploadedAt: row.uploaded_at,
    uploadedByUser: row.uploaded_by_user,
  };
}

export async function emitComplianceDocOutbox(
  client: QueryClient,
  input: {
    orgId: string;
    eventType: 'compliance_doc.uploaded' | 'compliance_doc.deleted';
    docId: string;
    productCode: string;
    actorUserId: string;
    payload: Record<string, unknown>;
  },
) {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'compliance_doc', $3, $4::jsonb, $5)`,
    [
      input.orgId,
      input.eventType,
      input.docId,
      JSON.stringify({
        org_id: input.orgId,
        product_code: input.productCode,
        compliance_doc_id: input.docId,
        actor_user_id: input.actorUserId,
        ...input.payload,
      }),
      COMPLIANCE_DOC_APP_VERSION,
    ],
  );
}

function buildFilePath(input: ParsedUploadDoc, docId: string, versionNumber: number): string {
  return [
    sanitizePathSegment(input.productCode),
    sanitizePathSegment(input.docType),
    `v${versionNumber}`,
    `${docId}-${sanitizePathSegment(input.file.name || 'document')}`,
  ].join('/');
}

function normalizeText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDate(value: FormDataEntryValue | null): string | null | false {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : false;
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}
