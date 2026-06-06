'use server';

import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  DEFAULT_TEMPLATE_ID,
  PROJECT_CODE_SEQUENCE,
  PROJECT_CREATE_PERMISSION,
  PROJECT_CREATED_EVENT,
  type OrgContextLike,
  type ProjectPriority,
  hasPermission,
  parseOptionalNonNegNumber,
  parsePriority,
  parseStartFrom,
  parseTargetLaunch,
  trimOptionalString,
} from './shared';

export type CreateProjectInput = {
  name: string;
  /** Category (project.jsx wizard "Category" select). Stored in npd_projects.type. */
  type: string;
  prio?: ProjectPriority;
  owner?: string | null;
  targetLaunch?: string | null;
  notes?: string | null;
  // Brief step (folded in — mig 242). All optional.
  packFormat?: string | null;
  salesChannel?: string | null;
  expectedVolume?: string | null;
  targetRetailPriceEur?: number | null;
  targetAudience?: string | null;
  marketingClaims?: string | null;
  constraints?: string | null;
  // Starting point step.
  startFrom: 'blank' | 'clone' | 'template';
  cloneSource?: string | null;
  templateId: string;
};

export type CreateProjectResult =
  | {
      ok: true;
      data: {
        id: string;
        code: string;
        checklistItemsSeeded: number;
        outboxEventType: typeof PROJECT_CREATED_EVENT;
      };
    }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

type ProjectInsertRow = {
  id: string;
  code: string;
};

type CountRow = {
  inserted_count: string | number;
};

export async function createProject(rawInput: unknown): Promise<CreateProjectResult> {
  const input = parseCreateProjectInput(rawInput);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  try {
    return await withOrgContext<CreateProjectResult>(async (ctx): Promise<CreateProjectResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, PROJECT_CREATE_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      const code = await allocateProjectCode(context);
      const { rows } = await context.client.query<ProjectInsertRow>(
        `insert into public.npd_projects
           (org_id, code, name, type, prio, owner, target_launch, notes,
            pack_format, sales_channel, expected_volume, target_retail_price_eur,
            target_audience, marketing_claims, constraints,
            current_gate, current_stage, start_from, clone_source, created_by_user, app_version)
         values
           ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8,
            $9, $10, $11, $12::numeric,
            $13, $14, $15,
            'G0', 'brief', $16, $17, $18::uuid, 'npd-project-actions-v1')
         returning id, code`,
        [
          context.orgId,
          code,
          input.name,
          input.type,
          input.prio,
          input.owner,
          input.targetLaunch,
          input.notes,
          input.packFormat ?? null,
          input.salesChannel ?? null,
          input.expectedVolume ?? null,
          input.targetRetailPriceEur ?? null,
          input.targetAudience ?? null,
          input.marketingClaims ?? null,
          input.constraints ?? null,
          input.startFrom,
          input.cloneSource ?? null,
          context.userId,
        ],
      );
      const project = rows[0];
      if (!project) return { ok: false, error: 'PERSISTENCE_FAILED' };

      const seeded = await seedChecklistItems(context, project.id, input.templateId);
      await writeProjectCreatedOutbox(context, project.id, project.code, input, seeded);
      safeRevalidatePath('/pipeline');

      return {
        ok: true,
        data: {
          id: project.id,
          code: project.code,
          checklistItemsSeeded: seeded,
          outboxEventType: PROJECT_CREATED_EVENT,
        },
      };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

function parseCreateProjectInput(rawInput: unknown): CreateProjectInput | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const input = rawInput as Record<string, unknown>;
  const name = trimOptionalString(input.name, 160);
  const type = trimOptionalString(input.type, 120);
  const prio = parsePriority(input.prio);
  const owner = trimOptionalString(input.owner, 120);
  const targetLaunch = parseTargetLaunch(input.targetLaunch);
  const notes = trimOptionalString(input.notes, 2000);
  const templateId = trimOptionalString(input.templateId, 80) ?? DEFAULT_TEMPLATE_ID;

  // Brief step — all optional (undefined === over-length/invalid → reject).
  const packFormat = trimOptionalString(input.packFormat, 160);
  const salesChannel = trimOptionalString(input.salesChannel, 80);
  const expectedVolume = trimOptionalString(input.expectedVolume, 120);
  const targetAudience = trimOptionalString(input.targetAudience, 400);
  const marketingClaims = trimOptionalString(input.marketingClaims, 600);
  const constraints = trimOptionalString(input.constraints, 2000);
  const targetRetailPriceEur = parseOptionalNonNegNumber(input.targetRetailPriceEur);
  const startFrom = parseStartFrom(input.startFrom);
  const cloneSource = trimOptionalString(input.cloneSource, 120);

  if (
    !name || !type || !prio || !templateId ||
    owner === undefined || targetLaunch === undefined || notes === undefined ||
    packFormat === undefined || salesChannel === undefined || expectedVolume === undefined ||
    targetAudience === undefined || marketingClaims === undefined || constraints === undefined ||
    targetRetailPriceEur === undefined || cloneSource === undefined
  ) {
    return null;
  }

  return {
    name, type, prio, owner, targetLaunch, notes,
    packFormat, salesChannel, expectedVolume, targetRetailPriceEur,
    targetAudience, marketingClaims, constraints,
    startFrom, cloneSource, templateId,
  };
}

async function allocateProjectCode(ctx: OrgContextLike): Promise<string> {
  for (let attempts = 0; attempts < 999; attempts += 1) {
    const { rows } = await ctx.client.query<{ next_value: string }>(
      `insert into public.org_sequences (org_id, seq_name, current_value, updated_at)
       values ($1::uuid, $2, 1, now())
       on conflict (org_id, seq_name) do update
          set current_value = public.org_sequences.current_value + 1,
              updated_at = now()
        where public.org_sequences.current_value < 999
       returning current_value::text as next_value`,
      [ctx.orgId, PROJECT_CODE_SEQUENCE],
    );
    const nextValue = Number(rows[0]?.next_value);
    if (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 999) {
      throw new Error('NPD project code sequence exhausted');
    }

    const code = `NPD-${String(nextValue).padStart(3, '0')}`;
    const existing = await ctx.client.query<{ id: string }>(
      `select id
         from public.npd_projects
        where org_id = app.current_org_id()
          and code = $1
        limit 1`,
      [code],
    );
    if (existing.rows.length === 0) return code;
  }

  throw new Error('Unable to allocate an unused NPD project code');
}

async function seedChecklistItems(ctx: OrgContextLike, projectId: string, templateId: string): Promise<number> {
  const { rows } = await ctx.client.query<CountRow>(
    `with inserted as (
       insert into public.gate_checklist_items
         (org_id, project_id, gate_code, category_code, item_text, required)
       select $1::uuid, $2::uuid, template.gate_code, template.category_code, template.item_text, template.required
         from "Reference"."GateChecklistTemplates" template
        where template.org_id = app.current_org_id()
          and template.template_id = $3
        order by template.gate_code, template.sequence
       returning id
     )
     select count(*)::text as inserted_count from inserted`,
    [ctx.orgId, projectId, templateId],
  );
  return Number(rows[0]?.inserted_count ?? 0);
}

async function writeProjectCreatedOutbox(
  ctx: OrgContextLike,
  projectId: string,
  code: string,
  input: CreateProjectInput,
  checklistItemsSeeded: number,
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       ($1::uuid, $2, 'npd_project', $3, $4::jsonb, 'npd-project-actions-v1', $5)`,
    [
      ctx.orgId,
      PROJECT_CREATED_EVENT,
      projectId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        project_id: projectId,
        code,
        name: input.name,
        type: input.type,
        prio: input.prio,
        checklist_items_seeded: checklistItemsSeeded,
      }),
      `${PROJECT_CREATED_EVENT}:${projectId}`,
    ],
  );
}
