/**
 * T-084 — Technical sensory read model / contract tests.
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5, §17.
 *
 * RED-first: these describe the pure required/not_required/pass/fail/hold mapping
 * contract BEFORE the adapter is wired into NPD/Quality. No DB, no I/O — the adapter
 * is a pure function over a persisted-row shape.
 *
 * Run: pnpm --filter web vitest run tests/lib/technical/sensory-contract.test.ts
 */
import { describe, expect, it } from 'vitest';

import {
  SENSORIAL_BLOCKED,
  SENSORY_STATUSES,
  isSensoryStatus,
  npdMayProceed,
  toSensoryReadModel,
  type SensoryEvaluationRow,
} from '../../../lib/technical/sensory';

function row(partial: Partial<SensoryEvaluationRow>): SensoryEvaluationRow {
  return { status: 'not_required', policyRequired: false, statusReason: null, ...partial };
}

describe('sensory contract — status set', () => {
  it('exposes exactly the six contract statuses including not_required', () => {
    expect([...SENSORY_STATUSES].sort()).toEqual(
      ['fail', 'hold', 'not_required', 'pass', 'pending', 'required'].sort(),
    );
  });

  it('isSensoryStatus guards the contract set', () => {
    expect(isSensoryStatus('pass')).toBe(true);
    expect(isSensoryStatus('not_required')).toBe(true);
    expect(isSensoryStatus('in_progress')).toBe(false);
    expect(isSensoryStatus(undefined)).toBe(false);
  });
});

describe('AC1 — required-policy products expose required/pending/pass/fail to NPD', () => {
  it('required status reports required and is not yet a proceed', () => {
    const rm = toSensoryReadModel(row({ status: 'required', policyRequired: true }));
    expect(rm.status).toBe('required');
    expect(rm.npdCanProceedWithoutEvidence).toBe(false);
    expect(rm.releaseBlocked).toBe(false);
    expect(npdMayProceed(rm)).toBe(false);
  });

  it('pending status reports pending and blocks proceed', () => {
    const rm = toSensoryReadModel(row({ status: 'pending', policyRequired: true }));
    expect(rm.status).toBe('pending');
    expect(rm.npdCanProceedWithoutEvidence).toBe(false);
    expect(npdMayProceed(rm)).toBe(false);
  });

  it('pass status lets NPD proceed with real evidence (not without)', () => {
    const rm = toSensoryReadModel(row({ status: 'pass', policyRequired: true }));
    expect(rm.status).toBe('pass');
    expect(rm.npdCanProceedWithoutEvidence).toBe(false);
    expect(rm.releaseBlocked).toBe(false);
    expect(npdMayProceed(rm)).toBe(true);
  });
});

describe('AC2 — not_required lets NPD proceed without fabricated Technical evidence', () => {
  it('not_required row reports not_required and proceed-without-evidence', () => {
    const rm = toSensoryReadModel(row({ status: 'not_required', policyRequired: false }));
    expect(rm.status).toBe('not_required');
    expect(rm.npdCanProceedWithoutEvidence).toBe(true);
    expect(rm.releaseBlocked).toBe(false);
    expect(rm.blockedReason).toBeNull();
    expect(npdMayProceed(rm)).toBe(true);
  });

  it('absent row (no Technical evidence on record) is treated as not_required', () => {
    const rm = toSensoryReadModel(null);
    expect(rm.status).toBe('not_required');
    expect(rm.npdCanProceedWithoutEvidence).toBe(true);
    expect(rm.releaseBlocked).toBe(false);
    expect(npdMayProceed(rm)).toBe(true);
  });

  it('undefined row behaves the same as absent', () => {
    expect(toSensoryReadModel(undefined)).toEqual(toSensoryReadModel(null));
  });
});

describe('AC3 — fail/hold surface SENSORIAL_BLOCKED to release guards', () => {
  it('fail yields releaseBlocked + SENSORIAL_BLOCKED with detail', () => {
    const rm = toSensoryReadModel(
      row({ status: 'fail', policyRequired: true, statusReason: 'off-flavour panel reject' }),
    );
    expect(rm.status).toBe('fail');
    expect(rm.releaseBlocked).toBe(true);
    expect(rm.blockedReason).toBe(SENSORIAL_BLOCKED);
    expect(rm.blockedDetail).toBe('off-flavour panel reject');
    expect(rm.npdCanProceedWithoutEvidence).toBe(false);
    expect(npdMayProceed(rm)).toBe(false);
  });

  it('hold yields releaseBlocked + SENSORIAL_BLOCKED', () => {
    const rm = toSensoryReadModel(row({ status: 'hold', policyRequired: true }));
    expect(rm.status).toBe('hold');
    expect(rm.releaseBlocked).toBe(true);
    expect(rm.blockedReason).toBe(SENSORIAL_BLOCKED);
    expect(rm.blockedDetail).toBeNull();
    expect(npdMayProceed(rm)).toBe(false);
  });

  it('non-blocking statuses never emit a blocked reason', () => {
    for (const status of ['required', 'pending', 'pass', 'not_required'] as const) {
      const rm = toSensoryReadModel(row({ status }));
      expect(rm.releaseBlocked).toBe(false);
      expect(rm.blockedReason).toBeNull();
    }
  });
});
