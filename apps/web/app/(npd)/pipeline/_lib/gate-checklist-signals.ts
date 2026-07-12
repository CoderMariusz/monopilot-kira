import type { QueryClient } from '../_actions/shared';
import {
  buildGateChecklistAutoSignals,
  type GateChecklistAutoSignals,
} from './gate-checklist-auto-satisfy';

type GateChecklistSignalRow = {
  product_code: string | null;
  recipe_ingredient_count: number;
  has_locked_formulation: boolean;
  linked_bom_count: number;
};

export { buildGateChecklistAutoSignals };

/** Live project signals for gate-checklist auto-satisfy (shared by getProject + advance gate). */
export async function loadGateChecklistAutoSignals(
  client: QueryClient,
  projectId: string,
): Promise<GateChecklistAutoSignals> {
  const { rows } = await client.query<GateChecklistSignalRow>(
    `select p.product_code,
            (select count(fi.id)
               from public.formulations f
               join public.formulation_versions fv on fv.id = f.current_version_id
               join public.formulation_ingredients fi on fi.version_id = fv.id
              where f.org_id = app.current_org_id()
                and f.project_id = p.id)::int as recipe_ingredient_count,
            exists (
              select 1
                from public.formulations f
                join public.formulation_versions fv on fv.id = f.current_version_id
               where f.org_id = app.current_org_id()
                 and f.project_id = p.id
                 and fv.state = 'locked'
            ) as has_locked_formulation,
            (select count(bh.id)::int
               from public.bom_headers bh
              where bh.org_id = app.current_org_id()
                and bh.npd_project_id = p.id) as linked_bom_count
       from public.npd_projects p
      where p.org_id = app.current_org_id()
        and p.id = $1::uuid
      limit 1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) {
    return {
      hasLockedFormulation: false,
      hasFgCandidate: false,
      ingredientCount: 0,
      linkedBomCount: 0,
    };
  }
  return buildGateChecklistAutoSignals(row);
}
