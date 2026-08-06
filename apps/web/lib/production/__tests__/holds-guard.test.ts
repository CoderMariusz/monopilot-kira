/**
 * E7-R1 deny-path test for the production holdsGuard batch expansion.
 *
 * Verifies that:
 * 1. A batch hold stored in reference_text (post-mig-412 model) blocks
 *    consumption when the LP's batch_number matches — the query must include
 *    the batch CTE expansion and lower/trim normalisation.
 * 2. A direct LP hold (reference_type='lp', reference_id=lpId) still blocks.
 * 3. When no hold matches, null is returned — an EMPTY RESULT SET is the
 *    expected "no hold" answer.
 * 4. Every query FAILURE (42P01 relation-missing, 42703 column drift, …) is a
 *    refusal, never "no hold" (contract changed 2026-08-06; see holds-guard.ts).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';

import { assertWoNotOnHold, holdsGuard, QualityHoldCheckFailedError } from '../holds-guard.js';

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

  // CONTRACT CHANGED 2026-08-06 (was: "fails open (returns null) on 42P01").
  // v_active_holds shipped in migration 197, so 42P01 can no longer mean
  // "09-quality isn't built yet" — it means the hold read model is gone, and
  // answering "no hold" feeds held material into production.
  function throwingCtx(code: string, message: string) {
    return {
      client: {
        query: async () => {
          throw Object.assign(new Error(message), { code });
        },
      },
    };
  }

  it.each([
    ['42P01', 'relation "v_active_holds" does not exist'],
    ['42703', 'column does not exist'],
    ['42501', 'permission denied for view v_active_holds'],
    ['08006', 'connection terminated unexpectedly'],
  ])('REFUSES (never "no hold") when the read fails with %s', async (code, message) => {
    await expect(holdsGuard(throwingCtx(code, message), { lpId: LP_ID })).rejects.toMatchObject({
      code: 'quality_hold_check_failed',
      status: 503,
    });
  });

  it('the refusal names the cause and does not leak raw SQLSTATE text', async () => {
    const err = await holdsGuard(throwingCtx('42P01', 'relation "v_active_holds" does not exist'), {
      lpId: LP_ID,
    }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(QualityHoldCheckFailedError);
    expect(err.message).toMatch(/verify quality holds/i);
    expect(err.message).not.toMatch(/does not exist/i);
    // The original error stays attached for the logs.
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('42P01');
  });

  it('assertWoNotOnHold REFUSES rather than reporting ok when the read fails', async () => {
    await expect(assertWoNotOnHold(LP_ID, throwingCtx('42P01', 'nope'))).rejects.toBeInstanceOf(
      QualityHoldCheckFailedError,
    );
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
    // users.role_id is NOT NULL — omitting it made this whole beforeAll throw,
    // which vitest reports as SKIPPED tests, so the real-Postgres half of this
    // file had never executed once (fixed 2026-08-06).
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Production Holds Guard PG User', (select id from public.roles limit 1))
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

  // ── Both directions of the fail-closed fix, against the real view ──────────
  // The two tests above are direction 3 (a REAL hold blocks). These are
  // direction 2 (healthy DB, no hold → passes) and direction 1 (the view cannot
  // be read → refuses). Without direction 2 a guard that simply always refused
  // would look "fixed" while stopping the plant.

  it('PASSES a clean LP through when the view is healthy and no hold matches', async () => {
    const lpId = await insertLp('Clean-Batch-001');

    await runUnderOrg(async (client) => {
      await expect(holdsGuard({ client }, { lpId })).resolves.toBeNull();
    });
  });

  it('REFUSES (does not answer "no hold") when v_active_holds cannot be read', async () => {
    const lpId = await insertLp('Broken-View-001');

    // Break exactly what the guard reads, inside a transaction that is rolled
    // back, so the damage never outlives this test. The rename needs owner
    // rights, so the guard runs on the owner client here; `app.current_org_id()`
    // is irrelevant because the statement fails to parse before any filtering.
    const client = await ownerPool.connect();
    try {
      await client.query('begin');
      await client.query('alter view public.v_active_holds rename to v_active_holds__fail_closed_probe');

      const error = await holdsGuard({ client }, { lpId }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(QualityHoldCheckFailedError);
      expect((error as Error).message).toMatch(/verify quality holds/i);
      expect((error as { status?: number }).status).toBe(503);
      expect((error as { cause?: { code?: string } }).cause?.code).toBe('42P01');
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }

    // …and the view is still there afterwards.
    const { rows } = await ownerPool.query<{ ok: boolean }>(
      `select to_regclass('public.v_active_holds') is not null as ok`,
    );
    expect(rows[0]?.ok).toBe(true);
  });
});
