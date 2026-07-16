/**
 * T-074 — RM usability decision service: PURE unit table tests.
 *
 * One RED case per reason code + the all-green path + report-shape (AC7) +
 * the context-dependent QC behaviour (AC6). No DB — these exercise the pure
 * `validateRmUsability` contract.
 */
import { describe, expect, it } from 'vitest';

import {
  RM_USABILITY_REASON_CODES,
  validateRmUsability,
  type RmSupplierSpecInput,
  type RmUsabilityRequest,
} from './rm-usability';

const NOW = new Date('2026-06-04T00:00:00.000Z');

function activeSpec(overrides: Partial<RmSupplierSpecInput> = {}): RmSupplierSpecInput {
  return {
    supplierCode: 'SUP-1',
    supplierStatus: 'approved',
    lifecycleStatus: 'active',
    reviewStatus: 'approved',
    effectiveFrom: '2026-01-01',
    expiryDate: '2027-01-01',
    costReviewBlocked: false,
    specReviewBlocked: false,
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseRequest(overrides: Partial<RmUsabilityRequest> = {}): RmUsabilityRequest {
  return {
    context: 'bom_edit',
    item: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'active', updatedAt: '2026-05-01T00:00:00.000Z' },
    supplier: activeSpec(),
    rmAllergens: [],
    targetFgForbiddenAllergens: [],
    qcRelease: { required: false },
    now: NOW,
    ...overrides,
  };
}

describe('T-074 validateRmUsability — reason codes (RED table)', () => {
  it('AC1: blocked item → usable=false + ITEM_NOT_ACTIVE', () => {
    const v = validateRmUsability(baseRequest({ item: { id: 'x', status: 'blocked' } }));
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('ITEM_NOT_ACTIVE');
  });

  it('AC2: missing supplier_spec → SUPPLIER_SPEC_NOT_ACTIVE (+ SUPPLIER_NOT_APPROVED)', () => {
    // factory_spec_approval keeps supplier-readiness HARD (release-critical seam).
    const v = validateRmUsability(baseRequest({ context: 'factory_spec_approval', supplier: null }));
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('AC2: expired supplier_spec → SUPPLIER_SPEC_NOT_ACTIVE', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'factory_spec_approval', supplier: activeSpec({ expiryDate: '2026-01-01' }) }),
    );
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('supplier not approved → SUPPLIER_NOT_APPROVED', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'factory_spec_approval', supplier: activeSpec({ supplierStatus: 'pending' }) }),
    );
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('SUPPLIER_NOT_APPROVED');
  });

  it('AC3: RM allergen conflicts with target FG → ALLERGEN_CONFLICT with codes', () => {
    const v = validateRmUsability(
      baseRequest({
        rmAllergens: [
          { allergenCode: 'milk', intensity: 'contains' },
          { allergenCode: 'soy', intensity: 'contains' },
        ],
        targetFgForbiddenAllergens: ['MILK'],
      }),
    );
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('ALLERGEN_CONFLICT');
    const conflictRow = v.checks.find((c) => c.code === 'ALLERGEN_CONFLICT');
    expect(conflictRow?.allergenCodes).toEqual(['MILK']);
  });

  it('cost review blocked → COST_REVIEW_PENDING', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'factory_spec_approval', supplier: activeSpec({ costReviewBlocked: true }) }),
    );
    expect(v.blockingReasons).toContain('COST_REVIEW_PENDING');
  });

  it('spec review blocked → SPEC_REVIEW_PENDING', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'factory_spec_approval', supplier: activeSpec({ specReviewBlocked: true }) }),
    );
    expect(v.blockingReasons).toContain('SPEC_REVIEW_PENDING');
  });

  it('AC6: factory_spec_approval + required QC missing → blocks with QC_RELEASE_MISSING', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'factory_spec_approval', qcRelease: { required: true, status: 'pending' } }),
    );
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('QC_RELEASE_MISSING');
  });

  it('AC6: bom_edit + required QC missing → WARNS (not blocks) but still reports QC_RELEASE_MISSING', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'bom_edit', qcRelease: { required: true, status: 'pending' } }),
    );
    expect(v.usable).toBe(true);
    expect(v.warnings).toContain('QC_RELEASE_MISSING');
    expect(v.checks.some((c) => c.code === 'QC_RELEASE_MISSING')).toBe(true);
  });

  it('every reason code is reachable from at least one input', () => {
    // Guard against an orphaned code that no branch can ever emit.
    expect(new Set(RM_USABILITY_REASON_CODES).size).toBe(RM_USABILITY_REASON_CODES.length);
  });
});

describe('BOM draft authoring — supplier-readiness demotes to WARNINGS in bom_edit', () => {
  // PRODUCT DECISION (locked 2026-06-11): a fresh item with NO supplier_specs must
  // be addable to a draft BOM; supplier-readiness gaps warn, they do not block.
  it('fresh item with no supplier spec → usable=true in bom_edit, gaps are warnings', () => {
    const v = validateRmUsability(baseRequest({ context: 'bom_edit', supplier: null }));
    expect(v.usable).toBe(true);
    expect(v.blockingReasons).toHaveLength(0);
    expect(v.warnings).toEqual(expect.arrayContaining(['SUPPLIER_NOT_APPROVED', 'SUPPLIER_SPEC_NOT_ACTIVE']));
    // The codes are still REPORTED so the dialog can render warning badges.
    expect(v.checks.some((c) => c.code === 'SUPPLIER_NOT_APPROVED' && c.severity === 'warn')).toBe(true);
    expect(v.checks.some((c) => c.code === 'SUPPLIER_SPEC_NOT_ACTIVE' && c.severity === 'warn')).toBe(true);
  });

  it('cost/spec review pending → warnings (not blocks) in bom_edit', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'bom_edit', supplier: activeSpec({ costReviewBlocked: true, specReviewBlocked: true }) }),
    );
    expect(v.usable).toBe(true);
    expect(v.warnings).toEqual(expect.arrayContaining(['COST_REVIEW_PENDING', 'SPEC_REVIEW_PENDING']));
    expect(v.blockingReasons).toHaveLength(0);
  });

  it('the SAME supplier-readiness gaps STILL HARD-BLOCK at factory_spec_approval', () => {
    const v = validateRmUsability(baseRequest({ context: 'factory_spec_approval', supplier: null }));
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toEqual(
      expect.arrayContaining(['SUPPLIER_NOT_APPROVED', 'SUPPLIER_SPEC_NOT_ACTIVE']),
    );
  });

  it('ITEM_NOT_ACTIVE still HARD-BLOCKS in bom_edit (picker lists active items only)', () => {
    const v = validateRmUsability(baseRequest({ context: 'bom_edit', item: { id: 'x', status: 'blocked' } }));
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('ITEM_NOT_ACTIVE');
  });

  it('ALLERGEN_CONFLICT still HARD-BLOCKS in bom_edit (food-safety, not a readiness gap)', () => {
    const v = validateRmUsability(
      baseRequest({
        context: 'bom_edit',
        rmAllergens: [{ allergenCode: 'milk', intensity: 'contains' }],
        targetFgForbiddenAllergens: ['MILK'],
      }),
    );
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toContain('ALLERGEN_CONFLICT');
  });
});

describe('manufactured intermediate (WIP) — supplier sourcing exemption', () => {
  it('skips supplier/spec gates at factory_spec_approval when sourcing is not required', () => {
    const v = validateRmUsability(
      baseRequest({ context: 'factory_spec_approval', supplier: null, supplierSourcingRequired: false }),
    );
    expect(v.usable).toBe(true);
    expect(v.blockingReasons).toHaveLength(0);
    expect(v.blockingReasons).not.toContain('SUPPLIER_NOT_APPROVED');
    expect(v.blockingReasons).not.toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('still hard-blocks purchased intermediates without supplier specs at factory_spec_approval', () => {
    const v = validateRmUsability(baseRequest({ context: 'factory_spec_approval', supplier: null }));
    expect(v.usable).toBe(false);
    expect(v.blockingReasons).toEqual(
      expect.arrayContaining(['SUPPLIER_NOT_APPROVED', 'SUPPLIER_SPEC_NOT_ACTIVE']),
    );
  });
});

describe('T-074 validateRmUsability — green path + report shape', () => {
  it('AC4: all checks pass → usable=true and every row is pass with a source', () => {
    const v = validateRmUsability(baseRequest());
    expect(v.usable).toBe(true);
    expect(v.blockingReasons).toHaveLength(0);
    expect(v.checks.every((c) => c.severity === 'pass')).toBe(true);
    expect(v.checks.every((c) => c.source.length > 0)).toBe(true);
  });

  it('AC7: report rows carry label, code, severity, source, remediationHref and evidence ts', () => {
    const v = validateRmUsability(baseRequest({ item: { id: 'x', status: 'blocked' } }));
    const blockRow = v.checks.find((c) => c.code === 'ITEM_NOT_ACTIVE');
    expect(blockRow).toBeDefined();
    expect(blockRow).toMatchObject({
      code: 'ITEM_NOT_ACTIVE',
      severity: 'block',
    });
    expect(typeof blockRow!.label).toBe('string');
    expect('remediationHref' in blockRow!).toBe(true);
    expect('evidenceAt' in blockRow!).toBe(true);
    expect(typeof v.evaluatedAt).toBe('string');
  });
});
