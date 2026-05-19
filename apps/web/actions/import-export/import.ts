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

type StartImportInput = {
  target: string;
  fileName: string;
  contentType: string;
  csvText: string;
  auditReason: string;
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

type ImportJobResult =
  | { ok: true; data: { job: ImportExportJobView } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'unsupported_import' | 'audit_reason_required' | 'authorization_preflight_failed' | 'persistence_failed'; blockers?: Array<Record<string, unknown>> };

type ImportExportJobView = {
  id: string;
  kind: 'import' | 'export';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: { processed: number; total: number };
  download: { url: string; contentType: 'text/csv' } | null;
};

type AuthorizationPolicyRow = {
  policy_code: string;
  is_enabled: boolean | null;
  authorize_permissions: string[] | null;
  approver_role_codes: string[] | null;
  requires_new_version: boolean | null;
  approval_gate_rule_code: string | null;
  min_approvers: number | null;
};

type RuleDefinitionRow = { rule_code: string; active: boolean | null };

const IMPORTABLE_TARGETS = new Set(['authorization_policies']);
const AUTHORIZATION_IMPORT_PERMISSION = 'settings.authorization.edit';

export async function startImportJob(rawInput: unknown): Promise<ImportJobResult> {
  const input = parseStartImportInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  if (!IMPORTABLE_TARGETS.has(input.target)) {
    return { ok: false, error: 'unsupported_import', blockers: [{ code: 'import_not_supported', target: input.target }] };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<ImportJobResult> => {
      if (input.target === 'authorization_policies') {
        const allowed = await hasPermission({ userId, orgId, client }, AUTHORIZATION_IMPORT_PERMISSION);
        if (!allowed) return { ok: false, error: 'forbidden' };
        if (input.auditReason.trim().length === 0) return { ok: false, error: 'audit_reason_required' };

        const blockers = await runAuthorizationPolicyPreflight(client, parseAuthorizationPolicyCodes(input.csvText));
        if (blockers.length > 0) return { ok: false, error: 'authorization_preflight_failed', blockers };
      }

      const job = await createImportJob(client, {
        userId,
        target: input.target,
        fileName: input.fileName,
        contentType: input.contentType,
        csvText: input.csvText,
        auditReason: input.auditReason,
      });
      return { ok: true, data: { job: mapJob(job) } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseStartImportInput(raw: unknown): StartImportInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<Record<keyof StartImportInput, unknown>>;
  const target = normalizeTarget(obj.target);
  const fileName = typeof obj.fileName === 'string' ? obj.fileName.trim() : '';
  const contentType = typeof obj.contentType === 'string' ? obj.contentType.trim() : '';
  const csvText = typeof obj.csvText === 'string' ? obj.csvText : null;
  const auditReason = typeof obj.auditReason === 'string' ? obj.auditReason : '';
  if (!target || !fileName || !contentType || csvText === null) return null;
  return { target, fileName, contentType, csvText, auditReason };
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

async function runAuthorizationPolicyPreflight(client: QueryClient, policyCodes: string[]): Promise<Array<Record<string, unknown>>> {
  const { rows: policies } = await client.query<AuthorizationPolicyRow>(
    `select policy_code,
            is_enabled,
            authorize_permissions,
            approver_role_codes,
            requires_new_version,
            approval_gate_rule_code,
            min_approvers
       from public.org_authorization_policies
      where org_id = app.current_org_id()
        and is_enabled = true
      order by policy_code`,
  );

  const { rows: activeRules } = await client.query<RuleDefinitionRow>(
    `select rule_code, active
       from public.rule_definitions
      where org_id = app.current_org_id()
        and active = true`,
  );
  const activeRuleCodes = new Set(activeRules.filter((rule) => rule.active !== false).map((rule) => rule.rule_code));

  const requestedCodes = new Set(policyCodes);
  const scopedPolicies = requestedCodes.size > 0 ? policies.filter((policy) => requestedCodes.has(policy.policy_code)) : policies;

  const blockers: Array<Record<string, unknown>> = [];
  for (const policy of scopedPolicies) {
    if ((policy.authorize_permissions ?? []).length < 1) {
      blockers.push({ code: 'authorize_permission_missing', check: 'V-SET-43', policyCode: policy.policy_code });
      continue;
    }
    if ((policy.min_approvers ?? 0) < 1 || (policy.approver_role_codes ?? []).length < 1) {
      blockers.push({ code: 'min_approvers_invalid', check: 'V-SET-44', policyCode: policy.policy_code });
      continue;
    }
    if (policy.requires_new_version && policy.approval_gate_rule_code && !activeRuleCodes.has(policy.approval_gate_rule_code)) {
      blockers.push({ code: 'approval_gate_rule_missing', check: 'V-SET-44', policyCode: policy.policy_code });
    }
  }
  return blockers;
}

function parseAuthorizationPolicyCodes(csvText: string): string[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? '').map((header) => header.trim().toLowerCase());
  const policyCodeIndex = headers.indexOf('policy_code');
  if (policyCodeIndex < 0) return [];
  return lines
    .slice(1)
    .map((line) => splitCsvLine(line)[policyCodeIndex]?.trim() ?? '')
    .filter((policyCode) => /^[a-z0-9_][a-z0-9_-]{0,127}$/i.test(policyCode));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells;
}

async function createImportJob(
  client: QueryClient,
  input: { userId: string; target: string; fileName: string; contentType: string; csvText: string; auditReason: string },
): Promise<ImportExportJobRow> {
  const { rows } = await client.query<ImportExportJobRow>(
    `insert into public.import_export_jobs
       (org_id, kind, target, status, progress_processed, progress_total, download_url, created_by, metadata)
     values (app.current_org_id(), $1, $2, 'queued', 0, 0, null, $3::uuid, $4::jsonb)
     returning id, kind, target, status, progress_processed, progress_total, download_url`,
    [
      'import',
      input.target,
      input.userId,
      JSON.stringify({ fileName: input.fileName, contentType: input.contentType, auditReason: input.auditReason, csvText: input.csvText }),
    ],
  );
  if (!rows[0]) throw new Error('import job insert returned no row');
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
