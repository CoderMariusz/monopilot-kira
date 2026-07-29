import { describe, expect, it, vi } from 'vitest';

import {
  ChainQtySyncRollbackError,
  type ChainEdgeSnapshot,
} from './wo-chain-qty-sync';
import {
  propagateParentWoChainScheduledDates,
  shiftScheduledTimeByParentDelta,
} from './wo-chain-date-sync';

const CHILD_WO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function edge(overrides: Partial<ChainEdgeSnapshot> = {}): ChainEdgeSnapshot {
  return {
    childWoId: CHILD_WO_ID,
    childStatus: 'DRAFT',
    childProductId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    linkProductId: null,
    linkBomItemId: null,
    childScheduledStartTime: '2026-07-25T00:00:00.000Z',
    childScheduledEndTime: '2026-07-25T08:00:00.000Z',
    ...overrides,
  };
}

describe('shiftScheduledTimeByParentDelta', () => {
  it('PF-R11-01: shifts child start by parent delta (preserves offset)', () => {
    expect(
      shiftScheduledTimeByParentDelta(
        '2026-07-25T00:00:00.000Z',
        '2026-07-25T00:00:00.000Z',
        '2026-07-26T00:00:00.000Z',
      ),
    ).toBe('2026-07-26T00:00:00.000Z');
  });

  it('preserves a non-zero parent-child offset after parent move', () => {
    expect(
      shiftScheduledTimeByParentDelta(
        '2026-07-24T00:00:00.000Z',
        '2026-07-26T00:00:00.000Z',
        '2026-07-28T00:00:00.000Z',
      ),
    ).toBe('2026-07-26T00:00:00.000Z');
  });

  it('clears child schedule when parent schedule is cleared', () => {
    expect(
      shiftScheduledTimeByParentDelta(
        '2026-07-25T00:00:00.000Z',
        '2026-07-25T00:00:00.000Z',
        null,
      ),
    ).toBeNull();
  });

  it('preserves null child timestamp when parent schedule moves', () => {
    expect(
      shiftScheduledTimeByParentDelta(
        null,
        '2026-07-25T00:00:00.000Z',
        '2026-07-26T00:00:00.000Z',
      ),
    ).toBeNull();
  });

  it('keeps child unchanged when parent had no previous start', () => {
    expect(
      shiftScheduledTimeByParentDelta(
        '2026-07-25T00:00:00.000Z',
        null,
        '2026-07-26T00:00:00.000Z',
      ),
    ).toBe('2026-07-25T00:00:00.000Z');
  });
});

describe('propagateParentWoChainScheduledDates', () => {
  it('writes shifted child scheduled_start/end in the same txn path', async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ id: CHILD_WO_ID }], rowCount: 1 })),
    };

    await propagateParentWoChainScheduledDates(
      { userId: 'user', orgId: 'org', client },
      'user',
      [edge({ childScheduledEndTime: null })],
      {
        parentOldScheduledStart: '2026-07-25T00:00:00.000Z',
        parentNewScheduledStart: '2026-07-26T00:00:00.000Z',
      },
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('scheduled_start_time = $2::timestamptz'),
      [
        CHILD_WO_ID,
        '2026-07-26T00:00:00.000Z',
        null,
        'user',
      ],
    );
  });

  it('throws chain_child_not_editable when child progressed', async () => {
    const client = { query: vi.fn() };

    await expect(
      propagateParentWoChainScheduledDates(
        { userId: 'user', orgId: 'org', client },
        'user',
        [edge({ childStatus: 'IN_PROGRESS' })],
        {
          parentOldScheduledStart: '2026-07-25T00:00:00.000Z',
          parentNewScheduledStart: '2026-07-26T00:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ChainQtySyncRollbackError);

    expect(client.query).not.toHaveBeenCalled();
  });
});
