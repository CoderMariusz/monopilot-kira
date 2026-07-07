import type {
  TraceMassBalance,
  TraceMassBalanceNode,
  TraceMassBalanceTotal,
  TraceMassBalanceUnreconciled,
  TraceTruncationLayer,
  TraceTruncationLayerKind,
} from './trace-types';

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

export type MassBalanceNodeInput = {
  woRef: string;
  inputRows: MassBalanceQtyRow[];
  outputRows: MassBalanceQtyRow[];
  wasteRows: MassBalanceQtyRow[];
  remainingRows: MassBalanceQtyRow[];
};

export function computeNodeMassBalance(node: MassBalanceNodeInput): {
  node: TraceMassBalanceNode;
  unreconciled: TraceMassBalanceUnreconciled[];
} {
  const input = partitionKgRows(node.inputRows, 'node_input');
  const output = partitionKgRows(node.outputRows, 'node_output');
  const waste = partitionKgRows(node.wasteRows, 'unattributed_wo_waste');
  const remaining = partitionKgRows(node.remainingRows, 'node_remaining');

  const inputKg = input.kgTotal;
  const outputKg = output.kgTotal;
  const wasteKg = waste.kgTotal;
  const remainingKg = remaining.kgTotal;
  const recoveredKg = addDecimalStrings([outputKg, wasteKg, remainingKg]);
  const deltaKg = subtractDecimalStrings(inputKg, recoveredKg);

  return {
    node: {
      woRef: node.woRef,
      inputKg,
      outputKg,
      wasteKg,
      remainingKg,
      deltaKg,
      balanced: isWithinEpsilon(deltaKg),
    },
    unreconciled: [...input.unreconciled, ...output.unreconciled, ...waste.unreconciled, ...remaining.unreconciled],
  };
}

export function computeNettedMassBalance(input: {
  seedRows: MassBalanceQtyRow[];
  onSiteRows: MassBalanceQtyRow[];
  shippedRows: MassBalanceQtyRow[];
  wasteKg: string;
  unattributedWasteRows?: TraceMassBalanceUnreconciled[];
}): { total: TraceMassBalanceTotal; unreconciled: TraceMassBalanceUnreconciled[] } | null {
  const seed = partitionKgRows(input.seedRows, 'netted_seed');
  const onSite = partitionKgRows(input.onSiteRows, 'netted_on_site');
  const shipped = partitionKgRows(input.shippedRows, 'netted_shipped');

  const seedInputKg = seed.kgTotal;
  if (seedInputKg === '0' && seed.unreconciled.length === 0) {
    return null;
  }

  const onSiteKg = onSite.kgTotal;
  const shippedKg = shipped.kgTotal;
  const wasteKg = input.wasteKg;
  const accountedKg = addDecimalStrings([onSiteKg, shippedKg, wasteKg]);
  const deltaKg = subtractDecimalStrings(seedInputKg, accountedKg);

  const seedScaled = decimalToScaled(seedInputKg, 6);
  const percentAccounted =
    seedScaled === 0n
      ? '0'
      : formatScaledDecimal((decimalToScaled(accountedKg, 6) * 100_000_000n) / seedScaled, 6);

  return {
    total: {
      seedInputKg,
      shippedKg,
      onSiteKg,
      wasteKg,
      deltaKg,
      balanced: isWithinEpsilon(deltaKg),
      percentAccounted,
    },
    unreconciled: [
      ...seed.unreconciled,
      ...onSite.unreconciled,
      ...shipped.unreconciled,
      ...(input.unattributedWasteRows ?? []),
    ],
  };
}

export function computeMassBalance(input: {
  nodes: MassBalanceNodeInput[];
  seedRows: MassBalanceQtyRow[];
  onSiteRows: MassBalanceQtyRow[];
  shippedRows: MassBalanceQtyRow[];
  wasteByWo: Map<string, string>;
  unattributedWasteRows?: TraceMassBalanceUnreconciled[];
}): TraceMassBalance | null {
  const nodeResults = input.nodes.map((node) => {
    const wasteKg = input.wasteByWo.get(node.woRef) ?? '0';
    return computeNodeMassBalance({
      ...node,
      wasteRows: wasteKg === '0' ? [] : [{ ref: node.woRef, qty: wasteKg, uom: 'kg' }],
    });
  });

  const netted = computeNettedMassBalance({
    seedRows: input.seedRows,
    onSiteRows: input.onSiteRows,
    shippedRows: input.shippedRows,
    wasteKg: addDecimalStrings([...input.wasteByWo.values()]),
    unattributedWasteRows: input.unattributedWasteRows,
  });

  if (!netted && nodeResults.length === 0) {
    return null;
  }

  if (!netted) {
    return null;
  }

  return {
    applicable: true,
    nodes: nodeResults.map((result) => result.node),
    total: netted.total,
    unreconciled: [
      ...nodeResults.flatMap((result) => result.unreconciled),
      ...netted.unreconciled,
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
