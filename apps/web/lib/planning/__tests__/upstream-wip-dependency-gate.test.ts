import { describe, expect, it } from 'vitest';

import {
  evaluateUpstreamWipGate,
  upstreamWipNotReadyMessage,
  type UpstreamWipNotReadyRow,
} from '../upstream-wip-dependency-gate';

const DRAFT_CHILD: UpstreamWipNotReadyRow = {
  child_wo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  child_wo_number: 'WIP-001',
  child_status: 'DRAFT',
  required_qty: '100',
  posted_output_kg: '0',
  release_blocked: true,
  start_complete_blocked: true,
};

const RELEASED_UNPRODUCED: UpstreamWipNotReadyRow = {
  child_wo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  child_wo_number: 'WIP-002',
  child_status: 'RELEASED',
  required_qty: '50',
  posted_output_kg: '0',
  release_blocked: false,
  start_complete_blocked: true,
};

const READY_CHILD: UpstreamWipNotReadyRow = {
  child_wo_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  child_wo_number: 'WIP-003',
  child_status: 'IN_PROGRESS',
  required_qty: '50',
  posted_output_kg: '50',
  release_blocked: false,
  start_complete_blocked: false,
};

const IN_PROGRESS_WITH_POSTED_OUTPUT: UpstreamWipNotReadyRow = {
  child_wo_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  child_wo_number: 'WIP-004',
  child_status: 'IN_PROGRESS',
  required_qty: '100.000',
  posted_output_kg: '100.000',
  release_blocked: false,
  start_complete_blocked: false,
};

describe('upstream WIP dependency gate (C3)', () => {
  it('blocks FG release when an upstream WIP prerequisite is still DRAFT', () => {
    const failure = evaluateUpstreamWipGate('release', [DRAFT_CHILD]);
    expect(failure).toMatchObject({
      code: 'upstream_wip_not_ready',
      mode: 'release',
      blockers: [expect.objectContaining({ child_wo_number: 'WIP-001' })],
    });
    expect(upstreamWipNotReadyMessage(failure!)).toContain('WIP-001');
  });

  it('allows FG release when upstream WIP is RELEASED but not yet produced', () => {
    expect(evaluateUpstreamWipGate('release', [RELEASED_UNPRODUCED])).toBeNull();
  });

  it('blocks FG start/complete until upstream WIP has posted required primary output', () => {
    expect(evaluateUpstreamWipGate('start', [RELEASED_UNPRODUCED])).toMatchObject({
      mode: 'start',
      blockers: [expect.objectContaining({ child_wo_number: 'WIP-002' })],
    });
    expect(evaluateUpstreamWipGate('complete', [RELEASED_UNPRODUCED])).toMatchObject({
      mode: 'complete',
    });
  });

  it('allows FG start/complete when upstream WIP has met required posted output', () => {
    expect(evaluateUpstreamWipGate('start', [READY_CHILD])).toBeNull();
    expect(evaluateUpstreamWipGate('complete', [READY_CHILD])).toBeNull();
    expect(evaluateUpstreamWipGate('start', [IN_PROGRESS_WITH_POSTED_OUTPUT])).toBeNull();
  });
});
