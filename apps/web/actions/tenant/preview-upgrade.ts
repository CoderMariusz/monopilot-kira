'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

export type PreviewUpgradeInput = {
  component: string;
  targetVersion: string;
};

export type DiffChange = {
  path: string;
  before: unknown;
  after: unknown;
};

export type UpgradeDiff = {
  fromVersion: string;
  toVersion: string;
  changes: DiffChange[];
};

export type PreviewUpgradeResult =
  | {
      ok: true;
      data: {
        component: string;
        targetVersion: string;
        affectedRows: number;
        diff: UpgradeDiff;
      };
    }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed'; message?: string };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type CurrentVersionRow = {
  current_version?: string | null;
  target_version?: string | null;
  status?: string | null;
};

type AffectedCountRow = {
  affected_rows?: number | string;
};

type RuleDefinitionRow = {
  rule_code: string;
  version: number | string;
  definition_json: unknown;
};

const FORBIDDEN = 'forbidden' as const;
const COMPONENT_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const VERSION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._+-]{0,126}[A-Za-z0-9])?$/;

export async function previewUpgrade(rawInput: PreviewUpgradeInput): Promise<PreviewUpgradeResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });

      const currentVersion = await readCurrentVersion(client, input.component);

      const affected = await client.query<AffectedCountRow>(
        `select count(*)::int as affected_rows
           from public.rule_definitions
          where org_id = app.current_org_id()
            and ($1::text = 'rule_engine' or rule_code like $1 || '.%')`,
        [input.component],
      );
      const affectedRows = coerceCount(affected.rows[0]?.affected_rows);

      const fromVersionNum = parseVersionLabel(currentVersion);
      const toVersionNum = parseVersionLabel(input.targetVersion);
      const changes = fromVersionNum !== null && toVersionNum !== null
        ? await loadDiffChanges(client, input.component, fromVersionNum, toVersionNum)
        : [];

      return {
        ok: true,
        data: {
          component: input.component,
          targetVersion: input.targetVersion,
          affectedRows,
          diff: {
            fromVersion: currentVersion,
            toVersion: input.targetVersion,
            changes,
          },
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

async function readCurrentVersion(client: QueryClient, component: string): Promise<string> {
  const current = await client.query<CurrentVersionRow>(
    `select current_version, target_version, status
       from public.tenant_migrations
      where org_id = app.current_org_id()
        and component = $1
      order by last_run_at desc nulls last, created_at desc nulls last
      limit 1`,
    [component],
  );
  const row = current.rows[0];
  return row?.current_version ?? row?.target_version ?? 'v1';
}

async function loadDiffChanges(
  client: QueryClient,
  component: string,
  fromVersion: number,
  toVersion: number,
): Promise<DiffChange[]> {
  const { rows } = await client.query<RuleDefinitionRow>(
    `select rule_code, version, definition_json
       from public.rule_definitions
      where org_id = app.current_org_id()
        and ($1::text = 'rule_engine' or rule_code like $1 || '.%')
        and version in ($2::int, $3::int)
      order by rule_code, version`,
    [component, fromVersion, toVersion],
  );

  const byRuleCode = new Map<string, { before?: unknown; after?: unknown }>();
  for (const row of rows) {
    const ver = typeof row.version === 'number' ? row.version : Number.parseInt(String(row.version), 10);
    if (!Number.isFinite(ver)) continue;
    const bucket = byRuleCode.get(row.rule_code) ?? {};
    if (ver === fromVersion) bucket.before = row.definition_json;
    if (ver === toVersion) bucket.after = row.definition_json;
    byRuleCode.set(row.rule_code, bucket);
  }

  const changes: DiffChange[] = [];
  for (const [ruleCode, { before, after }] of byRuleCode.entries()) {
    if (before === undefined || after === undefined) continue;
    diffJson(before, after, `rules.${ruleCode}`, changes);
  }
  return changes;
}

function diffJson(before: unknown, after: unknown, path: string, out: DiffChange[]): void {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      diffJson(before[key], after[key], `${path}.${key}`, out);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length || before.some((value, index) => !deepEqual(value, after[index]))) {
      out.push({ path, before, after });
    }
    return;
  }
  if (!deepEqual(before, after)) {
    out.push({ path, before, after });
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseVersionLabel(label: string): number | null {
  const match = /^v?(\d+)$/i.exec(label);
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInput(input: PreviewUpgradeInput | null | undefined): PreviewUpgradeInput | null {
  if (!input || typeof input !== 'object') return null;
  const component = typeof input.component === 'string' ? input.component.trim() : '';
  const targetVersion = typeof input.targetVersion === 'string' ? input.targetVersion.trim() : '';
  if (!COMPONENT_PATTERN.test(component) || !VERSION_PATTERN.test(targetVersion)) return null;
  return { component, targetVersion };
}

async function requirePermission({
  client,
  userId,
  orgId,
  permission,
}: OrgActionContext & { permission: string }): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

function coerceCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
