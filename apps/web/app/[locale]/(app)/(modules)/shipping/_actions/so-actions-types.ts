import type { PaginatedResult } from '../../../../../../lib/shared/pagination';
import type { SalesOrderStatus } from './so-transitions';

type TransitionTarget = SalesOrderStatus;
type AllocationStatus = 'unallocated' | 'partially_allocated' | 'allocated';

export type ForbiddenFailure = { ok: false; error: 'forbidden' };
export type InvalidInputFailure = { ok: false; error: 'invalid_input'; message?: string };
export type PersistenceFailure = { ok: false; error: 'persistence_failed'; message?: string };
export type ActionFailure = ForbiddenFailure | InvalidInputFailure | PersistenceFailure;
export type ActionResult<T, F extends { ok: false; error: string } = ForbiddenFailure> =
  | { ok: true; data: T }
  | F;

export type SalesOrderListRow = {
  id: string;
  so_number: string;
  customer_name: string | null;
  customer_code: string | null;
  status: SalesOrderStatus;
  line_count: number;
  total: string;
  created_at: string;
  expected_ship_date: string | null;
};

export type SalesOrderLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty: string;
  uom: string;
  allocated_qty: string;
  allocation_status: AllocationStatus;
};

export type SalesOrder = {
  id: string;
  so_number: string;
  status: SalesOrderStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
  expected_ship_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  allocation_status: AllocationStatus;
  lines: SalesOrderLine[];
};

export type IllegalTransitionError = {
  ok: false;
  error: 'ILLEGAL_TRANSITION';
  from: string;
  to: TransitionTarget;
};

export type InsufficientStockError = {
  ok: false;
  error: 'INSUFFICIENT_STOCK';
  item_id: string;
  needed: string;
  available: string;
};

export type NearExpiryAllocationWarning = {
  nearExpiry: true;
  reasonCode: 'allocated_lp_near_expiry';
  soonestExpiry: string;
  daysToExpiry: number;
  warnDays: number;
  affectedLpCount: number;
};

export type AllocateSalesOrderSuccess = {
  ok: true;
  data: SalesOrder | null;
  nearExpiryWarning?: NearExpiryAllocationWarning;
};

export type ListSalesOrdersResult = ActionResult<PaginatedResult<SalesOrderListRow>>;
export type GetSalesOrderResult = ActionResult<SalesOrder | null>;
export type CreateSalesOrderResult = ActionResult<SalesOrder | null, ActionFailure>;
