import { createHash } from 'node:crypto';

export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type WarehouseContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type WarehouseResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error'; message?: string };

export const WAREHOUSE_READ_PERMISSION = 'warehouse.inventory.read';
export const WAREHOUSE_STOCK_MOVE_PERMISSION = 'warehouse.stock.move';
export const WAREHOUSE_LP_RESERVE_PERMISSION = 'warehouse.lp.reserve';

export async function hasWarehousePermission(ctx: WarehouseContext, permission: string): Promise<boolean> {
  const res = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r
         on r.id = ur.role_id
        and r.org_id = $2::uuid
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return (res.rowCount ?? res.rows.length) > 0;
}

export function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function asLimit(value: unknown, fallback = 100, max = 500): number {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, 1), max) : fallback;
}

export function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function uuidFromSeed(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function moveNumberFromTransactionId(transactionId: string): string {
  return `SM-${transactionId.replaceAll('-', '').slice(0, 20).toUpperCase()}`;
}

export type LicensePlateListInput = {
  status?: string;
  qaStatus?: string;
  search?: string;
  warehouseId?: string;
  /**
   * 14-multi-site (CL4): filter on license_plates.site_id (day-1 column,
   * (org_id, site_id) index from mig 191). Absent/empty = All sites.
   * NOTE: warehouses has NO site_id column — the LP row itself carries it.
   */
  siteId?: string;
  limit?: number;
};

export type LicensePlateListItem = {
  id: string;
  lpNumber: string;
  itemCode: string | null;
  itemName: string | null;
  quantity: string;
  reservedQty: string;
  availableQty: string;
  uom: string;
  status: string;
  qaStatus: string;
  batchNumber: string | null;
  expiryDate: string | null;
  locationCode: string | null;
  warehouseCode: string | null;
  createdAt: string;
};

export type LicensePlateDetail = LicensePlateListItem & {
  productId: string;
  warehouseId: string;
  locationId: string | null;
  locationName: string | null;
  warehouseName: string | null;
  catchWeightKg: string | null;
  supplierBatchNumber: string | null;
  bestBeforeDate: string | null;
  origin: string;
  grnId: string | null;
  woId: string | null;
  reservedForWoId: string | null;
  reservedForWoNumber: string | null;
  parentLp: { id: string; lpNumber: string } | null;
  childLps: Array<{ id: string; lpNumber: string; status: string; quantity: string; uom: string }>;
  stateHistory: Array<{
    id: string;
    fromState: string | null;
    toState: string;
    reasonCode: string | null;
    reasonText: string | null;
    transitionedAt: string;
  }>;
  moves: Array<{
    id: string;
    moveNumber: string;
    moveType: string;
    fromLocationId: string | null;
    fromLocationCode: string | null;
    toLocationId: string | null;
    toLocationCode: string | null;
    quantity: string;
    uom: string | null;
    moveDate: string;
    reasonText: string | null;
  }>;
};

export type GrnListInput = { status?: string; sourceType?: string; search?: string; limit?: number };
export type GrnListItem = {
  id: string;
  grnNumber: string;
  sourceType: string;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
  warehouseId: string;
  warehouseCode: string | null;
  receiptDate: string;
  completedAt: string | null;
  /**
   * Count of receipt lines (public.grn_items) on this GRN, org-scoped and rolled
   * up server-side so the list can show a real Items count instead of an em-dash.
   * Cancelled lines are excluded so the count reflects live receipt lines.
   */
  itemCount: number;
};

export type GrnDetail = GrnListItem & {
  notes: string | null;
  items: Array<{
    id: string;
    lineNumber: number;
    productId: string;
    itemCode: string | null;
    itemName: string | null;
    poLineId: string | null;
    orderedQty: string | null;
    receivedQty: string;
    uom: string;
    batchNumber: string | null;
    expiryDate: string | null;
    lpId: string | null;
    lpNumber: string | null;
    lpQaStatus: string | null;
    /** R3 F6 — mig-298 receipt-line cancellation flag (cancelled_at IS NOT NULL). */
    cancelled: boolean;
    cancellationReasonCode: string | null;
  }>;
  licensePlates: Array<{ id: string; lpNumber: string; status: string; quantity: string; uom: string }>;
};

export type StockMoveListInput = { moveType?: string; limit?: number };

/**
 * Which ledger a unified movement row came from. `stock_move` = the explicit
 * public.stock_moves ledger (putaway/transfer/issue/adjustment). `lp_state` =
 * a public.lp_state_history transition (receive / production output / consume /
 * promotion) surfaced as a movement so receipts/consumes/outputs are no longer
 * invisible on the movements screen.
 */
export type StockMoveSource = 'stock_move' | 'lp_state';

export type StockMoveListItem = {
  id: string;
  moveNumber: string;
  lpId: string;
  lpNumber: string | null;
  moveType: string;
  fromLocationCode: string | null;
  toLocationCode: string | null;
  quantity: string;
  uom: string | null;
  moveDate: string;
  reasonText: string | null;
  /** Origin ledger of this row (unified movement ledger — WH-006 fix). */
  source: StockMoveSource;
};
export type CreateStockMoveInput = { lpId: string; toLocationId: string; reason?: string; clientOpId: string };

export type InventoryByProductRow = {
  productId: string;
  itemCode: string | null;
  itemName: string | null;
  totalQty: string;
  pickableQty: string;
  quantity: string;
  availableQty: string;
  lpCount: number;
  earliestExpiryDate: string | null;
  uom: string | null;
};

export type InventoryByLocationRow = {
  locationId: string | null;
  locationCode: string | null;
  warehouseId: string | null;
  warehouseCode: string | null;
  totalQty: string;
  pickableQty: string;
  quantity: string;
  availableQty: string;
  lpCount: number;
};

export type InventoryByBatchRow = {
  productId: string;
  itemCode: string | null;
  batchNumber: string | null;
  totalQty: string;
  pickableQty: string;
  quantity: string;
  availableQty: string;
  lpCount: number;
  earliestExpiryDate: string | null;
};

export type ReservationRow = {
  lpId: string;
  lpNumber: string;
  status: string;
  reservedQty: string;
  reservedForWoId: string | null;
  woNumber: string | null;
  itemCode: string | null;
  itemName: string | null;
  quantity: string;
  uom: string;
};
export type ReleaseReservationInput = { lpId: string; reason: string };

export type ExpiryDashboard = {
  redCount: number;
  amberCount: number;
  rows: Array<{
    lpId: string;
    lpNumber: string;
    tier: 'red' | 'amber';
    itemCode: string | null;
    itemName: string | null;
    locationCode: string | null;
    warehouseCode: string | null;
    quantity: string;
    uom: string;
    expiryDate: string;
    warningDays: number;
  }>;
};

export type GenealogyNode = {
  lpId: string;
  lpNumber: string;
  itemCode: string | null;
  quantity: string;
  uom: string;
  status: string;
  createdAt: string;
  depth: number;
  direction: 'self' | 'ancestor' | 'descendant';
  parentLpId: string | null;
};
