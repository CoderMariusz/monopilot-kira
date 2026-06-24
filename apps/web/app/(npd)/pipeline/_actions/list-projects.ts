'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  PROJECT_VIEW_PERMISSION,
  type OrgContextLike,
  type ProjectGate,
  type ProjectPriority,
  type ProjectRow,
  type ProjectSummary,
  hasPermission,
  mapProjectRow,
  normalizeSearch,
  parseGate,
  parsePriority,
  trimOptionalString,
} from './shared';

export type ListProjectsInput = {
  gate?: ProjectGate | null;
  owner?: string | null;
  prio?: ProjectPriority | null;
  search?: string | null;
};

export type ListProjectsResult =
  | { ok: true; data: { projects: ProjectSummary[] } }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

export async function listProjects(rawInput: unknown = {}): Promise<ListProjectsResult> {
  const input = parseListProjectsInput(rawInput);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  try {
    return await withOrgContext<ListProjectsResult>(async (ctx): Promise<ListProjectsResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, PROJECT_VIEW_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      const { rows } = await context.client.query<ProjectRow>(
        `select p.id,
                p.code,
                p.name,
                p.type,
                p.current_gate,
                p.current_stage,
                p.prio,
                p.owner,
                p.target_launch::text as target_launch,
                p.notes,
                p.created_at::text as created_at,
                count(gci.id)::text as checklist_total,
                count(gci.id) filter (
                  where case
                    when done.dept is null then gci.completed_at is not null
                    else coalesce(done.closed_value, '') = 'Yes'
                  end
                )::text as checklist_completed,
                c.id as closeout_id,
                c.trial_shelf_life_set,
                c.trial_allergens_cascade_recomputed_at::text as trial_allergens_cascade_recomputed_at,
                c.pilot_wo_id::text as pilot_wo_id,
                c.handoff_g4_esign_id::text as handoff_g4_esign_id,
                c.handoff_bom_header_id::text as handoff_bom_header_id,
                c.packaging_mrp_complete
           from public.npd_projects p
           left join public.gate_checklist_items gci
             on gci.project_id = p.id
            and gci.org_id = app.current_org_id()
           left join lateral (
             select closure.dept, closure.closed_value
               from public.product pfa
               cross join (values
                 ('Core', pfa.closed_core),
                 ('Planning', pfa.closed_planning),
                 ('Commercial', pfa.closed_commercial),
                 ('Production', pfa.closed_production),
                 ('Technical', pfa.closed_technical),
                 ('MRP', pfa.closed_mrp),
                 ('Procurement', pfa.closed_procurement)
              ) as closure(dept, closed_value)
              where pfa.org_id = app.current_org_id()
                and pfa.product_code = p.product_code
                and gci.item_text like ('Done\\_' || closure.dept || ':%') escape $$\$$
              limit 1
           ) done on true
           left join public.npd_legacy_closeout c
             on c.npd_project_id = p.id
            and c.org_id = app.current_org_id()
          where p.org_id = app.current_org_id()
            and ($1::text is null or p.current_gate = $1)
            and ($2::text is null or p.owner = $2)
            and ($3::text is null or p.prio = $3)
            and (
              $4::text is null
              or p.name ilike '%' || $4 || '%'
              or p.code ilike '%' || $4 || '%'
            )
          group by p.id, c.id, c.trial_shelf_life_set, c.trial_allergens_cascade_recomputed_at,
                   c.pilot_wo_id, c.handoff_g4_esign_id, c.handoff_bom_header_id,
                   c.packaging_mrp_complete
          order by p.created_at desc, p.code desc`,
        [input.gate, input.owner, input.prio, input.search],
      );

      return { ok: true, data: { projects: rows.map(mapProjectRow) } };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

function parseListProjectsInput(rawInput: unknown): ListProjectsInput | null {
  if (rawInput === undefined || rawInput === null) return {};
  if (typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const input = rawInput as Record<string, unknown>;
  const gate = parseGate(input.gate);
  const owner = trimOptionalString(input.owner, 120);
  const prio = input.prio === undefined || input.prio === null || input.prio === '' ? null : parsePriority(input.prio);
  const search = normalizeSearch(input.search);

  if (gate === null && input.gate !== undefined && input.gate !== null && input.gate !== '') return null;
  if (owner === undefined || prio === null && input.prio !== undefined && input.prio !== null && input.prio !== '') return null;
  if (search === undefined) return null;

  return { gate, owner, prio, search };
}
