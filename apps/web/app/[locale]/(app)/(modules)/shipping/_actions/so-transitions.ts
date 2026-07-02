export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'allocated'
  | 'partially_picked'
  | 'picked'
  | 'partially_packed'
  | 'packed'
  | 'manifested'
  | 'shipped'
  | 'partially_delivered'
  | 'delivered'
  | 'cancelled';

export type ShipmentStatus =
  | 'pending'
  | 'packing'
  | 'packed'
  | 'manifested'
  | 'shipped'
  | 'delivered'
  /** Reserved/unreachable: no writer sets exception yet (F3 audit A3 S-5). */
  | 'exception'
  | 'cancelled';

/** ext_data.closed_reason value marking an allocation consumed by ship confirm. */
export const SHIP_CLOSED_ALLOCATION_REASON = 'shipped' as const;

/** SQL predicate: allocation row is still live (not ship-consumed). */
export const LIVE_ALLOCATION_SQL = `ia.status in ('allocated', 'picked') and coalesce(ia.ext_data->>'closed_reason', '') <> '${SHIP_CLOSED_ALLOCATION_REASON}'`;

export const DEALLOCATABLE_SO_STATUSES: readonly SalesOrderStatus[] = [
  'allocated',
  'partially_picked',
  'picked',
];

export const SO_CANCEL_BLOCKED_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['shipped', 'delivered'];

export const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['pending', 'packing'];

export const SO_LEGAL_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['allocated', 'cancelled'],
  allocated: ['partially_picked', 'picked', 'confirmed', 'cancelled'],
  partially_picked: ['picked', 'confirmed', 'cancelled'],
  picked: ['partially_packed', 'packed', 'confirmed', 'cancelled'],
  partially_packed: ['packed', 'allocated', 'shipped', 'cancelled'],
  packed: ['manifested', 'partially_packed', 'allocated', 'shipped', 'cancelled'],
  manifested: ['shipped', 'packed', 'partially_packed', 'allocated', 'confirmed', 'cancelled'],
  shipped: ['partially_delivered', 'delivered'],
  partially_delivered: ['delivered', 'shipped'],
  delivered: ['partially_delivered', 'shipped'],
  cancelled: [],
};

export const SHIPMENT_LEGAL_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending: ['packing', 'cancelled'],
  packing: ['packed', 'cancelled'],
  packed: ['manifested', 'shipped', 'packing', 'cancelled'],
  manifested: ['shipped', 'packing', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['shipped'],
  exception: [],
  cancelled: [],
};

export function isSalesOrderStatus(status: string): status is SalesOrderStatus {
  return Object.prototype.hasOwnProperty.call(SO_LEGAL_TRANSITIONS, status);
}

export function isShipmentStatus(status: string): status is ShipmentStatus {
  return Object.prototype.hasOwnProperty.call(SHIPMENT_LEGAL_TRANSITIONS, status);
}

export function isLegalSoTransition(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return SO_LEGAL_TRANSITIONS[from].includes(to);
}

export function isLegalShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return SHIPMENT_LEGAL_TRANSITIONS[from].includes(to);
}

export function isDeallocatableSalesOrderStatus(status: string): status is (typeof DEALLOCATABLE_SO_STATUSES)[number] {
  return (DEALLOCATABLE_SO_STATUSES as readonly string[]).includes(status);
}

export type SalesOrderProgressSnapshot = {
  shipmentCount: number;
  packingCount: number;
  packedCount: number;
  manifestedCount: number;
  shippedCount: number;
  deliveredCount: number;
  liveAllocationCount: number;
};

/**
 * Derive the SO status from sibling shipment progress and live (non-ship-consumed) allocations.
 * Never regresses below the highest still-live shipment progress (e.g. sibling shipped → SO shipped).
 */
export function deriveSalesOrderStatusFromProgress(snapshot: SalesOrderProgressSnapshot): SalesOrderStatus {
  const {
    shipmentCount,
    packingCount,
    packedCount,
    manifestedCount,
    shippedCount,
    deliveredCount,
    liveAllocationCount,
  } = snapshot;

  if (shipmentCount > 0 && deliveredCount === shipmentCount) return 'delivered';
  if (deliveredCount > 0) return 'partially_delivered';
  if (shippedCount > 0) return 'shipped';
  if (manifestedCount > 0) return 'manifested';
  if (packedCount > 0 && packingCount === 0) return 'packed';
  if (packedCount > 0 || packingCount > 0) return 'partially_packed';
  if (liveAllocationCount > 0) return 'allocated';
  return 'confirmed';
}
