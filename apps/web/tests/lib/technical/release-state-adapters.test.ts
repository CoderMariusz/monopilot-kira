/**
 * T-081 — RED→GREEN unit tests for the Technical release-state adapters.
 *
 * Proves the adapters import/use the NPD T-097 canonical model (no duplicate enum),
 * map factory_spec storage states to the canonical value, keep D365 on a separate axis,
 * and return stable badge metadata.
 */
import { describe, expect, it } from 'vitest';

import type { FactoryReleaseStatusValue } from '../../../app/(npd)/builder/_lib/factory-release-status';
import {
  FACTORY_SPEC_STATUSES,
  initialSpecStatusFromNpdBuilder,
  isCanonicalFactoryUsable,
  isFactoryUsableSpecStatus,
  releaseBadge,
  specBadge,
  specStatusToCanonical,
  type FactorySpecStatus,
} from '../../../lib/technical/release-state-adapters';

// The canonical NPD release values (AC1: adapters map onto THIS set, not a Technical copy).
const CANONICAL_VALUES: FactoryReleaseStatusValue[] = [
  'pending_npd_release',
  'pending_technical_approval',
  'approved_for_factory',
  'released_to_factory',
  'blocked',
];

describe('T-081 release-state-adapters — canonical mapping (AC1)', () => {
  it('every factory_spec status maps to a canonical NPD release value (no duplicate enum)', () => {
    for (const status of FACTORY_SPEC_STATUSES) {
      const value = specStatusToCanonical(status);
      expect(CANONICAL_VALUES).toContain(value);
    }
  });

  it('factory-usable spec statuses map to factory-usable canonical values', () => {
    expect(specStatusToCanonical('approved_for_factory')).toBe('approved_for_factory');
    expect(specStatusToCanonical('released_to_factory')).toBe('released_to_factory');
    expect(isCanonicalFactoryUsable(specStatusToCanonical('approved_for_factory'))).toBe(true);
    expect(isCanonicalFactoryUsable(specStatusToCanonical('released_to_factory'))).toBe(true);
  });

  it('working / terminal statuses map to pending_technical_approval, never factory-usable', () => {
    for (const status of ['draft', 'in_review', 'superseded', 'archived'] as FactorySpecStatus[]) {
      expect(specStatusToCanonical(status)).toBe('pending_technical_approval');
      expect(isCanonicalFactoryUsable(specStatusToCanonical(status))).toBe(false);
    }
  });
});

describe('T-081 release-state-adapters — NPD Builder seed (AC2)', () => {
  it('a spec created from NPD Builder starts at in_review → pending_technical_approval', () => {
    const initial = initialSpecStatusFromNpdBuilder();
    expect(initial).toBe('in_review');
    expect(specStatusToCanonical(initial)).toBe('pending_technical_approval');
    // NPD G4 is NOT factory-use approval.
    expect(isFactoryUsableSpecStatus(initial)).toBe(false);
  });
});

describe('T-081 release-state-adapters — badge metadata (AC5)', () => {
  it('returns stable label, color token, allowed actions and blocking reason per value', () => {
    for (const value of CANONICAL_VALUES) {
      const badge = releaseBadge(value);
      expect(badge.value).toBe(value);
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.labelKey).toMatch(/^technical\.release\.badge\./);
      expect(['amber', 'blue', 'emerald', 'green', 'red']).toContain(badge.colorToken);
      expect(Array.isArray(badge.allowedActions)).toBe(true);
    }
  });

  it('factory-usable values have no blocking reason; non-usable values do', () => {
    expect(releaseBadge('approved_for_factory').blockingReasonCode).toBeNull();
    expect(releaseBadge('released_to_factory').blockingReasonCode).toBeNull();
    expect(releaseBadge('approved_for_factory').factoryUsable).toBe(true);

    expect(releaseBadge('pending_npd_release').blockingReasonCode).toBe('PENDING_NPD_RELEASE');
    expect(releaseBadge('pending_technical_approval').blockingReasonCode).toBe(
      'PENDING_TECHNICAL_APPROVAL',
    );
    expect(releaseBadge('blocked').blockingReasonCode).toBe('RELEASE_BLOCKED');
    expect(releaseBadge('blocked').factoryUsable).toBe(false);
  });

  it('specBadge resolves a spec status to the same badge as its canonical value', () => {
    expect(specBadge('in_review')).toEqual(releaseBadge('pending_technical_approval'));
    expect(specBadge('approved_for_factory')).toEqual(releaseBadge('approved_for_factory'));
    expect(specBadge('released_to_factory')).toEqual(releaseBadge('released_to_factory'));
  });
});
