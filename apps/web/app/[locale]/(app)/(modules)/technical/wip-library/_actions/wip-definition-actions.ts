'use server';

import { hasAnyPermission, hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { nextEntityCode } from '../../../../../../../lib/documents/code-mask';
import { materializeNpdBom } from '../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-bom';
import {
  acceptWipDefinitionUpdateInputSchema,
  archiveWipDefinitionInputSchema,
  listMyNotificationsInputSchema,
  listWipDefinitionsInputSchema,
  markNotificationReadInputSchema,
  publishWipDefinitionFromComponentInputSchema,
  saveWipDefinitionInputSchema,
  searchWipDefinitionsInputSchema,
} from './wip-definition-schemas';
import type {
  AcceptWipDefinitionUpdateInput,
  ArchiveWipDefinitionInput,
  ListMyNotificationsInput,
  ListWipDefinitionsInput,
  MarkNotificationReadInput,
  PublishWipDefinitionFromComponentInput,
  SaveWipDefinitionInput,
  SearchWipDefinitionsInput,
} from './wip-definition-schemas';

const CREATE_PERMISSION = 'technical.wip.create';
const EDIT_PERMISSION = 'technical.wip.edit';
const DEACTIVATE_PERMISSION = 'technical.wip.deactivate';
const NPD_PRODUCTION_WRITE_PERMISSION = 'npd.production.write';
const WIP_UPDATED_EVENT = 'wip.definition.updated';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };
type ActionResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; status?: number };

type ExistingDefinition = {
  id: string;
  item_id: string | null;
  version: number;
  status: string;
  name: string;
  description: string | null;
  base_uom: string;
  yield_pct: string | number;
  reusable: boolean;
  source_project_id: string | null;
};

type SaveWipDefinitionData = typeof saveWipDefinitionInputSchema._output;

export async function listWipDefinitions(input?: ListWipDefinitionsInput): Promise<ActionResult<{ definitions: unknown[] }>> {
  const parsed = listWipDefinitionsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid WIP definition filter', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult<{ definitions: unknown[] }>>(async (ctx) => {
    // Reads are org-scoped and open (canonical technical/items pattern);
    // technical.wip.* gates WRITES only — viewers get the read-only library.
    const filter = parsed.data ?? {};
    const rows = await ctx.client.query(
      `select d.id,
              d.name,
              d.base_uom as "baseUom",
              d.version,
              d.status,
              d.reusable,
              i.item_code as "itemCode",
              coalesce(proc.process_count, 0)::int as "processCount",
              coalesce(refs.project_count, 0)::int as "referencingProjects"
         from public.wip_definitions d
         left join public.items i on i.id = d.item_id and i.org_id = d.org_id
         left join lateral (
           select count(*)::int as process_count
             from public.wip_definition_processes p
            where p.org_id = d.org_id and p.wip_definition_id = d.id
         ) proc on true
         left join lateral (
           select count(distinct f.project_id)::int as project_count
             from public.formulation_ingredients fi
             join public.formulation_versions fv on fv.id = fi.version_id
             join public.formulations f on f.id = fv.formulation_id and f.org_id = d.org_id
            where fi.wip_definition_id = d.id
         ) refs on true
        where d.org_id = app.current_org_id()
          and ($1::text is null or d.status = $1::text)
          and ($2::boolean is null or d.reusable = $2::boolean)
          and ($3::text is null or d.name ilike '%' || $3::text || '%')
        order by d.updated_at desc, d.name asc`,
      [filter.status ?? null, filter.reusable ?? null, filter.q ?? null],
    );
    return { ok: true, definitions: rows.rows };
  });
}

export async function getWipDefinition(id: string): Promise<ActionResult<{ definition: unknown; ingredients: unknown[]; processes: unknown[]; whereUsed: unknown[] }>> {
  if (!id || typeof id !== 'string') return { ok: false, error: 'Invalid WIP definition id', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult<{ definition: unknown; ingredients: unknown[]; processes: unknown[]; whereUsed: unknown[] }>>(async (ctx) => {
    // Read is org-scoped and open (technical/items pattern) — writes stay gated.
    const definition = await ctx.client.query(
      `select d.*, i.item_code
         from public.wip_definitions d
         left join public.items i on i.id = d.item_id and i.org_id = d.org_id
        where d.id = $1::uuid and d.org_id = app.current_org_id()
        limit 1`,
      [id],
    );
    if (!definition.rows[0]) return { ok: false, error: 'WIP definition not found', code: 'NOT_FOUND', status: 404 };

    const ingredients = await ctx.client.query(
      `select wi.id, wi.item_id as "itemId", i.item_code as "itemCode", i.name, wi.qty_per_unit as "qtyPerUnit", wi.uom, wi.sequence
         from public.wip_definition_ingredients wi
         join public.items i on i.id = wi.item_id and i.org_id = wi.org_id
        where wi.org_id = app.current_org_id() and wi.wip_definition_id = $1::uuid
        order by wi.sequence asc, i.name asc`,
      [id],
    );
    const processes = await loadDefinitionProcesses(ctx, id);
    const whereUsed = await loadWhereUsed(ctx, id);
    return { ok: true, definition: definition.rows[0], ingredients: ingredients.rows, processes, whereUsed };
  });
}

export async function saveWipDefinition(input: SaveWipDefinitionInput): Promise<ActionResult<{ id: string; version: number }>> {
  const parsed = saveWipDefinitionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid WIP definition input', code: 'VALIDATION_ERROR' };
  const data = preserveProcessYieldPct(parsed.data, input);

  return withOrgContext<ActionResult<{ id: string; version: number }>>(async (ctx) => {
    const requiredPermission = data.id ? EDIT_PERMISSION : CREATE_PERMISSION;
    if (!(await hasPermission(ctx, requiredPermission))) {
      return { ok: false, error: `${requiredPermission} is required`, code: 'FORBIDDEN', status: 403 };
    }

    const existing = data.id ? await loadExistingDefinition(ctx, data.id) : null;
    if (data.id && !existing) return { ok: false, error: 'WIP definition not found', code: 'NOT_FOUND', status: 404 };

    const beforeContent = existing ? await loadDefinitionContent(ctx, existing.id, existing) : null;
    const afterContent = canonicalInputContent(data);
    const contentChanged = !beforeContent || JSON.stringify(beforeContent) !== JSON.stringify(afterContent);
    const nextVersion = existing ? existing.version + (contentChanged ? 1 : 0) : 1;

    const itemId = existing?.item_id ?? await ensureDefinitionItem(ctx, data.name, data.baseUom);
    const cloneOnWrite = Boolean(existing && existing.status === 'active' && contentChanged);

    if (cloneOnWrite) {
      await ctx.client.query(
        `select wip.id
           from public.wip_definitions wip
          where wip.id = $1::uuid
            and wip.org_id = app.current_org_id()
          for update`,
        [existing!.id],
      );
    }

    const saved = cloneOnWrite
      ? await ctx.client.query<{ id: string; version: number }>(
          `insert into public.wip_definitions
             (org_id, item_id, name, description, base_uom, yield_pct, version, status, reusable,
              source_project_id, supersedes_wip_definition_id, created_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4, $5::numeric, $6::int,
              'draft', $7::boolean, $8::uuid, $9::uuid, $10::uuid)
           returning id, version`,
          [
            itemId,
            data.name,
            data.description ?? null,
            data.baseUom,
            data.yieldPct,
            nextVersion,
            data.reusable,
            existing!.source_project_id,
            existing!.id,
            ctx.userId,
          ],
        )
      : existing
      ? await ctx.client.query<{ id: string; version: number }>(
          `update public.wip_definitions
              set name = $2,
                  description = $3,
                  base_uom = $4,
                  yield_pct = $5::numeric,
                  reusable = $6::boolean,
                  item_id = $7::uuid,
                  version = $8::int,
                  status = case when $6::boolean and status = 'draft' then 'active' else status end,
                  updated_at = now()
            where id = $1::uuid
              and org_id = app.current_org_id()
          returning id, version`,
          [
            existing.id,
            data.name,
            data.description ?? null,
            data.baseUom,
            data.yieldPct,
            data.reusable,
            itemId,
            nextVersion,
          ],
        )
      : await ctx.client.query<{ id: string; version: number }>(
          `insert into public.wip_definitions
             (org_id, item_id, name, description, base_uom, yield_pct, version, status, reusable, created_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4, $5::numeric, 1,
              case when $6::boolean then 'active' else 'draft' end, $6::boolean, $7::uuid)
           returning id, version`,
          [itemId, data.name, data.description ?? null, data.baseUom, data.yieldPct, data.reusable, ctx.userId],
        );

    const definitionId = saved.rows[0]?.id;
    if (!definitionId) throw new Error('Could not save WIP definition');

    await replaceDefinitionIngredients(ctx, definitionId, data.ingredients);
    await replaceDefinitionProcesses(ctx, definitionId, data.processes);
    await refreshWipItemAllergens(ctx, itemId, data.ingredients.map((ingredient) => ingredient.itemId));

    if (cloneOnWrite && data.reusable) {
      await ctx.client.query(
        `update public.wip_definitions wip
            set status = 'archived',
                updated_at = now()
          where wip.id = $1::uuid
            and wip.org_id = app.current_org_id()
            and wip.status = 'active'`,
        [existing!.id],
      );
      await ctx.client.query(
        `update public.wip_definitions wip
            set status = 'active',
                updated_at = now()
          where wip.id = $1::uuid
            and wip.org_id = app.current_org_id()`,
        [definitionId],
      );
    }

    if (existing && contentChanged) {
      await emitDefinitionUpdated(ctx, definitionId, nextVersion);
      await fanOutDefinitionNotifications(ctx, definitionId, data.name, nextVersion);
    }

    return { ok: true, id: definitionId, version: nextVersion };
  });
}

export async function publishWipDefinitionFromComponent(input: PublishWipDefinitionFromComponentInput): Promise<ActionResult<{ id: string }>> {
  const parsed = publishWipDefinitionFromComponentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid publish input', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult<{ id: string }>>(async (ctx) => {
    if (!(await hasPermission(ctx, NPD_PRODUCTION_WRITE_PERMISSION))) {
      return { ok: false, error: `${NPD_PRODUCTION_WRITE_PERMISSION} is required`, code: 'FORBIDDEN', status: 403 };
    }

    // D42: the WIP's base unit = the creating process's OUTPUT unit — taken from the
    // LAST process in the component chain (throughput_uom, mig 429); fallback 'kg'.
    const component = await ctx.client.query<{ project_id: string | null; output_uom: string }>(
      `select p.id as project_id,
              coalesce(last_proc.throughput_uom, 'kg') as output_uom
         from public.prod_detail pd
         left join public.npd_projects p on p.product_code = pd.product_code and p.org_id = pd.org_id
         left join lateral (
           select wp.throughput_uom
             from public.npd_wip_processes wp
            where wp.org_id = pd.org_id
              and wp.prod_detail_id = pd.id
              and wp.throughput_uom in ('kg', 'g', 'each', 'pack')
            order by wp.display_order desc
            limit 1
         ) last_proc on true
        where pd.id = $1::uuid
          and pd.org_id = app.current_org_id()
        limit 1`,
      [parsed.data.prodDetailId],
    );
    const componentRow = component.rows[0];
    if (!componentRow) return { ok: false, error: 'Production component not found', code: 'NOT_FOUND', status: 404 };

    // Idempotency: a component publishes at most one definition — a re-submit
    // returns the existing one instead of minting duplicates (review M2).
    const alreadyPublished = await ctx.client.query<{ wip_definition_id: string }>(
      `select wip_definition_id::text
         from public.npd_wip_processes
        where org_id = app.current_org_id()
          and prod_detail_id = $1::uuid
          and wip_definition_id is not null
        limit 1`,
      [parsed.data.prodDetailId],
    );
    const existingDefinitionId = alreadyPublished.rows[0]?.wip_definition_id;
    if (existingDefinitionId) return { ok: true, id: existingDefinitionId };

    const itemId = await ensureDefinitionItem(ctx, parsed.data.name, componentRow.output_uom ?? 'kg');
    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.wip_definitions
         (org_id, item_id, name, base_uom, status, reusable, source_project_id, created_by)
       values
         (app.current_org_id(), $1::uuid, $2, $3, 'active', true, $4::uuid, $5::uuid)
       returning id`,
      [itemId, parsed.data.name, componentRow.output_uom ?? 'kg', componentRow.project_id, ctx.userId],
    );
    const definitionId = inserted.rows[0]?.id;
    if (!definitionId) throw new Error('Could not publish WIP definition');

    const processes = await ctx.client.query<{
      id: string;
      process_name: string;
      display_order: number;
      duration_hours: string | number;
      additional_cost: string | number;
      throughput_per_hour: string | number | null;
      throughput_uom: string | null;
      setup_cost: string | number;
      yield_pct: string | number;
    }>(
      `select id, process_name, display_order, duration_hours, additional_cost,
              throughput_per_hour, throughput_uom, setup_cost, yield_pct
         from public.npd_wip_processes
        where org_id = app.current_org_id()
          and prod_detail_id = $1::uuid
        order by display_order asc`,
      [parsed.data.prodDetailId],
    );

    for (const process of processes.rows) {
      const copied = await ctx.client.query<{ id: string }>(
        `insert into public.wip_definition_processes
           (org_id, wip_definition_id, process_name, display_order, duration_hours, additional_cost,
            throughput_per_hour, throughput_uom, setup_cost, yield_pct)
         values
           (app.current_org_id(), $1::uuid, $2, $3::int, $4::numeric, $5::numeric, $6::numeric, $7, $8::numeric, $9::numeric)
         returning id`,
        [
          definitionId,
          process.process_name,
          process.display_order,
          process.duration_hours,
          process.additional_cost,
          process.throughput_per_hour,
          process.throughput_uom,
          process.setup_cost,
          process.yield_pct ?? 100,
        ],
      );
      const copiedId = copied.rows[0]?.id;
      if (!copiedId) throw new Error('Could not copy WIP process');
      await ctx.client.query(
        `insert into public.wip_definition_roles
           (org_id, process_id, role_group, headcount, rate_per_hour)
         select app.current_org_id(), $2::uuid, role_group, headcount, rate_per_hour
           from public.npd_wip_process_roles
          where org_id = app.current_org_id()
            and process_id = $1::uuid`,
        [process.id, copiedId],
      );
    }

    await ctx.client.query(
      `update public.npd_wip_processes
          set wip_definition_id = $2::uuid,
              wip_item_id = $3::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and prod_detail_id = $1::uuid`,
      [parsed.data.prodDetailId, definitionId, itemId],
    );

    return { ok: true, id: definitionId };
  });
}

export async function acceptWipDefinitionUpdate(
  input: AcceptWipDefinitionUpdateInput,
): Promise<ActionResult<{ acceptedVersion: number; bomsRegenerated: boolean; bomBlockedCode?: string }>> {
  const parsed = acceptWipDefinitionUpdateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid accept input', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult<{ acceptedVersion: number; bomsRegenerated: boolean; bomBlockedCode?: string }>>(async (ctx) => {
    if (!(await hasPermission(ctx, NPD_PRODUCTION_WRITE_PERMISSION))) {
      return { ok: false, error: `${NPD_PRODUCTION_WRITE_PERMISSION} is required`, code: 'FORBIDDEN', status: 403 };
    }

    const definition = await ctx.client.query<{ version: number }>(
      `select version
         from public.wip_definitions
        where id = $1::uuid and org_id = app.current_org_id()
        limit 1`,
      [parsed.data.wipDefinitionId],
    );
    const version = definition.rows[0]?.version;
    if (!version) return { ok: false, error: 'WIP definition not found', code: 'NOT_FOUND', status: 404 };

    await ctx.client.query(
      `insert into public.wip_definition_acks
         (org_id, wip_definition_id, npd_project_id, accepted_version, accepted_by)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, $3::int, $4::uuid)
       on conflict (org_id, wip_definition_id, npd_project_id)
       do update set accepted_version = excluded.accepted_version,
                     accepted_by = excluded.accepted_by,
                     accepted_at = now()`,
      [parsed.data.wipDefinitionId, parsed.data.projectId, version, ctx.userId],
    );

    const activeBom = await ctx.client.query<{ ok: boolean }>(
      `select true as ok
         from public.bom_headers
        where org_id = app.current_org_id()
          and npd_project_id = $1::uuid
          and status = 'active'
        limit 1`,
      [parsed.data.projectId],
    );
    let bomsRegenerated = false;
    let bomBlockedCode: string | undefined;
    if (activeBom.rows[0]?.ok) {
      const materialized = await materializeNpdBom(ctx, { projectId: parsed.data.projectId });
      bomsRegenerated = !materialized.code && materialized.bomHeaderId != null;
      bomBlockedCode = materialized.code ?? undefined;
    }

    return { ok: true, acceptedVersion: version, bomsRegenerated, ...(bomBlockedCode ? { bomBlockedCode } : {}) };
  });
}

export async function archiveWipDefinition(input: ArchiveWipDefinitionInput): Promise<ActionResult> {
  const parsed = archiveWipDefinitionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid archive input', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult>(async (ctx) => {
    if (!(await hasPermission(ctx, DEACTIVATE_PERMISSION))) {
      return { ok: false, error: `${DEACTIVATE_PERMISSION} is required`, code: 'FORBIDDEN', status: 403 };
    }

    const references = await ctx.client.query<{ count: string }>(
      `select count(distinct f.project_id)::text as count
         from public.formulation_ingredients fi
         join public.formulation_versions fv on fv.id = fi.version_id
         join public.formulations f on f.id = fv.formulation_id
         join public.npd_projects p on p.id = f.project_id and p.org_id = f.org_id
        where f.org_id = app.current_org_id()
          and fi.wip_definition_id = $1::uuid
          and p.current_gate <> 'Launched'`,
      [parsed.data.id],
    );
    if (Number(references.rows[0]?.count ?? 0) > 0) {
      return {
        ok: false,
        error: 'WIP definition is referenced by non-archived projects',
        code: 'WIP_DEFINITION_IN_USE',
        status: 409,
      };
    }

    const archived = await ctx.client.query(
      `update public.wip_definitions
          set status = 'archived',
              reusable = false,
              updated_at = now()
        where id = $1::uuid
          and org_id = app.current_org_id()`,
      [parsed.data.id],
    );
    return archived.rowCount === 1 ? { ok: true } : { ok: false, error: 'WIP definition not found', code: 'NOT_FOUND', status: 404 };
  });
}

export async function searchWipDefinitions(input: SearchWipDefinitionsInput): Promise<ActionResult<{ options: unknown[] }>> {
  const parsed = searchWipDefinitionsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid search input', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult<{ options: unknown[] }>>(async (ctx) => {
    if (!(await hasAnyPermission(ctx, [CREATE_PERMISSION, EDIT_PERMISSION, NPD_PRODUCTION_WRITE_PERMISSION]))) {
      return { ok: false, error: 'WIP definition permission required', code: 'FORBIDDEN', status: 403 };
    }

    const found = await ctx.client.query(
      `select d.id, d.name, d.base_uom as "baseUom", d.item_id as "itemId", i.item_code as "itemCode"
         from public.wip_definitions d
         join public.items i on i.id = d.item_id and i.org_id = d.org_id
        where d.org_id = app.current_org_id()
          and d.reusable is true
          and d.status = 'active'
          and d.base_uom in ('kg', 'g')
          and ($1::text = '' or d.name ilike '%' || $1::text || '%' or i.item_code ilike '%' || $1::text || '%')
        order by d.name asc
        limit 25`,
      [parsed.data.q],
    );
    return { ok: true, options: found.rows };
  });
}

export async function listMyNotifications(input?: ListMyNotificationsInput): Promise<ActionResult<{ notifications: unknown[] }>> {
  const parsed = listMyNotificationsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid notification filter', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult<{ notifications: unknown[] }>>(async (ctx) => {
    const notifications = await ctx.client.query(
      `select id, type, title, body, link, payload, read_at as "readAt", created_at as "createdAt"
         from public.user_notifications
        where org_id = app.current_org_id()
          and user_id = $1::uuid
          and ($2::boolean is false or read_at is null)
        order by created_at desc
        limit 100`,
      [ctx.userId, parsed.data?.unreadOnly ?? false],
    );
    return { ok: true, notifications: notifications.rows };
  });
}

export async function markNotificationRead(input: MarkNotificationReadInput): Promise<ActionResult> {
  const parsed = markNotificationReadInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid notification id', code: 'VALIDATION_ERROR' };

  return withOrgContext<ActionResult>(async (ctx) => {
    await ctx.client.query(
      `update public.user_notifications
          set read_at = coalesce(read_at, now())
        where org_id = app.current_org_id()
          and user_id = $1::uuid
          and id = $2::uuid`,
      [ctx.userId, parsed.data.id],
    );
    return { ok: true };
  });
}

export async function markAllRead(): Promise<ActionResult> {
  return withOrgContext<ActionResult>(async (ctx) => {
    await ctx.client.query(
      `update public.user_notifications
          set read_at = coalesce(read_at, now())
        where org_id = app.current_org_id()
          and user_id = $1::uuid
          and read_at is null`,
      [ctx.userId],
    );
    return { ok: true };
  });
}

async function loadExistingDefinition(ctx: OrgContextLike, id: string): Promise<ExistingDefinition | null> {
  const { rows } = await ctx.client.query<ExistingDefinition>(
    `select id, item_id, version, status, name, description, base_uom, yield_pct, reusable, source_project_id
       from public.wip_definitions
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

function preserveProcessYieldPct(data: SaveWipDefinitionData, raw: SaveWipDefinitionInput): SaveWipDefinitionData {
  const rawProcesses = Array.isArray((raw as { processes?: unknown[] }).processes)
    ? (raw as { processes: Array<Record<string, unknown>> }).processes
    : [];
  return {
    ...data,
    processes: data.processes.map((process, index) => ({
      ...process,
      yieldPct: normalizeProcessYieldPct(rawProcesses[index]?.yieldPct),
    })),
  };
}

function normalizeProcessYieldPct(value: unknown): number {
  const numeric = Number(value ?? 100);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 100 ? numeric : 100;
}

async function loadDefinitionProcesses(ctx: OrgContextLike, definitionId: string): Promise<unknown[]> {
  const processes = await ctx.client.query<{ id: string } & Record<string, unknown>>(
    `select id,
            process_name as "processName",
            display_order as "displayOrder",
            duration_hours as "durationHours",
            additional_cost as "additionalCost",
            throughput_per_hour as "throughputPerHour",
            throughput_uom as "throughputUom",
            setup_cost as "setupCost",
            yield_pct as "yieldPct"
       from public.wip_definition_processes
      where org_id = app.current_org_id()
        and wip_definition_id = $1::uuid
      order by display_order asc, process_name asc`,
    [definitionId],
  );

  const result = [];
  for (const process of processes.rows) {
    const roles = await ctx.client.query(
      `select role_group as "roleGroup", headcount, rate_per_hour as "ratePerHour"
         from public.wip_definition_roles
        where org_id = app.current_org_id()
          and process_id = $1::uuid
        order by role_group asc`,
      [process.id],
    );
    result.push({ ...process, roles: roles.rows });
  }
  return result;
}

async function loadWhereUsed(ctx: OrgContextLike, definitionId: string): Promise<unknown[]> {
  const { rows } = await ctx.client.query(
    `select p.id as "projectId",
            p.name as "projectName",
            p.product_code as "fgCode",
            ack.accepted_version as "acceptedVersion"
       from public.formulation_ingredients fi
       join public.formulation_versions fv on fv.id = fi.version_id
       join public.formulations f on f.id = fv.formulation_id
       join public.npd_projects p on p.id = f.project_id and p.org_id = f.org_id
       left join public.wip_definition_acks ack
         on ack.org_id = p.org_id
        and ack.wip_definition_id = $1::uuid
        and ack.npd_project_id = p.id
      where f.org_id = app.current_org_id()
        and fi.wip_definition_id = $1::uuid
      group by p.id, p.name, p.product_code, ack.accepted_version
      order by p.name asc`,
    [definitionId],
  );
  return rows;
}

async function loadDefinitionContent(ctx: OrgContextLike, definitionId: string, definition: ExistingDefinition): Promise<unknown> {
  const ingredients = await ctx.client.query(
    `select item_id as "itemId", qty_per_unit as "qtyPerUnit", uom, sequence
       from public.wip_definition_ingredients
      where org_id = app.current_org_id()
        and wip_definition_id = $1::uuid
      order by sequence asc, item_id asc`,
    [definitionId],
  );
  return canonicalContent({
    name: definition.name,
    description: definition.description,
    baseUom: definition.base_uom,
    yieldPct: definition.yield_pct,
    reusable: definition.reusable,
    ingredients: ingredients.rows,
    processes: await loadDefinitionProcesses(ctx, definitionId),
  });
}

function canonicalInputContent(input: {
  name: string;
  description?: string | null;
  baseUom: string;
  yieldPct: number;
  reusable: boolean;
  ingredients: unknown[];
  processes: unknown[];
}): unknown {
  return canonicalContent(input);
}

function canonicalContent(input: Record<string, unknown>): unknown {
  return {
    name: String(input.name ?? '').trim(),
    description: input.description ? String(input.description).trim() : null,
    baseUom: input.baseUom,
    yieldPct: Number(input.yieldPct).toFixed(3),
    reusable: input.reusable === true,
    ingredients: (input.ingredients as Array<Record<string, unknown>>).map((ingredient) => ({
      itemId: ingredient.itemId,
      qtyPerUnit: Number(ingredient.qtyPerUnit).toFixed(6),
      uom: ingredient.uom,
      sequence: Number(ingredient.sequence ?? 0),
    })),
    processes: (input.processes as Array<Record<string, unknown>>).map((process) => ({
      processName: process.processName,
      displayOrder: Number(process.displayOrder ?? 0),
      durationHours: Number(process.durationHours ?? 0).toFixed(4),
      additionalCost: Number(process.additionalCost ?? 0).toFixed(4),
      throughputPerHour: process.throughputPerHour == null ? null : Number(process.throughputPerHour).toFixed(4),
      throughputUom: process.throughputUom ?? null,
      setupCost: Number(process.setupCost ?? 0).toFixed(4),
      yieldPct: Number(process.yieldPct ?? 100).toFixed(3),
      roles: (process.roles as Array<Record<string, unknown>> | undefined ?? []).map((role) => ({
        roleGroup: role.roleGroup,
        headcount: Number(role.headcount ?? 1),
        ratePerHour: role.ratePerHour == null ? null : Number(role.ratePerHour).toFixed(4),
      })),
    })),
  };
}

async function ensureDefinitionItem(ctx: OrgContextLike, name: string, baseUom: string): Promise<string> {
  const itemCode = await mintWipItemCode(ctx, name);
  const inserted = await ctx.client.query<{ id: string }>(
    `insert into public.items
       (org_id, item_code, item_type, name, origin_module, status, uom_base, created_by)
     values
       (app.current_org_id(), $1, 'intermediate', $2, 'npd', 'active', $3, $4::uuid)
     returning id`,
    [itemCode, name, baseUom, ctx.userId],
  );
  const itemId = inserted.rows[0]?.id;
  if (!itemId) throw new Error('Could not create WIP definition item');
  await writeAudit(ctx, 'wip_definition.item.create', 'item', itemId, null, { itemCode, name, baseUom });
  return itemId;
}

async function mintWipItemCode(ctx: OrgContextLike, name: string): Promise<string> {
  try {
    return await nextEntityCode(ctx.client, ctx.orgId, 'wip');
  } catch (error) {
    if (error instanceof Error && (error.message === 'entity_code_settings_missing:wip' || error.message === 'entity_code_mask_missing:wip')) {
      return `WIP-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'DEFINITION'}`;
    }
    throw error;
  }
}

async function replaceDefinitionIngredients(
  ctx: OrgContextLike,
  definitionId: string,
  ingredients: Array<{ itemId: string; qtyPerUnit: number; uom: string; sequence: number }>,
): Promise<void> {
  await ctx.client.query(
    `delete from public.wip_definition_ingredients
      where org_id = app.current_org_id()
        and wip_definition_id = $1::uuid`,
    [definitionId],
  );
  for (const ingredient of ingredients) {
    await ctx.client.query(
      `insert into public.wip_definition_ingredients
         (org_id, wip_definition_id, item_id, qty_per_unit, uom, sequence)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::int)`,
      [definitionId, ingredient.itemId, ingredient.qtyPerUnit, ingredient.uom, ingredient.sequence],
    );
  }
}

async function replaceDefinitionProcesses(
  ctx: OrgContextLike,
  definitionId: string,
  processes: Array<{
    processName: string;
    displayOrder: number;
    durationHours: number;
    additionalCost: number;
    throughputPerHour?: number | null;
    throughputUom?: string | null;
    setupCost: number;
    yieldPct?: number;
    roles: Array<{ roleGroup: string; headcount: number; ratePerHour?: number | null }>;
  }>,
): Promise<void> {
  await ctx.client.query(
    `delete from public.wip_definition_processes
      where org_id = app.current_org_id()
        and wip_definition_id = $1::uuid`,
    [definitionId],
  );
  for (const process of processes) {
    const inserted = await ctx.client.query<{ id: string }>(
      `insert into public.wip_definition_processes
         (org_id, wip_definition_id, process_name, display_order, duration_hours, additional_cost,
          throughput_per_hour, throughput_uom, setup_cost, yield_pct)
       values
         (app.current_org_id(), $1::uuid, $2, $3::int, $4::numeric, $5::numeric, $6::numeric, $7, $8::numeric, $9::numeric)
       returning id`,
      [
        definitionId,
        process.processName,
        process.displayOrder,
        process.durationHours,
        process.additionalCost,
        process.throughputPerHour ?? null,
        process.throughputUom ?? null,
        process.setupCost,
        process.yieldPct ?? 100,
      ],
    );
    const processId = inserted.rows[0]?.id;
    if (!processId) throw new Error('Could not save WIP definition process');
    for (const role of process.roles) {
      await ctx.client.query(
        `insert into public.wip_definition_roles
           (org_id, process_id, role_group, headcount, rate_per_hour)
         values
           (app.current_org_id(), $1::uuid, $2, $3::int, $4::numeric)`,
        [processId, role.roleGroup, role.headcount, role.ratePerHour ?? null],
      );
    }
  }
}

async function refreshWipItemAllergens(ctx: OrgContextLike, itemId: string, ingredientItemIds: string[]): Promise<void> {
  await ctx.client.query(
    `delete from public.item_allergen_profiles
      where org_id = app.current_org_id()
        and item_id = $1::uuid
        and source = 'cascaded'`,
    [itemId],
  );
  if (ingredientItemIds.length === 0) return;
  await ctx.client.query(
    `insert into public.item_allergen_profiles
       (org_id, item_id, allergen_code, source, intensity, confidence, declared_by)
     select distinct app.current_org_id(),
            $1::uuid,
            profile.allergen_code,
            'cascaded',
            profile.intensity,
            profile.confidence,
            $3::uuid
       from public.item_allergen_profiles profile
       join "Reference"."Allergens" ref
         on ref.org_id = profile.org_id
        and ref.allergen_code = profile.allergen_code
      where profile.org_id = app.current_org_id()
        and profile.item_id = any($2::uuid[])
     on conflict (org_id, item_id, allergen_code)
     do update set source = excluded.source,
                   intensity = excluded.intensity,
                   confidence = excluded.confidence,
                   declared_by = excluded.declared_by,
                   declared_at = now()
     where public.item_allergen_profiles.source <> 'manual_override'`,
    [itemId, ingredientItemIds, ctx.userId],
  );
}

async function emitDefinitionUpdated(ctx: OrgContextLike, definitionId: string, version: number): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'wip_definition', $2, $3::jsonb, 'w3-l8')`,
    [WIP_UPDATED_EVENT, definitionId, JSON.stringify({ id: definitionId, version })],
  );
}

async function fanOutDefinitionNotifications(ctx: OrgContextLike, definitionId: string, name: string, version: number): Promise<void> {
  await ctx.client.query(
    `insert into public.user_notifications
       (org_id, user_id, type, title, body, link, payload)
     select distinct app.current_org_id(),
            p.created_by_user,
            'wip.definition.updated',
            $2,
            $3,
            '/npd/pipeline/' || p.id::text,
            jsonb_build_object('wipDefinitionId', $1::uuid, 'version', $4::int, 'projectId', p.id)
       from public.formulation_ingredients fi
       join public.formulation_versions fv on fv.id = fi.version_id
       join public.formulations f on f.id = fv.formulation_id
       join public.npd_projects p on p.id = f.project_id and p.org_id = f.org_id
      where f.org_id = app.current_org_id()
        and fi.wip_definition_id = $1::uuid
        and p.created_by_user is not null`,
    [definitionId, 'WIP definition updated', `${name} was updated to version ${version}.`, version],
  );
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
