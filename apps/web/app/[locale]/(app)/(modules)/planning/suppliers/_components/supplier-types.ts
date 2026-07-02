/**
 * P2-PLANNING — client-side type mirrors of the reviewed supplier actions.
 *
 * The Server Actions in ../_actions/actions.ts ('use server') can only export
 * async functions, so they cannot re-export these structural types. We mirror the
 * exact shapes they return (Supplier / SupplierResult) here so the presentational
 * components stay type-checked against the real action contract without importing
 * runtime code into the client bundle.
 */

export type SupplierStatus = 'active' | 'inactive' | 'blocked';

export type SupplierError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'invalid_state'
  // mirrors planning ProcurementError (W9-K-II added insufficient_stock for TO
  // ship validation; W9-RF5 added partially_received for TO cancel refusal;
  // E7 added insufficient_stock_holds for shortfalls caused by held LPs);
  // supplier flows never return these but the seam types must stay aligned.
  | 'insufficient_stock'
  | 'insufficient_stock_holds'
  | 'partially_received'
  | 'persistence_failed';

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact: Record<string, unknown>;
  currency: string;
  leadTimeDays: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierResult<T> = { ok: true; data: T } | { ok: false; error: SupplierError; message?: string };

export type ListSuppliersResult = SupplierResult<Supplier[]>;
export type CreateSupplierResult = SupplierResult<Supplier>;
export type UpdateSupplierResult = SupplierResult<Supplier>;
export type TransitionSupplierResult = SupplierResult<Supplier>;

/** Best-effort read of the optional contact jsonb fields the create modal writes. */
export function contactField(contact: Record<string, unknown>, key: 'email' | 'phone' | 'country' | 'paymentTerms'): string | null {
  const v = contact?.[key];
  return typeof v === 'string' && v.trim() ? v : null;
}
