import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext } from '../shared';
import { resumeWo } from '../pause-resume-wo';

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: { resumedAt: '2026-06-12T10:00:00.000Z' },
  })),
}));

vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
    writeOutbox: vi.fn(async () => undefined),
  };
});

import { applyTransition } from '../wo-state-machine';

const WO_ID = '33333333-3333-4333-8333-333333333333';
const TX_ID = '55555555-5555-4555-8555-555555555555';

function makeCtx(clientQuery = vi.fn()): ProductionContext {
  return {
    userId: '22222222-2222-4222-8222-222222222222',
    orgId: '11111111-1111-4111-8111-111111111111',
    siteId: null,
    client: { query: clientQuery },
  };
}

describe('resumeWo actualDurationMin validation (N-PRD-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects negative actualDurationMin with invalid_input before any write', async () => {
    const clientQuery = vi.fn();
    const result = await resumeWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      actualDurationMin: -5,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_input',
      status: 422,
      message: 'actualDurationMin must be a non-negative integer',
      details: { code: 'invalid_actual_duration_min', actualDurationMin: -5 },
    });
    expect(applyTransition).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('rejects non-integer actualDurationMin with invalid_input', async () => {
    const clientQuery = vi.fn();
    const result = await resumeWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      actualDurationMin: 1.5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('invalid_input');
    expect(applyTransition).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('accepts zero actualDurationMin and closes downtime', async () => {
    const clientQuery = vi.fn(async () => ({
      rows: [{ id: 'dt-1', duration_min: 0 }],
      rowCount: 1,
    }));
    const result = await resumeWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      actualDurationMin: 0,
    });

    expect(result.ok).toBe(true);
    expect(applyTransition).toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalled();
  });
});
