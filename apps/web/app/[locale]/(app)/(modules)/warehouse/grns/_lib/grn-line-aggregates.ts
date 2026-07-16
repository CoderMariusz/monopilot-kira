import { microToDecimal, toMicro } from '../../../../../../../lib/shared/decimal';

export type GrnLineForAggregate = {
  poLineId: string | null;
  orderedQty: string | null;
  receivedQty: string;
  cancelled?: boolean;
};

export type PoLineReceiptAggregate = {
  /** Total received across all live receipt rows for the PO line. */
  receivedMicro: bigint;
  /** Display outstanding: max(0, ordered − aggregate received). */
  outstanding: string | null;
  /** PO-line aggregate receipt state (over/full/partial/none). */
  state: 'none' | 'partial' | 'full' | 'over';
};

/**
 * Roll up received quantities per PO line (multi-receipt GRNs). Cancelled rows are
 * excluded — they no longer contribute to the PO-line balance.
 */
export function buildPoLineReceiptAggregates(
  items: GrnLineForAggregate[],
): Map<string, PoLineReceiptAggregate> {
  const receivedByPoLine = new Map<string, bigint>();
  const orderedByPoLine = new Map<string, string>();

  for (const item of items) {
    if (item.cancelled || !item.poLineId) continue;
    const prev = receivedByPoLine.get(item.poLineId) ?? 0n;
    receivedByPoLine.set(item.poLineId, prev + toMicro(item.receivedQty));
    if (item.orderedQty != null && !orderedByPoLine.has(item.poLineId)) {
      orderedByPoLine.set(item.poLineId, item.orderedQty);
    }
  }

  const aggregates = new Map<string, PoLineReceiptAggregate>();
  for (const [poLineId, receivedMicro] of receivedByPoLine) {
    const ordered = orderedByPoLine.get(poLineId) ?? null;
    aggregates.set(poLineId, {
      receivedMicro,
      outstanding: outstandingFromAggregate(ordered, receivedMicro),
      state: receiptAggregateState(ordered, receivedMicro),
    });
  }
  return aggregates;
}

export function resolveLineReceiptAggregate(
  item: GrnLineForAggregate,
  aggregates: Map<string, PoLineReceiptAggregate>,
): PoLineReceiptAggregate {
  if (item.cancelled) {
    return { receivedMicro: 0n, outstanding: null, state: 'none' };
  }
  if (item.poLineId) {
    const aggregate = aggregates.get(item.poLineId);
    if (aggregate) return aggregate;
  }
  const receivedMicro = toMicro(item.receivedQty);
  return {
    receivedMicro,
    outstanding: outstandingFromAggregate(item.orderedQty, receivedMicro),
    state: receiptAggregateState(item.orderedQty, receivedMicro),
  };
}

function outstandingFromAggregate(ordered: string | null, receivedMicro: bigint): string | null {
  if (ordered == null) return null;
  const rem = toMicro(ordered) - receivedMicro;
  if (rem <= 0n) return '0';
  return microToDecimal(rem);
}

function receiptAggregateState(
  ordered: string | null,
  receivedMicro: bigint,
): 'none' | 'partial' | 'full' | 'over' {
  if (ordered == null) return 'none';
  const orderedMicro = toMicro(ordered);
  if (receivedMicro <= 0n) return 'none';
  if (receivedMicro > orderedMicro) return 'over';
  if (receivedMicro >= orderedMicro) return 'full';
  return 'partial';
}
