/**
 * T-075 / SET-102 — My Notifications real data + Server Action.
 *
 * Replaces the prior FULL_MOCK client (hardcoded `defaultPreferences`,
 * `userId='current-user'`, unwired save) with real, org-scoped Supabase
 * reads/writes against `public.notification_preferences` (migration 049).
 *
 *   - `readMyNotificationPreferences()` resolves the SIGNED-IN user via
 *     `withOrgContext` and reads their `(category, event, channel_email,
 *     channel_in_app)` rows (RLS-scoped to the caller's org). The boolean
 *     toggles surfaced in the prototype are projected from those rows; missing
 *     rows fall back to the prototype defaults so a brand-new user still sees
 *     the documented baseline (but `userId` is the REAL signed-in id, never a
 *     literal).
 *   - `saveNotificationPreferencesAction` upserts each toggle as a row and
 *     emits a `settings.notification_digest_updated` outbox event in the same
 *     transaction.
 *
 * Quiet hours are stored once per user/org in `user_notification_settings`;
 * they are global settings, not per-category notification preferences.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export type NotificationPreferenceKey =
  | 'notification_badges'
  | 'browser_push'
  | 'sound_on_alert'
  | 'work_order_assigned'
  | 'approval_requested'
  | 'daily_plant_summary'
  | 'weekly_npd_digest'
  | 'product_updates_tips';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean> & {
  quiet_hours_enabled: boolean;
  quiet_hours_from: string;
  quiet_hours_to: string;
};

export type NotificationsData = {
  state: 'ready' | 'empty' | 'error';
  userId: string | null;
  preferences: NotificationPreferences;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type PreferenceRow = {
  category: string;
  event: string;
  channel_email: boolean | null;
  channel_in_app: boolean | null;
};

type QuietHoursRow = {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

const OUTBOX_APP_VERSION = 'account-notifications-screen';
const OUTBOX_DIGEST_EVENT = 'settings.notification_digest_updated';

/**
 * Documented prototype baseline
 * (account-screens.jsx:81-122). Used as the per-key fallback ONLY when the
 * signed-in user has no stored row for that key yet.
 */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  notification_badges: true,
  browser_push: true,
  sound_on_alert: false,
  work_order_assigned: true,
  approval_requested: true,
  daily_plant_summary: true,
  weekly_npd_digest: false,
  product_updates_tips: false,
  quiet_hours_enabled: false,
  quiet_hours_from: '20:00',
  quiet_hours_to: '07:00',
};

/**
 * Each toggle is stored as one `(category, event)` row. `inApp` keys use the
 * `channel_in_app` boolean; `email` keys use `channel_email`.
 */
type ToggleSpec = { key: NotificationPreferenceKey; category: string; event: string; channel: 'in_app' | 'email' };

const TOGGLE_REGISTRY: ToggleSpec[] = [
  { key: 'notification_badges', category: 'in_app', event: 'notification_badges', channel: 'in_app' },
  { key: 'browser_push', category: 'in_app', event: 'browser_push', channel: 'in_app' },
  { key: 'sound_on_alert', category: 'in_app', event: 'sound_on_alert', channel: 'in_app' },
  { key: 'work_order_assigned', category: 'email', event: 'work_order_assigned', channel: 'email' },
  { key: 'approval_requested', category: 'email', event: 'approval_requested', channel: 'email' },
  { key: 'daily_plant_summary', category: 'email', event: 'daily_plant_summary', channel: 'email' },
  { key: 'weekly_npd_digest', category: 'email', event: 'weekly_npd_digest', channel: 'email' },
  { key: 'product_updates_tips', category: 'email', event: 'product_updates_tips', channel: 'email' },
];

function projectRowsToPreferences(rows: PreferenceRow[]): NotificationPreferences {
  const byKey = new Map<string, PreferenceRow>();
  for (const row of rows) byKey.set(`${row.category}:${row.event}`, row);

  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES };
  for (const spec of TOGGLE_REGISTRY) {
    const row = byKey.get(`${spec.category}:${spec.event}`);
    if (!row) continue;
    const value = spec.channel === 'email' ? row.channel_email : row.channel_in_app;
    if (typeof value === 'boolean') {
      prefs[spec.key] = value;
    }
  }
  return prefs;
}

/**
 * Read the signed-in user's real notification preferences. Degrades to
 * `state: 'error'` (logged, never thrown) on a failed read so the page renders
 * an error shell instead of a 500. When the user has no rows yet, state is
 * `'ready'` with the documented prototype defaults (and the REAL userId).
 */
export async function readMyNotificationPreferences(): Promise<NotificationsData> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const result = await queryClient.query<PreferenceRow>(
        `select category, event, channel_email, channel_in_app
           from public.notification_preferences
          where org_id = $1::uuid
            and user_id = $2::uuid
          order by category, event`,
        [orgId, userId],
      );
      const settings = await queryClient.query<QuietHoursRow>(
        `select quiet_hours_enabled, quiet_hours_start, quiet_hours_end
           from public.user_notification_settings
          where org_id = $1::uuid
            and user_id = $2::uuid`,
        [orgId, userId],
      );
      const preferences = projectRowsToPreferences(result.rows);
      const quietHours = settings.rows[0];
      if (quietHours) {
        preferences.quiet_hours_enabled = quietHours.quiet_hours_enabled;
        if (quietHours.quiet_hours_start) preferences.quiet_hours_from = quietHours.quiet_hours_start.slice(0, 5);
        if (quietHours.quiet_hours_end) preferences.quiet_hours_to = quietHours.quiet_hours_end.slice(0, 5);
      }

      return {
        state: 'ready',
        userId,
        preferences,
      };
    });
  } catch (error) {
    console.error('[account/notifications] readMyNotificationPreferences failed:', error);
    return { state: 'error', userId: null, preferences: { ...DEFAULT_PREFERENCES } };
  }
}

export type SaveNotificationPreferencesResult =
  | { ok: true; userPreferencesRowUpdated: true; rowsWritten: number; outboxEventType: string }
  | { ok: false; error: 'invalid_input' | 'persistence_failed' };

/**
 * Upsert every boolean toggle as a `notification_preferences` row for the
 * VERIFIED caller (id resolved from context, never trusted from the client
 * payload), and emit a digest outbox event atomically.
 */
export async function saveNotificationPreferencesAction(
  payload: NotificationPreferences & { userId: string },
): Promise<SaveNotificationPreferencesResult> {
  'use server';

  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(payload.quiet_hours_from) || !timePattern.test(payload.quiet_hours_to)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const rowsWritten = await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      let written = 0;
      for (const spec of TOGGLE_REGISTRY) {
        const enabled = Boolean(payload[spec.key]);
        const channelEmail = spec.channel === 'email' ? enabled : false;
        const channelInApp = spec.channel === 'in_app' ? enabled : false;
        await queryClient.query(
          `insert into public.notification_preferences
             (user_id, org_id, category, event, channel_email, channel_in_app, updated_at)
           values ($1::uuid, $2::uuid, $3, $4, $5, $6, now())
           on conflict (user_id, org_id, category, event)
           do update set channel_email = excluded.channel_email,
                         channel_in_app = excluded.channel_in_app,
                         updated_at = now()`,
          [userId, orgId, spec.category, spec.event, channelEmail, channelInApp],
        );
        written += 1;
      }

      await queryClient.query(
        `insert into public.user_notification_settings
           (user_id, org_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, updated_at)
         values ($1::uuid, $2::uuid, $3, $4::time, $5::time, now())
         on conflict (user_id, org_id)
         do update set quiet_hours_enabled = excluded.quiet_hours_enabled,
                       quiet_hours_start = excluded.quiet_hours_start,
                       quiet_hours_end = excluded.quiet_hours_end,
                       updated_at = now()`,
        [userId, orgId, payload.quiet_hours_enabled, payload.quiet_hours_from, payload.quiet_hours_to],
      );
      written += 1;

      await queryClient.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'notification_preferences', $1::uuid, $3::jsonb, $4)`,
        [
          orgId,
          OUTBOX_DIGEST_EVENT,
          JSON.stringify({
            actorUserId: userId,
            quietHoursEnabled: Boolean(payload.quiet_hours_enabled),
            quietHoursFrom: payload.quiet_hours_from,
            quietHoursTo: payload.quiet_hours_to,
          }),
          OUTBOX_APP_VERSION,
        ],
      );

      return written;
    });

    return { ok: true, userPreferencesRowUpdated: true, rowsWritten, outboxEventType: OUTBOX_DIGEST_EVENT };
  } catch (error) {
    console.error('[account/notifications] saveNotificationPreferencesAction failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export { DEFAULT_PREFERENCES };
