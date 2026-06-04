/**
 * T-030 — GET /api/settings/d365/health route (real-DB).
 *
 * Exercises the route through the withOrgContext test-env stub. Skipped when
 * DATABASE_URL is unset. Asserts:
 *   - 403 when the caller lacks technical.d365.sync_trigger.
 *   - 412 when the flag is off (V-TEC-70).
 *   - 200 with a SANITIZED { connected, latency_ms, last_sync_at } body and no
 *     secret fields when enabled + constants present (AC3).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  makeHarness,
  enableD365Flag,
  seedD365Constants,
  type Harness,
  type TestOrg,
} from '../../../../../../lib/integrations/d365/__tests__/helpers';

const run = process.env.DATABASE_URL ? describe : describe.skip;

function withStub(org: TestOrg): void {
  process.env.NODE_ENV = 'test';
  process.env.VITEST = '1';
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = org.userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = org.orgId;
}

function clearStub(): void {
  delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  delete process.env.NEXT_SERVER_ACTION_ORG_ID;
}

run('T-030 GET /api/settings/d365/health', () => {
  let h: Harness;

  beforeAll(() => {
    h = makeHarness();
  });

  afterEach(() => {
    clearStub();
  });

  afterAll(async () => {
    await h.cleanup();
  });

  it('403 when the caller lacks technical.d365.sync_trigger', async () => {
    const org = await h.createOrg({ grantSyncTrigger: false });
    await enableD365Flag(h.owner, org.orgId, true);
    await seedD365Constants(h.owner, org.orgId);
    withStub(org);

    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('412 (V-TEC-70) when integration.d365.enabled=false', async () => {
    const org = await h.createOrg();
    await enableD365Flag(h.owner, org.orgId, false);
    await seedD365Constants(h.owner, org.orgId);
    withStub(org);

    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(412);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('V-TEC-70');
  });

  it('AC3: 200 with sanitized { connected, latency_ms, last_sync_at } and no secrets', async () => {
    const org = await h.createOrg();
    await enableD365Flag(h.owner, org.orgId, true);
    await seedD365Constants(h.owner, org.orgId);
    withStub(org);

    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('connected');
    expect(body).toHaveProperty('latency_ms');
    expect(body).toHaveProperty('last_sync_at');

    // No secret field may leak.
    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ['secret', 'bearer', 'password', 'client_id', 'tenant_id', 'oauth']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
