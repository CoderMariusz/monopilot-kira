/**
 * Shared zod schemas + row mappers for customer master Server Actions.
 * NOT a 'use server' module — types/schemas may be imported by tests and actions.
 */
import { z } from 'zod';

export type CustomerError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'address_in_use'
  | 'persistence_failed';

export type CustomerCategory = 'retail' | 'wholesale' | 'distributor';
export type CustomerAddressType = 'billing' | 'shipping';

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
  addressCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddress = {
  id: string;
  customerId: string;
  addressType: CustomerAddressType;
  isDefault: boolean;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  countryIso2: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDetail = Customer & {
  addresses: CustomerAddress[];
};

export type CustomerResult<T> =
  | ({ ok: true; data: T } & (T extends Customer ? { id: string } : object))
  | { ok: false; error: CustomerError; message?: string };

export const CustomerCreateInput = z.object({
  code: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(1).max(80).optional(),
  ),
  name: z.string().trim().min(2).max(255),
  category: z.enum(['retail', 'wholesale', 'distributor']).default('retail'),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(64).optional(),
  taxId: z.string().trim().max(64).optional(),
  creditLimitGbp: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .optional(),
  isActive: z.boolean().default(true),
});

export const CustomerUpdateInput = z.object({
  customerId: z.string().uuid(),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(255),
  category: z.enum(['retail', 'wholesale', 'distributor']),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().email().max(255).optional(),
  ),
  phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(64).optional(),
  ),
  taxId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(64).optional(),
  ),
  creditLimitGbp: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d{1,2})?$/)
      .optional(),
  ),
  isActive: z.boolean(),
});

export const CustomerActiveInput = z.object({
  customerId: z.string().uuid(),
  isActive: z.boolean(),
});

export const CustomerAddressInput = z.object({
  customerId: z.string().uuid(),
  addressType: z.enum(['billing', 'shipping']),
  isDefault: z.boolean().default(false),
  addressLine1: z.string().trim().min(1).max(255),
  addressLine2: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(255).optional(),
  ),
  city: z.string().trim().min(1).max(120),
  state: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(120).optional(),
  ),
  postalCode: z.string().trim().min(1).max(32),
  countryIso2: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  notes: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
});

export const CustomerAddressUpdateInput = CustomerAddressInput.extend({
  addressId: z.string().uuid(),
});

export const CustomerAddressIdInput = z.object({
  customerId: z.string().uuid(),
  addressId: z.string().uuid(),
});

export const SetDefaultShippingAddressInput = z.object({
  customerId: z.string().uuid(),
  addressId: z.string().uuid(),
});

type CustomerRow = {
  id: string;
  customer_code: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  category: string | null;
  credit_limit_gbp: string | number | null;
  is_active: boolean;
  address_count?: number | string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CustomerAddressRow = {
  id: string;
  customer_id: string;
  address_type: string;
  is_default: boolean;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country_iso2: string;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapCustomer(row: CustomerRow): Customer {
  const category = (row.category ?? 'retail') as CustomerCategory;
  return {
    id: row.id,
    code: row.customer_code ?? '',
    name: row.name ?? '',
    email: row.email,
    phone: row.phone,
    taxId: row.tax_id,
    category,
    creditLimitGbp: row.credit_limit_gbp == null ? null : String(row.credit_limit_gbp),
    isActive: row.is_active,
    addressCount: Number(row.address_count ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapCustomerAddress(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customer_id,
    addressType: row.address_type as CustomerAddressType,
    isDefault: row.is_default,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    countryIso2: row.country_iso2,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export function pgErrorToResult(err: unknown): CustomerError {
  if (isPgError(err) && err.code === '23505') return 'already_exists';
  if (isPgError(err) && err.code === '23514') return 'invalid_input';
  if (isPgError(err) && err.code === '23503') return 'not_found';
  return 'persistence_failed';
}

export const SHIP_CUSTOMER_WRITE = 'ship.so.create';

export const CUSTOMER_SELECT =
  `id::text, customer_code, name, email, phone, tax_id, category,
   credit_limit_gbp::text as credit_limit_gbp, is_active, created_at, updated_at`;

export const ADDRESS_SELECT =
  `id::text, customer_id::text, address_type, is_default,
   address_line1, address_line2, city, state, postal_code, country_iso2, notes,
   created_at, updated_at`;
