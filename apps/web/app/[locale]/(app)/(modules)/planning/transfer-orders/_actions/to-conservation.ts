import type { OrgActionContext, QueryClient } from '../../_actions/procurement-shared';

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

/** Stable key for per-(item_id, uom) balances — never mix products or UOMs. */
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
 * C058 — physical matter balance per (item_id, uom) for a TO:
 *   Σ license_plates.quantity (org-wide for that item + UOM)
 * + Σ transfer_order_line_lps.qty (unreceived / in-transit rows for this TO)
 *
 * In-transit qty is not on any LP yet; counting both sides catches ship/receive inflation.
 * Each (item_id, uom) pair is tracked independently — unlike a global scalar, +A / −B cannot mask.
 */
export async function snapshotTransferOrderMatterBalance(
  ctx: OrgActionContext,
  toId: string,
  itemUoms: ToItemUom[],
): Promise<ToMatterBalanceSnapshot> {
  const snapshot: ToMatterBalanceSnapshot = new Map();
  if (itemUoms.length === 0) return snapshot;

  const itemIds = [...new Set(itemUoms.map((pair) => pair.itemId))];
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
  const onHandByKey = new Map(
    onHandRows.map((row) => [toItemUomKey(row.item_id, row.uom), toMicro6(row.total)]),
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
  const inTransitByKey = new Map(
    inTransitRows.map((row) => [toItemUomKey(row.item_id, row.uom), toMicro6(row.total)]),
  );

  for (const { itemId, uom } of itemUoms) {
    const key = toItemUomKey(itemId, uom);
    const onHand = onHandByKey.get(key) ?? 0n;
    const inTransit = inTransitByKey.get(key) ?? 0n;
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
