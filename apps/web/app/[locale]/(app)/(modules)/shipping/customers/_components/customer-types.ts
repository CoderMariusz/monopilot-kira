/**
 * Wave-shipping — client-side type mirrors of the reviewed customer actions.
 *
 * The Server Actions in ../_actions/customer-actions.ts ('use server') can only
 * export async functions, so they cannot re-export these structural types. We
 * mirror the exact shapes they return (Customer / CustomerResult) here so the
 * presentational components stay type-checked against the real action contract
 * without importing runtime code into the client bundle.
 *
 * Columns come from the real public.customers master (mig 211 / 288): customer_code,
 * name, email, phone, tax_id, category (retail/wholesale/distributor),
 * credit_limit_gbp, is_active, deleted_at + audit columns.
 */

export type CustomerCategory = 'retail' | 'wholesale' | 'distributor';

export type CustomerError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'persistence_failed';

export type Customer = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  category: CustomerCategory;
  creditLimitGbp: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerResult<T> = { ok: true; data: T } | { ok: false; error: CustomerError; message?: string };

export type ListCustomersResult = CustomerResult<Customer[]>;
export type CreateCustomerResult = CustomerResult<Customer>;

/** The exact create payload the modal builds and the action validates (zod). */
export type CreateCustomerInput = {
  code?: string;
  name: string;
  category: CustomerCategory;
  email?: string;
  phone?: string;
  taxId?: string;
  creditLimitGbp?: string;
  isActive: boolean;
};
