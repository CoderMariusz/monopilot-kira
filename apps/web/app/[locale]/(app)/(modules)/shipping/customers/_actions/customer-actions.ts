'use server';

/**
 * Wave-shipping — Customer master CRUD Server Actions.
 *
 * Contract:
 *   - org-scoped: every statement filters org_id = app.current_org_id() (RLS, mig
 *     211 customers_org_context policy); no service-role bypass, no mocks.
 *   - RBAC: ship.so.create (seeded packages/db/migrations/212-shipping-outbox-and-rbac-seed.sql:199)
 *   - validation: zod schemas in customer-action-schemas.ts
 *   - audit: writes public.audit_events rows for mutations
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  CUSTOMER_SELECT,
  CustomerActiveInput,
  CustomerCreateInput,
  CustomerUpdateInput,
  SHIP_CUSTOMER_WRITE,
  ADDRESS_SELECT,
  ALLERGEN_RESTRICTION_SELECT,
  CONTACT_SELECT,
  type Customer,
  type CustomerDetail,
  type CustomerResult,
  mapCustomer,
  mapCustomerAddress,
  mapCustomerAllergenRestriction,
  mapCustomerContact,
  pgErrorToResult,
} from './customer-action-schemas';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

async function hasCustomerWritePermission(ctx: OrgActionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, SHIP_CUSTOMER_WRITE],
  );
  return rows.length > 0;
}

async function writeCustomerAudit(
  ctx: OrgActionContext,
  input: { action: string; resourceId: string; afterState: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'customer', $4,
        null, $5::jsonb, $6::uuid, 'operational')`,
    [ctx.orgId, ctx.userId, input.action, input.resourceId, JSON.stringify(input.afterState), randomUUID()],
  );
}

async function nextCustomerCode(ctx: OrgActionContext): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `CUST-${year}-`;
  const { rows } = await ctx.client.query<{ max_seq: number | null }>(
    `select max((substring(customer_code from '^CUST-[0-9]{4}-([0-9]+)$'))::int) as max_seq
       from public.customers
      where org_id = app.current_org_id()
        and customer_code like $1`,
    [`${prefix}%`],
  );
  const next = (rows[0]?.max_seq ?? 0) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

async function loadCustomerById(
  client: QueryClient,
  customerId: string,
): Promise<Customer | null> {
  const { rows } = await client.query<Parameters<typeof mapCustomer>[0]>(
    `select ${CUSTOMER_SELECT},
            (select count(*)::int
               from public.customer_addresses ca
              where ca.customer_id = c.id
                and ca.org_id = app.current_org_id()
                and ca.deleted_at is null) as address_count
       from public.customers c
      where c.id = $1::uuid
        and c.org_id = app.current_org_id()
        and c.deleted_at is null
      limit 1`,
    [customerId],
  );
  const row = rows[0];
  return row ? mapCustomer(row) : null;
}

function revalidateCustomerRoutes(customerId?: string): void {
  revalidateLocalized('/shipping');
  revalidateLocalized('/shipping/customers');
  if (customerId) revalidateLocalized(`/shipping/customers/${customerId}`);
}

export async function listCustomers(params: unknown = {}): Promise<CustomerResult<Customer[]>> {
  const input = (params ?? {}) as { q?: unknown; activeOnly?: unknown; limit?: unknown };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const activeOnly = input.activeOnly === true;
  const limit =
    typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 500) : 200;

  try {
    return await withOrgContext(async ({ client }): Promise<CustomerResult<Customer[]>> => {
      const { rows } = await (client as QueryClient).query<Parameters<typeof mapCustomer>[0]>(
        `select ${CUSTOMER_SELECT},
                (select count(*)::int
                   from public.customer_addresses ca
                  where ca.customer_id = c.id
                    and ca.org_id = app.current_org_id()
                    and ca.deleted_at is null) as address_count
           from public.customers c
          where c.org_id = app.current_org_id()
            and c.deleted_at is null
            and ($1::boolean is not true or c.is_active = true)
            and ($2::text is null or c.customer_code ilike '%' || $2 || '%' or c.name ilike '%' || $2 || '%' or c.email ilike '%' || $2 || '%')
          order by c.customer_code asc, c.name asc
          limit $3::integer`,
        [activeOnly, q, limit],
      );
      return { ok: true, data: rows.map(mapCustomer) };
    });
  } catch (err) {
    console.error('[shipping/customers] listCustomers failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getCustomer(customerId: unknown): Promise<CustomerResult<CustomerDetail>> {
  const id = typeof customerId === 'string' ? customerId.trim() : '';
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ client }): Promise<CustomerResult<CustomerDetail>> => {
      const customer = await loadCustomerById(client as QueryClient, id);
      if (!customer) return { ok: false, error: 'not_found' };

      const { rows } = await (client as QueryClient).query<Parameters<typeof mapCustomerAddress>[0]>(
        `select ${ADDRESS_SELECT}
           from public.customer_addresses
          where org_id = app.current_org_id()
            and customer_id = $1::uuid
            and deleted_at is null
          order by address_type asc, is_default desc, created_at asc`,
        [id],
      );

      const { rows: contactRows } = await (client as QueryClient).query<Parameters<typeof mapCustomerContact>[0]>(
        `select ${CONTACT_SELECT}
           from public.customer_contacts
          where org_id = app.current_org_id()
            and customer_id = $1::uuid
            and deleted_at is null
          order by is_primary desc, name asc, created_at asc`,
        [id],
      );

      const { rows: allergenRows } = await (client as QueryClient).query<
        Parameters<typeof mapCustomerAllergenRestriction>[0]
      >(
        `select ${ALLERGEN_RESTRICTION_SELECT}
           from public.customer_allergen_restrictions car
           left join public.reference_tables rt
             on rt.org_id = car.org_id
            and rt.table_code = 'reference.allergens_reference'
            and rt.is_active
            and (
              rt.row_data->>'id' = car.allergen_id::text
              or rt.row_key = car.allergen_id::text
            )
           left join "Reference"."Allergens" ra
             on ra.org_id = app.current_org_id()
            and ra.allergen_code = coalesce(nullif(trim(rt.row_data->>'allergen_code'), ''), rt.row_key)
          where car.org_id = app.current_org_id()
            and car.customer_id = $1::uuid
            and car.deleted_at is null
          order by allergen_name asc, car.created_at asc`,
        [id],
      );

      return {
        ok: true,
        id: customer.id,
        data: {
          ...customer,
          addresses: rows.map(mapCustomerAddress),
          contacts: contactRows.map(mapCustomerContact),
          allergenRestrictions: allergenRows.map(mapCustomerAllergenRestriction),
        },
      };
    });
  } catch (err) {
    console.error('[shipping/customers] getCustomer failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createCustomer(rawInput: unknown): Promise<CustomerResult<Customer>> {
  const parsed = CustomerCreateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CustomerResult<Customer>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const code = input.code ?? (await nextCustomerCode(ctx));

      const { rows } = await ctx.client.query<Parameters<typeof mapCustomer>[0]>(
        `insert into public.customers
           (org_id, customer_code, name, email, phone, tax_id, category, credit_limit_gbp, is_active, created_by, updated_by)
         values
           (app.current_org_id(), $1, $2, $3, $4, $5, $6, $7::numeric, $8, $9::uuid, $9::uuid)
         returning ${CUSTOMER_SELECT}`,
        [
          code,
          input.name,
          input.email ?? null,
          input.phone ?? null,
          input.taxId ?? null,
          input.category,
          input.creditLimitGbp ?? null,
          input.isActive,
          userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeCustomerAudit(ctx, {
        action: 'ship.customer.created',
        resourceId: row.id,
        afterState: { code: row.customer_code, name: row.name, category: row.category, is_active: row.is_active },
      });

      revalidateCustomerRoutes();
      return { ok: true, id: row.id, data: mapCustomer({ ...row, address_count: 0 }) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] createCustomer failed', err);
    return { ok: false, error };
  }
}

export async function updateCustomer(rawInput: unknown): Promise<CustomerResult<Customer>> {
  const parsed = CustomerUpdateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CustomerResult<Customer>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapCustomer>[0]>(
        `update public.customers
            set customer_code = $2,
                name = $3,
                email = $4,
                phone = $5,
                tax_id = $6,
                category = $7,
                credit_limit_gbp = $8::numeric,
                is_active = $9,
                updated_by = $10::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
        returning ${CUSTOMER_SELECT}`,
        [
          input.customerId,
          input.code,
          input.name,
          input.email ?? null,
          input.phone ?? null,
          input.taxId ?? null,
          input.category,
          input.creditLimitGbp ?? null,
          input.isActive,
          userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await writeCustomerAudit(ctx, {
        action: 'ship.customer.updated',
        resourceId: row.id,
        afterState: { code: row.customer_code, name: row.name, is_active: row.is_active },
      });

      revalidateCustomerRoutes(input.customerId);
      const customer = await loadCustomerById(ctx.client, input.customerId);
      return { ok: true, id: row.id, data: customer ?? mapCustomer(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] updateCustomer failed', err);
    return { ok: false, error };
  }
}

export async function setCustomerActive(rawInput: unknown): Promise<CustomerResult<Customer>> {
  const parsed = CustomerActiveInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CustomerResult<Customer>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapCustomer>[0]>(
        `update public.customers
            set is_active = $2,
                updated_by = $3::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
        returning ${CUSTOMER_SELECT}`,
        [input.customerId, input.isActive, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await writeCustomerAudit(ctx, {
        action: input.isActive ? 'ship.customer.reactivated' : 'ship.customer.deactivated',
        resourceId: row.id,
        afterState: { is_active: row.is_active },
      });

      revalidateCustomerRoutes(input.customerId);
      const customer = await loadCustomerById(ctx.client, input.customerId);
      return { ok: true, id: row.id, data: customer ?? mapCustomer(row) };
    });
  } catch (err) {
    console.error('[shipping/customers] setCustomerActive failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
