/**
 * T-075 / SET-102 — real notification preferences read + save.
 *
 * Runs the read/save against a fake in-transaction pg client — no DB required.
 * Asserts the REAL SQL hits `public.notification_preferences` (migration 049),
 * that the projection reflects stored rows (not hardcoded defaults), and that
 * the save upserts under the VERIFIED caller id (never a 'current-user'
 * literal) plus emits a real outbox event.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, ctxRef } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  ctxRef: { userId: 'real-user-uuid', orgId: 'real-org-uuid' },
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => unknown) =>
    action({ userId: ctxRef.userId, orgId: ctxRef.orgId, sessionToken: 'tok', client: { query: queryMock } }),
}));

import {
  DEFAULT_PREFERENCES,
  readMyNotificationPreferences,
  saveNotificationPreferencesAction,
} from './notifications-data';

beforeEach(() => {
  queryMock.mockReset();
  ctxRef.userId = 'real-user-uuid';
  ctxRef.orgId = 'real-org-uuid';
});

describe('readMyNotificationPreferences — real per-user read', () => {
  it('selects from public.notification_preferences scoped by org + signed-in user', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const data = await readMyNotificationPreferences();

    expect(queryMock).toHaveBeenCalledTimes(2);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('from public.notification_preferences');
    expect(params).toEqual(['real-org-uuid', 'real-user-uuid']);
    expect(data.state).toBe('ready');
    expect(data.userId).toBe('real-user-uuid');
  });

  it('projects STORED rows over the prototype defaults (real data wins)', async () => {
    // sound_on_alert defaults false; a stored in_app row flips it true.
    // weekly_npd_digest defaults false; a stored email row flips it true.
    queryMock
      .mockResolvedValueOnce({
        rows: [
          { category: 'in_app', event: 'sound_on_alert', channel_email: false, channel_in_app: true },
          { category: 'email', event: 'weekly_npd_digest', channel_email: true, channel_in_app: false },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const data = await readMyNotificationPreferences();
    expect(data.preferences.sound_on_alert).toBe(true);
    expect(data.preferences.weekly_npd_digest).toBe(true);
    // keys with no stored row fall back to the documented baseline
    expect(data.preferences.work_order_assigned).toBe(DEFAULT_PREFERENCES.work_order_assigned);
  });

  it('degrades to the error state (logged, not thrown) when the read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValue(new Error('pool exhausted'));
    const data = await readMyNotificationPreferences();
    expect(data.state).toBe('error');
    expect(data.userId).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('saveNotificationPreferencesAction — real upsert + outbox', () => {
  it('upserts each toggle under the VERIFIED caller id and emits the outbox event', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await saveNotificationPreferencesAction({
      userId: 'spoofed-from-client',
      notification_badges: true,
      browser_push: false,
      sound_on_alert: true,
      work_order_assigned: true,
      approval_requested: false,
      daily_plant_summary: true,
      weekly_npd_digest: false,
      product_updates_tips: true,
      quiet_hours_enabled: true,
      quiet_hours_from: '22:00',
      quiet_hours_to: '07:00',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.outboxEventType).toBe('settings.notification_digest_updated');

    const upserts = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes('insert into public.notification_preferences'),
    );
    expect(upserts.length).toBe(8);
    // every upsert uses the context user id, never the spoofed client id
    for (const [, params] of upserts) {
      expect(params?.[0]).toBe('real-user-uuid');
      expect(params?.[1]).toBe('real-org-uuid');
    }
    expect(params(upserts, 'sound_on_alert')).toMatchObject({ channel_in_app: true });

    const outbox = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('insert into public.outbox_events'),
    );
    expect(outbox).toBeTruthy();
    expect(String(outbox?.[0])).toContain('public.outbox_events');
  });

  it('round-trips quiet hours through the user-level settings row', async () => {
    let quietHours: unknown[] | null = null;
    queryMock.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('insert into public.user_notification_settings')) {
        quietHours = values ?? null;
      }
      if (sql.includes('from public.user_notification_settings')) {
        return Promise.resolve({
          rows: quietHours
            ? [{
                quiet_hours_enabled: quietHours[2],
                quiet_hours_start: quietHours[3],
                quiet_hours_end: quietHours[4],
              }]
            : [],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    await saveNotificationPreferencesAction({
      userId: 'spoofed-from-client',
      ...DEFAULT_PREFERENCES,
      quiet_hours_enabled: true,
      quiet_hours_from: '22:15',
      quiet_hours_to: '06:45',
    });
    const loaded = await readMyNotificationPreferences();

    expect(loaded.preferences).toMatchObject({
      quiet_hours_enabled: true,
      quiet_hours_from: '22:15',
      quiet_hours_to: '06:45',
    });
  });

  it('returns persistence_failed (logged) when the upsert throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValue(new Error('deadlock'));
    const result = await saveNotificationPreferencesAction({
      userId: 'real-user-uuid',
      ...DEFAULT_PREFERENCES,
    });
    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    spy.mockRestore();
  });
});

function params(
  upserts: unknown[][],
  event: string,
): { channel_email: unknown; channel_in_app: unknown } {
  for (const call of upserts) {
    const p = call[1] as unknown[];
    if (p?.[3] === event) return { channel_email: p[4], channel_in_app: p[5] };
  }
  throw new Error(`no upsert for event ${event}`);
}
