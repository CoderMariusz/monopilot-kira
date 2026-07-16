/**
 * Shared types/schemas for RMA Server Actions.
 * NOT a 'use server' module.
 */
import { z } from 'zod';

export type RmaError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'persistence_failed';

export type RmaStatus = 'pending' | 'approved' | 'receiving' | 'received' | 'processed' | 'closed';
export type RmaDisposition = 'restock' | 'scrap' | 'quality_hold';

export type RmaLineSummary = {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  quantityExpected: string;
  quantityReceived: string;
  lotNumber: string | null;
  reasonNotes: string | null;
  disposition: RmaDisposition | null;
};

export type RmaListItem = {
  id: string;
  rmaNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  shipmentId: string | null;
  reasonCode: string;
  reasonLabel: string | null;
  status: RmaStatus;
  lineCount: number;
  totalValueGbp: string | null;
  disposition: RmaDisposition | null;
  createdAt: string;
};

export type RmaDetail = RmaListItem & {
  notes: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  processedAt: string | null;
  closedAt: string | null;
  lines: RmaLineSummary[];
};

export type RmaResult<T> =
  | ({ ok: true; data: T } & (T extends { id: string } ? { id: string } : object))
  | { ok: false; error: RmaError; message?: string };

export const RmaLineInput = z.object({
  productId: z.string().uuid(),
  quantityExpected: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,3})?$/),
  lotNumber: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(120).optional(),
  ),
  reasonNotes: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
});

export const CreateRmaInput = z.object({
  customerId: z.string().uuid(),
  salesOrderId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().uuid().optional(),
  ),
  shipmentId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().uuid().optional(),
  ),
  reasonCode: z.string().trim().min(1).max(64),
  notes: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
  lines: z.array(RmaLineInput).min(1),
});

export const RmaIdInput = z.object({
  rmaId: z.string().uuid(),
});

export const ReceiveRmaInput = z.object({
  rmaId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        quantityReceived: z
          .string()
          .trim()
          .regex(/^\d+(?:\.\d{1,3})?$/),
      }),
    )
    .min(1),
});

export const ProcessRmaInput = z.object({
  rmaId: z.string().uuid(),
  disposition: z.enum(['restock', 'scrap', 'quality_hold']),
});

export const SHIP_RMA_WRITE = 'ship.so.create';
export const SHIP_RMA_APPROVE = 'ship.so.confirm';
export const SHIP_RMA_DISPOSITION = 'ship.rma.disposition';

export const RMA_SELECT =
  `r.id::text,
   r.rma_number,
   r.customer_id::text,
   c.name as customer_name,
   c.customer_code,
   r.sales_order_id::text,
   so.order_number as sales_order_number,
   r.shipment_id::text,
   r.reason_code,
   rc.label_en as reason_label,
   r.status,
   r.total_value_gbp::text as total_value_gbp,
   r.disposition,
   r.notes,
   r.approved_at,
   r.received_at,
   r.processed_at,
   r.closed_at,
   r.created_at,
   (select count(*)::int from public.rma_lines rl
     where rl.rma_request_id = r.id
       and rl.org_id = app.current_org_id()
       and rl.deleted_at is null) as line_count`;

export const RMA_LINE_SELECT =
  `rl.id::text,
   rl.product_id::text,
   i.item_code as product_code,
   i.name as product_name,
   rl.quantity_expected::text as quantity_expected,
   rl.quantity_received::text as quantity_received,
   rl.lot_number,
   rl.reason_notes,
   rl.disposition`;
