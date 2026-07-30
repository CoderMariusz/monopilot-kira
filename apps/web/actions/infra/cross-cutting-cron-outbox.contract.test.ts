import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_EVENT = {
  org_id: '22222222-2222-4222-8222-222222222222',
  event_type: 'fg.intermediate_code_changed',
  aggregate_type: 'fg',
  aggregate_id: '33333333-3333-4333-8333-333333333333',
  payload: {
    org_id: '22222222-2222-4222-8222-222222222222',
    fg_id: '33333333-3333-4333-8333-333333333333',
    operation_name: 'Mix',
  },
  created_at: new Date('2026-07-30T12:00:00.000Z'),
  app_version: 'contract-test',
};

const state = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  consumedIds: new Set<string>(),
  deadLetteredIds: new Set<string>(),
  attempts: new Map<string, number>(),
  dispatchCalls: 0,
  dispatchFails: false,
  connectCalls: 0,
}));

function seedEvents(count: number, eventType = 'fg.intermediate_code_changed') {
  state.events = Array.from({ length: count }, (_, index) => ({
    ...BASE_EVENT,
    id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    event_type: eventType,
  }));
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const client = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    const text = normalize(sql);
    if (text.startsWith('select count(*)::text as c')) {
      const count = state.events.filter((event) => !state.consumedIds.has(String(event.id))).length;
      return { rows: [{ c: String(count) }], rowCount: 1 };
    }
    if (text.startsWith('select id, org_id, event_type')) {
      const limit = Number(text.match(/\blimit\s+(\d+)\b/)?.[1] ?? 0);
      const rows = state.events
        .filter((event) => !state.consumedIds.has(String(event.id)))
        .slice(0, limit);
      return { rows, rowCount: rows.length };
    }
    if (text.startsWith('select coalesce(attempts, 0)')) {
      return { rows: [{ attempts: state.attempts.get(String(params[0])) ?? 0 }], rowCount: 1 };
    }
    if (text.startsWith('insert into public.outbox_dead_letter')) {
      state.deadLetteredIds.add(String(params[0]));
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('update public.outbox_events') && text.includes('set consumed_at')) {
      const id = String(params[0]);
      state.consumedIds.add(id);
      state.attempts.set(id, Number(params[1] ?? state.attempts.get(id) ?? 0));
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('update public.outbox_events') && text.includes('set attempts')) {
      state.attempts.set(String(params[0]), Number(params[1]));
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${text}`);
  }),
  release: vi.fn(),
};

const pool = {
  connect: vi.fn(async () => {
    state.connectCalls += 1;
    return client;
  }),
  end: vi.fn(async () => undefined),
};

vi.mock('@monopilot/db/system-actor-connection.js', () => ({
  cronBearerMatches: (provided: string, expected: string | undefined) =>
    typeof expected === 'string' && expected.length > 0 && provided === expected,
  getSystemActorConnection: () => pool,
}));

vi.mock('../../../../packages/rule-engine/src/dispatch', () => ({
  isCascadeEvent: (eventType: string) =>
    eventType === 'fg.intermediate_code_changed'
    || eventType.includes('manufacturing_operation')
    || eventType.includes('cascade'),
  dispatchCascade: vi.fn(async () => {
    state.dispatchCalls += 1;
    if (state.dispatchFails) throw new Error('handler crashed');
  }),
}));

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/internal/cron/outbox', { headers });
}

async function route() {
  return import('../../app/api/internal/cron/outbox/route');
}

beforeEach(() => {
  seedEvents(1);
  state.consumedIds.clear();
  state.deadLetteredIds.clear();
  state.attempts.clear();
  state.dispatchCalls = 0;
  state.dispatchFails = false;
  state.connectCalls = 0;
  client.query.mockClear();
  client.release.mockClear();
  pool.connect.mockClear();
  pool.end.mockClear();
  vi.unstubAllEnvs();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('XC-001 cron platform-header contract', () => {
  it('accepts x-vercel-cron without Bearer and executes one outbox tick', async () => {
    const { GET } = await route();

    const response = await GET(request({ 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 1 });
    expect(state.dispatchCalls).toBe(1);
    expect(state.consumedIds.size).toBe(1);
  });

  it('rejects a request with neither platform header nor valid Bearer', async () => {
    const { GET } = await route();

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(state.connectCalls).toBe(0);
    expect(state.dispatchCalls).toBe(0);
  });
});

describe('XC-002 production fail-closed cron contract', () => {
  it('rejects an arbitrary Bearer when CRON_SECRET is absent in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await route();

    const response = await GET(request({ authorization: 'Bearer attacker-value' }));

    expect(response.status).toBe(401);
    expect(state.connectCalls).toBe(0);
  });

  it('keeps the non-Vercel development fallback for a non-empty Bearer', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('CRON_SECRET', '');
    state.consumedIds.add(String(state.events[0]?.id));
    const { GET } = await route();

    const response = await GET(request({ authorization: 'Bearer local-operator' }));

    expect(response.status).toBe(200);
    expect(state.connectCalls).toBe(1);
  });
});

describe('XC-004 dispatch outcome contract', () => {
  it('retains a registered handler failure for retry instead of reporting it as handled', async () => {
    state.dispatchFails = true;
    const { GET } = await route();

    const response = await GET(request({ 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(state.dispatchCalls).toBe(1);
    expect(await response.json()).toMatchObject({ ok: true, processed: 0, errors: 1 });
    expect(state.consumedIds.size).toBe(0);
    expect(state.attempts.get(String(state.events[0]?.id))).toBe(1);
  });

  it('keeps a known but unhandled event queued instead of stamping it consumed', async () => {
    seedEvents(1, 'audit.recorded');
    const { GET } = await route();

    const response = await GET(request({ 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 0 });
    expect(state.dispatchCalls).toBe(0);
    expect(state.consumedIds.size).toBe(0);
  });

  it('dead-letters an invalid cascade-shaped event instead of dispatching it', async () => {
    seedEvents(1, 'unknown.cascade');
    const eventId = String(state.events[0]?.id);
    const { GET } = await route();

    const response = await GET(request({ 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(state.dispatchCalls).toBe(0);
    expect(state.deadLetteredIds).toContain(eventId);
    expect(state.consumedIds).toContain(eventId);
  });
});

describe('XC-005 Vercel throughput contract', () => {
  it('processes a burst of 150 supported events in one cron invocation', async () => {
    seedEvents(150);
    const { GET } = await route();

    const response = await GET(request({ 'x-vercel-cron': '1' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 150 });
    expect(state.dispatchCalls).toBe(150);
    expect(state.consumedIds.size).toBe(150);
  });

  it('runs the outbox cron every five minutes', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons?: Array<{ path: string; schedule: string }> };

    expect(config.crons).toContainEqual({
      path: '/api/internal/cron/outbox',
      schedule: '*/5 * * * *',
    });
  });
});
