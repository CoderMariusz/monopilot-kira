'use server';

import { createHash } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ITEMS_EDIT_PERMISSION,
  type OrgActionContext,
  type QueryClient,
} from './shared';

const SUPPLIER_SPEC_DOC_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type StorageOperationResult<T = unknown> = Promise<{ data: T | null; error: unknown }>;
type SupplierSpecStorageClient = {
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
    };
  };
};

type ParsedUpload = {
  specId: string;
  file: Blob;
  filename: string;
  mimeType: string;
};

export async function uploadSupplierSpecDoc(
  formData: FormData,
): Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }> {
  const parsed = await parseSupplierSpecDocUpload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return withOrgContext(async ({ userId, orgId, client }) => {
    const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };

    try {
      if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const existing = await ctx.client.query<{ id: string }>(
        `select id
           from public.supplier_specs
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [parsed.value.specId],
      );
      if (!existing.rows[0]) return { ok: false, error: 'not found' };

      const bytes = await parsed.value.file.arrayBuffer();
      const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
      const bucket = supplierSpecDocsBucket(orgId);
      const filePath = buildSupplierSpecDocPath(parsed.value.specId, parsed.value.filename);
      const url = `${bucket}/${filePath}`;

      const storageAdmin = await createSupplierSpecDocsStorageAdmin();
      await ensureSupplierSpecDocsBucket(storageAdmin, bucket);
      const { error: storageError } = await storageAdmin.storage.from(bucket).upload(filePath, bytes, {
        contentType: parsed.value.mimeType,
        upsert: false,
      });
      if (storageError) return { ok: false, error: 'storage failed' };

      const updated = await ctx.client.query<{ id: string }>(
        `update public.supplier_specs
            set spec_document_url = $2,
                document_sha256 = $3,
                document_mime_type = $4,
                uploaded_at = pg_catalog.now(),
                uploaded_by = $5::uuid
          where id = $1::uuid
            and org_id = (select app.current_org_id())
          returning id`,
        [parsed.value.specId, url, sha256, parsed.value.mimeType, userId],
      );
      if (!updated.rows[0]) {
        await deleteUploadedSupplierSpecDoc(storageAdmin, bucket, filePath);
        return { ok: false, error: 'not found' };
      }

      return { ok: true, data: { url } };
    } catch {
      return { ok: false, error: 'persistence failed' };
    }
  });
}

async function parseSupplierSpecDocUpload(
  formData: FormData | null | undefined,
): Promise<{ ok: true; value: ParsedUpload } | { ok: false; error: string }> {
  if (!formData || typeof formData.get !== 'function') return { ok: false, error: 'invalid input' };

  const specId = normalizeText(formData.get('specId'));
  const file = formData.get('file');
  if (!specId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(specId)) {
    return { ok: false, error: 'invalid input' };
  }
  if (!isBlob(file)) return { ok: false, error: 'invalid input' };
  if (file.size > SUPPLIER_SPEC_DOC_MAX_BYTES) return { ok: false, error: 'file too large' };
  if (file.size <= 0) return { ok: false, error: 'invalid input' };

  const mimeType = file.type || (await sniffMimeType(file));
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return { ok: false, error: 'unsupported mime type' };

  return {
    ok: true,
    value: {
      specId,
      file,
      filename: typeof File !== 'undefined' && file instanceof File ? file.name : 'document',
      mimeType,
    },
  };
}

async function createSupplierSpecDocsStorageAdmin(): Promise<SupplierSpecStorageClient> {
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

async function ensureSupplierSpecDocsBucket(admin: SupplierSpecStorageClient, bucket: string): Promise<void> {
  const { error } = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: SUPPLIER_SPEC_DOC_MAX_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  });
  if (error && !isBucketAlreadyExistsError(error)) throw error;
}

async function deleteUploadedSupplierSpecDoc(
  supabase: SupplierSpecStorageClient,
  bucket: string,
  filePath: string,
): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([filePath]);
  } catch {
    // Preserve the action result; cleanup is best-effort.
  }
}

function supplierSpecDocsBucket(orgId: string): string {
  return `org-${orgId}-supplier-specs`;
}

function buildSupplierSpecDocPath(specId: string, filename: string): string {
  return `${specId}/${Date.now()}-${sanitizePathSegment(filename || 'document')}`;
}

function normalizeText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isBlob(value: FormDataEntryValue | null): value is File {
  // FormDataEntryValue is string | File; a non-string entry is a File (which is a Blob at runtime).
  // Predicate narrows to File (assignable to the param type — Blob is not, TS2677).
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

async function sniffMimeType(file: Blob): Promise<string> {
  if (file.type) return file.type;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'application/octet-stream';
}

function isBucketAlreadyExistsError(error: unknown): boolean {
  const candidate = error as { statusCode?: string | number; status?: string | number; message?: string; name?: string };
  const status = String(candidate.statusCode ?? candidate.status ?? '');
  const message = String(candidate.message ?? candidate.name ?? '').toLowerCase();
  return status === '409' || message.includes('already exists') || message.includes('duplicate');
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}
