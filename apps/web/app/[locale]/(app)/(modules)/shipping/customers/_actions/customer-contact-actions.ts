'use server';

/**
 * Wave-shipping — Customer contact CRUD Server Actions.
 *
 * RBAC: ship.so.create. Tables: public.customer_contacts (migration 211).
 */

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  CONTACT_SELECT,
  CustomerContactIdInput,
  CustomerContactInput,
  CustomerContactUpdateInput,
  SetPrimaryCustomerContactInput,
  SHIP_CUSTOMER_WRITE,
  type CustomerContact,
  type CustomerResult,
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

class CustomerContactAbort extends Error {
  constructor(readonly result: Extract<CustomerResult<unknown>, { ok: false }>) {
    super(result.error);
    this.name = 'CustomerContactAbort';
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

async function writeContactAudit(
  ctx: OrgActionContext,
  input: { action: string; resourceId: string; customerId: string; afterState: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'customer_contact', $4,
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

async function clearPrimaryExcept(
  ctx: OrgActionContext,
  customerId: string,
  exceptContactId?: string,
): Promise<void> {
  if (exceptContactId) {
    await ctx.client.query(
      `update public.customer_contacts
          set is_primary = false,
              updated_by = $3::uuid
        where org_id = app.current_org_id()
          and customer_id = $1::uuid
          and deleted_at is null
          and id <> $2::uuid`,
      [customerId, exceptContactId, ctx.userId],
    );
  } else {
    await ctx.client.query(
      `update public.customer_contacts
          set is_primary = false,
              updated_by = $2::uuid
        where org_id = app.current_org_id()
          and customer_id = $1::uuid
          and deleted_at is null`,
      [customerId, ctx.userId],
    );
  }
}

export async function createCustomerContact(rawInput: unknown): Promise<CustomerResult<CustomerContact>> {
  const parsed = CustomerContactInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };
      if (!(await assertCustomerExists(ctx, input.customerId))) return { ok: false, error: 'not_found' };

      try {
        if (input.isPrimary) {
          await clearPrimaryExcept(ctx, input.customerId);
        }

        const { rows } = await ctx.client.query<Parameters<typeof mapCustomerContact>[0]>(
          `insert into public.customer_contacts
             (org_id, customer_id, name, title, email, phone, is_primary, created_by, updated_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $7::uuid)
           returning ${CONTACT_SELECT}`,
          [
            input.customerId,
            input.name,
            input.title ?? null,
            input.email ?? null,
            input.phone ?? null,
            input.isPrimary,
            userId,
          ],
        );
        const row = rows[0];
        if (!row) throw new CustomerContactAbort({ ok: false, error: 'persistence_failed' });

        await writeContactAudit(ctx, {
          action: 'ship.customer_contact.created',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: { name: row.name, is_primary: row.is_primary },
        });

        revalidateCustomerRoutes(input.customerId);
        return { ok: true, data: mapCustomerContact(row) };
      } catch (err) {
        if (err instanceof CustomerContactAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] createCustomerContact failed', err);
    return { ok: false, error };
  }
}

export async function updateCustomerContact(rawInput: unknown): Promise<CustomerResult<CustomerContact>> {
  const parsed = CustomerContactUpdateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };
      if (!(await assertCustomerExists(ctx, input.customerId))) return { ok: false, error: 'not_found' };

      try {
        if (input.isPrimary) {
          await clearPrimaryExcept(ctx, input.customerId, input.contactId);
        }

        const { rows } = await ctx.client.query<Parameters<typeof mapCustomerContact>[0]>(
          `update public.customer_contacts
              set name = $3,
                  title = $4,
                  email = $5,
                  phone = $6,
                  is_primary = $7,
                  updated_by = $8::uuid
            where id = $2::uuid
              and customer_id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
          returning ${CONTACT_SELECT}`,
          [
            input.customerId,
            input.contactId,
            input.name,
            input.title ?? null,
            input.email ?? null,
            input.phone ?? null,
            input.isPrimary,
            userId,
          ],
        );
        const row = rows[0];
        if (!row) throw new CustomerContactAbort({ ok: false, error: 'not_found' });

        await writeContactAudit(ctx, {
          action: 'ship.customer_contact.updated',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: { name: row.name, is_primary: row.is_primary },
        });

        revalidateCustomerRoutes(input.customerId);
        return { ok: true, data: mapCustomerContact(row) };
      } catch (err) {
        if (err instanceof CustomerContactAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] updateCustomerContact failed', err);
    return { ok: false, error };
  }
}

export async function deactivateCustomerContact(rawInput: unknown): Promise<CustomerResult<{ id: string }>> {
  const parsed = CustomerContactIdInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.customer_contacts
            set deleted_at = now(),
                is_primary = false,
                updated_by = $3::uuid
          where id = $2::uuid
            and customer_id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
        returning id::text`,
        [input.customerId, input.contactId, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await writeContactAudit(ctx, {
        action: 'ship.customer_contact.deactivated',
        resourceId: row.id,
        customerId: input.customerId,
        afterState: { deleted: true },
      });

      revalidateCustomerRoutes(input.customerId);
      return { ok: true, data: { id: row.id } };
    });
  } catch (err) {
    console.error('[shipping/customers] deactivateCustomerContact failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function setPrimaryCustomerContact(rawInput: unknown): Promise<CustomerResult<CustomerContact>> {
  const parsed = SetPrimaryCustomerContactInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasCustomerWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows: existing } = await ctx.client.query<{ id: string }>(
        `select id::text as id
           from public.customer_contacts
          where id = $2::uuid
            and customer_id = $1::uuid
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [input.customerId, input.contactId],
      );
      if (existing.length === 0) return { ok: false, error: 'not_found' };

      try {
        await clearPrimaryExcept(ctx, input.customerId, input.contactId);

        const { rows } = await ctx.client.query<Parameters<typeof mapCustomerContact>[0]>(
          `update public.customer_contacts
              set is_primary = true,
                  updated_by = $3::uuid
            where id = $2::uuid
              and customer_id = $1::uuid
              and org_id = app.current_org_id()
              and deleted_at is null
          returning ${CONTACT_SELECT}`,
          [input.customerId, input.contactId, userId],
        );
        const row = rows[0];
        if (!row) throw new CustomerContactAbort({ ok: false, error: 'not_found' });

        await writeContactAudit(ctx, {
          action: 'ship.customer_contact.primary_set',
          resourceId: row.id,
          customerId: input.customerId,
          afterState: { is_primary: true },
        });

        revalidateCustomerRoutes(input.customerId);
        return { ok: true, data: mapCustomerContact(row) };
      } catch (err) {
        if (err instanceof CustomerContactAbort) return err.result;
        throw err;
      }
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error === 'persistence_failed') console.error('[shipping/customers] setPrimaryCustomerContact failed', err);
    return { ok: false, error };
  }
}
