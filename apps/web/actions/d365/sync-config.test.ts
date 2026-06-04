import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T-111 / SET-082 — D365 Sync Config Server Actions.
 *
 * RED→GREEN: the SET-082 screen must persist REAL config (integration_settings,
 * category='d365_sync') instead of rendering fallback defaults. These tests
 * assert the load/save round-trip, the RBAC gate (settings.d365.manage), zod
 * validation, and the settings.d365_sync.updated outbox emission against an
 * in-memory fake of the org-scoped client (RLS is exercised live in the DB
 * gate; here we verify the action's contract + SQL shape).
 */

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = '22222222-2222-4222-8222-222222222222';

const { _runWithOrgContext } = vi.hoisted(() => ({ _runWithOrgContext: vi.fn() }));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _runWithOrgContext(action)),
}));

type QueryCall = { sql: string; params: readonly unknown[] };

type IntegrationRow = { id: string; org_id: string; category: string; provider: string | null; config: Record<string, unknown> };

type FakeClient = {
  calls: QueryCall[];
  integrationRows: IntegrationRow[];
  auditRows: Array<{ action: string; resource_type: string; after_state: unknown }>;
  outboxRows: Array<{ event_type: string; aggregate_type: string; payload: unknown }>;
  hasManage: boolean;
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function makeClient(options: { hasManage?: boolean } = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    integrationRows: [],
    auditRows: [],
    outboxRows: [],
    hasManage: options.hasManage ?? true,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      const paramsText = params.map(String).join(' ').toLowerCase();

      // RBAC gate
      if (n.includes('from public.user_roles')) {
        const asksManage = paramsText.includes('settings.d365.manage');
        const allowed = asksManage && n.includes('role_permissions') && client.hasManage;
        return { rows: (allowed ? [{ ok: true }] : []) as never[], rowCount: allowed ? 1 : 0 };
      }

      // applied_by label lookup
      if (n.startsWith('select') && n.includes('from public.users')) {
        return { rows: [{ label: 'Marta Owner' }] as never[], rowCount: 1 };
      }

      // Load config
      if (n.startsWith('select config') && n.includes('from public.integration_settings')) {
        const category = String(params.find((p) => p === 'd365_sync') ?? 'd365_sync');
        const row = client.integrationRows.find((r) => r.category === category);
        return { rows: (row ? [{ config: row.config }] : []) as never[], rowCount: row ? 1 : 0 };
      }

      // Upsert config
      if (n.startsWith('insert into public.integration_settings')) {
        const category = String(params.find((p) => p === 'd365_sync') ?? 'd365_sync');
        const blob = (params.map(safeJsonParse).find((p) => p && typeof p === 'object' && !Array.isArray(p)) ?? {}) as Record<string, unknown>;
        const existing = client.integrationRows.find((r) => r.category === category);
        if (existing) {
          existing.config = blob;
          existing.provider = 'd365';
          return { rows: [{ id: existing.id }] as never[], rowCount: 1 };
        }
        const id = `is-${client.integrationRows.length + 1}`;
        client.integrationRows.push({ id, org_id: ORG_ID, category, provider: 'd365', config: blob });
        return { rows: [{ id }] as never[], rowCount: 1 };
      }

      // Audit
      if (n.startsWith('insert into public.audit_events')) {
        client.auditRows.push({
          action: String(params.find((p) => typeof p === 'string' && p.includes('d365')) ?? 'd365_sync_config_update'),
          resource_type: 'integration_settings',
          after_state: safeJsonParse(params.find((p) => typeof p === 'string' && String(p).startsWith('{'))),
        });
        return { rows: [] as never[], rowCount: 1 };
      }

      // Outbox (event_type is an inlined SQL literal, not a param)
      if (n.startsWith('insert into public.outbox_events')) {
        const eventType =
          String(params.find((p) => typeof p === 'string' && String(p).startsWith('settings.')) ?? '') ||
          (/'(settings\.[a-z0-9_.]+)'/.exec(n)?.[1] ?? '');
        client.outboxRows.push({
          event_type: eventType,
          aggregate_type: 'integration_settings',
          payload: safeJsonParse(params.find((p) => typeof p === 'string' && String(p).startsWith('{'))),
        });
        return { rows: [] as never[], rowCount: 1 };
      }

      return { rows: [] as never[], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
});

async function loadModule() {
  return import('./sync-config') as Promise<typeof import('./sync-config')>;
}

const validInput = {
  pull_cron: '0 * * * *',
  batch_size: 100,
  max_attempts: 3,
  retry_backoff_minutes: 15,
  push_queue_enabled: true,
};

describe('D365 sync config Server Actions (T-111 / SET-082)', () => {
  it('loadD365SyncConfig returns honest defaults + canEdit when no row exists yet', async () => {
    const { loadD365SyncConfig } = await loadModule();
    const result = await loadD365SyncConfig('en');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canEdit).toBe(true);
    expect(result.config.pull_cron).toBe('0 2 * * *');
    expect(result.config.batch_size).toBe(50);
    expect(result.config.dlq_href).toBe('/en/settings/integrations/d365/dlq');
    expect(result.config.last_applied_at).toBeNull();
  });

  it('loadD365SyncConfig reports canEdit=false for a caller without settings.d365.manage', async () => {
    currentClient = makeClient({ hasManage: false });
    _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 's', client: currentClient }),
    );
    const { loadD365SyncConfig } = await loadModule();
    const result = await loadD365SyncConfig('en');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canEdit).toBe(false);
  });

  it('updateD365SyncConfig persists the config and a later load reads it back (round-trip)', async () => {
    const { loadD365SyncConfig, updateD365SyncConfig } = await loadModule();

    const saved = await updateD365SyncConfig(validInput);
    expect(saved).toEqual({ ok: true });

    // The row is now persisted in integration_settings under category='d365_sync'.
    const persisted = currentClient.integrationRows.find((r) => r.category === 'd365_sync');
    expect(persisted, 'd365_sync config must be persisted to integration_settings').toBeDefined();
    expect(persisted!.config.pull_cron).toBe('0 * * * *');
    expect(persisted!.config.batch_size).toBe(100);
    expect(persisted!.config.applied_by_user).toBe('Marta Owner');
    expect(typeof persisted!.config.last_applied_at).toBe('string');

    // A subsequent load returns the persisted values (not the defaults).
    const reload = await loadD365SyncConfig('en');
    expect(reload.ok).toBe(true);
    if (!reload.ok) return;
    expect(reload.config.pull_cron).toBe('0 * * * *');
    expect(reload.config.batch_size).toBe(100);
    expect(reload.config.applied_by_user).toBe('Marta Owner');
    expect(reload.config.last_applied_at).not.toBeNull();
  });

  it('updateD365SyncConfig emits a settings.d365_sync.updated outbox event in the same txn', async () => {
    const { updateD365SyncConfig } = await loadModule();
    await updateD365SyncConfig(validInput);

    expect(currentClient.outboxRows).toHaveLength(1);
    expect(currentClient.outboxRows[0]!.event_type).toBe('settings.d365_sync.updated');
    expect(currentClient.outboxRows[0]!.aggregate_type).toBe('integration_settings');
    expect(currentClient.auditRows.some((r) => r.action.includes('d365'))).toBe(true);
  });

  it('updateD365SyncConfig refuses a caller without settings.d365.manage and persists nothing', async () => {
    currentClient = makeClient({ hasManage: false });
    _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 's', client: currentClient }),
    );
    const { updateD365SyncConfig } = await loadModule();

    const result = await updateD365SyncConfig(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/permission/i);
    expect(currentClient.integrationRows).toHaveLength(0);
    expect(currentClient.outboxRows).toHaveLength(0);
  });

  it('updateD365SyncConfig rejects an invalid cron without any DB write', async () => {
    const { updateD365SyncConfig } = await loadModule();
    const result = await updateD365SyncConfig({ ...validInput, pull_cron: '*/x * * * *' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/cron/i);
    expect(currentClient.calls.some((c) => /insert into public\.integration_settings/i.test(c.sql))).toBe(false);
  });

  it('updateD365SyncConfig rejects out-of-range numeric fields', async () => {
    const { updateD365SyncConfig } = await loadModule();
    const result = await updateD365SyncConfig({ ...validInput, batch_size: 9999 });
    expect(result.ok).toBe(false);
    expect(currentClient.integrationRows).toHaveLength(0);
  });
});
