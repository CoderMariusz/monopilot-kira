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

import { describe, expect, it } from 'vitest';
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
