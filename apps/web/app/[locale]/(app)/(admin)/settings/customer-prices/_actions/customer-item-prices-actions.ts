'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import type {
  CustomerPriceFormOptions,
  CustomerPriceMutationResult,
  CustomerPriceRow,
  ListCustomerItemPricesResult,
  LoadCustomerPriceFormOptionsResult,
} from './customer-item-prices-types';

const SETTINGS_READ_PERMISSION = 'settings.org.read';
const SETTINGS_WRITE_PERMISSION = 'settings.org.update';
const CUSTOMER_PRICES_ROUTE = '/settings/customer-prices';
const ALLOWED_CURRENCIES = ['GBP', 'USD', 'EUR', 'PLN'] as const;

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type CustomerPriceDbRow = {
  id: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  unit_price: string | number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
};

type OptionDbRow = {
  id: string;
  code: string | null;
  name: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// NUMERIC(12,4): max 8 integer digits, max 4 fractional digits — string only.
const NUMERIC_12_4_RE = /^\d{1,8}(\.\d{1,4})?$/;
const UuidInput = z.string().trim().regex(UUID_RE);

function isValidIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const DateInput = z
  .string()
  .trim()
  .regex(DATE_RE)
  .refine(isValidIsoDate, { message: 'must be a valid calendar date' });

// NUMERIC-exact: unit_price is accepted only as a decimal STRING, bound ::numeric.
const UnitPriceInput = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'unit_price must be a non-negative decimal string')
  .refine((value) => NUMERIC_12_4_RE.test(value), {
    message: 'unit_price exceeds numeric(12,4) bounds',
  });

const CustomerItemPriceBodyInput = z
  .object({
    customerId: UuidInput,
    itemId: UuidInput,
    unitPrice: UnitPriceInput,
    currency: z.enum(ALLOWED_CURRENCIES),
    effectiveFrom: DateInput,
    effectiveTo: DateInput.nullable().optional(),
  })
  .strict();

function effectiveWindowRefine<T extends { effectiveFrom: string; effectiveTo?: string | null }>(
  input: T,
): boolean {
  return input.effectiveTo == null || input.effectiveTo >= input.effectiveFrom;
}

const CreateCustomerItemPriceInput = CustomerItemPriceBodyInput.refine(effectiveWindowRefine, {
  message: 'effective_to must be on or after effective_from',
});

const UpdateCustomerItemPriceInput = CustomerItemPriceBodyInput.extend({
  id: UuidInput,
}).refine(effectiveWindowRefine, {
  message: 'effective_to must be on or after effective_from',
});

const DeactivateCustomerItemPriceInput = z
  .object({
    id: UuidInput,
  })
  .strict();

function revalidateCustomerPricesRoute() {
  try {
    revalidateLocalized(CUSTOMER_PRICES_ROUTE);
  } catch {
    /* no request store in action unit tests */
  }
}

function toUnitPriceString(value: string | number): string {
  return typeof value === 'string' ? value : String(value);
}

function toCustomerPriceRow(row: CustomerPriceDbRow): CustomerPriceRow {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerCode: row.customer_code ?? '',
    customerName: row.customer_name ?? '',
    itemId: row.item_id,
    itemCode: row.item_code ?? '',
    itemName: row.item_name ?? '',
    unitPrice: toUnitPriceString(row.unit_price),
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

function toOption(row: OptionDbRow): { id: string; code: string; name: string } | null {
  const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim() : null;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : code;
  if (!code || !name) return null;
  return { id: row.id, code, name };
}

async function queryCustomerItemPrices(
  context: OrgContextLike,
  customerId: string | null,
): Promise<CustomerPriceRow[]> {
  const { rows } = await context.client.query<CustomerPriceDbRow>(
    `select cip.id::text,
            cip.customer_id::text,
            c.customer_code,
            c.name as customer_name,
            cip.item_id::text,
            i.sku as item_code,
            i.name as item_name,
            cip.unit_price::text,
            cip.currency,
            to_char(cip.effective_from, 'YYYY-MM-DD') as effective_from,
            to_char(cip.effective_to, 'YYYY-MM-DD') as effective_to
       from public.customer_item_prices cip
       join public.customers c
         on c.id = cip.customer_id
        and c.org_id = app.current_org_id()
       join public.items i
         on i.id = cip.item_id
        and i.org_id = app.current_org_id()
      where cip.org_id = app.current_org_id()
        and cip.deleted_at is null
        and ($1::uuid is null or cip.customer_id = $1::uuid)
      order by c.customer_code asc, i.sku asc, cip.effective_from desc`,
    [customerId],
  );
  return rows.map(toCustomerPriceRow);
}

async function queryFormOptions(context: OrgContextLike): Promise<CustomerPriceFormOptions> {
  const [customersResult, itemsResult] = await Promise.all([
    context.client.query<OptionDbRow>(
      `select c.id::text,
              c.customer_code as code,
              c.name
         from public.customers c
        where c.org_id = app.current_org_id()
          and c.deleted_at is null
          and c.is_active = true
        order by c.customer_code asc, c.name asc
        limit 500`,
    ),
    context.client.query<OptionDbRow>(
      `select i.id::text,
              i.sku as code,
              i.name
         from public.items i
        where i.org_id = app.current_org_id()
          and i.deleted_at is null
          and i.item_type = 'fg'
        order by i.sku asc, i.name asc
        limit 500`,
    ),
  ]);

  return {
    customers: customersResult.rows.map(toOption).filter((row): row is NonNullable<typeof row> => row !== null),
    items: itemsResult.rows.map(toOption).filter((row): row is NonNullable<typeof row> => row !== null),
  };
}

async function assertCustomerAndItemInOrg(
  context: OrgContextLike,
  customerId: string,
  itemId: string,
): Promise<boolean> {
  const { rows } = await context.client.query<{ ok: boolean }>(
    `select true as ok
       from public.customers c
       join public.items i
         on i.org_id = app.current_org_id()
        and i.id = $2::uuid
        and i.deleted_at is null
      where c.org_id = app.current_org_id()
        and c.id = $1::uuid
        and c.deleted_at is null
      limit 1`,
    [customerId, itemId],
  );
  return rows.length > 0;
}

export async function listCustomerItemPrices(
  customerId: string | null = null,
): Promise<ListCustomerItemPricesResult> {
  const parsedCustomerId =
    customerId == null || customerId.trim() === ''
      ? null
      : UuidInput.safeParse(customerId).success
        ? customerId
        : undefined;
  if (parsedCustomerId === undefined) {
    return { ok: false, error: 'persistence_failed' };
  }

  try {
    return await withOrgContext<ListCustomerItemPricesResult>(async (ctx): Promise<ListCustomerItemPricesResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, SETTINGS_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }
      const prices = await queryCustomerItemPrices(context, parsedCustomerId);
      return { ok: true, prices };
    });
  } catch (error) {
    console.error('[settings/customer-prices] list_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function loadCustomerPriceFormOptions(): Promise<LoadCustomerPriceFormOptionsResult> {
  try {
    return await withOrgContext<LoadCustomerPriceFormOptionsResult>(async (ctx): Promise<LoadCustomerPriceFormOptionsResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, SETTINGS_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }
      const options = await queryFormOptions(context);
      return { ok: true, options };
    });
  } catch (error) {
    console.error('[settings/customer-prices] options_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createCustomerItemPrice(rawInput: unknown): Promise<CustomerPriceMutationResult> {
  const parsed = CreateCustomerItemPriceInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<CustomerPriceMutationResult>(async (ctx): Promise<CustomerPriceMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, SETTINGS_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }
      if (!(await assertCustomerAndItemInOrg(context, parsed.data.customerId, parsed.data.itemId))) {
        return { ok: false, error: 'invalid_input' };
      }

      const { rows } = await context.client.query<{ id: string }>(
        `insert into public.customer_item_prices
           (org_id, customer_id, item_id, unit_price, currency, effective_from, effective_to, created_by, updated_by)
         values (
           app.current_org_id(),
           $1::uuid,
           $2::uuid,
           $3::numeric,
           $4,
           $5::date,
           $6::date,
           $7::uuid,
           $7::uuid
         )
         returning id::text as id`,
        [
          parsed.data.customerId,
          parsed.data.itemId,
          parsed.data.unitPrice,
          parsed.data.currency,
          parsed.data.effectiveFrom,
          parsed.data.effectiveTo ?? null,
          context.userId,
        ],
      );
      const id = rows[0]?.id;
      if (!id) return { ok: false, error: 'persistence_failed' };
      revalidateCustomerPricesRoute();
      return { ok: true, id };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('customer_item_prices_org_customer_item_eff_uq')) {
      return { ok: false, error: 'conflict' };
    }
    console.error('[settings/customer-prices] create_failed', { message });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateCustomerItemPrice(rawInput: unknown): Promise<CustomerPriceMutationResult> {
  const parsed = UpdateCustomerItemPriceInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<CustomerPriceMutationResult>(async (ctx): Promise<CustomerPriceMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, SETTINGS_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }
      if (!(await assertCustomerAndItemInOrg(context, parsed.data.customerId, parsed.data.itemId))) {
        return { ok: false, error: 'invalid_input' };
      }

      const { rows } = await context.client.query<{ id: string }>(
        `update public.customer_item_prices cip
            set customer_id = $2::uuid,
                item_id = $3::uuid,
                unit_price = $4::numeric,
                currency = $5,
                effective_from = $6::date,
                effective_to = $7::date,
                updated_by = $8::uuid,
                updated_at = now()
          where cip.id = $1::uuid
            and cip.org_id = app.current_org_id()
            and cip.deleted_at is null
          returning cip.id::text as id`,
        [
          parsed.data.id,
          parsed.data.customerId,
          parsed.data.itemId,
          parsed.data.unitPrice,
          parsed.data.currency,
          parsed.data.effectiveFrom,
          parsed.data.effectiveTo ?? null,
          context.userId,
        ],
      );
      const id = rows[0]?.id;
      if (!id) return { ok: false, error: 'not_found' };
      revalidateCustomerPricesRoute();
      return { ok: true, id };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('customer_item_prices_org_customer_item_eff_uq')) {
      return { ok: false, error: 'conflict' };
    }
    console.error('[settings/customer-prices] update_failed', { message });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deactivateCustomerItemPrice(rawInput: unknown): Promise<CustomerPriceMutationResult> {
  const parsed = DeactivateCustomerItemPriceInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<CustomerPriceMutationResult>(async (ctx): Promise<CustomerPriceMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, SETTINGS_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await context.client.query<{ id: string }>(
        `update public.customer_item_prices
            set deleted_at = now(),
                updated_by = $2::uuid,
                updated_at = now()
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
          returning id::text as id`,
        [parsed.data.id, context.userId],
      );
      const id = rows[0]?.id;
      if (!id) return { ok: false, error: 'not_found' };
      revalidateCustomerPricesRoute();
      return { ok: true, id };
    });
  } catch (error) {
    console.error('[settings/customer-prices] deactivate_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}
