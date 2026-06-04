/**
 * T-029 — POST /api/settings/d365/dlq/[id]/retry route (real-DB).
 *
 * Focus: AC4 RBAC — a user WITHOUT technical.d365.sync_trigger gets 403 and no
 * push is attempted. Skipped when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
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

run('T-029 POST /api/settings/d365/dlq/[id]/retry', () => {
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

  it('AC4: 403 when caller lacks technical.d365.sync_trigger', async () => {
    const org = await h.createOrg({ grantSyncTrigger: false });
    await enableD365Flag(h.owner, org.orgId, true);
    await seedD365Constants(h.owner, org.orgId);
    withStub(org);

    const { POST } = await import('../[id]/retry/route');
    const res = await POST(new Request('http://local/retry', { method: 'POST' }), {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(res.status).toBe(403);
  });

  it('400 on a non-uuid dlq id', async () => {
    const org = await h.createOrg();
    withStub(org);
    const { POST } = await import('../[id]/retry/route');
    const res = await POST(new Request('http://local/retry', { method: 'POST' }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
  });
});
