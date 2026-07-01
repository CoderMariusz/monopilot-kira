/**
 * P2-MODALS — state-appropriateness gating unit tests.
 *
 * Focus: the Start enable-condition parity between the WO LIST and the WO DETAIL
 * (F13). The list feeds the pre-materialized runtime status (RELEASED → `planned`)
 * so `status='planned'` and Start is offered; the detail feeds the raw
 * wo_executions.status, which is `null` for a just-RELEASED WO with no execution
 * row yet. The gate must offer Start in BOTH shapes when the WO is RELEASED, and
 * must still refuse a genuinely-DRAFT WO (release in Planning first).
 */
import { describe, expect, it } from 'vitest';

import { canOfferAction, isActionAvailable } from '../gating';
import type { WoActionPermissions } from '../types';

const ALL_PERMS: WoActionPermissions = {
  release: true,
  start: true,
  pause: true,
  resume: true,
  cancel: true,
  complete: true,
  close: true,
  outputWrite: true,
  wasteWrite: true,
};

describe('gating — Start enable-condition (F13 list/detail parity)', () => {
  it('DETAIL: a RELEASED WO with no execution row yet (status=null) offers Start', () => {
    // This is the exact F13 shape: work_orders.status='RELEASED', wo_executions
    // absent → executionStatus=null. Previously refused; now offered.
    expect(isActionAvailable('start', null, 'RELEASED')).toBe(true);
    expect(canOfferAction('start', null, ALL_PERMS, 'RELEASED')).toBe(true);
  });

  it('DETAIL: a DRAFT WO with no execution row (status=null) still refuses Start', () => {
    expect(isActionAvailable('start', null, 'DRAFT')).toBe(false);
    expect(canOfferAction('start', null, ALL_PERMS, 'DRAFT')).toBe(false);
    // A missing/unknown header status is not RELEASED → no Start.
    expect(isActionAvailable('start', null, null)).toBe(false);
    expect(isActionAvailable('start', null, undefined)).toBe(false);
  });

  it('LIST: the materialized planned status offers Start with no header status arg', () => {
    // The list calls canOfferAction('start', 'planned', perms) with NO
    // workOrderStatus — it already folds RELEASED → planned. This must stay true.
    expect(isActionAvailable('start', 'planned')).toBe(true);
    expect(canOfferAction('start', 'planned', ALL_PERMS)).toBe(true);
  });

  it('a RELEASED header does NOT resurrect Start for a WO already running/terminal', () => {
    // Once an execution row exists, the runtime status governs — a stale RELEASED
    // header must not re-offer Start for an in_progress / completed / closed WO.
    for (const s of ['in_progress', 'paused', 'completed', 'closed', 'cancelled'] as const) {
      expect(isActionAvailable('start', s, 'RELEASED')).toBe(false);
    }
  });

  it('Start still hidden when the RBAC start permission is denied', () => {
    expect(canOfferAction('start', null, { ...ALL_PERMS, start: false }, 'RELEASED')).toBe(false);
  });

  it('release is offered only for a DRAFT header status', () => {
    expect(isActionAvailable('release', null, 'DRAFT')).toBe(true);
    expect(isActionAvailable('release', null, 'RELEASED')).toBe(false);
    expect(isActionAvailable('release', 'planned', 'RELEASED')).toBe(false);
  });
});
