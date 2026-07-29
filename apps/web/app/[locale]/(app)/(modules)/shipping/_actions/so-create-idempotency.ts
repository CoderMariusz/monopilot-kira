import { createHash } from 'node:crypto';

import { normalizeSoLineQty } from './so-line-numeric';

export type SoCreateLineInput = {
  item_id: string;
  qty: string;
  uom: string;
  unit_price_gbp?: string;
  discount_pct?: string;
  tax_pct?: string;
  currency?: string;
};

export type SoCreateIdempotencyInput = {
  customer_id: string;
  requested_date?: string;
  notes?: string;
  lines: SoCreateLineInput[];
};

const PCT_PATTERN = /^\d+(?:\.\d{1,4})?$/;

function normalizePct(value: string | undefined): string {
  const text = value?.trim() || '0';
  if (!PCT_PATTERN.test(text)) return text;
  const [whole, fraction = ''] = text.split('.');
  return `${whole}.${fraction.padEnd(4, '0').slice(0, 4)}`;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

export function buildSoCreateIdempotencyPayload(input: SoCreateIdempotencyInput): Record<string, unknown> {
  return {
    customer_id: input.customer_id,
    requested_date: input.requested_date ?? null,
    notes: input.notes?.trim() || null,
    lines: input.lines.map((line, index) => ({
      line_no: index + 1,
      item_id: line.item_id,
      qty: normalizeSoLineQty(line.qty) ?? line.qty.trim(),
      uom: line.uom.trim(),
      unit_price_gbp: line.unit_price_gbp?.trim() || null,
      discount_pct: normalizePct(line.discount_pct),
      tax_pct: normalizePct(line.tax_pct),
      currency: line.currency?.trim().toUpperCase() || 'GBP',
    })),
  };
}

export function hashSoCreatePayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex');
}

export function isUuidV4ish(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const IDEMPOTENCY_TX_PREFIX = 'ship.so.idempotency_tx:';

/** Org-scoped idempotency PK — avoids cross-tenant collision on bare client_op_id. */
export function soCreateIdempotencyTransactionId(orgId: string, clientOpId: string): string {
  const seed = `${IDEMPOTENCY_TX_PREFIX}${orgId}:${clientOpId.trim().toLowerCase()}`;
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-a${hex.slice(16, 19)}-${hex.slice(20, 32)}`;
}
