// Types + constants for the FA BOM tab. Kept OUTSIDE get-fa-bom.ts because a
// 'use server' module may export only async functions (Next 16 / Turbopack
// enforces this at build time; webpack-based local builds let it slip through).

export const FA_BOM_READ_PERMISSION = 'npd.fa.read';

/** A single BOM line as rendered in the tab table (1:1 with the prototype columns). */
export type FaBomLine = {
  /** Component type — 'RM' (blue badge) / 'PM' (violet badge) / other. */
  componentType: string;
  /** Component code (mono). */
  componentCode: string;
  /** Component display name (falls back to the code when unknown). */
  componentName: string;
  /** Quantity per unit (numeric, rendered mono/right). */
  quantity: string;
  /** Process stage (manufacturing operation name) — muted. */
  processStage: string;
  /** Source of the line (Core / ProdDetail / MRP / manual) — muted. */
  source: string;
  /** D365 status: 'Found' (green), 'No cost' (amber), 'Missing'/'Empty' (red). */
  d365Status: string;
};

/** The version header shown above the table (status + version + line count). */
export type FaBomVersion = {
  bomHeaderId: string;
  status: string;
  version: number;
  lineCount: number;
};

export type FaBomResult =
  | { state: 'ready'; version: FaBomVersion; lines: FaBomLine[] }
  | { state: 'empty' };
