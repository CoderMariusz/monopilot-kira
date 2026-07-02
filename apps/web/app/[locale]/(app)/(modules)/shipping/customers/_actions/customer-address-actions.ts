'use server';

/**
 * Wave-shipping — Customer address CRUD Server Actions.
 *
 * RBAC: ship.so.create (packages/db/migrations/212-shipping-outbox-and-rbac-seed.sql:199)
 * Tables: public.customer_addresses (mig 211) — soft-deactivate via deleted_at.
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  ADDRESS_SELECT,
  CustomerAddressIdInput,
  CustomerAddressInput,
  CustomerAddressUpdateInput,
  SetDefaultShippingAddressInput,
  SHIP_CUSTOMER_WRITE,
  type CustomerAddress,
  type CustomerResult,
  mapCustomerAddress,
  pgErrorToResult,
} from './customer-action-schemas';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

class CustomerAddressAbort extends Error {
  constructor(readonly result: Extract<CustomerResult<unknown>, { ok: false }>) {
    super(result.error);
    this.name = 'CustomerAddressAbort';
  }
}

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

async function writeAddressAudit(
  ctx: OrgActionContext,
  input: { action: string; resourceId: string; customerId: string; afterState: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'customer_address', $4,
        jsonb_build_object('customer_id', $7::text), $5::jsonb, $6::uuid, 'operational')`,
    [
      ctx.orgId,
      ctx.userId,
      input.action,
      input.resourceId,
      JSON.stringify(input.afterState),
      randomUUID(),
      input.customerId,
    ],
  );
}

function revalidateCustomerRoutes(customerId: string): void {
  revalidateLocalized('/shipping');
  revalidateLocalized('/shipping/customers');
  revalidateLocalized(`/shipping/customers/${customerId}`);
}

async function assertCustomerExists(ctx: OrgActionContext, customerId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.customers
      where id = $1::uuid
        and org_id = app.current_org_id()
        and deleted_at is null
      limit 1`,
    [customerId],
  );
  return rows.length > 0;
}

async function clearDefaultForType(
  ctx: OrgActionContext,
  customerId: string,
  addressType: string,
  exceptAddressId?: string,
): Promise<void> {
  if (exceptAddressId) {
    await ctx.client.query(
      `update public.customer_addresses
          set is_default = false,
              updated_by = $4::uuid
        where org_id = app.current_org_id()
          and customer_id = $1::uuid
          and address_type = $2
          and deleted_at is null
          and id <> $3::uuid`,
      [customerId, addressType, exceptAddressId, ctx.userId],
    );
  } else {
    await ctx.client.query(
      `update public.customer_addresses
          set is_default = false,
              updated_by = $3::uuid
        where org_id = app.current_org_id()
          and customer_id = $1::uuid
          and address_type = $2
          and deleted_at is null`,
      [customerId, addressType, ctx.userId],
    );
  }
}

export async function createCustomerAddress(rawInput: unknown): Promise<CustomerResult<CustomerAddress>> {
  const parsed = CustomerAddressInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };
      if (!(await assertCustomerExists(ctx, input.customerId))) return { ok: false, error: 'not_found' };

      try {
        if (input.isDefault) {
          await clearDefaultForType(ctx, input.customerId, input.addressType);
        }

        const { rows } = await ctx.client.query<Parameters<typeof mapCustomerAddress>[0]>(
          `insert into public.customer_addresses
             (org_id, customer_id, address_type, is_default, address_line1, address_line2,
              city, state, postal_code, country_iso2, notes, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $11::uuid)
           returning ${ADDRESS_SELECT}`,
          [
            input.customerId,
            input.addressType,
            input.isDefault,
            input.addressLine1,
            input.addressLine2 ?? null,
            input.city,
            input.state ?? null,
            input.postalCode,
            input.countryIso2,
            input.notes ?? null,
            userId,
          ],
        );
        const row = rows[0];
        if (!row) throw new CustomerAddressAbort({ ok: false, error: 'persistence_failed' });

        await writeAddressAudit(ctx, {
          action: 'ship.customer_address.created',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: { address_type: row.address_type, is_default: row.is_default },
        });

        revalidateCustomerRoutes(input.customerId);
        return { ok: true, data: mapCustomerAddress(row) };
      } catch (err) {
        if (err instanceof CustomerAddressAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] createCustomerAddress failed', err);
    return { ok: false, error };
  }
}

export async function updateCustomerAddress(rawInput: unknown): Promise<CustomerResult<CustomerAddress>> {
  const parsed = CustomerAddressUpdateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };
      if (!(await assertCustomerExists(ctx, input.customerId))) return { ok: false, error: 'not_found' };

      try {
        if (input.isDefault) {
          await clearDefaultForType(ctx, input.customerId, input.addressType, input.addressId);
        }

        const { rows } = await ctx.client.query<Parameters<typeof mapCustomerAddress>[0]>(
          `update public.customer_addresses
              set address_type = $3,
                  is_default = $4,
                  address_line1 = $5,
                  address_line2 = $6,
                  city = $7,
                  state = $8,
                  postal_code = $9,
                  country_iso2 = $10,
                  notes = $11,
                  updated_by = $12::uuid
            where id = $2::uuid
              and customer_id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
          returning ${ADDRESS_SELECT}`,
          [
            input.customerId,
            input.addressId,
            input.addressType,
            input.isDefault,
            input.addressLine1,
            input.addressLine2 ?? null,
            input.city,
            input.state ?? null,
            input.postalCode,
            input.countryIso2,
            input.notes ?? null,
            userId,
          ],
        );
        const row = rows[0];
        if (!row) throw new CustomerAddressAbort({ ok: false, error: 'not_found' });

        await writeAddressAudit(ctx, {
          action: 'ship.customer_address.updated',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: { address_type: row.address_type, is_default: row.is_default },
        });

        revalidateCustomerRoutes(input.customerId);
        return { ok: true, data: mapCustomerAddress(row) };
      } catch (err) {
        if (err instanceof CustomerAddressAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] updateCustomerAddress failed', err);
    return { ok: false, error };
  }
}

export async function deactivateCustomerAddress(rawInput: unknown): Promise<CustomerResult<{ id: string }>> {
  const parsed = CustomerAddressIdInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      // F3: refuse to deactivate an address referenced by live documents.
      // SO terminal statuses: 'delivered', 'cancelled'.  Shipment terminal: 'delivered'.
      const { rows: refRows } = await ctx.client.query<{ ref_count: string }>(
        `select (
           (select count(*) from public.sales_orders
             where shipping_address_id = $1::uuid
               and org_id = app.current_org_id()
               and status not in ('delivered', 'cancelled')
               and deleted_at is null)
           +
           (select count(*) from public.shipments
             where shipping_address_id = $1::uuid
               and org_id = app.current_org_id()
               and status not in ('delivered')
               and deleted_at is null)
         )::text as ref_count`,
        [input.addressId],
      );
      const refCount = Number(refRows[0]?.ref_count ?? '0');
      if (refCount > 0) {
        return { ok: false, error: 'address_in_use', message: `address referenced by ${refCount} live document(s)` };
      }

      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.customer_addresses
            set deleted_at = now(),
                is_default = false,
                updated_by = $3::uuid
          where id = $2::uuid
            and customer_id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
        returning id::text`,
        [input.customerId, input.addressId, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await writeAddressAudit(ctx, {
        action: 'ship.customer_address.deactivated',
        resourceId: row.id,
        customerId: input.customerId,
        afterState: { deleted: true },
      });

      revalidateCustomerRoutes(input.customerId);
      return { ok: true, data: { id: row.id } };
    });
  } catch (err) {
    console.error('[shipping/customers] deactivateCustomerAddress failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function setDefaultShippingAddress(rawInput: unknown): Promise<CustomerResult<CustomerAddress>> {
  const parsed = SetDefaultShippingAddressInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows: existing } = await ctx.client.query<{ address_type: string }>(
        `select address_type
           from public.customer_addresses
          where id = $2::uuid
            and customer_id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [input.customerId, input.addressId],
      );
      if (existing.length === 0) return { ok: false, error: 'not_found' };
      if (existing[0]!.address_type !== 'shipping') return { ok: false, error: 'invalid_input' };

      try {
        await clearDefaultForType(ctx, input.customerId, 'shipping', input.addressId);

        const { rows } = await ctx.client.query<Parameters<typeof mapCustomerAddress>[0]>(
          `update public.customer_addresses
              set is_default = true,
                  updated_by = $3::uuid
            where id = $2::uuid
              and customer_id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
          returning ${ADDRESS_SELECT}`,
          [input.customerId, input.addressId, userId],
        );
        const row = rows[0];
        if (!row) throw new CustomerAddressAbort({ ok: false, error: 'not_found' });

        await writeAddressAudit(ctx, {
          action: 'ship.customer_address.default_set',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: { is_default: true },
        });

        revalidateCustomerRoutes(input.customerId);
        return { ok: true, data: mapCustomerAddress(row) };
      } catch (err) {
        if (err instanceof CustomerAddressAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] setDefaultShippingAddress failed', err);
    return { ok: false, error };
  }
}
