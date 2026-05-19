'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const VIEW_PERMISSION = 'settings.rules.view';
const RULE_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const FILTER_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
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

type RuleRow = {
  id: string;
  rule_code: string;
  rule_type: string;
  department_code?: string | null;
  tier?: string | null;
  version: number | string;
  active_from: string | Date;
  active_to: string | Date | null;
  definition_json?: unknown;
  deploy_ref?: string | null;
  deployed_by?: string | null;
};

type LatestDryRunRow = {
  rule_definition_id: string;
  status: DryRunStatus;
  ran_at: string | Date | null;
};

export type ListRulesInput = {
  ruleType?: string;
  departmentCode?: string;
  active?: boolean;
  dryRunStatus?: DryRunStatus;
};

export type ListRulesResult =
  | {
      ok: true;
      data: {
        rules: Array<{
          id: string;
          ruleCode: string;
          ruleType: string;
          departmentCode: string | null;
          tier: string | null;
          activeVersion: number;
          activeFrom: string;
          activeTo: string | null;
          isActive: boolean;
          latestDryRunStatus: DryRunStatus | null;
          latestDryRunAt: string | null;
          deployRef: string | null;
          deployedBy: string | null;
        }>;
      };
    }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export async function listRules(rawInput: ListRulesInput = {}): Promise<ListRulesResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId });

      const { sql, params } = buildListQuery(input);
      const { rows } = await client.query<RuleRow>(sql, params);
      const latestByDefinitionId = await readLatestDryRunStatus({
        client,
        ruleDefinitionIds: rows.map((row) => row.id),
        status: input.dryRunStatus,
      });

      const filteredRows = input.dryRunStatus
        ? rows.filter((row) => latestByDefinitionId.get(row.id)?.status === input.dryRunStatus)
        : rows;

      return {
        ok: true,
        data: {
          rules: filteredRows.map((row) => {
            const latest = latestByDefinitionId.get(row.id);
            return {
              id: row.id,
              ruleCode: row.rule_code,
              ruleType: row.rule_type,
              departmentCode: row.department_code ?? null,
              tier: row.tier ?? null,
              activeVersion: toNumber(row.version),
              activeFrom: toIso(row.active_from),
              activeTo: row.active_to == null ? null : toIso(row.active_to),
              isActive: row.active_to == null,
              latestDryRunStatus: latest?.status ?? null,
              latestDryRunAt: latest?.ranAt ?? null,
              deployRef: row.deploy_ref ?? null,
              deployedBy: row.deployed_by ?? null,
            };
          }),
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: ListRulesInput | null | undefined): ListRulesInput | null {
  if (input == null) return {};
  if (typeof input !== 'object') return null;
  const parsed: ListRulesInput = {};
  if (input.ruleType !== undefined) {
    const ruleType = String(input.ruleType).trim();
    if (!FILTER_CODE_PATTERN.test(ruleType)) return null;
    parsed.ruleType = ruleType;
  }
  if (input.departmentCode !== undefined) {
    const departmentCode = String(input.departmentCode).trim();
    if (!RULE_CODE_PATTERN.test(departmentCode)) return null;
    parsed.departmentCode = departmentCode;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') return null;
    parsed.active = input.active;
  }
  if (input.dryRunStatus !== undefined) {
    if (input.dryRunStatus !== 'passed' && input.dryRunStatus !== 'failed') return null;
    parsed.dryRunStatus = input.dryRunStatus;
  }
  return parsed;
}

function buildListQuery(input: ListRulesInput): { sql: string; params: unknown[] } {
  const where = ['rd.org_id = app.current_org_id()'];
  const params: unknown[] = [];
  if (input.ruleType) {
    params.push(input.ruleType);
    where.push(`rd.rule_type = $${params.length}`);
  }
  if (input.departmentCode) {
    params.push(input.departmentCode);
    where.push(`coalesce(rd.definition_json->>'departmentCode', rd.definition_json->>'department_code', split_part(rd.rule_code, '_', 1)) = $${params.length}`);
  }
  if (input.active === true) where.push('rd.active_to is null');
  if (input.active === false) where.push('rd.active_to is not null');
  return {
    sql: `select rd.id,
                 rd.rule_code,
                 rd.rule_type,
                 coalesce(rd.definition_json->>'departmentCode', rd.definition_json->>'department_code', split_part(rd.rule_code, '_', 1)) as department_code,
                 rd.tier,
                 rd.version,
                 rd.active_from,
                 rd.active_to,
                 rd.definition_json,
                 rd.deploy_ref,
                 rd.deployed_by::text as deployed_by
            from public.rule_definitions rd
           where ${where.join('\n             and ')}
           order by rd.rule_code asc, rd.version desc`,
    params,
  };
}

async function readLatestDryRunStatus({
  client,
  ruleDefinitionIds,
  status,
}: {
  client: QueryClient;
  ruleDefinitionIds: string[];
  status?: DryRunStatus;
}): Promise<Map<string, { status: DryRunStatus; ranAt: string | null }>> {
  if (ruleDefinitionIds.length === 0) return new Map();
  const params: unknown[] = [ruleDefinitionIds];
  const statusFilter = status ? 'and coalesce(result_json->>\'status\', result_json->>\'outcome\', case when result_json @> \'{"allowed": true}\'::jsonb then \'passed\' else \'failed\' end) = $2' : '';
  if (status) params.push(status);
  const { rows } = await client.query<LatestDryRunRow>(
    `select distinct on (rule_definition_id)
            rule_definition_id,
            coalesce(result_json->>'status', result_json->>'outcome', case when result_json @> '{"allowed": true}'::jsonb then 'passed' else 'failed' end) as status,
            ran_at
       from public.rule_dry_runs
      where org_id = app.current_org_id()
        and rule_definition_id = any($1::uuid[])
        ${statusFilter}
      order by rule_definition_id, ran_at desc`,
    params,
  );
  return new Map(
    rows.map((row) => [row.rule_definition_id, { status: row.status, ranAt: row.ran_at == null ? null : toIso(row.ran_at) }]),
  );
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

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}
