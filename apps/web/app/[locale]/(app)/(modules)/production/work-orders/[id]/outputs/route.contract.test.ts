import { beforeEach, describe, expect, it, vi } from 'vitest';

const withOrgContextMock = vi.hoisted(() => vi.fn());
const registerOutputMock = vi.hoisted(() => vi.fn());
const emitConsumeBlockedMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (...args: unknown[]) => withOrgContextMock(...args),
}));

vi.mock('../../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => '33333333-3333-4333-8333-333333333333'),
}));

vi.mock('../../../../../../../../lib/production/output/register-output', () => ({
  registerOutput: (...args: unknown[]) => registerOutputMock(...args),
}));

vi.mock('../../../../../../../../lib/production/shared', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../../../../lib/production/shared')>();
  return { ...actual, emitConsumeBlocked: emitConsumeBlockedMock };
});

import { QualityHoldError } from '../../../../../../../../lib/production/shared';
import { POST } from './route';

const WO_ID = '11111111-1111-4111-8111-111111111111';
const LP_ID = '22222222-2222-4222-8222-222222222222';
const HOLD_ID = '44444444-4444-4444-8444-444444444444';
const TX_ID = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  withOrgContextMock.mockReset();
  registerOutputMock.mockReset();
  emitConsumeBlockedMock.mockReset();
  withOrgContextMock.mockImplementation(
    async (
      action: (ctx: {
        userId: string;
        orgId: string;
        client: { query: ReturnType<typeof vi.fn> };
      }) => Promise<unknown>,
    ) =>
      action({
        userId: '66666666-6666-4666-8666-666666666666',
        orgId: '77777777-7777-4777-8777-777777777777',
        client: { query: vi.fn() },
      }),
  );
});

describe('output route hold audit (PRD-047)', () => {
  it('uses a fresh org transaction to commit the blocked event after LP-hold rollback', async () => {
    registerOutputMock.mockRejectedValue(
      new QualityHoldError({
        hold: { holdId: HOLD_ID, lpId: LP_ID, lotId: null },
        woId: WO_ID,
        blockedPath: 'output',
        transactionId: TX_ID,
        lpId: LP_ID,
        lotId: null,
      }),
    );

    const response = await POST(
      new Request('http://test.local/outputs', {
        method: 'POST',
        body: JSON.stringify({
          transaction_id: TX_ID,
          output_type: 'primary',
          product_id: '88888888-8888-4888-8888-888888888888',
          qty_kg: '10',
          lp_id: LP_ID,
        }),
      }),
      { params: Promise.resolve({ id: WO_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'quality_hold_active',
      hold_id: HOLD_ID,
    });
    expect(withOrgContextMock).toHaveBeenCalledTimes(2);
    expect(emitConsumeBlockedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '66666666-6666-4666-8666-666666666666',
        orgId: '77777777-7777-4777-8777-777777777777',
      }),
      expect.objectContaining({
        hold: { holdId: HOLD_ID, lpId: LP_ID, lotId: null },
        lpId: LP_ID,
        blockedPath: 'output',
      }),
    );
  });

  it('does not emit a blocked event for a successful output', async () => {
    registerOutputMock.mockResolvedValue({ output_id: '99999999-9999-4999-8999-999999999999' });

    const response = await POST(
      new Request('http://test.local/outputs', {
        method: 'POST',
        body: JSON.stringify({ transaction_id: TX_ID }),
      }),
      { params: Promise.resolve({ id: WO_ID }) },
    );

    expect(response.status).toBe(200);
    expect(withOrgContextMock).toHaveBeenCalledTimes(1);
    expect(emitConsumeBlockedMock).not.toHaveBeenCalled();
  });
});
