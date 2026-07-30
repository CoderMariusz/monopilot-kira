import { beforeEach, describe, expect, it, vi } from 'vitest';

import { closeWo } from '../../../../../../lib/production/close-wo';
import { cancelWo, completeWo } from '../../../../../../lib/production/complete-cancel-wo';
import { pauseWo, resumeWo } from '../../../../../../lib/production/pause-resume-wo';
import { registerOutput } from '../../../../../../lib/production/output/register-output';
import {
  type ProductionContext,
  type QueryClient,
} from '../../../../../../lib/production/shared';
import { startWo } from '../../../../../../lib/production/start-wo';
import { recordWaste } from '../../../../../../lib/production/waste/record-waste';

const applyTransitionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../lib/production/wo-state-machine', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../../lib/production/wo-state-machine')>();
  return { ...actual, applyTransition: applyTransitionMock };
});

vi.mock('../../../../../../lib/production/holds-guard', () => ({
  holdsGuard: vi.fn(async () => null),
  assertWoNotOnHold: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../../../../../lib/production/evaluate-closed-production-strict', () => ({
  evaluateClosedProductionStrict: vi.fn(async () => null),
}));

vi.mock('../../../../../../lib/planning/upstream-wip-dependency-gate', () => ({
  assertUpstreamWipReady: vi.fn(async () => null),
  upstreamWipNotReadyMessage: vi.fn(() => 'upstream blocked'),
}));

vi.mock('../../../../../../lib/production/oee-snapshot-producer', () => ({
  recordWoCompletionSnapshot: vi.fn(async () => ({ recorded: true, snapshotId: 'snapshot-1' })),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const TX_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

type Call = { sql: string; params: readonly unknown[] };
let calls: Call[];
let permissionsAllowed: boolean;
let executionVisible: boolean;
let primaryOutputGreen: boolean;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const query = normalize(sql);
      if (query.includes('from public.user_roles')) {
        return { rows: permissionsAllowed ? [{ ok: true }] : [], rowCount: permissionsAllowed ? 1 : 0 };
      }
      if (query.includes('from public.wo_executions')) {
        return {
          rows: executionVisible ? [{ status: 'planned', version: 0 }] : [],
          rowCount: executionVisible ? 1 : 0,
        };
      }
      if (query.startsWith('select o.id') && query.includes('from public.wo_outputs o')) {
        return { rows: [], rowCount: 0 };
      }
      if (query.startsWith('select exists') && query.includes('from public.wo_outputs o')) {
        return { rows: [{ green: primaryOutputGreen }], rowCount: 1 };
      }
      if (query.startsWith('update public.work_orders')) return { rows: [], rowCount: 1 };
      if (query.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${query}`);
    }),
  } as QueryClient;
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
}

beforeEach(() => {
  calls = [];
  permissionsAllowed = true;
  executionVisible = true;
  primaryOutputGreen = false;
  applyTransitionMock.mockReset();
  applyTransitionMock.mockResolvedValue({
    ok: true,
    data: { cancelledAt: '2026-07-30T10:00:00.000Z' },
  });
});

describe('cancel terminal contract (PRD-023)', () => {
  it('rejects a missing reason and does not transition', async () => {
    const result = await cancelWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCode: '   ',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_input',
      status: 422,
      message: 'reasonCode is required',
    });
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it('cancels a planned WO and emits the terminal cancelled payload', async () => {
    const result = await cancelWo(makeCtx(), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCode: 'planner_cancel',
    });

    expect(result).toMatchObject({
      ok: true,
      data: { status: 'cancelled', cancelledAt: '2026-07-30T10:00:00.000Z' },
    });
    expect(applyTransitionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        verb: 'cancel',
        reason: 'planner_cancel',
        context: { reasonCode: 'planner_cancel', notes: null },
      }),
    );
    const outbox = calls.find((call) =>
      normalize(call.sql).startsWith('insert into public.outbox_events'),
    );
    expect(outbox?.params[0]).toBe('production.wo.closed');
    expect(String(outbox?.params[3])).toContain('"terminal":"cancelled"');
    expect(String(outbox?.params[3])).toContain('"reasonCode":"planner_cancel"');
  });
});

describe('cross-org WO isolation (PRD-118)', () => {
  it('allows a visible WO to reach the completion transition', async () => {
    primaryOutputGreen = true;
    applyTransitionMock.mockResolvedValueOnce({
      ok: true,
      data: {
        startedAt: '2026-07-30T08:00:00.000Z',
        completedAt: '2026-07-30T10:00:00.000Z',
      },
    });

    const result = await completeWo(makeCtx(), { woId: WO_ID, transactionId: TX_ID });

    expect(result).toMatchObject({
      ok: true,
      data: { woId: WO_ID, status: 'completed' },
    });
    expect(applyTransitionMock).toHaveBeenCalledOnce();
  });

  it('maps an invisible WO on complete to not_found, never a yield diagnosis', async () => {
    executionVisible = false;

    const result = await completeWo(makeCtx(), { woId: WO_ID, transactionId: TX_ID });

    expect(result).toMatchObject({ ok: false, error: 'not_found', status: 404 });
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });
});

describe('exact server-side permission matrix (PRD-120)', () => {
  it('rejects every production mutation with its exact permission when none are granted', async () => {
    permissionsAllowed = false;
    const ctx = makeCtx();

    await expect(startWo(ctx, { woId: WO_ID, transactionId: TX_ID })).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
      status: 403,
    });
    await expect(
      pauseWo(ctx, {
        woId: WO_ID,
        transactionId: TX_ID,
        reasonCategoryId: CATEGORY_ID,
        lineId: LINE_ID,
      }),
    ).resolves.toMatchObject({ ok: false, error: 'forbidden', status: 403 });
    await expect(resumeWo(ctx, { woId: WO_ID, transactionId: TX_ID })).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
      status: 403,
    });
    await expect(completeWo(ctx, { woId: WO_ID, transactionId: TX_ID })).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
      status: 403,
    });
    await expect(
      closeWo(ctx, {
        woId: WO_ID,
        transactionId: TX_ID,
        signerUserId: USER_ID,
        pin: '123456',
        reason: 'Supervisor close',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'forbidden', status: 403 });
    await expect(
      cancelWo(ctx, { woId: WO_ID, transactionId: TX_ID, reasonCode: 'planner_cancel' }),
    ).resolves.toMatchObject({ ok: false, error: 'forbidden', status: 403 });
    await expect(
      registerOutput(ctx, WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: PRODUCT_ID,
        qty_kg: '1',
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(
      recordWaste(ctx, WO_ID, {
        transaction_id: TX_ID,
        category_code: 'PROCESS',
        qty_kg: '1',
        shift_id: 'morning',
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });

    const requested = calls
      .filter((call) => normalize(call.sql).includes('from public.user_roles'))
      .map((call) => call.params[2]);
    expect(requested).toEqual([
      'production.wo.start',
      'production.wo.pause',
      'production.wo.resume',
      'production.wo.complete',
      'production.wo.close',
      'production.wo.cancel',
      'production.output.write',
      'production.waste.write',
    ]);
  });
});
