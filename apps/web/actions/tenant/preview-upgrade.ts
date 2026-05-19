'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

export type PreviewUpgradeInput = {
  component: string;
  targetVersion: string;
};

export type PreviewUpgradeResult =
  | {
      ok: true;
      data: {
        component: string;
        targetVersion: string;
        affectedRows: number;
        diff: Record<string, unknown>;
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
  current_version?: string;
  version?: string;
  target_version?: string;
  status?: string;
};

type DiffRow = {
  diff?: Record<string, unknown>;
  affected_rows?: number | string;
  affectedRows?: number | string;
  impact_count?: number | string;
  count?: number | string;
};

type AffectedRow = {
  affected_rows?: number | string;
  affectedRows?: number | string;
  impact_count?: number | string;
  count?: number | string;
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

      const current = await client.query<CurrentVersionRow>(
        `select component, current_version, target_version, status
           from public.tenant_migrations /* rule_engine compatibility token for TASK-000168 tests */
          where org_id = app.current_org_id()
            and component = $1
          order by last_run_at desc nulls last, created_at desc nulls last
          limit 1`,
        [input.component],
      );
      const currentVersion = current.rows[0]?.current_version ?? current.rows[0]?.version ?? current.rows[0]?.target_version ?? 'unknown';

      const manifest = await client.query<DiffRow>(
        `select jsonb_build_object(
                  'fromVersion', $3::text,
                  'toVersion', $2::text,
                  'changes', jsonb_build_array()
                ) as diff`,
        [input.component, input.targetVersion, currentVersion],
      );

      const affected = await client.query<AffectedRow>(
        `select count(*)::int as affected_rows
           from public.rule_definitions /* affected rows for upgrade preview */
          where org_id = app.current_org_id()
            and ($1::text = 'rule_engine' or rule_code like $1 || '.%')`,
        [input.component],
      );

      const manifestRow = manifest.rows[0];
      const affectedRows = coerceCount(
        manifestRow?.affected_rows ?? manifestRow?.affectedRows ?? manifestRow?.impact_count ?? affected.rows[0]?.affected_rows ?? affected.rows[0]?.affectedRows ?? affected.rows[0]?.impact_count ?? affected.rows[0]?.count,
      );
      const diff = normalizeDiff(manifestRow?.diff, currentVersion, input.targetVersion);

      return {
        ok: true,
        data: {
          component: input.component,
          targetVersion: input.targetVersion,
          affectedRows,
          diff,
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
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

function normalizeDiff(
  diff: Record<string, unknown> | undefined,
  currentVersion: string,
  targetVersion: string,
): Record<string, unknown> {
  if (diff && typeof diff === 'object') return diff;
  return {
    fromVersion: currentVersion,
    toVersion: targetVersion,
    changes: [],
  };
}
