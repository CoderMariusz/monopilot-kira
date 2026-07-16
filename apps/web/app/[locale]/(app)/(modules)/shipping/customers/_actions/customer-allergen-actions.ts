'use server';

/**
 * Wave-shipping — Customer allergen restriction CRUD Server Actions.
 *
 * RBAC: ship.so.create (same gate as customer master writes).
 * Tables: public.customer_allergen_restrictions (mig 211).
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  ALLERGEN_RESTRICTION_SELECT,
  CustomerAllergenRestrictionIdInput,
  CustomerAllergenRestrictionInput,
  CustomerAllergenRestrictionUpdateInput,
  SHIP_CUSTOMER_WRITE,
  type AllergenReferenceOption,
  type CustomerAllergenRestriction,
  type CustomerResult,
  mapCustomerAllergenRestriction,
  pgErrorToResult,
} from './customer-action-schemas';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

class CustomerAllergenAbort extends Error {
  constructor(readonly result: Extract<CustomerResult<unknown>, { ok: false }>) {
    super(result.error);
    this.name = 'CustomerAllergenAbort';
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

async function writeAllergenAudit(
  ctx: OrgActionContext,
  input: { action: string; resourceId: string; customerId: string; afterState: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'customer_allergen_restriction', $4,
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

async function assertAllergenReferenceExists(ctx: OrgActionContext, allergenId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.reference_tables rt
      where rt.org_id = app.current_org_id()
        and rt.table_code = 'reference.allergens_reference'
        and rt.is_active
        and rt.deleted_at is null
        and (
          rt.row_data->>'id' = $1::text
          or rt.row_key = $1::text
        )
      limit 1`,
    [allergenId],
  );
  return rows.length > 0;
}

async function loadRestrictionById(
  ctx: OrgActionContext,
  customerId: string,
  restrictionId: string,
): Promise<CustomerAllergenRestriction | null> {
  const { rows } = await ctx.client.query<Parameters<typeof mapCustomerAllergenRestriction>[0]>(
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
        and car.id = $2::uuid
        and car.deleted_at is null
      limit 1`,
    [customerId, restrictionId],
  );
  const row = rows[0];
  return row ? mapCustomerAllergenRestriction(row) : null;
}

export async function listAllergenReferenceOptions(): Promise<CustomerResult<AllergenReferenceOption[]>> {
  try {
    return await withOrgContext(async ({ client }): Promise<CustomerResult<AllergenReferenceOption[]>> => {
      const { rows } = await (client as QueryClient).query<{ id: string; name: string }>(
        `select coalesce(nullif(trim(rt.row_data->>'id'), ''), rt.row_key)::text as id,
                coalesce(
                  nullif(trim(rt.row_data->>'display_name'), ''),
                  nullif(trim(rt.row_data->>'allergen_code'), ''),
                  rt.row_key
                ) as name
           from public.reference_tables rt
          where rt.org_id = app.current_org_id()
            and rt.table_code = 'reference.allergens_reference'
            and rt.is_active
            and rt.deleted_at is null
          order by name asc`,
      );
      return { ok: true, data: rows.map((row) => ({ id: row.id, name: row.name })) };
    });
  } catch (err) {
    console.error('[shipping/customers] listAllergenReferenceOptions failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createCustomerAllergenRestriction(
  rawInput: unknown,
): Promise<CustomerResult<CustomerAllergenRestriction>> {
  const parsed = CustomerAllergenRestrictionInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };
      if (!(await assertCustomerExists(ctx, input.customerId))) return { ok: false, error: 'not_found' };
      if (!(await assertAllergenReferenceExists(ctx, input.allergenId))) {
        return { ok: false, error: 'invalid_input', message: 'Unknown allergen reference' };
      }

      try {
        const { rows } = await ctx.client.query<{ id: string }>(
          `insert into public.customer_allergen_restrictions
             (org_id, customer_id, allergen_id, restriction_type, notes, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, $5::uuid, $5::uuid)
           returning id::text`,
          [input.customerId, input.allergenId, input.restrictionType, input.notes ?? null, userId],
        );
        const row = rows[0];
        if (!row) throw new CustomerAllergenAbort({ ok: false, error: 'persistence_failed' });

        await writeAllergenAudit(ctx, {
          action: 'ship.customer.allergen_created',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: {
            allergen_id: input.allergenId,
            restriction_type: input.restrictionType,
          },
        });

        revalidateCustomerRoutes(input.customerId);
        const restriction = await loadRestrictionById(ctx, input.customerId, row.id);
        if (!restriction) throw new CustomerAllergenAbort({ ok: false, error: 'persistence_failed' });
        return { ok: true, data: restriction };
      } catch (err) {
        if (err instanceof CustomerAllergenAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] createCustomerAllergenRestriction failed', err);
    return { ok: false, error };
  }
}

export async function updateCustomerAllergenRestriction(
  rawInput: unknown,
): Promise<CustomerResult<CustomerAllergenRestriction>> {
  const parsed = CustomerAllergenRestrictionUpdateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };
      if (!(await assertCustomerExists(ctx, input.customerId))) return { ok: false, error: 'not_found' };
      if (!(await assertAllergenReferenceExists(ctx, input.allergenId))) {
        return { ok: false, error: 'invalid_input', message: 'Unknown allergen reference' };
      }

      try {
        const { rows } = await ctx.client.query<{ id: string }>(
          `update public.customer_allergen_restrictions
              set allergen_id = $3::uuid,
                  restriction_type = $4,
                  notes = $5,
                  updated_by = $6::uuid,
                  updated_at = now()
            where id = $2::uuid
              and customer_id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
          returning id::text`,
          [
            input.customerId,
            input.restrictionId,
            input.allergenId,
            input.restrictionType,
            input.notes ?? null,
            userId,
          ],
        );
        const row = rows[0];
        if (!row) throw new CustomerAllergenAbort({ ok: false, error: 'not_found' });

        await writeAllergenAudit(ctx, {
          action: 'ship.customer.allergen_updated',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: {
            allergen_id: input.allergenId,
            restriction_type: input.restrictionType,
          },
        });

        revalidateCustomerRoutes(input.customerId);
        const restriction = await loadRestrictionById(ctx, input.customerId, row.id);
        if (!restriction) throw new CustomerAllergenAbort({ ok: false, error: 'persistence_failed' });
        return { ok: true, data: restriction };
      } catch (err) {
        if (err instanceof CustomerAllergenAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] updateCustomerAllergenRestriction failed', err);
    return { ok: false, error };
  }
}

export async function deleteCustomerAllergenRestriction(
  rawInput: unknown,
): Promise<CustomerResult<{ id: string }>> {
  const parsed = CustomerAllergenRestrictionIdInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.customer_allergen_restrictions
            set deleted_at = now(),
                updated_by = $3::uuid,
                updated_at = now()
          where id = $2::uuid
            and customer_id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
        returning id::text`,
        [input.customerId, input.restrictionId, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await writeAllergenAudit(ctx, {
        action: 'ship.customer.allergen_deleted',
        resourceId: row.id,
        customerId: input.customerId,
        afterState: { deleted: true },
      });

      revalidateCustomerRoutes(input.customerId);
      return { ok: true, data: { id: row.id } };
    });
  } catch (err) {
    console.error('[shipping/customers] deleteCustomerAllergenRestriction failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
