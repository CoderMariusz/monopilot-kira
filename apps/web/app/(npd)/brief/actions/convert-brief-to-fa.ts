'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validateBriefMappingV08 } from '@monopilot/validation/v08-brief-mapping';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

const BRIEF_CONVERT_PERMISSION = 'brief.convert_to_fa';
const BRIEF_CONVERTED_EVENT = 'brief.converted';
const BRIEF_COMPLETED_EVENT = 'brief.completed_for_project';
const PROJECT_BRIEF_MAPPED_EVENT = 'npd.project.brief_mapped';
const APP_VERSION = 'brief-convert-project-v1';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type BriefRow = {
  brief_id: string;
  npd_project_id: string | null;
  status: string;
  product_name: string | null;
  volume: string | null;
  dev_code: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  product_code: string | null;
};

type MappingRow = {
  brief_col: string;
  fa_target: string;
  marker: string;
  schema_version: number;
};

type FieldValueRow = Record<string, string | null>;

export type ConvertBriefToFaResult = {
  ok: true;
  briefId: string;
  npdProjectId: string;
  legacyProductCode: string | null;
  v08Status: 'PASS' | 'WARN' | 'FAIL';
};

const convertInputSchema = z.object({
  briefId: z.string().uuid(),
  productCode: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
});

export async function convertBriefToFa(briefId: string, productCode?: string | null): Promise<ConvertBriefToFaResult> {
  return completeBriefForProject(briefId, productCode);
}

export async function convertBriefToProject(
  briefId: string,
  legacyProductCode?: string | null,
): Promise<ConvertBriefToFaResult> {
  return completeBriefForProject(briefId, legacyProductCode);
}

export async function completeBriefForProject(
  briefId: string,
  legacyProductCode?: string | null,
): Promise<ConvertBriefToFaResult> {
  const parsed = convertInputSchema.safeParse({ briefId, productCode: legacyProductCode });
  if (!parsed.success) throw new GateError('INVALID_INPUT');

  return withOrgContext<ConvertBriefToFaResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    if (!(await hasPermission(context, BRIEF_CONVERT_PERMISSION))) {
      throw new GateError('FORBIDDEN');
    }

    const brief = await loadBriefForUpdate(context.client, parsed.data.briefId);
    if (!brief) throw new GateError('BRIEF_NOT_FOUND');
    if (brief.status !== 'complete') throw new GateError('BRIEF_NOT_COMPLETE');
    if (!brief.npd_project_id) throw new GateError('PROJECT_NOT_LINKED');

    const project = await loadProjectForUpdate(context.client, brief.npd_project_id);
    if (!project) throw new GateError('PROJECT_NOT_LINKED');

    const mappings = await loadMappings(context.client);
    const fieldValues = await loadBriefFieldValues(context.client, brief.brief_id);
    await writeAuditRows(context, brief, mappings, fieldValues, parsed.data.productCode);
    const auditRows = await loadAuditRows(context.client, brief.brief_id);
    const v08 = validateBriefMappingV08(auditRows.map((row) => ({ fieldName: row.field_name, applied: row.applied })));

    await updateProjectEvidence(context, project, brief, parsed.data.productCode, v08.status);
    await markBriefConverted(context, brief.brief_id);
    await writeOutboxEvents(context, brief, project.id, parsed.data.productCode, v08.status);

    safeRevalidatePath(`/npd/brief/${brief.brief_id}`);
    safeRevalidatePath(`/npd/pipeline/${project.id}`);

    return {
      ok: true,
      briefId: brief.brief_id,
      npdProjectId: project.id,
      legacyProductCode: parsed.data.productCode,
      v08Status: v08.status,
    };
  });
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
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
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function loadBriefForUpdate(client: QueryClient, briefId: string): Promise<BriefRow | null> {
  const { rows } = await client.query<BriefRow>(
    `select brief_id, npd_project_id, status, product_name, volume::text, dev_code
       from public.brief
      where brief_id = $1::uuid
        and org_id = app.current_org_id()
      for update`,
    [briefId],
  );
  return rows[0] ?? null;
}

async function loadProjectForUpdate(client: QueryClient, projectId: string): Promise<ProjectRow | null> {
  const { rows } = await client.query<ProjectRow>(
    `select id, code, name, notes, product_code
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      for update`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadMappings(client: QueryClient): Promise<MappingRow[]> {
  const { rows } = await client.query<MappingRow>(
    `select brief_col, fa_target, marker, schema_version
       from "Reference"."BriefFieldMapping"
      where org_id = app.current_org_id()
      order by substring(brief_col from 2)::integer`,
  );
  return rows;
}

async function loadBriefFieldValues(client: QueryClient, briefId: string): Promise<FieldValueRow> {
  const { rows } = await client.query<FieldValueRow>(
    `select
       coalesce(bl.product, b.product_name) as "C1",
       coalesce(bl.volume::text, b.volume::text) as "C2",
       coalesce(bl.dev_code, b.dev_code) as "C3",
       bl.component as "C4",
       bl.slice_count::text as "C5",
       bl.supplier as "C6",
       bl.code as "C7",
       bl.price as "C8",
       bl.weights::text as "C9",
       bl.pct::text as "C10",
       bl.packs_per_case::text as "C11",
       bl.comments as "C12",
       bl.benchmark_identified as "C13",
       bl.primary_packaging as "C14",
       bl.secondary_packaging as "C15",
       bl.base_web_code as "C16",
       bl.base_web_price::text as "C17",
       bl.top_web_type as "C18",
       bl.sleeve_carton_code as "C19",
       bl.sleeve_carton_price::text as "C20"
     from public.brief b
     left join lateral (
       select *
         from public.brief_lines line
        where line.brief_id = b.brief_id
          and line.org_id = app.current_org_id()
          and line.line_type = 'product'
        order by line.line_index asc
        limit 1
     ) bl on true
     where b.brief_id = $1::uuid
       and b.org_id = app.current_org_id()`,
    [briefId],
  );
  return rows[0] ?? {};
}

async function writeAuditRows(
  ctx: OrgContextLike,
  brief: BriefRow,
  mappings: MappingRow[],
  fieldValues: FieldValueRow,
  legacyProductCode: string | null,
): Promise<void> {
  for (const mapping of mappings) {
    const rawValue = fieldValues[mapping.brief_col];
    await ctx.client.query(
      `insert into public.brief_to_fa_audit
         (org_id, brief_id, product_code, field_name, applied, mapping_version)
       values
         (app.current_org_id(), $1::uuid, $2, $3, $4, $5)
       on conflict (brief_id, field_name) do update
          set product_code = excluded.product_code,
              applied = excluded.applied,
              mapping_version = excluded.mapping_version`,
      [brief.brief_id, legacyProductCode, mapping.brief_col, hasAppliedValue(rawValue), mapping.schema_version],
    );
  }
}

function hasAppliedValue(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0;
}

async function loadAuditRows(client: QueryClient, briefId: string): Promise<Array<{ field_name: string; applied: boolean }>> {
  const { rows } = await client.query<{ field_name: string; applied: boolean }>(
    `select field_name, applied
       from public.brief_to_fa_audit
      where brief_id = $1::uuid
        and org_id = app.current_org_id()
      order by substring(field_name from 2)::integer`,
    [briefId],
  );
  return rows;
}

async function updateProjectEvidence(
  ctx: OrgContextLike,
  project: ProjectRow,
  brief: BriefRow,
  legacyProductCode: string | null,
  v08Status: string,
): Promise<void> {
  const evidenceNote = [
    project.notes,
    `T-033 brief_to_fa_audit legacy alias: brief ${brief.brief_id} completed for project; V08=${v08Status}; legacy_product_code=${legacyProductCode ?? 'null'}.`,
  ]
    .filter(Boolean)
    .join('\n');

  await ctx.client.query(
    `update public.npd_projects
        set name = coalesce($1, name),
            notes = $2,
            product_code = null
      where id = $3::uuid
        and org_id = app.current_org_id()`,
    [brief.product_name, evidenceNote, project.id],
  );
}

async function markBriefConverted(ctx: OrgContextLike, briefId: string): Promise<void> {
  await ctx.client.query(
    `update public.brief
        set status = 'converted',
            converted_at = now(),
            converted_by_user = $2::uuid
      where brief_id = $1::uuid
        and org_id = app.current_org_id()
        and status = 'complete'`,
    [briefId, ctx.userId],
  );
}

async function writeOutboxEvents(
  ctx: OrgContextLike,
  brief: BriefRow,
  projectId: string,
  legacyProductCode: string | null,
  v08Status: string,
): Promise<void> {
  const basePayload = {
    org_id: ctx.orgId,
    actor_user_id: ctx.userId,
    brief_id: brief.brief_id,
    npd_project_id: projectId,
    legacy_product_code: legacyProductCode,
    v08_status: v08Status,
    fa_alias_legacy_only: true,
  };
  await writeOutbox(ctx, {
    eventType: BRIEF_CONVERTED_EVENT,
    aggregateType: 'brief',
    aggregateId: brief.brief_id,
    payload: basePayload,
    dedupKey: `${BRIEF_CONVERTED_EVENT}:${brief.brief_id}`,
  });
  await writeOutbox(ctx, {
    eventType: BRIEF_COMPLETED_EVENT,
    aggregateType: 'brief',
    aggregateId: brief.brief_id,
    payload: basePayload,
    dedupKey: `${BRIEF_COMPLETED_EVENT}:${brief.brief_id}`,
  });
  await writeOutbox(ctx, {
    eventType: PROJECT_BRIEF_MAPPED_EVENT,
    aggregateType: 'npd_project',
    aggregateId: projectId,
    payload: basePayload,
    dedupKey: `${PROJECT_BRIEF_MAPPED_EVENT}:${projectId}:${brief.brief_id}`,
  });
}

async function writeOutbox(
  ctx: OrgContextLike,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    dedupKey: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, $2, $3, $4::jsonb, $5, $6)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload),
      APP_VERSION,
      event.dedupKey,
    ],
  );
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

class GateError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = 'GateError';
    this.code = code;
  }
}
