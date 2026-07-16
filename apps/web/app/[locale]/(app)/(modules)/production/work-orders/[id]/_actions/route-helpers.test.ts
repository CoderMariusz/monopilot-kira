import { describe, expect, it } from 'vitest';

import type { ProductionResult } from '../../../../../../../../lib/production/shared';
import { formatProductionFailureBody, toResponse } from './route-helpers';

describe('formatProductionFailureBody (C078)', () => {
  it('backfills upstream_wip_not_ready message from blocker details when message is omitted', () => {
    const result: ProductionResult<void> = {
      ok: false,
      error: 'upstream_wip_not_ready',
      status: 409,
      details: {
        code: 'upstream_wip_not_ready',
        mode: 'start',
        blockers: [
          {
            child_wo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            child_wo_number: 'WO-202607-0026-W1',
            child_status: 'RELEASED',
            required_qty: '1260',
            posted_output_kg: '0',
            release_blocked: false,
            start_complete_blocked: true,
          },
        ],
      },
    };

    const body = formatProductionFailureBody(result);

    expect(body).toMatchObject({
      ok: false,
      error: 'upstream_wip_not_ready',
      message: expect.stringContaining('WO-202607-0026-W1'),
    });
    expect(body.message).toContain('finish producing required output');
  });

  it('preserves an explicit upstream_wip_not_ready message from the service', () => {
    const explicit =
      'Upstream WIP work order(s) must finish producing required output before this order can proceed: WO-CHILD.';
    const result: ProductionResult<void> = {
      ok: false,
      error: 'upstream_wip_not_ready',
      status: 409,
      message: explicit,
      details: {
        code: 'upstream_wip_not_ready',
        mode: 'start',
        blockers: [],
      },
    };

    expect(formatProductionFailureBody(result).message).toBe(explicit);
  });
});

describe('toResponse', () => {
  it('serializes upstream_wip_not_ready with a precise operator message', async () => {
    const response = toResponse({
      ok: false,
      error: 'upstream_wip_not_ready',
      status: 409,
      details: {
        code: 'upstream_wip_not_ready',
        mode: 'start',
        blockers: [
          {
            child_wo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            child_wo_number: 'WO-ROOT-W1',
            child_status: 'IN_PROGRESS',
            required_qty: '100',
            posted_output_kg: '10',
            release_blocked: false,
            start_complete_blocked: true,
          },
        ],
      },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'upstream_wip_not_ready',
      message: expect.stringContaining('WO-ROOT-W1'),
    });
  });
});
