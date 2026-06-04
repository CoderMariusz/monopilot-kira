'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

const BRIEF_CREATE_PERMISSION = 'brief.create';
const BRIEF_CREATED_EVENT = 'brief.created';
const PROJECT_CREATED_EVENT = 'npd.project.created';
const APP_VERSION = 'brief-actions-v1';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type BriefTemplate = 'single_component' | 'multi_component';
type ExistingBriefRow = {
  brief_id: string;
  npd_project_id: string | null;
  dev_code: string;
};

export type CreateBriefResult = {
  ok: true;
  briefId: string;
  npdProjectId: string;
  devCode: string;
};

const createBriefSchema = z.object({
  template: z.enum(['single_component', 'multi_component']),
  devCode: z.string().regex(/^DEV(?:\d{2}|\d{4})-\d+$/),
});

export async function createBrief(template: BriefTemplate, devCode: string): Promise<CreateBriefResult> {
  const parsed = createBriefSchema.safeParse({ template, devCode });
  if (!parsed.success) throw new ValidationError('DEV_CODE_FORMAT');

  return withOrgContext<CreateBriefResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    if (!(await hasPermission(context, BRIEF_CREATE_PERMISSION))) {
      throw new ValidationError('FORBIDDEN');
    }

    const existing = await findExistingBrief(context.client, parsed.data.devCode);
    const briefId = existing?.brief_id ?? (await insertBrief(context, parsed.data.template, parsed.data.devCode));
    await ensureInitialProductLine(context, briefId, parsed.data.devCode);

    const npdProjectId =
      existing?.npd_project_id ?? (await upsertNpdProject(context, parsed.data.template, parsed.data.devCode));
    if (!existing?.npd_project_id) {
      await linkBriefToProject(context.client, briefId, npdProjectId);
    }

    await writeOutbox(context, {
      eventType: BRIEF_CREATED_EVENT,
      aggregateType: 'brief',
      aggregateId: briefId,
      payload: {
        org_id: context.orgId,
        actor_user_id: context.userId,
        brief_id: briefId,
        npd_project_id: npdProjectId,
        template: parsed.data.template,
        dev_code: parsed.data.devCode,
      },
      dedupKey: `${BRIEF_CREATED_EVENT}:${briefId}`,
    });
    await writeOutbox(context, {
      eventType: PROJECT_CREATED_EVENT,
      aggregateType: 'npd_project',
      aggregateId: npdProjectId,
      payload: {
        org_id: context.orgId,
        actor_user_id: context.userId,
        project_id: npdProjectId,
        brief_id: briefId,
        code: parsed.data.devCode,
        current_gate: 'G0',
        current_stage: 'brief',
      },
      dedupKey: `${PROJECT_CREATED_EVENT}:${npdProjectId}`,
    });

    safeRevalidatePath('/npd/brief');
    return { ok: true, briefId, npdProjectId, devCode: parsed.data.devCode };
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

async function findExistingBrief(client: QueryClient, devCode: string): Promise<ExistingBriefRow | null> {
  const { rows } = await client.query<ExistingBriefRow>(
    `select brief_id, npd_project_id, dev_code
       from public.brief
      where org_id = app.current_org_id()
        and dev_code = $1
      limit 1`,
    [devCode],
  );
  return rows[0] ?? null;
}

async function insertBrief(ctx: OrgContextLike, template: BriefTemplate, devCode: string): Promise<string> {
  const { rows } = await ctx.client.query<{ brief_id: string }>(
    `insert into public.brief
       (org_id, template, dev_code, status, created_by_user, app_version)
     values
       (app.current_org_id(), $1, $2, 'draft', $3::uuid, $4)
     returning brief_id`,
    [template, devCode, ctx.userId, APP_VERSION],
  );
  const briefId = rows[0]?.brief_id;
  if (!briefId) throw new Error('brief insert returned no id');
  return briefId;
}

async function ensureInitialProductLine(ctx: OrgContextLike, briefId: string, devCode: string): Promise<void> {
  await ctx.client.query(
    `insert into public.brief_lines
       (brief_id, org_id, line_type, line_index, dev_code)
     values
       ($1::uuid, app.current_org_id(), 'product', 0, $2)
     on conflict (brief_id, line_type, line_index) do nothing`,
    [briefId, devCode],
  );
}

async function upsertNpdProject(ctx: OrgContextLike, template: BriefTemplate, devCode: string): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.npd_projects
       (org_id, code, name, type, current_gate, current_stage, prio, start_from, created_by_user, app_version)
     values
       (app.current_org_id(), $1, $1, $2, 'G0', 'brief', 'normal', 'blank', $3::uuid, $4)
     on conflict (org_id, code) do update
       set code = excluded.code
     returning id`,
    [devCode, template, ctx.userId, APP_VERSION],
  );
  const projectId = rows[0]?.id;
  if (!projectId) throw new Error('npd project insert returned no id');
  return projectId;
}

async function linkBriefToProject(client: QueryClient, briefId: string, npdProjectId: string): Promise<void> {
  await client.query(
    `update public.brief
        set npd_project_id = $1::uuid
      where brief_id = $2::uuid
        and org_id = app.current_org_id()`,
    [npdProjectId, briefId],
  );
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

class ValidationError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ValidationError';
    this.code = code;
  }
}
