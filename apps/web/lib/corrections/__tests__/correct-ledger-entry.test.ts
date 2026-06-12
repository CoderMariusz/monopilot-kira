import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signEvent } from '@monopilot/e-sign';

import {
  assertCorrectionAllowed,
  CLOSED_WO_CORRECTION_PERMISSION,
  CORRECTION_REASON_CODES,
  insertCounterEntry,
} from '../correct-ledger-entry';
import type { ProductionContext, QueryClient } from '../../production/shared';

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '99999999-9999-4999-8999-999999999999',
    signerUserId: USER_ID,
    intent: 'prod.output.void',
    subjectHash: 'hash',
    signedAt: '2026-06-12T00:00:00.000Z',
    auditEventId: 123,
    nonce: 'nonce',
  })),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let granted: Set<string>;
let queries: Array<{ sql: string; params: readonly unknown[] }>;
let ctx: ProductionContext;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const normalized = normalize(sql);
      if (normalized.includes('from public.user_roles')) {
        const permission = String(params[2] ?? '');
        const ok = granted.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.wo_waste_log')) {
        return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${normalized}`);
    }),
  };
}

beforeEach(() => {
  granted = new Set(['production.output.correct']);
  queries = [];
  ctx = { userId: USER_ID, orgId: ORG_ID, client: makeClient() };
  vi.mocked(signEvent).mockClear();
});

describe('correction framework authorization', () => {
  it('denies when the correction permission is missing', async () => {
    granted = new Set();

    await expect(
      assertCorrectionAllowed(ctx, {
        permission: 'production.output.correct',
        woStatus: 'completed',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    expect(signEvent).not.toHaveBeenCalled();
  });

  it('requires the closed-WO tier permission in addition to the correction permission', async () => {
    await expect(
      assertCorrectionAllowed(ctx, {
        permission: 'production.output.correct',
        woStatus: 'closed',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    granted.add(CLOSED_WO_CORRECTION_PERMISSION);

    await expect(
      assertCorrectionAllowed(ctx, {
        permission: 'production.output.correct',
        woStatus: 'closed',
      }),
    ).resolves.toEqual({});
  });

  it('calls the e-sign seam when requireEsign=true', async () => {
    const result = await assertCorrectionAllowed(ctx, {
      permission: 'production.output.correct',
      woStatus: 'completed',
      requireEsign: true,
      signature: {
        pin: '123456',
        intent: 'prod.output.void',
        reason: 'entry_error',
        nonce: 'correction-nonce',
        subject: { output_id: '33333333-3333-4333-8333-333333333333' },
      },
    });

    expect(result.signatureReceipt?.signatureId).toBe('99999999-9999-4999-8999-999999999999');
    expect(signEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        signerUserId: USER_ID,
        pin: '123456',
        intent: 'prod.output.void',
        reason: 'entry_error',
        nonce: 'correction-nonce',
        subject: expect.objectContaining({
          correction_permission: 'production.output.correct',
          output_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      expect.objectContaining({ client: ctx.client }),
    );
  });

  it('exposes the canonical reason codes and deterministic transaction-id convention', async () => {
    expect(CORRECTION_REASON_CODES).toEqual(['entry_error', 'wrong_quantity', 'wrong_batch', 'wrong_product', 'other']);

    await insertCounterEntry(ctx, {
      table: 'wo_waste_log',
      originalId: '44444444-4444-4444-8444-444444444444',
      reasonCode: 'entry_error',
      transactionIdColumn: 'transaction_id',
      values: {
        wo_id: '55555555-5555-4555-8555-555555555555',
        qty_kg: '-1.000',
      },
    });
    await insertCounterEntry(ctx, {
      table: 'wo_waste_log',
      originalId: '44444444-4444-4444-8444-444444444444',
      reasonCode: 'entry_error',
      transactionIdColumn: 'transaction_id',
      values: {
        wo_id: '55555555-5555-4555-8555-555555555555',
        qty_kg: '-1.000',
      },
    });

    const inserts = queries.filter((q) => normalize(q.sql).startsWith('insert into public.wo_waste_log'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.params[1]).toBe(inserts[1]?.params[1]);
  });
});
