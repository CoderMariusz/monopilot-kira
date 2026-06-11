/**
 * NPD storage backends — shared (non-'use server') helper.
 *
 * Single source of truth for the `npd-attachments` bucket contract used by the
 * brief "+ Upload" attachments and the packaging artwork versions:
 *
 *   bucket  : npd-attachments (PRIVATE; migration 279 creates it + RLS policies)
 *   paths   : <org_id>/briefs/<projectId>/<uuid>-<filename>
 *             <org_id>/artwork/<projectId>/v<N>-<uuid>-<filename>
 *
 * The org segment is ALWAYS taken from withOrgContext's verified orgId inside
 * the Server Actions — never from client input — so the service-role client
 * can never be steered outside the caller's org. storage.objects RLS policies
 * (mig 279) additionally pin the first path segment to the caller's org via a
 * public.users membership lookup (defense-in-depth; service_role bypasses RLS).
 *
 * Versioning (artwork): the `v<N>-` object-name prefix is the version. The
 * CURRENT version is simply the highest N — there is no set-current action
 * (deleting the newest falls back to the previous one). Documented decision:
 * cheapest scheme that satisfies "Preview / New version / history".
 *
 * Per the 'use server' export rule (MON-t2-api) every non-async export
 * (constants, types, sync utils) lives here and is imported by the action files.
 */

export const NPD_ATTACHMENTS_BUCKET = 'npd-attachments';
export const NPD_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB (bucket limit, mig 279)
export const NPD_SIGNED_URL_TTL_SECONDS = 900; // 15 min — short-lived download links

/** Brief attachments: pdf / png / jpg / docx / xlsx. */
export const BRIEF_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Packaging artwork: pdf / png / jpg (previewable subset = images). */
export const ARTWORK_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
export const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

// ─── Minimal structural contracts (driver-agnostic, mock-friendly) ────────────
export type QueryResult<T> = { rows: T[]; rowCount?: number | null };
export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type StorageOp<T = unknown> = Promise<{ data: T | null; error: unknown }>;

export type StorageObjectEntry = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
};

export type NpdStorageClient = {
  storage: {
    createBucket(
      bucket: string,
      options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] },
    ): StorageOp<{ name: string }>;
    from(bucket: string): {
      upload(
        path: string,
        body: ArrayBuffer,
        options: { contentType: string; upsert: boolean },
      ): StorageOp<{ path: string }>;
      remove(paths: string[]): StorageOp;
      list(
        prefix: string,
        options?: { limit?: number; sortBy?: { column: string; order: 'asc' | 'desc' } },
      ): StorageOp<StorageObjectEntry[]>;
      createSignedUrl(path: string, expiresIn: number): StorageOp<{ signedUrl: string }>;
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): StorageOp<Array<{ path: string | null; signedUrl: string; error?: string | null }>>;
    };
  };
};

/**
 * Service-role storage client (mirrors the compliance-docs pattern). The
 * service key NEVER leaves the server; org scoping is enforced by the path
 * builders below fed from withOrgContext's verified orgId.
 */
export async function createNpdStorageAdmin(): Promise<NpdStorageClient> {
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
  ) as unknown as NpdStorageClient;
}

/**
 * Self-healing bucket creation (idempotent; swallows already-exists). Migration
 * 279 is the canonical creator — this only covers environments where 279 has
 * not landed yet (preview branches), mirroring ensureComplianceDocsBucket.
 */
export async function ensureNpdAttachmentsBucket(admin: NpdStorageClient): Promise<void> {
  const { error } = await admin.storage.createBucket(NPD_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: NPD_ATTACHMENT_MAX_BYTES,
    allowedMimeTypes: Array.from(
      new Set([...BRIEF_ATTACHMENT_MIME_TYPES, ...ARTWORK_MIME_TYPES]),
    ),
  });
  if (error && !isBucketAlreadyExistsError(error)) throw error;
}

export function isBucketAlreadyExistsError(error: unknown): boolean {
  const candidate = error as {
    statusCode?: string | number;
    status?: string | number;
    message?: string;
    name?: string;
  };
  const status = String(candidate?.statusCode ?? candidate?.status ?? '');
  const message = String(candidate?.message ?? candidate?.name ?? '').toLowerCase();
  return status === '409' || message.includes('already exists') || message.includes('duplicate');
}

// ─── Path contract ────────────────────────────────────────────────────────────
export function briefAttachmentsPrefix(orgId: string, projectId: string): string {
  return `${orgId}/briefs/${projectId}`;
}

export function artworkPrefix(orgId: string, projectId: string): string {
  return `${orgId}/artwork/${projectId}`;
}

/** Single path segment, lowercased, no separators — never lets input escape the prefix. */
export function sanitizeFileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
  );
}

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const ARTWORK_VERSION_RE = /^v(\d+)-/;

/** `<uuid>-name.pdf` → `name.pdf` (display name for brief attachments). */
export function displayFileName(objectName: string): string {
  return objectName.replace(UUID_PREFIX_RE, '');
}

/** `v3-<uuid>-name.png` → { version: 3, fileName: 'name.png' } (null when unparsable). */
export function parseArtworkObjectName(
  objectName: string,
): { version: number; fileName: string } | null {
  const match = ARTWORK_VERSION_RE.exec(objectName);
  if (!match) return null;
  const version = Number(match[1]);
  if (!Number.isInteger(version) || version < 1) return null;
  return { version, fileName: displayFileName(objectName.slice(match[0].length)) };
}

/**
 * Object names handed back by clients (delete targets) must be a SINGLE path
 * segment that we plausibly minted — rejects traversal / cross-prefix tricks.
 */
export function isSafeObjectName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 300 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('..') &&
    value.trim() === value
  );
}

/**
 * RBAC gate — identical SQL to the packaging/compliance actions (checks BOTH
 * the normalized role_permissions table AND the legacy roles.permissions jsonb).
 */
export async function hasNpdPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

/** Org-scoped project existence check (RLS already scopes; not_found surface). */
export async function projectExistsInOrg(client: QueryClient, projectId: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `select id from public.npd_projects
      where id = $1::uuid and org_id = app.current_org_id() limit 1`,
    [projectId],
  );
  return rows.length > 0;
}

/**
 * Audit row in the SAME txn as the storage mutation (MON-t2-api rule). No outbox
 * event: there is no `npd.attachment.*` member in the outbox event-type enum SoT
 * (same decision the packaging actions document).
 */
export async function writeNpdStorageAudit(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceType: 'npd_brief_attachment' | 'npd_artwork';
    resourceId: string;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, $4, $5, null, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceType,
      params.resourceId,
      JSON.stringify(params.afterState),
    ],
  );
}

// ─── Result types (shared by actions + screens) ───────────────────────────────
export type NpdStorageErrorCode =
  | 'INVALID_INPUT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'STORAGE_FAILED'
  | 'PERSISTENCE_FAILED';

export type BriefAttachmentDto = {
  /** Full object name inside the project prefix (delete handle). */
  objectName: string;
  /** Human display name (uuid prefix stripped). */
  fileName: string;
  sizeBytes: number;
  /** ISO timestamp from storage (created_at). */
  uploadedAt: string;
  /** Short-lived signed download URL. */
  signedUrl: string;
};

export type ArtworkVersionDto = {
  version: number;
  objectName: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  signedUrl: string;
  mimeType: string;
  isImage: boolean;
};
