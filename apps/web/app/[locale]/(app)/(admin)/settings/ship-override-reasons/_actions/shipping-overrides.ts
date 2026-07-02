'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';
const SHIP_OVERRIDE_REASONS_ROUTE = '/settings/ship-override-reasons';
const SHIPPING_OVERRIDES_ROUTE = '/settings/shipping-overrides';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type OverrideTypeRow = {
  id: string;
  org_id: string;
  code: string;
  label: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  reason_count: number;
};

export type ReasonCodeRow = {
  id: string;
  org_id: string;
  override_type_id: string;
  override_type_code: string;
  code: string;
  label: string;
  requires_note: boolean;
  display_order: number;
  is_active: boolean;
};

export type RmaReasonCodeRow = {
  id: string;
  org_id: string;
  code: string;
  label_en: string;
  label_pl: string | null;
  display_order: number;
  is_active: boolean;
};

export type ReasonCodeMutationResult =
  | { ok: true; data: ReasonCodeRow }
  | { ok: true; deleted: true; id: string }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export type ShippingOverridesSettingsData = {
  org_id: string;
  override_types: OverrideTypeRow[];
  selected_override_type_id: string | null;
  reason_codes: ReasonCodeRow[];
  rma_reason_codes: RmaReasonCodeRow[];
};

type OverrideTypeDbRow = {
  id: string;
  org_id: string;
  code: string;
  label: string;
  description: string | null;
  display_order: number | string;
  is_active: boolean;
  reason_count: number | string;
};

type ReasonCodeDbRow = {
  id: string;
  org_id: string;
  override_type_id: string;
  override_type_code: string;
  code: string;
  label: string;
  requires_note: boolean;
  display_order: number | string;
  is_active: boolean;
};

type RmaReasonCodeDbRow = {
  id: string;
  org_id: string;
  code: string;
  label_en: string;
  label_pl: string | null;
  display_order: number | string;
  is_active: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);

const CreateReasonCodeInput = z
  .object({
    orgId: UuidInput,
    overrideTypeId: UuidInput,
    code: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(200),
    requires_note: z.boolean().optional().default(false),
    display_order: z.number().int().min(0).max(100000).optional().default(0),
    is_active: z.boolean().optional().default(true),
  })
  .strict();

const UpdateReasonCodeInput = CreateReasonCodeInput.omit({ overrideTypeId: true }).extend({
  id: UuidInput,
  overrideTypeId: UuidInput.optional(),
});

const DeleteReasonCodeInput = z
  .object({
    orgId: UuidInput,
    id: UuidInput,
  })
  .strict();

function revalidateShippingOverrideRoutes() {
  try {
    revalidateLocalized(SHIP_OVERRIDE_REASONS_ROUTE);
    revalidateLocalized(SHIPPING_OVERRIDES_ROUTE);
  } catch {
    /* no request store in action unit tests */
  }
}

function numeric(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOverrideTypeRow(row: OverrideTypeDbRow): OverrideTypeRow {
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.code,
    label: row.label,
    description: row.description,
    display_order: numeric(row.display_order),
    is_active: row.is_active,
    reason_count: numeric(row.reason_count),
  };
}

function toReasonCodeRow(row: ReasonCodeDbRow): ReasonCodeRow {
  return {
    id: row.id,
    org_id: row.org_id,
    override_type_id: row.override_type_id,
    override_type_code: row.override_type_code,
    code: row.code,
    label: row.label,
    requires_note: row.requires_note,
    display_order: numeric(row.display_order),
    is_active: row.is_active,
  };
}

function toRmaReasonCodeRow(row: RmaReasonCodeDbRow): RmaReasonCodeRow {
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.code,
    label_en: row.label_en,
    label_pl: row.label_pl,
    display_order: numeric(row.display_order),
    is_active: row.is_active,
  };
}

async function hasSettingsUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, SETTINGS_UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

async function queryOverrideTypes(context: OrgContextLike, orgId: string): Promise<OverrideTypeRow[]> {
  if (context.orgId !== orgId) return [];
  const { rows } = await context.client.query<OverrideTypeDbRow>(
    `select ot.id::text,
            ot.org_id::text,
            ot.code,
            ot.label,
            ot.description,
            ot.display_order,
            ot.is_active,
            count(r.id)::text as reason_count
       from public.shipping_override_types ot
       left join public.shipping_override_reasons r
         on r.org_id = app.current_org_id()
        and r.override_type_id = ot.id
        and r.is_active = true
      where ot.org_id = app.current_org_id()
        and ot.org_id = $1::uuid
        and ot.is_active = true
      group by ot.id, ot.org_id, ot.code, ot.label, ot.description, ot.display_order, ot.is_active
      order by ot.display_order, ot.code`,
    [orgId],
  );
  return rows.map(toOverrideTypeRow);
}

async function queryReasonCodes(context: OrgContextLike, orgId: string, overrideTypeId: string): Promise<ReasonCodeRow[]> {
  const parsed = z.object({ orgId: UuidInput, overrideTypeId: UuidInput }).safeParse({ orgId, overrideTypeId });
  if (!parsed.success || context.orgId !== parsed.data.orgId) return [];
  const { rows } = await context.client.query<ReasonCodeDbRow>(
    `select r.id::text,
            r.org_id::text,
            r.override_type_id::text,
            ot.code as override_type_code,
            r.code,
            r.label,
            r.requires_note,
            r.display_order,
            r.is_active
       from public.shipping_override_reasons r
       join public.shipping_override_types ot
         on ot.id = r.override_type_id
        and ot.org_id = app.current_org_id()
      where r.org_id = app.current_org_id()
        and r.org_id = $1::uuid
        and r.override_type_id = $2::uuid
      order by r.display_order, r.code`,
    [parsed.data.orgId, parsed.data.overrideTypeId],
  );
  return rows.map(toReasonCodeRow);
}

async function queryRmaReasonCodes(context: OrgContextLike, orgId: string): Promise<RmaReasonCodeRow[]> {
  if (context.orgId !== orgId) return [];
  const { rows } = await context.client.query<RmaReasonCodeDbRow>(
    `select id::text,
            org_id::text,
            code,
            label_en,
            label_pl,
            display_order,
            is_active
       from public.rma_reason_codes
      where org_id = app.current_org_id()
        and org_id = $1::uuid
      order by display_order, code`,
    [orgId],
  );
  return rows.map(toRmaReasonCodeRow);
}

export async function getOverrideTypes(orgId: string): Promise<OverrideTypeRow[]> {
  return withOrgContext<OverrideTypeRow[]>(async (ctx): Promise<OverrideTypeRow[]> =>
    queryOverrideTypes(ctx as OrgContextLike, orgId),
  );
}

export async function getReasonCodes(orgId: string, overrideTypeId: string): Promise<ReasonCodeRow[]> {
  return withOrgContext<ReasonCodeRow[]>(async (ctx): Promise<ReasonCodeRow[]> =>
    queryReasonCodes(ctx as OrgContextLike, orgId, overrideTypeId),
  );
}

export async function getRmaReasonCodes(orgId: string): Promise<RmaReasonCodeRow[]> {
  return withOrgContext<RmaReasonCodeRow[]>(async (ctx): Promise<RmaReasonCodeRow[]> =>
    queryRmaReasonCodes(ctx as OrgContextLike, orgId),
  );
}

export async function readShippingOverridesSettingsData(): Promise<ShippingOverridesSettingsData> {
  return withOrgContext<ShippingOverridesSettingsData>(async (ctx): Promise<ShippingOverridesSettingsData> => {
    const context = ctx as OrgContextLike;
    const overrideTypes = await queryOverrideTypes(context, context.orgId);
    const selectedOverrideTypeId = overrideTypes[0]?.id ?? null;
    const [reasonCodes, rmaReasonCodes] = await Promise.all([
      selectedOverrideTypeId ? queryReasonCodes(context, context.orgId, selectedOverrideTypeId) : Promise.resolve([]),
      queryRmaReasonCodes(context, context.orgId),
    ]);
    return {
      org_id: context.orgId,
      override_types: overrideTypes,
      selected_override_type_id: selectedOverrideTypeId,
      reason_codes: reasonCodes,
      rma_reason_codes: rmaReasonCodes,
    };
  });
}

export async function createReasonCode(rawInput: unknown): Promise<ReasonCodeMutationResult> {
  const parsed = CreateReasonCodeInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<ReasonCodeMutationResult>(async (ctx): Promise<ReasonCodeMutationResult> => {
      const context = ctx as OrgContextLike;
      if (context.orgId !== parsed.data.orgId) return { ok: false, error: 'forbidden' };
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<ReasonCodeDbRow>(
        `insert into public.shipping_override_reasons
           (org_id, override_type_id, code, label, requires_note, display_order, is_active, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3, $4, $5::boolean, $6::int, $7::boolean, $8::uuid, $8::uuid)
         returning id::text,
                   org_id::text,
                   override_type_id::text,
                   (select code from public.shipping_override_types where id = $2::uuid and org_id = app.current_org_id()) as override_type_code,
                   code,
                   label,
                   requires_note,
                   display_order,
                   is_active`,
        [
          parsed.data.orgId,
          parsed.data.overrideTypeId,
          parsed.data.code,
          parsed.data.label,
          parsed.data.requires_note,
          parsed.data.display_order,
          parsed.data.is_active,
          context.userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateShippingOverrideRoutes();
      return { ok: true, data: toReasonCodeRow(row) };
    });
  } catch (error) {
    console.error('[settings/shipping-overrides] create_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateReasonCode(rawInput: unknown): Promise<ReasonCodeMutationResult> {
  const parsed = UpdateReasonCodeInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<ReasonCodeMutationResult>(async (ctx): Promise<ReasonCodeMutationResult> => {
      const context = ctx as OrgContextLike;
      if (context.orgId !== parsed.data.orgId) return { ok: false, error: 'forbidden' };
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<ReasonCodeDbRow>(
        `update public.shipping_override_reasons r
            set override_type_id = coalesce($3::uuid, override_type_id),
                code = $4,
                label = $5,
                requires_note = $6::boolean,
                display_order = $7::int,
                is_active = $8::boolean,
                updated_by = $9::uuid,
                updated_at = now()
           from public.shipping_override_types ot
          where r.id = $1::uuid
            and r.org_id = app.current_org_id()
            and r.org_id = $2::uuid
            and ot.id = coalesce($3::uuid, r.override_type_id)
            and ot.org_id = app.current_org_id()
          returning r.id::text,
                    r.org_id::text,
                    r.override_type_id::text,
                    ot.code as override_type_code,
                    r.code,
                    r.label,
                    r.requires_note,
                    r.display_order,
                    r.is_active`,
        [
          parsed.data.id,
          parsed.data.orgId,
          parsed.data.overrideTypeId ?? null,
          parsed.data.code,
          parsed.data.label,
          parsed.data.requires_note,
          parsed.data.display_order,
          parsed.data.is_active,
          context.userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateShippingOverrideRoutes();
      return { ok: true, data: toReasonCodeRow(row) };
    });
  } catch (error) {
    console.error('[settings/shipping-overrides] update_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteReasonCode(rawInput: unknown): Promise<ReasonCodeMutationResult> {
  const parsed = DeleteReasonCodeInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<ReasonCodeMutationResult>(async (ctx): Promise<ReasonCodeMutationResult> => {
      const context = ctx as OrgContextLike;
      if (context.orgId !== parsed.data.orgId) return { ok: false, error: 'forbidden' };
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<{ id: string }>(
        `update public.shipping_override_reasons
            set is_active = false,
                updated_by = $3::uuid,
                updated_at = now()
          where id = $1::uuid
            and org_id = app.current_org_id()
            and org_id = $2::uuid
          returning id::text`,
        [parsed.data.id, parsed.data.orgId, context.userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateShippingOverrideRoutes();
      return { ok: true, deleted: true, id: row.id };
    });
  } catch (error) {
    console.error('[settings/shipping-overrides] delete_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}
