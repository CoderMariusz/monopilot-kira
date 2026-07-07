/**
 * Resolve label/print field values into Code128 payload strings.
 */

import { buildGs1Element } from './build.js';
import { validateGtin14 } from './gtin.js';
import { validateSscc18 } from './sscc.js';

export type BarcodeSymbology = 'ean13' | 'code128' | 'gs1-128' | string;

export type ResolvedBarcode = {
  /** Payload encoded into Code128 (without FNC1 — use gs1 flag when rendering). */
  value: string;
  /** Human-readable caption under the bars. */
  caption: string;
  /** When true, prepend FNC1 (GS1-128). */
  gs1: boolean;
};

function digitsOnly(value: string): string {
  return value.replace(/\s+/g, '');
}

function normalizeSymbology(symbology: BarcodeSymbology | undefined): string {
  return (symbology ?? 'ean13').trim().toLowerCase().replace(/\s+/g, '');
}

function resolveGs1FromField(field: string, raw: string): ResolvedBarcode | null {
  const digits = digitsOnly(raw);
  if (field === 'sscc' && validateSscc18(digits)) {
    const element = buildGs1Element({ sscc: digits });
    return { value: element.raw, caption: element.human, gs1: true };
  }
  if ((field === 'ean' || field === 'gtin' || field === 'sku') && validateGtin14(digits)) {
    const element = buildGs1Element({ gtin: digits });
    return { value: element.raw, caption: element.human, gs1: true };
  }
  return null;
}

/**
 * Map editor/print inputs to a Code128 payload.
 * GS1-128 is used for SSCC/GTIN when symbology or field implies it.
 */
export function resolveBarcodePayload(input: {
  value: string;
  field?: string;
  symbology?: BarcodeSymbology;
}): ResolvedBarcode {
  const raw = input.value.trim();
  if (!raw) {
    throw new Error('Barcode value is required');
  }

  const symbology = normalizeSymbology(input.symbology);
  const field = (input.field ?? '').toLowerCase();

  if (symbology === 'gs1-128') {
    const gs1 = resolveGs1FromField(field || 'ean', raw);
    if (gs1) return gs1;
    return { value: digitsOnly(raw) || raw, caption: raw, gs1: true };
  }

  if (symbology === 'ean13' || symbology === 'ean-13') {
    const gs1 = resolveGs1FromField('ean', raw);
    if (gs1) return gs1;
  }

  if (field === 'sscc') {
    const gs1 = resolveGs1FromField('sscc', raw);
    if (gs1) return gs1;
  }

  if (field === 'ean' || field === 'gtin') {
    const gs1 = resolveGs1FromField('ean', raw);
    if (gs1) return gs1;
  }

  return { value: raw, caption: raw, gs1: false };
}

/** Convenience for SSCC-18 box labels (always GS1-128 AI 00). */
export function resolveSsccBarcode(sscc: string): ResolvedBarcode {
  return resolveGs1FromField('sscc', sscc) ?? { value: digitsOnly(sscc), caption: sscc, gs1: true };
}

/** Convenience for GTIN product labels (GS1-128 AI 01 when valid). */
export function resolveGtinBarcode(gtin: string): ResolvedBarcode | null {
  return resolveGs1FromField('ean', gtin);
}
