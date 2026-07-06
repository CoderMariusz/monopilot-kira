import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext, QueryClient } from '../shared';

vi.mock('../holds-guard', () => ({
  holdsGuard: vi.fn(async () => null),
  assertWoNotOnHold: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../oee-snapshot-producer', () => ({
  recordWoCompletionSnapshot: vi.fn(async () => undefined),
}));

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: {
      startedAt: '2026-06-12T08:00:00.000Z',
      completedAt: '2026-06-12T10:00:00.000Z',
    },
  })),
}));

import { holdsGuard, assertWoNotOnHold } from '../holds-guard';
import { completeWo } from '../complete-cancel-wo';
import { QualityHoldError } from '../shared';
import { recordWoCompletionSnapshot } from '../oee-snapshot-producer';
import { applyTransition } from '../wo-state-machine';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const OUTPUT_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const TX_ID = '66666666-6666-4666-8666-666666666666';

type QueryCall = { sql: string; params: readonly unknown[] };

let queries: QueryCall[];
let hasOverrideYieldPermission = true;
let primaryOutputGreen = false;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function activePrimaryVisibleTo(sql: string): boolean {
  const normalized = normalize(sql);
  expect(normalized).toContain('o.correction_of_id is null');

  // The ledger shape is one positive original plus one counter-entry pointing
  // back to it. The original is only excluded when the query anti-joins the
  // correction row.
  return !normalized.includes('correction.correction_of_id = o.id');
}

function makeClient(): QueryClient {
  return {
    query: async <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        const permission = String(params[2] ?? '');
        const allowed =
          permission === 'production.wo.complete' ||
          (permission === 'production.wo.override_yield' && hasOverrideYieldPermission);
        return { rows: allowed ? [{ ok: true }] as T[] : [] as T[], rowCount: allowed ? 1 : 0 };
      }

      if (normalized.startsWith('select o.id') && normalized.includes('from public.wo_outputs o')) {
        const rows = activePrimaryVisibleTo(sql)
          ? [{ id: OUTPUT_ID, output_type: 'primary', lp_id: LP_ID }]
          : [];
        return { rows: rows as T[], rowCount: rows.length };
      }

      if (normalized.startsWith('select exists') && normalized.includes('from public.wo_outputs o')) {
        return { rows: [{ green: primaryOutputGreen }] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [] as T[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.work_orders')) {
        return { rows: [] as T[], rowCount: 1 };
      }

      throw new Error(`unexpected query: ${normalized}`);
    },
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
}

describe('completeWo yield gate', () => {
  beforeEach(() => {
    queries = [];
    hasOverrideYieldPermission = true;
    primaryOutputGreen = false;
    vi.clearAllMocks();
    vi.mocked(assertWoNotOnHold).mockResolvedValue({ ok: true });
  });

  it('fails when the only primary output is voided by a correction counter-entry', async () => {
    const result = await completeWo(makeCtx(), { woId: WO_ID, transactionId: TX_ID });

    expect(result).toMatchObject({
      ok: false,
      error: 'closed_production_strict_failed',
      details: {
        code: 'output_yield_gate_failed',
        outputsRegistered: 0,
      },
    });

    const outputQueries = queries.filter((q) => normalize(q.sql).includes('from public.wo_outputs'));
    expect(outputQueries).toHaveLength(2);
    for (const query of outputQueries) {
      const normalized = normalize(query.sql);
      expect(normalized).toContain('o.correction_of_id is null');
      expect(normalized).toContain('correction.correction_of_id = o.id');
    }

    expect(holdsGuard).not.toHaveBeenCalled();
    expect(applyTransition).not.toHaveBeenCalled();
    expect(recordWoCompletionSnapshot).not.toHaveBeenCalled();
  });

  it('throws QualityHoldError when the WO itself is on an active hold', async () => {
    vi.mocked(assertWoNotOnHold).mockResolvedValue({
      ok: false,
      error: 'quality_hold_active',
      hold: { holdId: 'hold-1', lpId: null, lotId: null },
    });

    await expect(
      completeWo(makeCtx(), { woId: WO_ID, transactionId: TX_ID }),
    ).rejects.toBeInstanceOf(QualityHoldError);

    expect(holdsGuard).not.toHaveBeenCalled();
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('rejects free-text yield-gate override reason codes on the red path', async () => {
    const result = await completeWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      overrideReasonCode: 'because I said so',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_input',
      details: { code: 'invalid_yield_gate_override_reason' },
    });
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('rejects taxonomy override codes without production.wo.override_yield', async () => {
    hasOverrideYieldPermission = false;

    const result = await completeWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      overrideReasonCode: 'scrap_total_loss',
    });

    expect(result).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('allows a taxonomy override code when the supervisor permission is present', async () => {
    const result = await completeWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      overrideReasonCode: 'scrap_total_loss',
    });

    expect(result.ok).toBe(true);
    expect(applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: expect.objectContaining({ overrideReasonCode: 'scrap_total_loss' }),
      }),
    );
    expect(recordWoCompletionSnapshot).toHaveBeenCalled();
  });

  it('completes on the green path without an override reason', async () => {
    primaryOutputGreen = true;

    const result = await completeWo(makeCtx(), { woId: WO_ID, transactionId: TX_ID });

    expect(result.ok).toBe(true);
    expect(applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: expect.objectContaining({ overrideReasonCode: null }),
      }),
    );
    expect(recordWoCompletionSnapshot).toHaveBeenCalled();
  });

  it('ignores a stray override reason on the green path', async () => {
    primaryOutputGreen = true;

    const result = await completeWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      overrideReasonCode: 'because I said so',
    });

    expect(result.ok).toBe(true);
    expect(applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: expect.objectContaining({ overrideReasonCode: null }),
      }),
    );
    expect(recordWoCompletionSnapshot).toHaveBeenCalled();
  });
});
