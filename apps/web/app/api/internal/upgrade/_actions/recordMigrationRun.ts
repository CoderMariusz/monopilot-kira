/**
 * T-039 — recordMigrationRun Server Action.
 *
 * Records the result of a per-tenant migration run for a given component:
 *   - On status='succeeded': UPSERT tenant_migrations bumping current_version=$target,
 *     status='succeeded', last_run_at=now(); emits outbox 'tenant.migration.run' event
 *     with retention_class='operational' in the payload.
 *   - On status='failed': UPSERT keeping the existing current_version (no bump);
 *     status='failed', failure_reason persisted, last_run_at=now(); emits outbox
 *     'tenant.migration.run.failed' event carrying the failure_reason.
 *
 * RBAC: caller must hold the system role 'org.platform.admin' for $orgId.
 *   On 403, writes audit_events row with retention_class='security' and returns
 *   { success: false, statusCode: 403, error: 'forbidden' } without touching
 *   tenant_migrations or outbox_events.
 *
 * Atomicity: the UPSERT and outbox INSERT are issued inside a single transaction
 * so the transactional outbox invariant (T-008) holds.
 */

import { randomUUID } from 'node:crypto';
import { getOwnerConnection } from '../../../../../../../packages/db/src/clients.js';

export interface RecordMigrationRunInput {
  actorUserId: string;
  orgId: string;
  component: string;
  tenantId: string;
  target: string;
  status: 'succeeded' | 'failed';
  failure_reason?: string;
}

export interface RecordMigrationRunResult {
  success: boolean;
  error?: 'forbidden' | string;
  statusCode?: number;
}

const PLATFORM_ADMIN_SLUG = 'org.platform.admin';

export async function recordMigrationRun(
  input: RecordMigrationRunInput,
): Promise<RecordMigrationRunResult> {
  const pool = getOwnerConnection();
  const client = await pool.connect();

  try {
    // ── 1. RBAC guard ─────────────────────────────────────────────────────
    const { rows: roleRows } = await client.query<{ ok: number }>(
      `select 1 as ok
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = $1
          and r.org_id = $2
          and r.slug = $3
        limit 1`,
      [input.actorUserId, input.orgId, PLATFORM_ADMIN_SLUG],
    );

    if (roleRows.length === 0) {
      // RBAC denied: append audit_events row with retention_class='security'.
      // EXACT MATCH per task spec — mutation of 'standard'/'operational' fails AC4.
      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            request_id, retention_class)
         values ($1, $2, 'user', 'tenant.migration.run', 'tenant_migrations', $3, $4, 'security')`,
        [input.orgId, input.actorUserId, input.tenantId, randomUUID()],
      );
      return { success: false, statusCode: 403, error: 'forbidden' };
    }

    // ── 2. Single-transaction UPSERT + outbox emit ────────────────────────
    await client.query('begin');
    try {
      if (input.status === 'succeeded') {
        // SUCCESS: bump current_version=$target, clear failure_reason.
        await client.query(
          `insert into public.tenant_migrations
             (tenant_id, component, current_version, target_version,
              cohort, last_run_at, status, failure_reason)
           values ($1, $2, $3, $3, 'general', now(), 'succeeded', null)
           on conflict (tenant_id, component) do update set
             current_version = excluded.current_version,
             target_version  = excluded.target_version,
             last_run_at     = excluded.last_run_at,
             status          = excluded.status,
             failure_reason  = null`,
          [input.tenantId, input.component, input.target],
        );

        await client.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1, 'tenant.migration.run', 'tenant_migration', $2, $3::jsonb, 't-039')`,
          [
            input.orgId,
            input.tenantId,
            JSON.stringify({
              action: 'tenant.migration.run',
              component: input.component,
              tenant_id: input.tenantId,
              target: input.target,
              status: 'succeeded',
              retention_class: 'operational',
            }),
          ],
        );
      } else {
        // FAILURE: do NOT bump current_version. Persist status='failed' + failure_reason.
        // On INSERT (first row), seed current_version with target_version (a new row could
        // not have an existing version); on UPDATE, COALESCE retains the existing version.
        await client.query(
          `insert into public.tenant_migrations
             (tenant_id, component, current_version, target_version,
              cohort, last_run_at, status, failure_reason)
           values ($1, $2, $3, $3, 'general', now(), 'failed', $4)
           on conflict (tenant_id, component) do update set
             -- KEY GUARD: keep existing current_version, never bump on failure.
             current_version = public.tenant_migrations.current_version,
             target_version  = excluded.target_version,
             last_run_at     = excluded.last_run_at,
             status          = excluded.status,
             failure_reason  = excluded.failure_reason`,
          [
            input.tenantId,
            input.component,
            input.target,
            input.failure_reason ?? null,
          ],
        );

        await client.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1, 'tenant.migration.run.failed', 'tenant_migration', $2, $3::jsonb, 't-039')`,
          [
            input.orgId,
            input.tenantId,
            JSON.stringify({
              action: 'tenant.migration.run.failed',
              component: input.component,
              tenant_id: input.tenantId,
              target: input.target,
              status: 'failed',
              failure_reason: input.failure_reason ?? null,
              retention_class: 'operational',
            }),
          ],
        );
      }

      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }

    return { success: true, statusCode: 200 };
  } finally {
    client.release();
    await pool.end();
  }
}
