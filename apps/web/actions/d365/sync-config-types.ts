/**
 * T-111 / SET-082 — D365 Sync Config shared types.
 *
 * Kept in a NON-`'use server'` sibling so the action module
 * (`sync-config.ts`) can stay `'use server'` (only async-function exports —
 * see MON-t2-api "'use server' export rule"). Types are erased at compile time.
 */

/** The persisted D365 sync-config shape rendered by the SET-082 screen. */
export type D365SyncConfig = {
  pull_cron: string;
  batch_size: number;
  max_attempts: number;
  retry_backoff_minutes: number;
  push_queue_enabled: boolean;
  dlq_href: string;
  last_applied_at: string | null;
  applied_by_user: string | null;
};

/** The mutable subset the owner saves from the form. */
export type UpdateD365SyncConfigInput = Pick<
  D365SyncConfig,
  'pull_cron' | 'batch_size' | 'max_attempts' | 'retry_backoff_minutes' | 'push_queue_enabled'
>;

/** Result of loading the config for the current org. */
export type LoadD365SyncConfigResult =
  | { ok: true; canEdit: boolean; config: D365SyncConfig }
  | { ok: false; error: 'unavailable' };

/** Result of the owner save mutation. */
export type UpdateD365SyncConfigResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * The canonical `integration_settings.category` value that holds the D365 sync
 * config blob. Reuses the migration-072 table (one active row per (org,
 * category)) rather than provisioning a new table — the config is a small
 * per-org settings blob, which is exactly what `integration_settings` models.
 */
export const D365_SYNC_CATEGORY = 'd365_sync';

/** RBAC string checked at the save gate — seeded to the org-admin family in migration 150. */
export const D365_SYNC_MANAGE_PERMISSION = 'settings.d365.manage';

/** Defaults applied until the org has saved a config (honest, persisted on first save). */
export const D365_SYNC_DEFAULTS: Omit<D365SyncConfig, 'dlq_href' | 'last_applied_at' | 'applied_by_user'> = {
  pull_cron: '0 2 * * *',
  batch_size: 50,
  max_attempts: 3,
  retry_backoff_minutes: 15,
  push_queue_enabled: true,
};
