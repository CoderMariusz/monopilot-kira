import { microToDecimal, toMicro } from '../../../../../../lib/shared/decimal';

/** Exact micro-unit compare for NUMERIC(18,6) qty columns — never float. */
export function compareDecimal(a: string, b: string): number {
  const aa = toMicro(a);
  const bb = toMicro(b);
  if (aa === bb) return 0;
  return aa > bb ? 1 : -1;
}

export function remainingQty(ordered: string, received: string): string {
  const rem = toMicro(ordered) - toMicro(received);
  return rem > 0n ? microToDecimal(rem) : '0';
}

export function receiptPercent(received: string, ordered: string): number {
  const o = toMicro(ordered);
  if (o <= 0n) return 0;
  const pct = (toMicro(received) * 100n + o / 2n) / o;
  return Number(pct > 999n ? 999n : pct);
}
