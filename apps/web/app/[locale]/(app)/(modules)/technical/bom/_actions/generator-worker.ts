/**
 * 03-technical BOM Generator worker (T-016) — async XLSX artifact builder.
 *
 * Consumes a queued `bom_generator_jobs` payload and produces the workbook
 * artifact descriptor(s). It is invoked by the worker runtime (apps/worker), NEVER
 * inside the Server Action request (red-line: generation is outbox/queue-async).
 *
 * Output contract (PRD §7.6):
 *   - output_mode 'per_fg'      → ONE artifact per FG: BOM_FG<code>.xlsx, each a
 *                                 distinct URL/key (N artifacts for N FGs).
 *   - output_mode 'single_batch'→ ONE artifact BOM_Batch_<date>.xlsx with N sheets.
 *
 * Red-line: private_jsonb is NEVER included in the workbook — only the whitelisted
 * BOM header/lines/co-product fields are serialized into sheet rows.
 */

import type { BomDetailView } from './shared';

export type GeneratorWorkerInput = {
  outputMode: 'per_fg' | 'single_batch';
  /** Resolved + V-TEC-15-filtered FG product_codes, in stable order. */
  productCodes: ReadonlyArray<string>;
  /** date stamp for single_batch filename (YYYY-MM-DD). */
  runDate: string;
  /** Per-FG flattened BOM detail keyed by product_code (header/lines/co_products). */
  bomsByFg: Readonly<Record<string, BomDetailView>>;
};

export type SheetRow = Record<string, string | number | boolean | null>;
export type WorkbookSheet = { name: string; rows: SheetRow[] };
export type Artifact = { url: string; fileName: string; sheets: WorkbookSheet[] };
export type GeneratorWorkerResult = { artifacts: Artifact[]; resultUrls: string[] };

/** Flatten ONE FG's BOM detail into worksheet rows (whitelisted fields only). */
export function fgSheet(productCode: string, detail: BomDetailView): WorkbookSheet {
  const rows: SheetRow[] = [];
  for (const line of detail.lines) {
    rows.push({
      kind: 'component',
      line_no: line.lineNo,
      component_code: line.componentCode,
      component_type: line.componentType,
      quantity: line.quantity,
      uom: line.uom,
      scrap_pct: line.scrapPct,
      manufacturing_operation: line.manufacturingOperationName,
    });
  }
  for (const cp of detail.co_products) {
    rows.push({
      kind: cp.isByproduct ? 'byproduct' : 'co_product',
      line_no: null,
      component_code: cp.coProductItemId,
      component_type: null,
      quantity: cp.quantity,
      uom: cp.uom,
      scrap_pct: cp.allocationPct,
      manufacturing_operation: null,
    });
  }
  // Excel sheet names are capped at 31 chars; FG codes are short but clamp anyway.
  return { name: productCode.slice(0, 31), rows };
}

/** Deterministic artifact key — the storage layer maps key → signed URL on upload. */
function artifactUrl(orgId: string, fileName: string): string {
  return `bom-generator/${orgId}/${fileName}`;
}

export function runGeneratorJob(orgId: string, input: GeneratorWorkerInput): GeneratorWorkerResult {
  const artifacts: Artifact[] = [];

  if (input.outputMode === 'per_fg') {
    for (const code of input.productCodes) {
      const detail = input.bomsByFg[code];
      const sheets = detail ? [fgSheet(code, detail)] : [{ name: code.slice(0, 31), rows: [] }];
      const fileName = `BOM_FG${code}.xlsx`;
      artifacts.push({ url: artifactUrl(orgId, fileName), fileName, sheets });
    }
  } else {
    const sheets: WorkbookSheet[] = input.productCodes.map((code) => {
      const detail = input.bomsByFg[code];
      return detail ? fgSheet(code, detail) : { name: code.slice(0, 31), rows: [] };
    });
    const fileName = `BOM_Batch_${input.runDate}.xlsx`;
    artifacts.push({ url: artifactUrl(orgId, fileName), fileName, sheets });
  }

  return { artifacts, resultUrls: artifacts.map((a) => a.url) };
}
