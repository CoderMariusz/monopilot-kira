/**
 * T-039 — advanceCohort Server Action.
 *
 * Atomically promotes all tenants on `fromCohort` (status='succeeded',
 * last_run_at older than now() - INTERVAL '15 minutes') to `toCohort` for the
 * given component, and emits one 'tenant.cohort.advanced' outbox event per
 * advanced tenant — all inside a SINGLE transaction. If any UPDATE or outbox
 * INSERT throws, the entire batch is rolled back (no partial cohort flips).
 *
 * Strict 15-min monitor window: predicate is `last_run_at < now() - interval
 * '15 minutes'` — a tenant @14m59s is NOT advanced; a tenant @15m1s IS
 * advanced (boundary pinned by AC3 #5).
 *
 * Status filter: only status='succeeded' tenants advance. canary/failed rows
 * stay put regardless of last_run_at (red line: T-039 risk_red_lines).
 *
 * RBAC: caller must hold 'org.platform.admin' for $orgId. On 403, writes
 * audit_events row with retention_class='security' and returns
 * { success: false, statusCode: 403, error: 'forbidden' } without DB writes
 * to tenant_migrations or outbox_events.
 */

import { randomUUID } from 'node:crypto';
import { getOwnerConnection } from '../../../../../../../packages/db/src/clients.js';

export interface AdvanceCohortInput {
  actorUserId: string;
  orgId: string;
  component: string;
  fromCohort: 'canary' | 'early' | 'general';
  toCohort: 'canary' | 'early' | 'general';
}

export interface AdvanceCohortResult {
  success: boolean;
  advancedCount: number;
  error?: 'forbidden' | string;
  statusCode?: number;
}

const PLATFORM_ADMIN_SLUG = 'org.platform.admin';

export async function advanceCohort(
  input: AdvanceCohortInput,
): Promise<AdvanceCohortResult> {
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
      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            request_id, retention_class)
         values ($1, $2, 'user', 'tenant.cohort.advanced', 'tenant_migrations', $3, $4, 'security')`,
        [input.orgId, input.actorUserId, input.component, randomUUID()],
      );
      return { success: false, advancedCount: 0, statusCode: 403, error: 'forbidden' };
    }

    // ── 2. Single-transaction cohort flip + outbox emit (per tenant) ──────
    await client.query('begin');
    let advancedCount = 0;
    try {
      // Lock eligible rows FOR UPDATE inside the same tx so concurrent calls
      // can't double-advance. The strict `<` boundary pins the 15-min window.
      const { rows: eligible } = await client.query<{ tenant_id: string }>(
        `select tenant_id
           from public.tenant_migrations
          where component = $1
            and cohort = $2
            and status = 'succeeded'
            and last_run_at < now() - interval '15 minutes'
          for update`,
        [input.component, input.fromCohort],
      );

      for (const row of eligible) {
        await client.query(
          `update public.tenant_migrations
              set cohort = $1
            where tenant_id = $2 and component = $3`,
          [input.toCohort, row.tenant_id, input.component],
        );

        await client.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1, 'tenant.cohort.advanced', 'tenant_migration', $2, $3::jsonb, 't-039')`,
          [
            input.orgId,
            row.tenant_id,
            JSON.stringify({
              action: 'tenant.cohort.advanced',
              component: input.component,
              tenant_id: row.tenant_id,
              from_cohort: input.fromCohort,
              to_cohort: input.toCohort,
              retention_class: 'operational',
            }),
          ],
        );

        advancedCount++;
      }

      await client.query('commit');
    } catch (err) {
      // Atomicity red line: ANY error rolls back the entire batch.
      await client.query('rollback');
      throw err;
    }

    return { success: true, advancedCount, statusCode: 200 };
  } finally {
    client.release();
    await pool.end();
  }
}
