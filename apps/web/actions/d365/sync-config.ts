'use server';

/**
 * T-111 / SET-082 — D365 Sync Config server actions.
 *
 * The SET-082 screen (settings/integrations/d365/sync) is the LOCAL source of
 * truth for the per-org D365 sync cadence/retry/push-queue config. Per R15
 * anti-corruption, D365 is export-only: this config is NEVER auto-pulled from or
 * overwritten by D365 — the owner edits it here and the worker reads it.
 *
 * Storage: reuses the migration-072 `public.integration_settings` table
 * (one active row per (org_id, category)); the D365 sync blob lives under
 * category='d365_sync'. No new table is provisioned — the config is a small
 * per-org settings blob, exactly what integration_settings models.
 *
 * Contract:
 *   - Every read/write runs under `withOrgContext` (RLS-scoped; org isolation
 *     via app.current_org_id()).
 *   - Save is gated FIRST by RBAC `settings.d365.manage` (seeded to the
 *     org-admin family in migration 150) — a caller without it never persists
 *     and gets { ok:false, message } (never a leaked DB error).
 *   - Input is validated server-side with zod (cron + numeric bounds) BEFORE
 *     any DB write.
 *   - On save: upsert the config row, write a security audit_events row, and
 *     enqueue a `settings.d365_sync.updated` outbox event in the SAME txn.
 */

import { z } from 'zod';

import { withOrgContext } from '../../lib/auth/with-org-context';
import {
  D365_SYNC_CATEGORY,
  D365_SYNC_DEFAULTS,
  D365_SYNC_MANAGE_PERMISSION,
  type D365SyncConfig,
  type LoadD365SyncConfigResult,
  type UpdateD365SyncConfigInput,
  type UpdateD365SyncConfigResult,
} from './sync-config-types';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

// ─── Validation ───────────────────────────────────────────────────────────────

function isCronNumber(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return parsed >= min && parsed <= max;
}

function isCronPart(part: string, min: number, max: number): boolean {
  const [base, step, extra] = part.split('/');
  if (extra !== undefined) return false;
  if (step !== undefined && !/^[1-9]\d*$/.test(step)) return false;
  if (base === '*') return true;
  const range = base!.split('-');
  if (range.length === 1) return isCronNumber(range[0]!, min, max);
  if (range.length === 2) {
    const [start, end] = range;
    if (!isCronNumber(start!, min, max) || !isCronNumber(end!, min, max)) return false;
    return Number(start) <= Number(end);
  }
  return false;
}

function isCronField(field: string, min: number, max: number): boolean {
  if (!field) return false;
  return field.split(',').every((part) => isCronPart(part, min, max));
}

/** A valid 5-field cron expression (mirrors the client form's validator). */
function isValidFiveFieldCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const ranges: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  return fields.every((field, index) => isCronField(field, ranges[index]![0], ranges[index]![1]));
}

const SyncConfigInput = z.object({
  pull_cron: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .refine(isValidFiveFieldCron, { message: 'invalid_cron' }),
  batch_size: z.coerce.number().int().min(1).max(1000),
  max_attempts: z.coerce.number().int().min(1).max(20),
  retry_backoff_minutes: z.coerce.number().int().min(1).max(1440),
  push_queue_enabled: z.coerce.boolean(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function dlqHrefForLocale(locale: string): string {
  return `/${locale}/settings/integrations/d365/dlq`;
}

async function hasManagePermission(ctx: OrgActionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3 or r.code = any($4::text[]) or r.slug = any($4::text[]))
      limit 1`,
    [ctx.userId, ctx.orgId, D365_SYNC_MANAGE_PERMISSION, ['owner', 'admin', 'org_admin']],
  );
  return rows.length > 0;
}

function coerceConfig(blob: Record<string, unknown> | null | undefined): Omit<D365SyncConfig, 'dlq_href'> {
  const b = blob ?? {};
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    pull_cron: typeof b.pull_cron === 'string' && b.pull_cron.trim() ? b.pull_cron : D365_SYNC_DEFAULTS.pull_cron,
    batch_size: num(b.batch_size, D365_SYNC_DEFAULTS.batch_size),
    max_attempts: num(b.max_attempts, D365_SYNC_DEFAULTS.max_attempts),
    retry_backoff_minutes: num(b.retry_backoff_minutes, D365_SYNC_DEFAULTS.retry_backoff_minutes),
    push_queue_enabled: b.push_queue_enabled == null ? D365_SYNC_DEFAULTS.push_queue_enabled : Boolean(b.push_queue_enabled),
    last_applied_at: typeof b.last_applied_at === 'string' ? b.last_applied_at : null,
    applied_by_user: typeof b.applied_by_user === 'string' ? b.applied_by_user : null,
  };
}

// ─── Read ───────────────────────────────────────────────────────────────────────

/**
 * Load the D365 sync config for the caller's org from integration_settings.
 * Returns honest defaults (not yet persisted) when no row exists, and reports
 * whether the caller may edit (RBAC `settings.d365.manage`). RLS scopes the
 * read to the org, so a cross-org row is never returned.
 */
export async function loadD365SyncConfig(locale = 'en'): Promise<LoadD365SyncConfigResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const canEdit = await hasManagePermission(ctx);

      const { rows } = await ctx.client.query<{ config: Record<string, unknown> | null }>(
        `select config
           from public.integration_settings
          where org_id = app.current_org_id() and category = $1
          limit 1`,
        [D365_SYNC_CATEGORY],
      );

      const base = coerceConfig(rows[0]?.config);
      const config: D365SyncConfig = { ...base, dlq_href: dlqHrefForLocale(locale) };
      return { ok: true as const, canEdit, config };
    });
  } catch {
    return { ok: false as const, error: 'unavailable' };
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────────

/**
 * Persist the D365 sync config for the caller's org. RBAC-gated, validated,
 * upserted under RLS, audited, and event-emitted in one transaction.
 */
export async function updateD365SyncConfig(rawInput: unknown): Promise<UpdateD365SyncConfigResult> {
  const parsed = SyncConfigInput.safeParse(rawInput);
  if (!parsed.success) {
    const cron = parsed.error.issues.some((i) => i.message === 'invalid_cron');
    return { ok: false, message: cron ? 'Invalid cron expression. Use a valid 5-field cron.' : 'Invalid sync configuration.' };
  }
  const input: UpdateD365SyncConfigInput = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<UpdateD365SyncConfigResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };

      // RBAC FIRST — never let a caller without settings.d365.manage persist.
      if (!(await hasManagePermission(ctx))) {
        return { ok: false, message: 'You do not have permission to manage D365 sync settings.' };
      }

      // Resolve a human label for `applied_by` from the users table (best-effort).
      const { rows: userRows } = await ctx.client.query<{ label: string | null }>(
        `select coalesce(nullif(trim(display_name), ''), email::text) as label
           from public.users
          where id = $1::uuid and org_id = app.current_org_id()
          limit 1`,
        [userId],
      );
      const appliedByUser = userRows[0]?.label ?? null;

      const blob = {
        pull_cron: input.pull_cron,
        batch_size: input.batch_size,
        max_attempts: input.max_attempts,
        retry_backoff_minutes: input.retry_backoff_minutes,
        push_queue_enabled: input.push_queue_enabled,
        last_applied_at: new Date().toISOString(),
        applied_by_user: appliedByUser,
      };

      // Upsert the active config row (one per (org, category)).
      const { rows: upserted } = await ctx.client.query<{ id: string }>(
        `insert into public.integration_settings (org_id, category, provider, config, is_active)
         values (app.current_org_id(), $1, 'd365', $2::jsonb, true)
         on conflict (org_id, category) do update set
           provider  = excluded.provider,
           config    = excluded.config,
           is_active = true
         returning id`,
        [D365_SYNC_CATEGORY, JSON.stringify(blob)],
      );
      const rowId = upserted[0]?.id;
      if (!rowId) return { ok: false, message: 'Unable to save D365 sync settings.' };

      // Security audit row (export-only config change is a regulated action).
      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user', 'd365_sync_config_update',
                 'integration_settings', $2, $3::jsonb, gen_random_uuid(), 'security')`,
        [userId, rowId, JSON.stringify(blob)],
      );

      // Outbox event — internal audit/notify signal (NOT a D365 push; R15).
      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values (app.current_org_id(), 'settings.d365_sync.updated', 'integration_settings', $1::uuid, $2::jsonb, 'settings-d365-sync-v1')`,
        [rowId, JSON.stringify({ category: D365_SYNC_CATEGORY, actor_user_id: userId, ...blob })],
      );

      return { ok: true };
    });
  } catch {
    return { ok: false, message: 'Unable to save D365 sync settings right now.' };
  }
}
