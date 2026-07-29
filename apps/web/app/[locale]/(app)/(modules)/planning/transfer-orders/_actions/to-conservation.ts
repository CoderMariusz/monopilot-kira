import type { OrgActionContext, QueryClient } from '../../_actions/procurement-shared';
import { qtyToBaseMicro6, type TransferItemUomRow } from './transfer-uom-base';

const QTY_SCALE = 1_000_000n;

function toMicro6(decimal: string): bigint {
  const neg = decimal.startsWith('-');
  const body = neg ? decimal.slice(1) : decimal;
  const [intPart, fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '000000').slice(0, 6);
  const micro = BigInt(intPart || '0') * QTY_SCALE + BigInt(frac || '0');
  return neg ? -micro : micro;
}

function microToText6(micro: bigint): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const frac = (abs % QTY_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  const out = frac ? `${abs / QTY_SCALE}.${frac}` : `${abs / QTY_SCALE}`;
  return neg && abs !== 0n ? `-${out}` : out;
}

/** C058 — matter must not be created/destroyed across TO stock transitions. */
export class TransferOrderConservationError extends Error {
  readonly code = 'CONSERVATION_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'TransferOrderConservationError';
  }
}

export type ToItemUom = { itemId: string; uom: string };

/** Stable key for per-item balances in base UoM — mixed-UoM lines (g + kg) aggregate here. */
export function toItemConservationKey(itemId: string): string {
  return itemId;
}

/** @deprecated Per-(item,uom) keys — use toItemConservationKey for matter snapshots. */
export function toItemUomKey(itemId: string, uom: string): string {
  return `${itemId}:${uom}`;
}

export type ToMatterBalanceSnapshot = Map<string, bigint>;

export async function loadTransferOrderItemUoms(ctx: OrgActionContext, toId: string): Promise<ToItemUom[]> {
  const { rows } = await (ctx.client as QueryClient).query<{ item_id: string; uom: string }>(
    `select distinct item_id::text as item_id, uom
       from public.transfer_order_lines
      where org_id = app.current_org_id()
        and to_id = $1::uuid`,
    [toId],
  );
  return rows.map((row) => ({ itemId: row.item_id, uom: row.uom }));
}

/** @deprecated Use loadTransferOrderItemUoms — item ids alone cannot conserve mixed UOM lines. */
export async function loadTransferOrderItemIds(ctx: OrgActionContext, toId: string): Promise<string[]> {
  const pairs = await loadTransferOrderItemUoms(ctx, toId);
  return [...new Set(pairs.map((pair) => pair.itemId))];
}

/**
 * C058 — physical matter balance per item in base UoM for a TO:
 *   Σ license_plates.quantity (org-wide, all UoMs converted to base)
 * + Σ transfer_order_line_lps.qty (unreceived / in-transit rows for this TO)
 *
 * In-transit qty is not on any LP yet; counting both sides catches ship/receive inflation.
 * Mixed-UoM lines (kg LP + g line) must convert to base — per-(item,uom) scalars false-trip.
 */
export async function snapshotTransferOrderMatterBalance(
  ctx: OrgActionContext,
  toId: string,
  itemUoms: ToItemUom[],
): Promise<ToMatterBalanceSnapshot> {
  const snapshot: ToMatterBalanceSnapshot = new Map();
  const itemIds = [...new Set(itemUoms.map((pair) => pair.itemId))];
  if (itemIds.length === 0) return snapshot;

  const { rows: itemRows } = await (ctx.client as QueryClient).query<TransferItemUomRow>(
    `select i.id::text as id,
            i.uom_base,
            i.net_qty_per_each::text as net_qty_per_each,
            i.each_per_box::text as each_per_box
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = any($1::uuid[])`,
    [itemIds],
  );
  const itemById = new Map(itemRows.map((row) => [row.id, row]));

  const { rows: onHandRows } = await (ctx.client as QueryClient).query<{
    item_id: string;
    uom: string;
    total: string;
  }>(
    `select lp.product_id::text as item_id,
            lp.uom,
            coalesce(sum(lp.quantity), 0)::text as total
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.product_id = any($1::uuid[])
      group by lp.product_id, lp.uom`,
    [itemIds],
  );

  const { rows: inTransitRows } = await (ctx.client as QueryClient).query<{
    item_id: string;
    uom: string;
    total: string;
  }>(
    `select tol.item_id::text as item_id,
            tol.uom,
            coalesce(sum(tll.qty), 0)::text as total
       from public.transfer_order_line_lps tll
       join public.transfer_order_lines tol
         on tol.org_id = tll.org_id
        and tol.id = tll.to_line_id
      where tll.org_id = app.current_org_id()
        and tll.to_id = $1::uuid
        and tll.dest_lp_id is null
      group by tol.item_id, tol.uom`,
    [toId],
  );

  const sumRowsToBase = (
    rows: readonly { item_id: string; uom: string; total: string }[],
  ): Map<string, bigint> => {
    const byItem = new Map<string, bigint>();
    for (const row of rows) {
      const item = itemById.get(row.item_id);
      if (!item) continue;
      const baseMicro = qtyToBaseMicro6(item, row.total, row.uom);
      if (baseMicro === null) {
        throw new TransferOrderConservationError(
          `Cannot convert ${row.uom} qty to base UoM for item ${row.item_id} during matter snapshot`,
        );
      }
      const key = toItemConservationKey(row.item_id);
      byItem.set(key, (byItem.get(key) ?? 0n) + baseMicro);
    }
    return byItem;
  };

  const onHandByItem = sumRowsToBase(onHandRows);
  const inTransitByItem = sumRowsToBase(inTransitRows);

  for (const itemId of itemIds) {
    const key = toItemConservationKey(itemId);
    const onHand = onHandByItem.get(key) ?? 0n;
    const inTransit = inTransitByItem.get(key) ?? 0n;
    snapshot.set(key, onHand + inTransit);
  }
  return snapshot;
}

function formatSnapshot(snapshot: ToMatterBalanceSnapshot): string {
  const parts = [...snapshot.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, micro]) => `${key}=${microToText6(micro)}`);
  return parts.length > 0 ? parts.join(', ') : '(empty)';
}

/** Per-line receive progress — junction rows drive in-transit vs received qty. */
export type TransferOrderLineReceiveState = {
  lineId: string;
  lineMicro: bigint;
  receivedMicro: bigint;
  pendingMicro: bigint;
};

export async function loadTransferOrderLineReceiveState(
  ctx: OrgActionContext,
  toId: string,
): Promise<TransferOrderLineReceiveState[]> {
  const { rows } = await (ctx.client as QueryClient).query<{
    line_id: string;
    line_qty: string;
    received_qty: string;
    pending_qty: string;
  }>(
    `select l.id::text as line_id,
            l.qty::text as line_qty,
            coalesce(sum(tll.qty) filter (where tll.dest_lp_id is not null), 0)::text as received_qty,
            coalesce(sum(tll.qty) filter (where tll.dest_lp_id is null), 0)::text as pending_qty
       from public.transfer_order_lines l
       left join public.transfer_order_line_lps tll
         on tll.org_id = l.org_id
        and tll.to_line_id = l.id
      where l.org_id = app.current_org_id()
        and l.to_id = $1::uuid
      group by l.id, l.qty, l.line_no
      order by l.line_no asc`,
    [toId],
  );
  return rows.map((row) => ({
    lineId: row.line_id,
    lineMicro: toMicro6(row.line_qty),
    receivedMicro: toMicro6(row.received_qty),
    pendingMicro: toMicro6(row.pending_qty),
  }));
}

/** Every line must have received qty equal to line qty with no pending in-transit rows. */
export function assertAllLinesFullyReceived(lines: readonly TransferOrderLineReceiveState[]): {
  ok: true;
} | {
  ok: false;
  message: string;
} {
  const incomplete = lines.filter((line) => line.receivedMicro !== line.lineMicro || line.pendingMicro > 0n);
  if (incomplete.length === 0) return { ok: true };
  const parts = incomplete.map(
    (line) =>
      `line ${line.lineId}: received ${microToText6(line.receivedMicro)} pending ${microToText6(line.pendingMicro)} required ${microToText6(line.lineMicro)}`,
  );
  return {
    ok: false,
    message: `Transfer order is not fully received: ${parts.join('; ')}`,
  };
}

/**
 * Derive header status from materialized junction rows — never from transition intent alone.
 * Partial fulfillment with remainder cancelled/in-transit cleared closes as `received`.
 */
export function resolveTransferOrderStatusFromLines(
  lines: readonly TransferOrderLineReceiveState[],
): 'received' | 'partially_received' | 'in_transit' | 'cancelled' {
  if (lines.length === 0) return 'cancelled';
  const anyPending = lines.some((line) => line.pendingMicro > 0n);
  const anyReceived = lines.some((line) => line.receivedMicro > 0n);
  const allFullyReceived = lines.every((line) => line.receivedMicro === line.lineMicro && line.pendingMicro === 0n);
  if (allFullyReceived) return 'received';
  if (anyPending) return anyReceived ? 'partially_received' : 'in_transit';
  return anyReceived ? 'received' : 'cancelled';
}

export async function assertTransferOrderMatterConserved(
  ctx: OrgActionContext,
  toId: string,
  itemUoms: ToItemUom[],
  expected: ToMatterBalanceSnapshot,
  context: string,
): Promise<void> {
  const actual = await snapshotTransferOrderMatterBalance(ctx, toId, itemUoms);
  const violations: string[] = [];
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  for (const key of keys) {
    const want = expected.get(key) ?? 0n;
    const got = actual.get(key) ?? 0n;
    if (want !== got) {
      violations.push(`${key}: expected ${microToText6(want)}, got ${microToText6(got)}`);
    }
  }
  if (violations.length > 0) {
    throw new TransferOrderConservationError(
      `TO matter conservation violated (${context}): ${violations.join('; ')} [expected {${formatSnapshot(expected)}} actual {${formatSnapshot(actual)}}]`,
    );
  }
}
