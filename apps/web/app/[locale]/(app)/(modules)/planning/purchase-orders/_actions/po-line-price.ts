import { Dec } from '@monopilot/domain';
import { microToFixed, toMicro } from '../../../../../../../lib/shared/decimal';

/** Postgres purchase_order_lines.unit_price scale (numeric(12,4)). */
export const PO_LINE_MONEY_SCALE = 4;

/** Line net = qty × unit_price, rounded to money scale. */
export function computePoLineNet(qty: string, unitPrice: string): string {
  return Dec.from(qty).mul(Dec.from(unitPrice)).toFixed(PO_LINE_MONEY_SCALE);
}

/** Tax on a net amount: net × tax_pct/100. */
export function computePoLineTax(net: string, taxPct: string = '0'): string {
  const hundred = Dec.from('100');
  return Dec.from(net).mul(Dec.from(taxPct).div(hundred)).toFixed(PO_LINE_MONEY_SCALE);
}

/** Gross = net + tax where net = qty × unit_price. */
export function computePoLineGross(qty: string, unitPrice: string, taxPct: string = '0'): string {
  const net = computePoLineNet(qty, unitPrice);
  const tax = computePoLineTax(net, taxPct);
  return Dec.from(net).add(Dec.from(tax)).toFixed(PO_LINE_MONEY_SCALE);
}

export function sumPoMoneyAmounts(amounts: readonly string[]): string {
  const sumMicros = amounts.reduce((sum, total) => sum + toMicro(total), 0n);
  return microToFixed(sumMicros, PO_LINE_MONEY_SCALE);
}

export type PoOrderTotals = {
  netTotal: string;
  taxTotal: string;
  grossTotal: string;
};

export function computePoOrderTotals(
  lines: ReadonlyArray<{ qty: string; unitPrice: string; taxPct?: string }>,
): PoOrderTotals {
  const nets = lines.map((l) => computePoLineNet(l.qty, l.unitPrice));
  const taxes = lines.map((l, i) => computePoLineTax(nets[i]!, l.taxPct ?? '0'));
  const grosses = lines.map((l, i) =>
    Dec.from(nets[i]!).add(Dec.from(taxes[i]!)).toFixed(PO_LINE_MONEY_SCALE),
  );
  return {
    netTotal: sumPoMoneyAmounts(nets),
    taxTotal: sumPoMoneyAmounts(taxes),
    grossTotal: sumPoMoneyAmounts(grosses),
  };
}
