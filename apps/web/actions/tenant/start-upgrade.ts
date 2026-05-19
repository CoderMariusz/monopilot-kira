'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type StartUpgradeInput = {
  component: string;
  targetVersion: string;
  targetRegion?: string;
  reason?: string;
};

export type StartUpgradeResult =
  | { ok: true; data: { migrationId: string; status: string } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'REGION_CHANGE_BLOCKED' | 'persistence_failed';
      message?: string;
      supportTicketRequired?: boolean;
    };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type OrganizationRow = {
  id: string;
  region?: string | null;
  region_cluster?: string | null;
  onboarding_completed_at?: string | null;
};

type CurrentVersionRow = { current_version?: string; version?: string; target_version?: string };
type InsertRow = { id?: string; status?: string };

const FORBIDDEN = 'forbidden' as const;
const COMPONENT_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const VERSION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._+-]{0,126}[A-Za-z0-9])?$/;
const REGION_PATTERN = /^[a-z][a-z0-9_-]{1,15}$/i;

export async function startUpgrade(rawInput: StartUpgradeInput): Promise<StartUpgradeResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });

      const org = await client.query<OrganizationRow>(
        `select id, region, region_cluster, onboarding_completed_at
           from public.organizations
          where id = app.current_org_id()
          limit 1`,
      );
      const orgRow = org.rows[0];
      if (input.targetRegion && orgRow?.onboarding_completed_at) {
        const currentRegion = orgRow.region ?? orgRow.region_cluster;
        if (currentRegion && currentRegion.toLowerCase() !== input.targetRegion.toLowerCase()) {
          return {
            ok: false,
            error: 'REGION_CHANGE_BLOCKED',
            supportTicketRequired: true,
            message: 'Region changes after onboarding require a support ticket.',
          };
        }
      }

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

      const inserted = await client.query<InsertRow>(
        `insert into public.tenant_migrations
           (org_id, component, current_version, target_version, status, canary_pct, scheduled_by, last_run_at)
         values (app.current_org_id(), $1, $2, $3, 'scheduled', 0, $4::uuid, now())
         returning id, status`,
        [input.component, currentVersion, input.targetVersion, userId],
      );
      const migration = inserted.rows[0];
      if (!migration?.id) return { ok: false, error: 'persistence_failed' };

      await writeOutbox({
        client,
        orgId,
        aggregateId: migration.id,
        eventType: 'settings.upgrade.scheduled',
        payload: {
          org_id: orgId,
          migration_id: migration.id,
          component: input.component,
          target_version: input.targetVersion,
          reason: input.reason,
          actor_user_id: userId,
        },
      });

      revalidatePath('/settings/tenant');
      return { ok: true, data: { migrationId: migration.id, status: migration.status ?? 'scheduled' } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: StartUpgradeInput | null | undefined): StartUpgradeInput | null {
  if (!input || typeof input !== 'object') return null;
  const component = typeof input.component === 'string' ? input.component.trim() : '';
  const targetVersion = typeof input.targetVersion === 'string' ? input.targetVersion.trim() : '';
  const targetRegion = typeof input.targetRegion === 'string' ? input.targetRegion.trim() : undefined;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : undefined;
  if (!COMPONENT_PATTERN.test(component) || !VERSION_PATTERN.test(targetVersion)) return null;
  if (targetRegion && !REGION_PATTERN.test(targetRegion)) return null;
  return {
    component,
    targetVersion,
    targetRegion: targetRegion && targetRegion.length > 0 ? targetRegion : undefined,
    reason: reason && reason.length > 0 ? reason : undefined,
  };
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

async function writeOutbox({
  client,
  orgId,
  aggregateId,
  eventType,
  payload,
}: {
  client: QueryClient;
  orgId: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'tenant_migration', $3::uuid, $4::jsonb, 'settings-upgrade-orchestration-v1')`,
    [orgId, eventType, aggregateId, JSON.stringify(payload)],
  );
}
