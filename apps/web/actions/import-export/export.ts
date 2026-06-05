'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ImportExportJobRow = {
  id: string;
  kind: 'import' | 'export';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress_processed: number;
  progress_total: number;
  download_url: string | null;
};

type ImportExportJobView = {
  id: string;
  kind: 'import' | 'export';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: { processed: number; total: number };
  download: { url: string; contentType: 'text/csv' } | null;
};

type StartExportResult =
  | { ok: true; data: { job: ImportExportJobView } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'unsupported_export' | 'not_implemented' | 'persistence_failed'; blockers?: Array<Record<string, unknown>> };

const EXPORT_PERMISSIONS: Record<string, string> = {
  users: 'settings.org.read',
  roles: 'settings.org.read',
  invitations: 'settings.org.read',
  reference_tables: 'settings.reference.view',
  infrastructure: 'settings.infra.view',
  feature_flags: 'settings.flags.view',
  authorization_policies: 'settings.authorization.view',
  audit_logs: 'settings.audit.read',
};
const EXPORT_FEATURE_DISABLED = true;

export async function startExportJob(rawInput: unknown): Promise<StartExportResult> {
  const input = parseStartExportInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };
  const permission = EXPORT_PERMISSIONS[input.target];
  if (!permission) {
    return { ok: false, error: 'unsupported_export', blockers: [{ code: 'export_not_supported', target: input.target }] };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<StartExportResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, permission);
      if (!allowed) return { ok: false, error: 'forbidden' };

      // TODO(worker): drain public.import_export_jobs (apps/worker/src) then flip EXPORT_FEATURE_DISABLED=false
      if (EXPORT_FEATURE_DISABLED) {
        return { ok: false, error: 'not_implemented', blockers: [{ code: 'export_not_implemented' }] };
      }

      const job = await createExportJob(client, { userId, target: input.target, filters: input.filters });
      return { ok: true, data: { job: mapJob(job) } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseStartExportInput(raw: unknown): { target: string; filters: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { target?: unknown; filters?: unknown };
  const target = normalizeTarget(obj.target);
  if (!target) return null;
  const filters = obj.filters && typeof obj.filters === 'object' && !Array.isArray(obj.filters)
    ? (obj.filters as Record<string, unknown>)
    : {};
  return { target, filters };
}

function normalizeTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^(users|roles|invitations|reference_tables|infrastructure|feature_flags|authorization_policies|audit_logs)$/.test(trimmed)
    ? trimmed
    : null;
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       join public.user_roles ur on ur.role_id = r.id and ur.org_id = r.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and rp.permission = $3
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function createExportJob(
  client: QueryClient,
  input: { userId: string; target: string; filters: Record<string, unknown> },
): Promise<ImportExportJobRow> {
  const { rows } = await client.query<ImportExportJobRow>(
    `insert into public.import_export_jobs
       (org_id, kind, target, status, progress_processed, progress_total, download_url, created_by, metadata)
     values (app.current_org_id(), $1, $2, 'queued', 0, 0, null, $3::uuid, $4::jsonb)
     returning id, kind, target, status, progress_processed, progress_total, download_url`,
    ['export', input.target, input.userId, JSON.stringify({ filters: input.filters })],
  );
  if (!rows[0]) throw new Error('export job insert returned no row');
  return rows[0];
}

function mapJob(row: ImportExportJobRow): ImportExportJobView {
  return {
    id: row.id,
    kind: row.kind,
    target: row.target,
    status: row.status,
    progress: { processed: Number(row.progress_processed), total: Number(row.progress_total) },
    download: row.download_url ? { url: row.download_url, contentType: 'text/csv' } : null,
  };
}
