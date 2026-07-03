'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { nextEntityCode } from '../../../../lib/documents/code-mask';

const PRODUCTION_WRITE_PERMISSION = 'npd.production.write';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const addWipProcessSchema = z.object({
  prodDetailId: z.string().uuid(),
  processName: z.string().trim().min(1),
  durationHours: z.coerce.number().finite().nonnegative().optional().default(0),
  additionalCost: z.coerce.number().finite().nonnegative().optional().default(0),
  createsWipItem: z.boolean().optional().default(false),
  throughputPerHour: z.coerce.number().finite().nonnegative().optional().default(0),
  throughputUom: z.enum(['kg', 'pack', 'each', 'l']).optional().default('kg'),
  setupCost: z.coerce.number().finite().nonnegative().optional().default(0),
});

const updateWipProcessSchema = z.object({
  id: z.string().uuid(),
  processName: z.string().trim().min(1).optional(),
  durationHours: z.coerce.number().finite().nonnegative().optional(),
  additionalCost: z.coerce.number().finite().nonnegative().optional(),
  createsWipItem: z.boolean().optional(),
  throughputPerHour: z.coerce.number().finite().nonnegative().optional(),
  throughputUom: z.enum(['kg', 'pack', 'each', 'l']).optional(),
  setupCost: z.coerce.number().finite().nonnegative().optional(),
});

const removeWipProcessSchema = z.object({
  id: z.string().uuid(),
});

const roleInputSchema = z.object({
  roleGroup: z.string().trim().min(1),
  headcount: z.coerce.number().int().positive(),
  ratePerHour: z.coerce.number().finite().nonnegative().optional(),
});

const saveWipProcessRolesSchema = z.object({
  processId: z.string().uuid(),
  roles: z.array(roleInputSchema),
}).refine(
  // Guard the (org_id, process_id, role_group) unique constraint at the edge: two role rows with
  // the same role_group would make the second INSERT raise a raw 23505 → surface a clean envelope.
  (input) => new Set(input.roles.map((r) => r.roleGroup.trim())).size === input.roles.length,
  { message: 'duplicate role_group in roles' },
);

export type AddWipProcessInput = z.input<typeof addWipProcessSchema>;
export type UpdateWipProcessInput = z.input<typeof updateWipProcessSchema>;
export type RemoveWipProcessInput = z.input<typeof removeWipProcessSchema>;
export type SaveWipProcessRolesInput = z.input<typeof saveWipProcessRolesSchema>;

export async function addWipProcess(input: AddWipProcessInput): Promise<ActionResult<{ id: string }>> {
  const parsed = addWipProcessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid WIP process input' };

  return withOrgContext<ActionResult<{ id: string }>>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      return { ok: false, error: `${PRODUCTION_WRITE_PERMISSION} is required to add a WIP process` };
    }

    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.npd_wip_processes
         (org_id, prod_detail_id, process_name, display_order, duration_hours, additional_cost,
          creates_wip_item, throughput_per_hour, throughput_uom, setup_cost)
       values
         (
           app.current_org_id(),
           $1::uuid,
           $2,
           (
             select coalesce(max(display_order), 0) + 1
               from public.npd_wip_processes
              where org_id = app.current_org_id()
                and prod_detail_id = $1::uuid
           ),
           $3::numeric,
           $4::numeric,
           $5::boolean,
           $6::numeric,
           $7,
           $8::numeric
         )
       returning id`,
      [
        parsed.data.prodDetailId,
        parsed.data.processName,
        parsed.data.durationHours,
        parsed.data.additionalCost,
        parsed.data.createsWipItem,
        parsed.data.throughputPerHour,
        parsed.data.throughputUom,
        parsed.data.setupCost,
      ],
    );

    const id = inserted.rows[0]?.id;
    if (id && parsed.data.createsWipItem) {
      await ensureWipItem(ctx, parsed.data.processName, id);
    }

    return id ? { ok: true, id } : { ok: false, error: 'Could not add WIP process' };
  });
}

export async function updateWipProcess(input: UpdateWipProcessInput): Promise<ActionResult<{ updated: boolean }>> {
  const parsed = updateWipProcessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid WIP process update input' };

  return withOrgContext<ActionResult<{ updated: boolean }>>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      return { ok: false, error: `${PRODUCTION_WRITE_PERMISSION} is required to update a WIP process` };
    }

    const updated = await ctx.client.query<{ id: string; process_name: string; creates_wip_item: boolean }>(
      `update public.npd_wip_processes
          set process_name = coalesce($2::text, process_name),
              duration_hours = coalesce($3::numeric, duration_hours),
              additional_cost = coalesce($4::numeric, additional_cost),
              creates_wip_item = coalesce($5::boolean, creates_wip_item),
              throughput_per_hour = coalesce($6::numeric, throughput_per_hour),
              throughput_uom = coalesce($7::text, throughput_uom),
              setup_cost = coalesce($8::numeric, setup_cost),
              wip_item_id = case when $5::boolean is false then null else wip_item_id end,
              updated_at = now()
        where id = $1::uuid
          and org_id = app.current_org_id()
      returning id, process_name, creates_wip_item`,
      [
        parsed.data.id,
        parsed.data.processName ?? null,
        parsed.data.durationHours ?? null,
        parsed.data.additionalCost ?? null,
        parsed.data.createsWipItem ?? null,
        parsed.data.throughputPerHour ?? null,
        parsed.data.throughputUom ?? null,
        parsed.data.setupCost ?? null,
      ],
    );

    const process = updated.rows[0];
    if (process?.creates_wip_item) {
      await ensureWipItem(ctx, process.process_name, process.id);
    }

    return { ok: true, updated: updated.rowCount === 1 };
  });
}

export async function removeWipProcess(input: RemoveWipProcessInput): Promise<ActionResult<{ removed: boolean }>> {
  const parsed = removeWipProcessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid WIP process remove input' };

  return withOrgContext<ActionResult<{ removed: boolean }>>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      return { ok: false, error: `${PRODUCTION_WRITE_PERMISSION} is required to remove a WIP process` };
    }

    const deleted = await ctx.client.query(
      `delete from public.npd_wip_processes
        where id = $1::uuid
          and org_id = app.current_org_id()`,
      [parsed.data.id],
    );

    return { ok: true, removed: deleted.rowCount === 1 };
  });
}

export async function saveWipProcessRoles(
  input: SaveWipProcessRolesInput,
): Promise<ActionResult<{ saved: number }>> {
  const parsed = saveWipProcessRolesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid WIP process roles input' };

  return withOrgContext<ActionResult<{ saved: number }>>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, PRODUCTION_WRITE_PERMISSION))) {
      return { ok: false, error: `${PRODUCTION_WRITE_PERMISSION} is required to save WIP process roles` };
    }

    const process = await ctx.client.query<{ ok: boolean }>(
      `select true as ok
         from public.npd_wip_processes
        where id = $1::uuid
          and org_id = app.current_org_id()
        limit 1`,
      [parsed.data.processId],
    );
    if (process.rows.length === 0) {
      return { ok: false, error: 'WIP process is not visible in this organisation' };
    }

    await ctx.client.query(
      `delete from public.npd_wip_process_roles
        where process_id = $1::uuid
          and org_id = app.current_org_id()`,
      [parsed.data.processId],
    );

    for (const role of parsed.data.roles) {
      const ratePerHour =
        role.ratePerHour ??
        (await getCurrentLaborRate(ctx, role.roleGroup));

      await ctx.client.query(
        `insert into public.npd_wip_process_roles
           (org_id, process_id, role_group, headcount, rate_per_hour)
         values
           (app.current_org_id(), $1::uuid, $2, $3::int, $4::numeric)`,
        [parsed.data.processId, role.roleGroup, role.headcount, ratePerHour],
      );
    }

    return { ok: true, saved: parsed.data.roles.length };
  });
}

async function getCurrentLaborRate(ctx: OrgContextLike, roleGroup: string): Promise<number | null> {
  const { rows } = await ctx.client.query<{ rate_per_hour: string | number | null }>(
    `select rate_per_hour
       from public.labor_rates
      where org_id = app.current_org_id()
        and role_group = $1
        and effective_from <= current_date
      order by effective_from desc
      limit 1`,
    [roleGroup],
  );

  const rate = rows[0]?.rate_per_hour;
  return rate === undefined || rate === null ? null : Number(rate);
}

async function ensureWipItem(ctx: OrgContextLike, processName: string, processId: string): Promise<string> {
  const linked = await ctx.client.query<{
    wip_item_id: string | null;
    wip_definition_id: string | null;
    definition_item_id: string | null;
    definition_base_uom: string | null;
    definition_name: string | null;
  }>(
    `select p.wip_item_id,
            p.wip_definition_id,
            d.item_id as definition_item_id,
            d.base_uom as definition_base_uom,
            d.name as definition_name
       from public.npd_wip_processes p
       left join public.wip_definitions d
         on d.id = p.wip_definition_id
        and d.org_id = p.org_id
      where p.id = $1::uuid
        and p.org_id = app.current_org_id()
      limit 1`,
    [processId],
  );
  const process = linked.rows[0];
  if (!process) {
    throw new Error('WIP process is not visible in this organisation');
  }

  if (process.wip_definition_id) {
    if (process.definition_item_id) {
      const existingDefinitionItem = await ctx.client.query<{ id: string }>(
        `select id
           from public.items
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [process.definition_item_id],
      );
      const definitionItemId = existingDefinitionItem.rows[0]?.id;
      if (definitionItemId) {
        await linkProcessToWipItem(ctx, processId, definitionItemId);
        return definitionItemId;
      }
    }

    const definitionItemCode = await mintWipItemCode(ctx, process.definition_name ?? processName, processId);
    const definitionItem = await ctx.client.query<{ id: string }>(
      `insert into public.items
         (org_id, item_code, item_type, name, origin_module, status, uom_base, created_by)
       values
         (app.current_org_id(), $1, 'intermediate', $2, 'npd', 'active', $3, $4::uuid)
       returning id`,
      [
        definitionItemCode,
        process.definition_name ?? processName,
        process.definition_base_uom ?? 'kg',
        ctx.userId,
      ],
    );
    const definitionItemId = definitionItem.rows[0]?.id;
    if (!definitionItemId) {
      throw new Error('Could not ensure WIP definition item');
    }
    await writeAudit(ctx, 'wip_definition.item.create', 'item', definitionItemId, null, {
      itemCode: definitionItemCode,
      name: process.definition_name ?? processName,
      baseUom: process.definition_base_uom ?? 'kg',
      wipDefinitionId: process.wip_definition_id,
    });
    await ctx.client.query(
      `update public.wip_definitions
          set item_id = $2::uuid,
              updated_at = now()
        where id = $1::uuid
          and org_id = app.current_org_id()
          and item_id is null`,
      [process.wip_definition_id, definitionItemId],
    );
    await linkProcessToWipItem(ctx, processId, definitionItemId);
    return definitionItemId;
  }

  const existingItemId = process.wip_item_id;
  if (existingItemId) {
    const existingItem = await ctx.client.query<{ id: string }>(
      `select id
         from public.items
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1`,
      [existingItemId],
    );
    if (existingItem.rows[0]?.id) {
      return existingItem.rows[0].id;
    }
  }

  const itemCode = await mintWipItemCode(ctx, processName, processId);
  const inserted = await ctx.client.query<{ id: string }>(
    `insert into public.items
       (org_id, item_code, item_type, name, origin_module, status, uom_base, created_by)
     values
       (app.current_org_id(), $1, 'intermediate', $2, 'npd', 'active', 'kg', $3::uuid)
     returning id`,
    [itemCode, processName, ctx.userId],
  );

  const itemId = inserted.rows[0]?.id;
  if (!itemId) {
    throw new Error('Could not ensure WIP item');
  }

  await writeAudit(ctx, 'wip_process.item.create', 'item', itemId, null, {
    itemCode,
    name: processName,
    baseUom: 'kg',
    processId,
  });
  await linkProcessToWipItem(ctx, processId, itemId);

  return itemId;
}

async function linkProcessToWipItem(ctx: OrgContextLike, processId: string, itemId: string): Promise<void> {
  const linkedProcess = await ctx.client.query(
    `update public.npd_wip_processes
        set wip_item_id = $2::uuid,
            updated_at = now()
      where id = $1::uuid
        and org_id = app.current_org_id()`,
    [processId, itemId],
  );
  if (linkedProcess.rowCount !== 1) {
    throw new Error('Could not link WIP item to process');
  }
}

async function writeAudit(
  ctx: OrgContextLike,
  action: string,
  resourceType: string,
  resourceId: string,
  beforeState: unknown,
  afterState: unknown,
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values
       (app.current_org_id(), $1::uuid, 'user', $2, $3, $4, $5::jsonb, $6::jsonb, 'standard')`,
    [ctx.userId, action, resourceType, resourceId, JSON.stringify(beforeState), JSON.stringify(afterState)],
  );
}

async function mintWipItemCode(ctx: OrgContextLike, processName: string, processId: string): Promise<string> {
  try {
    return await nextEntityCode(ctx.client, ctx.orgId, 'wip');
  } catch (error) {
    if (isMissingWipCodeMaskError(error)) {
      return `WIP-${sanitizeProcessName(processName)}-${processId.slice(0, 8)}`;
    }
    throw error;
  }
}

function isMissingWipCodeMaskError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === 'entity_code_settings_missing:wip' || error.message === 'entity_code_mask_missing:wip';
}

function sanitizeProcessName(processName: string): string {
  const sanitized = processName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'PROCESS';
}
