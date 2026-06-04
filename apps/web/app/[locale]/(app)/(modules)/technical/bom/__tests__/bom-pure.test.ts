/**
 * 03-technical BOM pure-logic unit tests (no DB):
 *   - cycle-detection (V-TEC-13 self-reference + cycle)
 *   - diff (added/removed/changed shape, numeric delta/percent)
 *   - generator (V-TEC-15 'Complete' filter + per_fg / single_batch output)
 */
import { describe, expect, it } from 'vitest';

import { buildGraph, detectCycle } from '../_actions/cycle-detection';
import { diffBom } from '../_actions/diff';
import { buildJobPayload, isComplete, resolveEligibleFgs } from '../_actions/generator';
import { runGeneratorJob } from '../_actions/generator-worker';
import type { BomDetailView } from '../_actions/shared';

describe('cycle-detection (V-TEC-13)', () => {
  it('flags a self-reference (parent appears in its own components)', () => {
    expect(detectCycle(buildGraph([]), 'FG1', ['FG1'])).toBe(true);
  });

  it('flags a transitive cycle over active BOMs (A->B already, adding B->A)', () => {
    // existing active BOM: A contains B.
    const graph = buildGraph([{ parent: 'A', component: 'B' }]);
    // new BOM: B contains A => closes the loop.
    expect(detectCycle(graph, 'B', ['A'])).toBe(true);
  });

  it('allows an acyclic addition', () => {
    const graph = buildGraph([{ parent: 'A', component: 'B' }]);
    expect(detectCycle(graph, 'C', ['B'])).toBe(false);
  });
});

function detail(over: Partial<BomDetailView>): BomDetailView {
  return {
    header: {
      id: 'h', productId: 'FG1', npdProjectId: null, faCode: null, originModule: 'technical',
      status: 'draft', version: 1, supersedesBomHeaderId: null, yieldPct: '100.000',
      effectiveFrom: '2026-01-01', effectiveTo: null, approvedBy: null, approvedAt: null, notes: null,
    },
    lines: [],
    co_products: [],
    ...over,
  };
}

describe('diff (PRD §7.5)', () => {
  it('returns one added + one changed when v2 adds a line and changes a quantity', () => {
    const from = detail({
      lines: [
        { id: 'l1', lineNo: 1, itemId: 'i1', componentCode: 'RM1', componentType: 'RM', quantity: '10.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
        { id: 'l2', lineNo: 2, itemId: 'i2', componentCode: 'RM2', componentType: 'RM', quantity: '5.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
        { id: 'l3', lineNo: 3, itemId: 'i3', componentCode: 'RM3', componentType: 'RM', quantity: '2.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
      ],
    });
    const to = detail({
      lines: [
        { id: 'l1', lineNo: 1, itemId: 'i1', componentCode: 'RM1', componentType: 'RM', quantity: '12.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
        { id: 'l2', lineNo: 2, itemId: 'i2', componentCode: 'RM2', componentType: 'RM', quantity: '5.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
        { id: 'l3', lineNo: 3, itemId: 'i3', componentCode: 'RM3', componentType: 'RM', quantity: '2.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
        { id: 'l4', lineNo: 4, itemId: 'i4', componentCode: 'RM4', componentType: 'RM', quantity: '1.000000', uom: 'kg', scrapPct: '0.00', manufacturingOperationName: null, sequence: null, isPhantom: false },
      ],
    });
    const d = diffBom(from, to);
    expect(d.lines.added).toHaveLength(1);
    expect(d.lines.removed).toHaveLength(0);
    expect(d.lines.changed).toHaveLength(1);
    expect(d.lines.changed[0]!.quantity).toEqual({ from: '10.000000', to: '12.000000', delta: '2', percentChange: 20 });
  });

  it('returns all-empty arrays when v1 === v2', () => {
    const same = detail({});
    const d = diffBom(same, same);
    expect(d.header).toHaveLength(0);
    expect(d.lines.added).toHaveLength(0);
    expect(d.lines.removed).toHaveLength(0);
    expect(d.lines.changed).toHaveLength(0);
    expect(d.co_products.added).toHaveLength(0);
  });
});

describe('generator (V-TEC-15)', () => {
  it('keeps only FGs with status_overall Complete (case-insensitive)', () => {
    expect(isComplete({ productCode: 'FG1', statusOverall: 'Complete' })).toBe(true);
    expect(isComplete({ productCode: 'FG2', statusOverall: 'In Progress' })).toBe(false);
    const eligible = resolveEligibleFgs(
      [
        { productCode: 'FG1', statusOverall: 'Complete' },
        { productCode: 'FG2', statusOverall: 'In Progress' },
        { productCode: 'FG3', statusOverall: 'complete' },
      ],
      'all_complete',
    );
    expect(eligible).toEqual(['FG1', 'FG3']);
    expect(buildJobPayload(eligible, 'per_fg').expectedCount).toBe(2);
  });

  it('per_fg produces N distinct artifact URLs; single_batch produces 1 with N sheets', () => {
    const boms: Record<string, BomDetailView> = { FG1: detail({ header: { ...detail({}).header, productId: 'FG1' } }), FG2: detail({ header: { ...detail({}).header, productId: 'FG2' } }) };
    const per = runGeneratorJob('org-1', { outputMode: 'per_fg', productCodes: ['FG1', 'FG2'], runDate: '2026-06-04', bomsByFg: boms });
    expect(per.resultUrls).toHaveLength(2);
    expect(new Set(per.resultUrls).size).toBe(2);

    const batch = runGeneratorJob('org-1', { outputMode: 'single_batch', productCodes: ['FG1', 'FG2'], runDate: '2026-06-04', bomsByFg: boms });
    expect(batch.resultUrls).toHaveLength(1);
    expect(batch.artifacts[0]!.sheets).toHaveLength(2);
  });
});
