'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  propagateTemplateSchema,
  type CategoryCode,
  type GateCode,
} from './checklist-template-schema';
import { hasNpdSchemaEdit, type OrgContextLike } from './checklist-template-auth';
import { writeChecklistTemplateAudit } from './checklist-template-audit';

type PropagateResult =
  | { ok: true; projectsTouched: number; itemsInserted: number; itemsUpdated: number; itemsDeleted: number }
  | { ok: false; code: 'invalid_input' | 'forbidden' | 'persistence_failed' };

type TemplateRow = {
  gate_code: GateCode;
  sequence: number;
  category_code: CategoryCode;
  item_text: string;
  required: boolean;
};

type ProjectRow = { id: string };

type ProjectItemRow = {
  id: string;
  gate_code: GateCode;
  category_code: CategoryCode;
  item_text: string;
  required: boolean;
  completed_at: string | null;
  ord: number;
};

/**
 * OPEN projects = still in the NPD pipeline (not terminal).
 *
 * `npd_projects` has no cancelled/closed status column — terminated projects are
 * `current_stage = 'launched'` / `current_gate = 'Launched'`; hard-deleted projects
 * are absent from the table. Propagate therefore targets every non-launched row.
 */
const OPEN_PROJECTS_SQL = `
  select id::text as id
    from public.npd_projects
   where org_id = app.current_org_id()
     and current_gate <> 'Launched'
     and current_stage <> 'launched'
`;

export async function propagateChecklistTemplates(input: unknown = {}): Promise<PropagateResult> {
  const parsed = propagateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false, code: 'forbidden' };
      }

      const templateId = parsed.data.templateId;

      const { rows: templates } = await context.client.query<TemplateRow>(
        `select gate_code, sequence, category_code, item_text, required
           from "Reference"."GateChecklistTemplates"
          where org_id = app.current_org_id()
            and template_id = $1
          order by gate_code, sequence`,
        [templateId],
      );

      const { rows: projects } = await context.client.query<ProjectRow>(OPEN_PROJECTS_SQL);

      let itemsInserted = 0;
      let itemsUpdated = 0;
      let itemsDeleted = 0;

      const templatesByGate = new Map<GateCode, TemplateRow[]>();
      for (const template of templates) {
        const bucket = templatesByGate.get(template.gate_code) ?? [];
        bucket.push(template);
        templatesByGate.set(template.gate_code, bucket);
      }

      for (const project of projects) {
        const { rows: projectItems } = await context.client.query<ProjectItemRow>(
          `select id::text as id,
                  gate_code,
                  category_code,
                  item_text,
                  required,
                  completed_at::text as completed_at,
                  row_number() over (
                    partition by gate_code
                    order by created_at, id
                  )::int as ord
             from public.gate_checklist_items
            where org_id = app.current_org_id()
              and project_id = $1::uuid
            order by gate_code, created_at, id`,
          [project.id],
        );

        const itemsByGate = new Map<GateCode, ProjectItemRow[]>();
        for (const item of projectItems) {
          const bucket = itemsByGate.get(item.gate_code) ?? [];
          bucket.push(item);
          itemsByGate.set(item.gate_code, bucket);
        }

        const matchedIds = new Set<string>();

        for (const [gateCode, gateTemplates] of templatesByGate) {
          const gateItems = itemsByGate.get(gateCode) ?? [];

          for (let index = 0; index < gateTemplates.length; index += 1) {
            const template = gateTemplates[index]!;
            const existing = gateItems[index];

            if (existing) {
              matchedIds.add(existing.id);
              const needsUpdate =
                existing.item_text !== template.item_text ||
                existing.required !== template.required ||
                existing.category_code !== template.category_code ||
                existing.gate_code !== template.gate_code;

              if (needsUpdate) {
                await context.client.query(
                  `update public.gate_checklist_items
                      set item_text = $2,
                          required = $3,
                          category_code = $4,
                          gate_code = $5
                    where id = $1::uuid
                      and org_id = app.current_org_id()
                      and project_id = $6::uuid`,
                  [
                    existing.id,
                    template.item_text,
                    template.required,
                    template.category_code,
                    template.gate_code,
                    project.id,
                  ],
                );
                itemsUpdated += 1;
              }
              continue;
            }

            await context.client.query(
              `insert into public.gate_checklist_items
                 (org_id, project_id, gate_code, category_code, item_text, required)
               values (app.current_org_id(), $1::uuid, $2, $3, $4, $5)`,
              [project.id, template.gate_code, template.category_code, template.item_text, template.required],
            );
            itemsInserted += 1;
          }
        }

        for (const item of projectItems) {
          if (matchedIds.has(item.id)) continue;
          if (item.completed_at !== null) continue;

          await context.client.query(
            `delete from public.gate_checklist_items
              where id = $1::uuid
                and org_id = app.current_org_id()
                and project_id = $2::uuid
                and completed_at is null`,
            [item.id, project.id],
          );
          itemsDeleted += 1;
        }
      }

      await writeChecklistTemplateAudit(context, 'npd.gate_checklist_template.propagated', {
        template_id: templateId,
        projects_touched: projects.length,
        items_inserted: itemsInserted,
        items_updated: itemsUpdated,
        items_deleted: itemsDeleted,
      });

      return {
        ok: true,
        projectsTouched: projects.length,
        itemsInserted,
        itemsUpdated,
        itemsDeleted,
      };
    });
  } catch (error) {
    console.error('[propagateChecklistTemplates] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'persistence_failed' };
  }
}
