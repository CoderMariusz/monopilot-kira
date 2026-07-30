/**
 * EVIDENCE (not a fix): what the RM-usability QC gate does when `lab_results`
 * is empty — which is ALWAYS, because no Quality lab write bridge exists
 * (`registerQualityLabBridge` is called only from tests, so
 * POST /api/technical/lab-results always returns 501 QUALITY_BRIDGE_MISSING).
 *
 * These tests assert the CURRENT behaviour to make the fail-open explicit and
 * runnable. They are expected to CHANGE when the gate is fixed.
 */

import { describe, expect, it } from 'vitest';
import { validateRmUsability, type RmUsabilityRequest } from './rm-usability';

const ACTIVE_ITEM = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'active' };
const GOOD_SPEC = {
  supplierCode: 'SUP-1',
  supplierStatus: 'approved',
  lifecycleStatus: 'active',
  reviewStatus: 'approved',
  effectiveFrom: '2020-01-01',
  expiryDate: null,
  costReviewBlocked: false,
  specReviewBlocked: false,
};

function base(over: Partial<RmUsabilityRequest> = {}): RmUsabilityRequest {
  return {
    context: 'bom_edit',
    item: ACTIVE_ITEM,
    supplier: GOOD_SPEC,
    rmAllergens: [],
    targetFgForbiddenAllergens: [],
    // What validate-component.ts:130 builds when requireQcRelease is not passed.
    qcRelease: { required: false },
    ...over,
  };
}

const qcRow = (v: ReturnType<typeof validateRmUsability>) =>
  v.checks.find((c) => c.source === 'quality.lab_results (read model)')!;

describe('QC-release gate vs an empty lab_results table', () => {
  it('PROD PATH A (bom-edit-dialog → validateBomComponent, no requireQcRelease): green QC row, table never queried', () => {
    const v = validateRmUsability(base());
    expect(v.usable).toBe(true);
    expect(v.blockingReasons).toEqual([]);
    expect(v.warnings).toEqual([]);
    // A PASS row citing lab_results as its source — with zero evidence behind it.
    expect(qcRow(v)).toMatchObject({ code: 'OK', label: 'QC release present', severity: 'pass' });
    expect(qcRow(v).evidenceAt).toBeNull();
  });

  it('PROD PATH B (bom/_actions/shared.ts hardcodes required:false) — same green row in the RELEASE-CRITICAL context', () => {
    const v = validateRmUsability(base({ context: 'factory_spec_approval' }));
    expect(v.usable).toBe(true);
    expect(qcRow(v)).toMatchObject({ code: 'OK', severity: 'pass' });
  });

  it('even IF requireQcRelease:true were passed, empty table only WARNS in bom_edit → still usable', () => {
    // validate-component.ts:141-145 with zero rows → status null, evidenceAt null.
    const v = validateRmUsability(base({ qcRelease: { required: true, status: null, evidenceAt: null } }));
    expect(v.warnings).toContain('QC_RELEASE_MISSING');
    expect(v.blockingReasons).toEqual([]);
    expect(v.usable).toBe(true); // fail-open: the BOM line is persisted
  });

  it('CONTROL — the gate CAN block, but only on a path production never takes', () => {
    const v = validateRmUsability(
      base({ context: 'factory_spec_approval', qcRelease: { required: true, status: null, evidenceAt: null } }),
    );
    expect(v.blockingReasons).toContain('QC_RELEASE_MISSING');
    expect(v.usable).toBe(false);
  });

  it('CONTROL — bad input is still rejected (blocked item blocks in every context)', () => {
    const v = validateRmUsability(base({ item: { id: ACTIVE_ITEM.id, status: 'blocked' } }));
    expect(v.blockingReasons).toContain('ITEM_NOT_ACTIVE');
    expect(v.usable).toBe(false);
  });
});
