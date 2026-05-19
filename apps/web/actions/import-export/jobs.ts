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

type GetImportExportJobResult =
  | { ok: true; data: { job: ImportExportJobView } }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'persistence_failed' };

export async function getImportExportJob(rawInput: unknown): Promise<GetImportExportJobResult> {
  const input = parseJobInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<GetImportExportJobResult> => {
      const { rows } = await client.query<ImportExportJobRow>(
        `select id, kind, target, status, progress_processed, progress_total, download_url
           from public.import_export_jobs
          where org_id = app.current_org_id()
            and id = $1
          limit 1`,
        [input.jobId],
      );
      const job = rows[0];
      if (!job) return { ok: false, error: 'not_found' };
      const permission = permissionForJob(job);
      if (!permission || !(await hasPermission({ userId, orgId, client }, permission))) return { ok: false, error: 'not_found' };
      return { ok: true, data: { job: mapJob(job) } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseJobInput(raw: unknown): { jobId: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const jobId = (raw as { jobId?: unknown }).jobId;
  if (typeof jobId !== 'string' || jobId.trim().length === 0 || jobId.length > 128) return null;
  return { jobId: jobId.trim() };
}

function permissionForJob(job: ImportExportJobRow): string | null {
  if (job.kind === 'export') return EXPORT_PERMISSIONS[job.target] ?? null;
  return IMPORT_PERMISSIONS[job.target] ?? null;
}

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

const IMPORT_PERMISSIONS: Record<string, string> = {
  reference_tables: 'settings.reference.import',
  authorization_policies: 'settings.authorization.edit',
};

async function hasPermission(ctx: { userId: string; orgId: string; client: QueryClient }, permission: string): Promise<boolean> {
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
