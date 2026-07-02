import type { TraceMassBalance, TraceMassBalanceUnreconciled, TraceTruncationLayer, TraceTruncationLayerKind } from './trace-types';

export const MASS_BALANCE_EPSILON_KG = '0.001';

export const LP_SEED_LIMIT = 200;
export const BATCH_SEED_LIMIT = 500;
export const ITEM_SEED_LIMIT = 500;

export type MassBalanceQtyRow = {
  ref: string;
  qty: string;
  uom: string | null;
};

export function isKgUom(uom: string | null | undefined): boolean {
  return uom?.trim().toLowerCase() === 'kg';
}

function decimalToScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const sign = trimmed.startsWith('-') ? -1n : 1n;
  const unsigned = trimmed.replace(/^-/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  return sign * BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function formatScaledDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  if (scale === 0) return `${sign}${abs.toString()}`;
  const raw = abs.toString().padStart(scale + 1, '0');
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function addDecimalStrings(values: string[]): string {
  if (values.length === 0) return '0';
  const scale = values.reduce((max, value) => Math.max(max, value.split('.')[1]?.length ?? 0), 0);
  const total = values.reduce((sum, value) => sum + decimalToScaled(value, scale), 0n);
  return formatScaledDecimal(total, scale);
}

export function subtractDecimalStrings(minuend: string, subtrahend: string): string {
  const scale = Math.max(minuend.split('.')[1]?.length ?? 0, subtrahend.split('.')[1]?.length ?? 0);
  const diff = decimalToScaled(minuend, scale) - decimalToScaled(subtrahend, scale);
  return formatScaledDecimal(diff, scale);
}

function absDecimalString(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value;
}

export function isWithinEpsilon(deltaKg: string, epsilonKg: string = MASS_BALANCE_EPSILON_KG): boolean {
  const scale = Math.max(deltaKg.split('.')[1]?.length ?? 0, epsilonKg.split('.')[1]?.length ?? 0);
  const deltaAbs = decimalToScaled(absDecimalString(deltaKg), scale);
  const epsilon = decimalToScaled(epsilonKg, scale);
  return deltaAbs <= epsilon;
}

function partitionKgRows(
  rows: MassBalanceQtyRow[],
  bucket: TraceMassBalanceUnreconciled['bucket'],
): { kgTotal: string; unreconciled: TraceMassBalanceUnreconciled[] } {
  const kgQtys: string[] = [];
  const unreconciled: TraceMassBalanceUnreconciled[] = [];
  for (const row of rows) {
    if (isKgUom(row.uom)) {
      kgQtys.push(row.qty);
      continue;
    }
    unreconciled.push({
      ref: row.ref,
      qty: row.qty,
      uom: row.uom ?? '—',
      bucket,
    });
  }
  return { kgTotal: addDecimalStrings(kgQtys), unreconciled };
}

export function computeMassBalance(input: {
  producedRows: MassBalanceQtyRow[];
  onSiteRows: MassBalanceQtyRow[];
  shippedRows: MassBalanceQtyRow[];
  wasteKg: string;
  /** Waste rows whose wo_id maps to a traced WO but whose LP/batch cannot be
   *  attributed to the exact traced set — emitted as unreconciled entries. */
  unattributedWasteRows?: TraceMassBalanceUnreconciled[];
}): TraceMassBalance | null {
  const produced = partitionKgRows(input.producedRows, 'produced');
  const onSite = partitionKgRows(input.onSiteRows, 'on_site');
  const shipped = partitionKgRows(input.shippedRows, 'shipped');

  const producedKg = produced.kgTotal;
  if (producedKg === '0' && produced.unreconciled.length === 0) {
    return null;
  }

  const onSiteKg = onSite.kgTotal;
  const shippedKg = shipped.kgTotal;
  const wasteKg = input.wasteKg;
  const recoveredKg = addDecimalStrings([onSiteKg, shippedKg, wasteKg]);
  const deltaKg = subtractDecimalStrings(producedKg, recoveredKg);

  const producedScaled = decimalToScaled(producedKg, 6);
  const percentRecovered =
    producedScaled === 0n
      ? '0'
      : formatScaledDecimal((decimalToScaled(recoveredKg, 6) * 100_000_000n) / producedScaled, 6);

  return {
    applicable: true,
    lines: [
      { key: 'produced', qtyKg: producedKg },
      { key: 'on_site', qtyKg: onSiteKg },
      { key: 'shipped', qtyKg: shippedKg },
      { key: 'waste', qtyKg: wasteKg },
      { key: 'recovered', qtyKg: recoveredKg },
      { key: 'delta', qtyKg: deltaKg },
    ],
    percentRecovered,
    balanced: isWithinEpsilon(deltaKg),
    unreconciled: [
      ...produced.unreconciled,
      ...onSite.unreconciled,
      ...shipped.unreconciled,
      ...(input.unattributedWasteRows ?? []),
    ],
  };
}

export function sliceSeedRows<T extends { id: string }>(
  rows: T[],
  limit: number,
  layer: TraceTruncationLayerKind,
): { ids: string[]; layer: TraceTruncationLayer | null } {
  if (rows.length > limit) {
    return { ids: rows.slice(0, limit).map((row) => row.id), layer: { layer, limit } };
  }
  return { ids: rows.map((row) => row.id), layer: null };
}
