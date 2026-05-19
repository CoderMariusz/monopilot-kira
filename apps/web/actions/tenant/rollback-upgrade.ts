'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type RollbackUpgradeInput = {
  migrationId: string;
  reason?: string;
};

export type RollbackUpgradeResult =
  | { ok: true; data: { migrationId: string; status: 'rolled_back' } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'rollback_window_expired' | 'persistence_failed';
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

type MigrationRow = {
  id: string;
  component?: string;
  target_version?: string;
  status: string;
  canary_pct?: number | string;
  completed_at?: string | null;
  last_run_at?: string | null;
  created_at?: string | null;
};

const FORBIDDEN = 'forbidden' as const;
const ROLLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function rollbackUpgrade(rawInput: RollbackUpgradeInput): Promise<RollbackUpgradeResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });

      const current = await client.query<MigrationRow>(
        `select id,
                component,
                target_version,
                status,
                canary_pct,
                last_run_at as completed_at,
                last_run_at,
                created_at
           from public.tenant_migrations
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [input.migrationId],
      );
      const migration = current.rows[0];
      if (!migration) return { ok: false, error: 'not_found' };
      if (migration.status !== 'completed') return { ok: false, error: 'invalid_state' };

      const completedAt = parseCompletedAt(migration);
      if (!completedAt || Date.now() - completedAt.getTime() > ROLLBACK_WINDOW_MS) {
        return {
          ok: false,
          error: 'rollback_window_expired',
          supportTicketRequired: true,
          message: 'Rollback window expired; open a support ticket to unlock rollback after 7 days.',
        };
      }

      const updated = await client.query<MigrationRow>(
        `update public.tenant_migrations
            set status = 'rolled_back',
                canary_pct = 0,
                last_run_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'completed'
        returning id, status`,
        [input.migrationId],
      );
      if ((updated.rowCount ?? updated.rows.length) < 1) return { ok: false, error: 'invalid_state' };

      await writeOutbox({
        client,
        orgId,
        aggregateId: input.migrationId,
        eventType: 'settings.upgrade.rolled_back',
        payload: {
          org_id: orgId,
          migration_id: input.migrationId,
          component: migration.component,
          target_version: migration.target_version,
          reason: input.reason,
          actor_user_id: userId,
        },
      });

      revalidatePath('/settings/tenant');
      return { ok: true, data: { migrationId: input.migrationId, status: 'rolled_back' } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: RollbackUpgradeInput | null | undefined): RollbackUpgradeInput | null {
  if (!input || typeof input !== 'object') return null;
  const migrationId = typeof input.migrationId === 'string' ? input.migrationId.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : undefined;
  if (!UUID_PATTERN.test(migrationId)) return null;
  return { migrationId, reason: reason && reason.length > 0 ? reason : undefined };
}

function parseCompletedAt(migration: MigrationRow): Date | null {
  const raw = migration.completed_at ?? migration.last_run_at ?? migration.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
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
