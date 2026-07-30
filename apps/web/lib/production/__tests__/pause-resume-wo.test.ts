import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductionContext } from '../shared';
import { pauseWo, resumeWo } from '../pause-resume-wo';

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
const CATEGORY_ID = '66666666-6666-4666-8666-666666666666';
const LINE_ID = '77777777-7777-4777-8777-777777777777';

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
      message: 'actualDurationMin must be a positive integer',
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

  it('rejects zero actualDurationMin with invalid_input before any write', async () => {
    const clientQuery = vi.fn();
    const result = await resumeWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      actualDurationMin: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_input',
      message: 'actualDurationMin must be a positive integer',
      details: { code: 'invalid_actual_duration_min', actualDurationMin: 0 },
    });
    expect(applyTransition).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('keeps sub-minute downtime rows and annotates actualDurationSec in ext_jsonb', async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('set ended_at = case')) {
        return { rows: [{ id: 'dt-1', duration_min: 0 }], rowCount: 1 };
      }
      if (normalized.includes('durationbelowminute')) {
        return {
          rows: [{ id: 'dt-1', duration_min: 0, actual_duration_sec: 42 }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await resumeWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      actualDurationMin: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.downtimeEventId).toBe('dt-1');
    expect(result.data.durationMin).toBe(0);
    expect(result.data.durationBelowMinute).toBe(true);
    expect(result.data.actualDurationSec).toBe(42);
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(String(clientQuery.mock.calls[1]?.[0])).toContain('durationBelowMinute');
    expect(String(clientQuery.mock.calls[1]?.[0])).not.toContain('delete from');
  });

  it('keeps positive-duration downtime rows on resume', async () => {
    const clientQuery = vi.fn(async () => ({
      rows: [{ id: 'dt-1', duration_min: 6 }],
      rowCount: 1,
    }));
    const result = await resumeWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      actualDurationMin: 6,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.downtimeEventId).toBe('dt-1');
    expect(result.data.durationMin).toBe(6);
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });
});

describe('pauseWo downtime site stamping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives downtime_events.site_id from the source WO before insert', async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.toLowerCase().includes('insert into public.downtime_events')) {
        return { rows: [{ id: 'dt-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await pauseWo(makeCtx(clientQuery), {
      woId: WO_ID,
      transactionId: TX_ID,
      reasonCategoryId: CATEGORY_ID,
      lineId: LINE_ID,
    });

    expect(result.ok).toBe(true);
    const insertSql = String(clientQuery.mock.calls[0]?.[0]).replace(/\s+/g, ' ').toLowerCase();
    expect(insertSql).toContain('(org_id, site_id, line_id');
    expect(insertSql).toContain('from public.work_orders wo');
    expect(insertSql).toContain('coalesce(wo.site_id');
  });
});
