import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  QA_HOLD_ACTIVE,
  QaHoldActiveError,
  assertNoActiveHoldForLp,
  assertNoActiveHoldForWo,
} from '../holdsGuard.js';

// 09-Quality T-064 — holdsGuard consume-gate contract.
// Unit: QaHoldActiveError envelope shape (the pinned cross-module contract).
// Integration (DATABASE_URL): assertNoActiveHoldForWo/Lp over the v_active_holds SECURITY INVOKER
// view — returns void when no active hold, throws QaHoldActiveError(409) when one exists, and is
// RLS-isolated (tenant B's holds are invisible to tenant A).

describe('QaHoldActiveError envelope (unit)', () => {
  it('carries the pinned {code, hold_number, priority, reason_code} envelope + 409 status', () => {
    const err = new QaHoldActiveError('HLD-00001234', 'critical', null);
    expect(err).toBeInstanceOf(QaHoldActiveError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.code).toBe(QA_HOLD_ACTIVE);
    expect(err.toEnvelope()).toEqual({
      code: 'QA_HOLD_ACTIVE',
      hold_number: 'HLD-00001234',
      priority: 'critical',
      reason_code: null,
    });
  });

  it('throws on an active LP hold from the caller context client', async () => {
    const queries: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        return { rows: [{ hold_number: 'HLD-00000042', priority: 'critical' }], rowCount: 1 };
      },
    };

    await expect(assertNoActiveHoldForLp('11111111-1111-4111-8111-111111111111', client)).rejects.toMatchObject({
      status: 409,
      code: 'QA_HOLD_ACTIVE',
      holdNumber: 'HLD-00000042',
    });
    expect(queries[0]?.sql).toContain('from public.v_active_holds');
    expect(queries[0]?.sql).toContain('reference_text');
    expect(queries[0]?.sql).toContain('supplier_batch_number');
    expect(queries[0]?.sql).toContain('app.current_org_id()');
    expect(queries[0]?.values).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('passes when no active LP or batch hold covers the LP', async () => {
    const client = {
      query: async () => ({ rows: [], rowCount: 0 }),
    };

    await expect(assertNoActiveHoldForLp('11111111-1111-4111-8111-111111111111', client)).resolves.toBeUndefined();
  });

  it('throws on an active batch hold that expands to the LP batch', async () => {
    const client = {
      query: async (sql: string) => {
        expect(sql).toContain("h.reference_type = 'batch'");
        // Post-mig-412 normalization: both the hold reference_text and the LP columns are
        // compared via lower(trim(...)) so whitespace/case differences never cause a miss.
        expect(sql).toContain('lower(trim(h.reference_text))');
        expect(sql).toContain('lp.batch_number');
        expect(sql).toContain('lp.supplier_batch_number');
        return { rows: [{ hold_number: 'HLD-00000043', priority: 'high' }], rowCount: 1 };
      },
    };

    await expect(assertNoActiveHoldForLp('11111111-1111-4111-8111-111111111111', client)).rejects.toMatchObject({
      status: 409,
      code: 'QA_HOLD_ACTIVE',
      holdNumber: 'HLD-00000043',
    });
  });

  it('normalizes LP batch columns with lower(trim()) in the CTE so mixed-case / padded batch holds match', async () => {
    const queries: Array<{ sql: string }> = [];
    const client = {
      query: async (sql: string) => {
        queries.push({ sql });
        return { rows: [], rowCount: 0 };
      },
    };

    await assertNoActiveHoldForLp('11111111-1111-4111-8111-111111111111', client);
    const sql = queries[0]?.sql ?? '';
    // CTE must normalise LP batch columns so the IN comparison is case/trim-insensitive.
    expect(sql).toContain('nullif(lower(trim(batch_number))');
    expect(sql).toContain('nullif(lower(trim(supplier_batch_number))');
    // Hold side must also be normalised.
    expect(sql).toContain('lower(trim(h.reference_text))');
  });

  it('throws on an active WO hold from v_active_holds', async () => {
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        expect(sql).toContain('from public.v_active_holds');
        expect(sql).toContain('reference_type = $1');
        expect(values).toEqual(['wo', '22222222-2222-4222-8222-222222222222']);
        return { rows: [{ hold_number: 'HLD-00000044', priority: 'medium' }], rowCount: 1 };
      },
    };

    await expect(assertNoActiveHoldForWo('22222222-2222-4222-8222-222222222222', client)).rejects.toMatchObject({
      status: 409,
      code: 'QA_HOLD_ACTIVE',
      holdNumber: 'HLD-00000044',
    });
  });
});

const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

const tenantId = '09020000-0000-4000-8000-000000000001';
const orgAId = '09020000-0000-4000-8000-0000000000a0';
const orgBId = '09020000-0000-4000-8000-0000000000b0';

runIntegration('holdsGuard over v_active_holds (integration)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let userA: string;
  let userB: string;

  async function seedOrg(id: string, slug: string): Promise<void> {
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Guard Org', $3, 'fmcg') on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }

  async function makeUser(orgId: string): Promise<string> {
    const { rows } = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 limit 1`,
      [orgId],
    );
    const roleId = rows[0]?.id ?? randomUUID();
    if (!rows[0]) {
      await ownerPool.query(
        `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
         values ($1, $2, 'g', 'g', 'G', '[]'::jsonb, false, 999)`,
        [roleId, orgId],
      );
    }
    const id = randomUUID();
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id) values ($1, $2, $3, 'G', $4)`,
      [id, orgId, `g-${id.slice(0, 8)}@example.test`, roleId],
    );
    return id;
  }

  async function insertHold(
    orgId: string,
    createdBy: string,
    referenceType: string,
    referenceId: string,
    holdStatus: string,
    releasedAt: string | null,
  ): Promise<void> {
    await ownerPool.query(
      `insert into public.quality_holds
         (org_id, reference_type, reference_id, priority, hold_status, created_by, released_at)
       values ($1, $2, $3, 'high', $4, $5, $6)`,
      [orgId, referenceType, referenceId, holdStatus, createdBy, releasedAt],
    );
  }

  async function runUnderOrg<T>(orgId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    ownerPool = new pg.Pool({ connectionString: databaseUrl });
    appPool = new pg.Pool({ connectionString: databaseUrl });
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'guard tenant', 'eu', 'https://guard.example') on conflict (id) do nothing`,
      [tenantId],
    );
    await seedOrg(orgAId, 'guard-a');
    await seedOrg(orgBId, 'guard-b');
    userA = await makeUser(orgAId);
    userB = await makeUser(orgBId);
  });

  afterAll(async () => {
    for (const orgId of [orgAId, orgBId]) {
      await ownerPool.query(`delete from public.quality_holds where org_id = $1`, [orgId]).catch(() => undefined);
      await ownerPool.query(`delete from public.users where org_id = $1`, [orgId]).catch(() => undefined);
      await ownerPool
        .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = $1`, [orgId])
        .catch(() => undefined);
      await ownerPool.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
      await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    }
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('returns void when no active hold covers the WO', async () => {
    const woId = randomUUID();
    await runUnderOrg(orgAId, async (c) => {
      await expect(assertNoActiveHoldForWo(woId, c)).resolves.toBeUndefined();
    });
  });

  it('throws QaHoldActiveError(409) when an active hold covers the WO', async () => {
    const woId = randomUUID();
    await insertHold(orgAId, userA, 'wo', woId, 'open', null);
    await runUnderOrg(orgAId, async (c) => {
      await expect(assertNoActiveHoldForWo(woId, c)).rejects.toMatchObject({
        status: 409,
        code: 'QA_HOLD_ACTIVE',
      });
    });
  });

  it('returns void when the only hold on the LP is released (excluded by v_active_holds)', async () => {
    const lpId = randomUUID();
    await insertHold(orgAId, userA, 'lp', lpId, 'released', '2026-01-01T00:00:00Z');
    await runUnderOrg(orgAId, async (c) => {
      await expect(assertNoActiveHoldForLp(lpId, c)).resolves.toBeUndefined();
    });
  });

  it('is RLS-isolated: tenant B does not see tenant A active holds (SECURITY INVOKER)', async () => {
    const sharedRef = randomUUID();
    await insertHold(orgAId, userA, 'wo', sharedRef, 'open', null);
    // Under org B context the same reference has no visible hold → guard passes.
    await runUnderOrg(orgBId, async (c) => {
      await expect(assertNoActiveHoldForWo(sharedRef, c)).resolves.toBeUndefined();
    });
    // Under org A context the hold IS visible → guard throws.
    await runUnderOrg(orgAId, async (c) => {
      await expect(assertNoActiveHoldForWo(sharedRef, c)).rejects.toBeInstanceOf(QaHoldActiveError);
    });
  });
});
