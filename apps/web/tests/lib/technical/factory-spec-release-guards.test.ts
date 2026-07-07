/**
 * T-081 — RED→GREEN unit tests for factory_spec release guards.
 *
 * Proves clone-on-write immutability (AC4), illegal-transition rejection, and D365
 * independence (a D365 metadata change is never a release transition).
 */
import { describe, expect, it } from 'vitest';

import {
  guardBusinessFieldEdit,
  guardD365MetadataUpdate,
  guardStatusTransition,
} from '../../../lib/technical/factory-spec-release-guards';

describe('T-081 factory-spec-release-guards — clone-on-write immutability (AC4)', () => {
  it('rejects in-place business-field edit on an approved/released record', () => {
    for (const status of ['approved_for_factory', 'released_to_factory']) {
      const result = guardBusinessFieldEdit(status);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('RELEASED_RECORD_IMMUTABLE');
    }
  });

  it('allows business-field edit on a working (draft/in_review) record', () => {
    expect(guardBusinessFieldEdit('draft').ok).toBe(true);
    expect(guardBusinessFieldEdit('in_review').ok).toBe(true);
  });

  it('rejects an illegal status jump on an approved record as immutable', () => {
    // approved_for_factory -> draft is a clone-on-write violation, not a transition.
    const result = guardStatusTransition('approved_for_factory', 'draft');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RELEASED_RECORD_IMMUTABLE');
  });

  it('rejects released_to_factory -> approved_for_factory (no backward release moves)', () => {
    const result = guardStatusTransition('released_to_factory', 'approved_for_factory');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RELEASED_RECORD_IMMUTABLE');
  });
});

describe('T-081 factory-spec-release-guards — permitted transitions', () => {
  it('allows in_review -> approved_for_factory (the bundle approval)', () => {
    expect(guardStatusTransition('in_review', 'approved_for_factory').ok).toBe(true);
  });

  it('allows approved_for_factory -> released_to_factory (recording release)', () => {
    expect(guardStatusTransition('approved_for_factory', 'released_to_factory').ok).toBe(true);
  });

  it('allows released_to_factory -> draft (recall path, mig 453)', () => {
    expect(guardStatusTransition('released_to_factory', 'draft').ok).toBe(true);
  });

  it('allows forward terminalisation to superseded/archived', () => {
    expect(guardStatusTransition('approved_for_factory', 'superseded').ok).toBe(true);
    expect(guardStatusTransition('released_to_factory', 'archived').ok).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = guardStatusTransition('draft', 'totally_made_up');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNKNOWN_STATUS');
  });

  it('rejects draft -> approved_for_factory (must pass through in_review)', () => {
    const result = guardStatusTransition('draft', 'approved_for_factory');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ILLEGAL_TRANSITION');
  });

  it('rejects a working-state illegal jump straight to released_to_factory', () => {
    const result = guardStatusTransition('draft', 'released_to_factory');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ILLEGAL_TRANSITION');
  });
});

describe('T-081 factory-spec-release-guards — D365 independence', () => {
  it('a D365 metadata update is always allowed and is not a release transition', () => {
    // Even on a factory-usable (immutable) row, updating D365 mirror fields is permitted
    // because D365 sync status is a separate axis from local release status.
    expect(guardD365MetadataUpdate().ok).toBe(true);
    expect(guardD365MetadataUpdate().code).toBe('OK');
  });
});
