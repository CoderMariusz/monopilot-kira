'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { writeTenantOutbox } from './_shared/outbox';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

export type PromoteCanaryInput = {
  migrationId: string;
  canaryPct?: number;
  reason?: string;
};

export type PromoteCanaryResult =
  | { ok: true; data: { migrationId: string; status: 'canary' | 'progressive' | 'completed'; canaryPct: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'persistence_failed'; message?: string };

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
  status: string;
  canary_pct?: number | string;
};

const FORBIDDEN = 'forbidden' as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function promoteCanary(rawInput: PromoteCanaryInput): Promise<PromoteCanaryResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });

      const current = await client.query<MigrationRow>(
        `select id, status, canary_pct
           from public.tenant_migrations
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [input.migrationId],
      );
      const row = current.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (!['scheduled', 'canary', 'progressive'].includes(row.status)) {
        return { ok: false, error: 'invalid_state' };
      }

      const nextPct = input.canaryPct;
      const nextStatus = nextPct >= 100 ? 'completed' : nextPct > 10 ? 'progressive' : 'canary';
      const updated = await client.query<MigrationRow>(
        `update public.tenant_migrations
            set status = $2,
                canary_pct = $3,
                last_run_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status in ('scheduled', 'canary', 'progressive')
        returning id, status, canary_pct`,
        [input.migrationId, nextStatus, nextPct],
      );
      const promoted = updated.rows[0];
      if (!promoted) return { ok: false, error: 'invalid_state' };

      await writeTenantOutbox({
        client,
        orgId,
        aggregateId: input.migrationId,
        eventType: nextStatus === 'completed' ? 'settings.upgrade.completed' : 'settings.upgrade.promoted',
        aggregateType: 'tenant_migration',
        appVersion: 'settings-upgrade-orchestration-v1',
        payload: {
          org_id: orgId,
          migration_id: input.migrationId,
          status: nextStatus,
          canary_pct: nextPct,
          reason: input.reason,
          actor_user_id: userId,
        },
      });

      revalidateLocalized('/settings/tenant');
      return { ok: true, data: { migrationId: input.migrationId, status: nextStatus, canaryPct: nextPct } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: PromoteCanaryInput | null | undefined): (PromoteCanaryInput & { canaryPct: number }) | null {
  if (!input || typeof input !== 'object') return null;
  const migrationId = typeof input.migrationId === 'string' ? input.migrationId.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : undefined;
  const canaryPct = input.canaryPct ?? 50;
  if (!UUID_PATTERN.test(migrationId) || typeof canaryPct !== 'number' || !Number.isFinite(canaryPct)) return null;
  if (canaryPct <= 0 || canaryPct > 100) return null;
  return { migrationId, canaryPct, reason: reason && reason.length > 0 ? reason : undefined };
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
