/**
 * 03-technical BOM version diff (T-015) — pure structured-diff logic (PRD §7.5).
 *
 * Lines are keyed by component_item_id (falling back to component_code when item_id
 * is null) and co-products by co_product_item_id. Numeric changes return `delta`
 * and `percentChange`. Header diff lists yield_pct / status / effective_from changes.
 *
 * Red-line: private_jsonb is NEVER part of the diff (bom_lines/headers carry no such
 * column anyway; this module only ever sees the whitelisted view fields).
 */

import type { BomCoProductView, BomDetailView, BomLineView } from './shared';

export type NumericChange = { from: string; to: string; delta: string; percentChange: number | null };

export type LineChange = {
  key: string;
  componentCode: string;
  quantity?: NumericChange;
  scrapPct?: NumericChange;
  uom?: { from: string; to: string };
  componentType?: { from: string | null; to: string | null };
};

export type CoProductChange = {
  key: string;
  quantity?: NumericChange;
  allocationPct?: NumericChange;
  uom?: { from: string; to: string };
  isByproduct?: { from: boolean; to: boolean };
};

export type HeaderFieldChange = { field: 'yieldPct' | 'status' | 'effectiveFrom'; from: string; to: string };

export type BomDiff = {
  header: HeaderFieldChange[];
  lines: { added: BomLineView[]; removed: BomLineView[]; changed: LineChange[] };
  co_products: { added: BomCoProductView[]; removed: BomCoProductView[]; changed: CoProductChange[] };
};

function lineKey(line: BomLineView): string {
  return line.itemId ?? `code:${line.componentCode}`;
}

function coProductKey(cp: BomCoProductView): string {
  return cp.coProductItemId;
}

function numericChange(from: string, to: string): NumericChange | undefined {
  const a = Number(from);
  const b = Number(to);
  if (a === b) return undefined;
  const delta = b - a;
  const percentChange = a === 0 ? null : Number(((delta / a) * 100).toFixed(4));
  // Preserve decimal formatting by emitting a fixed delta string with up to 6 dp.
  const deltaStr = Number(delta.toFixed(6)).toString();
  return { from, to, delta: deltaStr, percentChange };
}

export function diffBom(fromBom: BomDetailView, toBom: BomDetailView): BomDiff {
  // -- Header --
  const header: HeaderFieldChange[] = [];
  if (fromBom.header.yieldPct !== toBom.header.yieldPct)
    header.push({ field: 'yieldPct', from: fromBom.header.yieldPct, to: toBom.header.yieldPct });
  if (fromBom.header.status !== toBom.header.status)
    header.push({ field: 'status', from: fromBom.header.status, to: toBom.header.status });
  if (fromBom.header.effectiveFrom !== toBom.header.effectiveFrom)
    header.push({ field: 'effectiveFrom', from: fromBom.header.effectiveFrom, to: toBom.header.effectiveFrom });

  // -- Lines --
  const fromLines = new Map(fromBom.lines.map((l) => [lineKey(l), l]));
  const toLines = new Map(toBom.lines.map((l) => [lineKey(l), l]));

  const addedLines: BomLineView[] = [];
  const removedLines: BomLineView[] = [];
  const changedLines: LineChange[] = [];

  for (const [key, to] of toLines) {
    const from = fromLines.get(key);
    if (!from) {
      addedLines.push(to);
      continue;
    }
    const change: LineChange = { key, componentCode: to.componentCode };
    let dirty = false;
    const q = numericChange(from.quantity, to.quantity);
    if (q) { change.quantity = q; dirty = true; }
    const s = numericChange(from.scrapPct, to.scrapPct);
    if (s) { change.scrapPct = s; dirty = true; }
    if (from.uom !== to.uom) { change.uom = { from: from.uom, to: to.uom }; dirty = true; }
    if (from.componentType !== to.componentType) {
      change.componentType = { from: from.componentType, to: to.componentType };
      dirty = true;
    }
    if (dirty) changedLines.push(change);
  }
  for (const [key, from] of fromLines) {
    if (!toLines.has(key)) removedLines.push(from);
  }

  // -- Co-products --
  const fromCp = new Map(fromBom.co_products.map((c) => [coProductKey(c), c]));
  const toCp = new Map(toBom.co_products.map((c) => [coProductKey(c), c]));

  const addedCp: BomCoProductView[] = [];
  const removedCp: BomCoProductView[] = [];
  const changedCp: CoProductChange[] = [];

  for (const [key, to] of toCp) {
    const from = fromCp.get(key);
    if (!from) {
      addedCp.push(to);
      continue;
    }
    const change: CoProductChange = { key };
    let dirty = false;
    const q = numericChange(from.quantity, to.quantity);
    if (q) { change.quantity = q; dirty = true; }
    const a = numericChange(from.allocationPct, to.allocationPct);
    if (a) { change.allocationPct = a; dirty = true; }
    if (from.uom !== to.uom) { change.uom = { from: from.uom, to: to.uom }; dirty = true; }
    if (from.isByproduct !== to.isByproduct) {
      change.isByproduct = { from: from.isByproduct, to: to.isByproduct };
      dirty = true;
    }
    if (dirty) changedCp.push(change);
  }
  for (const [key, from] of fromCp) {
    if (!toCp.has(key)) removedCp.push(from);
  }

  return {
    header,
    lines: { added: addedLines, removed: removedLines, changed: changedLines },
    co_products: { added: addedCp, removed: removedCp, changed: changedCp },
  };
}
