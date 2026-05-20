'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const VIEW_PERMISSION = 'settings.rules.view';
const RULE_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const FORBIDDEN = 'forbidden' as const;

type DryRunStatus = 'passed' | 'failed';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type DryRunRow = {
  id: string;
  rule_definition_id: string;
  rule_code: string;
  status: DryRunStatus;
  sample_input_json: unknown;
  result_json: unknown;
  warnings?: unknown;
  ran_at: string | Date | null;
  ran_by: string | null;
};

export type ListRuleDryRunsInput = {
  ruleCode: string;
  status?: DryRunStatus;
  limit?: number;
};

export type ListRuleDryRunsResult =
  | {
      ok: true;
      data: {
        dryRuns: Array<{
          id: string;
          ruleDefinitionId: string;
          ruleCode: string;
          status: DryRunStatus;
          sampleInputJson: unknown;
          resultJson: unknown;
          warnings: string[];
          ranAt: string | null;
          ranBy: string | null;
        }>;
      };
    }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export async function listRuleDryRuns(rawInput: ListRuleDryRunsInput): Promise<ListRuleDryRunsResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId });
      const params: unknown[] = [input.ruleCode, input.limit];
      const statusFilter = input.status ? 'and coalesce(drr.result_json->>\'status\', drr.result_json->>\'outcome\', case when drr.result_json @> \'{"allowed": true}\'::jsonb then \'passed\' else \'failed\' end) = $3' : '';
      if (input.status) params.push(input.status);

      const { rows } = await client.query<DryRunRow>(
        `select drr.id,
                drr.rule_definition_id,
                rd.rule_code,
                coalesce(drr.result_json->>'status', drr.result_json->>'outcome', case when drr.result_json @> '{"allowed": true}'::jsonb then 'passed' else 'failed' end) as status,
                drr.sample_input_json,
                drr.result_json,
                coalesce(drr.result_json->'warnings', '[]'::jsonb) as warnings,
                drr.ran_at,
                drr.ran_by::text as ran_by
           from public.rule_dry_runs drr
           join public.rule_definitions rd on rd.id = drr.rule_definition_id and rd.org_id = drr.org_id
          where drr.org_id = app.current_org_id()
            and rd.rule_code = $1
            ${statusFilter}
          order by drr.ran_at desc
          limit $2`,
        params,
      );

      return { ok: true, data: { dryRuns: rows.map(mapDryRunRow) } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: ListRuleDryRunsInput | null | undefined): ListRuleDryRunsInput & { limit: number } | null {
  if (!input || typeof input !== 'object') return null;
  const ruleCode = typeof input.ruleCode === 'string' ? input.ruleCode.trim() : '';
  if (!RULE_CODE_PATTERN.test(ruleCode)) return null;
  if (input.status !== undefined && input.status !== 'passed' && input.status !== 'failed') return null;
  const limit = input.limit === undefined ? 25 : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  return { ruleCode, status: input.status, limit };
}

function mapDryRunRow(row: DryRunRow) {
  return {
    id: row.id,
    ruleDefinitionId: row.rule_definition_id,
    ruleCode: row.rule_code,
    status: row.status,
    sampleInputJson: row.sample_input_json,
    resultJson: row.result_json,
    warnings: normalizeWarnings(row.warnings),
    ranAt: row.ran_at == null ? null : toIso(row.ran_at),
    ranBy: row.ran_by,
  };
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

async function requirePermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, VIEW_PERMISSION],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
