import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext, QueryClient } from '../shared';

vi.mock('../holds-guard', () => ({
  assertWoNotOnHold: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({ signatureId: 'sig-1' })),
}));

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: { closedAt: '2026-06-12T12:00:00.000Z' },
  })),
  loadOrInitExecution: vi.fn(async () => ({ status: 'completed', version: 1 })),
  resolveTransition: vi.fn(() => ({ to: 'closed' })),
}));

import { assertWoNotOnHold } from '../holds-guard';
import { closeWo } from '../close-wo';
import { QualityHoldError } from '../shared';
import { applyTransition } from '../wo-state-machine';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const TX_ID = '66666666-6666-4666-8666-666666666666';

function makeClient(): QueryClient {
  return {
    query: async <T = Record<string, unknown>>(sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [] as T[], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${normalized}`);
    },
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
}

describe('closeWo WO-grain hold gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertWoNotOnHold).mockResolvedValue({ ok: true });
  });

  it('throws QualityHoldError when the WO itself is on an active hold', async () => {
    vi.mocked(assertWoNotOnHold).mockResolvedValue({
      ok: false,
      error: 'quality_hold_active',
      hold: { holdId: 'hold-1', lpId: null, lotId: null },
    });

    await expect(
      closeWo(makeCtx(), {
        woId: WO_ID,
        transactionId: TX_ID,
        signerUserId: USER_ID,
        pin: '123456',
        reason: 'financial close',
      }),
    ).rejects.toBeInstanceOf(QualityHoldError);

    expect(applyTransition).not.toHaveBeenCalled();
  });
});
