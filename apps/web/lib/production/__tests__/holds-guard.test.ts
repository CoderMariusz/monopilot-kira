/**
 * E7-R1 deny-path test for the production holdsGuard batch expansion.
 *
 * Verifies that:
 * 1. A batch hold stored in reference_text (post-mig-412 model) blocks
 *    consumption when the LP's batch_number matches — the query must include
 *    the batch CTE expansion and lower/trim normalisation.
 * 2. A direct LP hold (reference_type='lp', reference_id=lpId) still blocks.
 * 3. When no hold matches, null is returned (fail-open per seam contract).
 * 4. 42P01 (undefined_table) is swallowed (fail-open) but other errors are
 *    rethrown (42703 contract-drift guard).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';

import { holdsGuard } from '../holds-guard.js';

const LP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOLD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeCtx(queryResult: { rows: Record<string, unknown>[] }) {
  return {
    client: {
      query: async (_sql: string, _params?: readonly unknown[]) => queryResult,
    },
  };
}

describe('production holdsGuard — batch expansion (post-mig-412)', () => {
  it('returns null when no hold matches', async () => {
    const ctx = makeCtx({ rows: [] });
    const result = await holdsGuard(ctx, { lpId: LP_ID });
    expect(result).toBeNull();
  });

  it('returns an ActiveHold when a direct LP hold matches', async () => {
    const ctx = makeCtx({ rows: [{ hold_id: HOLD_ID, reference_type: 'lp', reference_id: LP_ID }] });
    const result = await holdsGuard(ctx, { lpId: LP_ID });
    expect(result).toEqual({ holdId: HOLD_ID, lpId: LP_ID, lotId: null });
  });

  it('returns an ActiveHold when a batch hold matches via reference_text (deny-path)', async () => {
    const ctx = makeCtx({ rows: [{ hold_id: HOLD_ID, reference_type: 'batch', reference_id: null }] });
    const result = await holdsGuard(ctx, { lpId: LP_ID });
    expect(result).toEqual({ holdId: HOLD_ID, lpId: null, lotId: null });
  });

  it('the query uses a CTE joining license_plates to expand batch holds via reference_text', async () => {
    const capturedSqls: string[] = [];
    const ctx = {
      client: {
        query: async (sql: string, _params?: readonly unknown[]) => {
          capturedSqls.push(sql);
          return { rows: [] };
        },
      },
    };

    await holdsGuard(ctx, { lpId: LP_ID });

    const sql = capturedSqls[0] ?? '';
    // Must join license_plates in a CTE for the batch expansion.
    expect(sql).toContain('license_plates');
    // Batch hold expansion uses reference_text, not reference_id.
    expect(sql).toContain('reference_text');
    // Normalisation must be present on the LP side.
    expect(sql).toContain('lower(trim(');
    // Normalisation must be present on the hold side.
    expect(sql).toContain('lower(trim(h.reference_text))');
    // LP hold path still present.
    expect(sql).toContain("reference_type = 'lp'");
  });

  it('returns null when lpId and lotId are both null/undefined (nothing to check)', async () => {
    const ctx = makeCtx({ rows: [{ hold_id: HOLD_ID, reference_type: 'lp', reference_id: LP_ID }] });
    const result = await holdsGuard(ctx, {});
    expect(result).toBeNull();
  });

  it('falls back to lotId UUID path for pre-412 batch holds carrying reference_id', async () => {
    const ctx = makeCtx({ rows: [{ hold_id: HOLD_ID, reference_type: 'batch', reference_id: LOT_ID }] });
    const result = await holdsGuard(ctx, { lotId: LOT_ID });
    // When match is via the lotId fallback, lotId is returned in the envelope.
    expect(result).toEqual({ holdId: HOLD_ID, lpId: null, lotId: LOT_ID });
  });

  it('fails open (returns null) on 42P01 undefined_table', async () => {
    const ctx = {
      client: {
        query: async () => {
          const err = new Error('relation does not exist') as Error & { code: string };
          err.code = '42P01';
          throw err;
        },
      },
    };
    const result = await holdsGuard(ctx, { lpId: LP_ID });
    expect(result).toBeNull();
  });

  it('rethrows non-42P01 errors (42703 column drift must surface)', async () => {
    const ctx = {
      client: {
        query: async () => {
          const err = new Error('column does not exist') as Error & { code: string };
          err.code = '42703';
          throw err;
        },
      },
    };
    await expect(holdsGuard(ctx, { lpId: LP_ID })).rejects.toMatchObject({ code: '42703' });
  });
});

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const itemId = randomUUID();
const warehouseId = randomUUID();

runIntegrationSuite('production holdsGuard real Postgres behavior', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Production Holds Guard PG Tenant', 'eu', 'https://holds-guard.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Production Holds Guard PG Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `holds-guard-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'Production Holds Guard PG User')
       on conflict (id) do nothing`,
      [userId, orgId, `holds-guard-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, $3, 'rm', 'Production Holds Guard PG Item', 'kg', $4)
       on conflict (id) do nothing`,
      [itemId, orgId, `HOLD-PG-${itemId.slice(0, 8)}`, userId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.quality_holds where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where id = $1', [itemId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  async function insertLp(batchNumber: string, supplierBatchNumber: string | null = null): Promise<string> {
    const lpId = randomUUID();
    await ownerPool.query(
      `insert into public.license_plates
         (id, org_id, warehouse_id, lp_number, product_id, quantity, uom, qa_status, batch_number, supplier_batch_number, created_by, updated_by)
       values ($1, $2, $3, $4, $5, 10, 'kg', 'released', $6, $7, $8, $8)`,
      [lpId, orgId, warehouseId, `LP-${lpId.slice(0, 8)}`, itemId, batchNumber, supplierBatchNumber, userId],
    );
    return lpId;
  }

  async function insertHold(input: {
    referenceType: 'lp' | 'batch' | 'wo' | 'po' | 'grn';
    referenceId?: string | null;
    referenceText?: string | null;
    status?: 'open' | 'investigating' | 'released' | 'quarantined' | 'escalated';
    releasedAt?: string | null;
  }): Promise<string> {
    const holdId = randomUUID();
    await ownerPool.query(
      `insert into public.quality_holds
         (id, org_id, reference_type, reference_id, reference_text, priority, hold_status, created_by, released_at)
       values ($1, $2, $3, $4, $5, 'high', $6, $7, $8)`,
      [
        holdId,
        orgId,
        input.referenceType,
        input.referenceId ?? null,
        input.referenceText ?? null,
        input.status ?? 'open',
        userId,
        input.releasedAt ?? null,
      ],
    );
    return holdId;
  }

  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('rollback');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool.query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken]);
    }
  }

  it('expands active batch holds through LP batch text case-insensitively and trimmed', async () => {
    const lpId = await insertLp('Batch-Case-001', 'Supplier-Case-001');
    const holdId = await insertHold({
      referenceType: 'batch',
      referenceText: '  batch-case-001  ',
    });

    await runUnderOrg(async (client) => {
      await expect(holdsGuard({ client }, { lpId })).resolves.toEqual({
        holdId,
        lpId: null,
        lotId: null,
      });
    });
  });

  it('does not return a stale active row after release before a new hold on the same batch', async () => {
    const lpId = await insertLp('Flip-Guard-001');
    const staleHoldId = await insertHold({
      referenceType: 'batch',
      referenceText: 'flip-guard-001',
      status: 'open',
    });
    await ownerPool.query(
      `update public.quality_holds
          set hold_status = 'released',
              released_at = now(),
              released_by = $2
        where id = $1`,
      [staleHoldId, userId],
    );
    const activeHoldId = await insertHold({
      referenceType: 'batch',
      referenceText: ' FLIP-GUARD-001 ',
      status: 'open',
    });

    await runUnderOrg(async (client) => {
      await expect(holdsGuard({ client }, { lpId })).resolves.toEqual({
        holdId: activeHoldId,
        lpId: null,
        lotId: null,
      });
    });
  });
});
