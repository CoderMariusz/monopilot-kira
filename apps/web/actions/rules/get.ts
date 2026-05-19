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

type RuleRow = {
  id: string;
  rule_code: string;
  rule_type: string;
  department_code?: string | null;
  tier?: string | null;
  version: number | string;
  active_from: string | Date;
  active_to: string | Date | null;
  definition_json: unknown;
  deploy_ref?: string | null;
  deployed_by?: string | null;
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

type AuditRow = {
  action: string;
  deploy_ref?: string | null;
  user_id?: string | null;
  actor_user_id?: string | null;
  created_at?: string | Date | null;
  occurred_at?: string | Date | null;
  new_data?: unknown;
  after_state?: unknown;
};

export type GetRuleInput = { ruleCode: string };

export type GetRuleResult =
  | {
      ok: true;
      data: {
        ruleCode: string;
        ruleType: string;
        departmentCode: string | null;
        activeVersion: number;
        definitionJson: unknown;
        versions: Array<{
          id: string;
          version: number;
          isActive: boolean;
          activeFrom: string;
          activeTo: string | null;
          deployRef: string | null;
          deployedBy: string | null;
        }>;
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
        auditSummary: {
          deployCount: number;
          lastDeployRef: string | null;
          lastDeployedBy: string | null;
          lastDeployedAt: string | null;
          auditEvents: Array<{
            action: string;
            deployRef: string | null;
            userId: string | null;
            createdAt: string | null;
          }>;
        };
      };
    }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export async function getRule(rawInput: GetRuleInput): Promise<GetRuleResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId });

      const [{ rows: versionRows }, { rows: dryRunRows }, { rows: auditRows }] = await Promise.all([
        client.query<RuleRow>(
          `select id,
                  rule_code,
                  rule_type,
                  coalesce(definition_json->>'departmentCode', definition_json->>'department_code', split_part(rule_code, '_', 1)) as department_code,
                  tier,
                  version,
                  active_from,
                  active_to,
                  definition_json,
                  deploy_ref,
                  deployed_by::text as deployed_by
             from public.rule_definitions
            where org_id = app.current_org_id()
              and rule_code = $1
            order by version desc`,
          [input.ruleCode],
        ),
        client.query<DryRunRow>(
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
            order by drr.ran_at desc
            limit 25`,
          [input.ruleCode],
        ),
        client.query<AuditRow>(
          `select action,
                  coalesce(after_state->>'deploy_ref', before_state->>'deploy_ref', resource_id) as deploy_ref,
                  actor_user_id::text as user_id,
                  occurred_at as created_at,
                  after_state as new_data
             from public.audit_log
            where org_id = app.current_org_id()
              and resource_type in ('rule_definitions', 'rule_definition', 'rules')
              and (resource_id = $1 or after_state->>'rule_code' = $1)
              and action in ('rule_deploy', 'rule.deploy', 'settings.rule.deployed')
            order by occurred_at desc
            limit 25`,
          [input.ruleCode],
        ),
      ]);

      if (versionRows.length === 0) return { ok: false, error: 'not_found' };

      const active = versionRows.find((row) => row.active_to == null) ?? versionRows[0]!;
      const versions = versionRows.map((row) => ({
        id: row.id,
        version: toNumber(row.version),
        isActive: row.id === active.id,
        activeFrom: toIso(row.active_from),
        activeTo: row.active_to == null ? null : toIso(row.active_to),
        deployRef: row.deploy_ref ?? null,
        deployedBy: row.deployed_by ?? null,
      }));
      const auditEvents = auditRows.map((row) => ({
        action: row.action,
        deployRef: row.deploy_ref ?? null,
        userId: row.user_id ?? row.actor_user_id ?? null,
        createdAt: toNullableIso(row.created_at ?? row.occurred_at ?? null),
      }));

      return {
        ok: true,
        data: {
          ruleCode: active.rule_code,
          ruleType: active.rule_type,
          departmentCode: active.department_code ?? null,
          activeVersion: toNumber(active.version),
          definitionJson: active.definition_json,
          versions,
          dryRuns: dryRunRows.filter((row) => row.rule_definition_id === active.id).map(mapDryRunRow),
          auditSummary: {
            deployCount: versions.length,
            lastDeployRef: active.deploy_ref ?? auditEvents[0]?.deployRef ?? null,
            lastDeployedBy: active.deployed_by ?? auditEvents[0]?.userId ?? null,
            lastDeployedAt: toIso(active.active_from),
            auditEvents,
          },
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: GetRuleInput | null | undefined): GetRuleInput | null {
  if (!input || typeof input !== 'object') return null;
  const ruleCode = typeof input.ruleCode === 'string' ? input.ruleCode.trim() : '';
  if (!RULE_CODE_PATTERN.test(ruleCode)) return null;
  return { ruleCode };
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

function toNullableIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return toIso(value);
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}
