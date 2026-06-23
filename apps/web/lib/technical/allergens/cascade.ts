/**
 * T-024 — Allergen cascade rule HANDLER (Technical full cascade).
 *
 * Deployed policy lives in public.rule_definitions (migration 170,
 * rule_code='technical.allergen_cascade'); THIS module is the runtime that
 * executes the contract:
 *
 *   trigger : a raw-material / intermediate item's allergen profile changes.
 *   compute : for every ACTIVE BOM whose product (FG or intermediate) transitively
 *             contains the changed component, aggregate the cascaded allergen set =
 *               UNION( component allergens via bom_lines.item_id -> item_allergen_profiles,
 *                      manufacturing-operation additions via bom_lines.manufacturing_operation_name )
 *             and UPSERT source='cascaded' rows onto the parent item's profile.
 *   protect : NEVER overwrite a source='manual_override' row (V-TEC-42). A cascaded
 *             write to an allergen_code already carrying a manual override is skipped,
 *             and the cascade source is preserved (the override stays the current value).
 *
 * RED LINES (task T-024):
 *   - never overwrite source='manual_override' rows;
 *   - do NOT run synchronously in an API request path — this handler is invoked by
 *     the worker/cascade engine cycle (it takes a client bound to an org context);
 *   - item_type lives on items, NOT item_allergen_profiles — join via item_id.
 *
 * The handler is org-scoped: it runs inside an org context (app.current_org_id())
 * and operates only on the caller org's rows under RLS. It is idempotent — a second
 * run with no source change writes nothing new.
 */

import type { QueryClient } from './shared';

export type CascadeResult = {
  /** parent item_ids whose cascaded set was (re)computed */
  affectedParentItemIds: string[];
  /** number of cascaded profile rows upserted */
  cascadedRowsWritten: number;
  /** allergen codes skipped because the parent carried a manual_override */
  overridesPreserved: number;
  /** wall-clock ms for the cascade (KPI: <= 5000) */
  durationMs: number;
};

type CascadedAllergen = { allergenCode: string; intensity: string; confidence: string };

const INTENSITY_RANK: Record<string, number> = { contains: 3, may_contain: 2, trace: 1 };
const CONFIDENCE_RANK: Record<string, number> = { tested: 3, declared: 2, assumed: 1 };

/**
 * Recompute and persist the cascaded allergen set for every parent that
 * transitively consumes `changedItemId`. Returns a summary incl. duration for
 * the KPI assertion. Pass `orgId` only for typing symmetry — RLS already scopes
 * every query to app.current_org_id().
 */
export async function cascadeAllergensForChangedItem(
  client: QueryClient,
  orgId: string,
  changedItemId: string,
): Promise<CascadeResult> {
  const start = Date.now();

  // 1. Find all ancestor (parent) items that transitively contain the changed
  //    component through ACTIVE BOMs. bom_headers.product_id = parent item_code;
  //    bom_lines.item_id = component item. Walk upward (component -> parents).
  const { rows: ancestors } = await client.query<{ item_id: string }>(
    `with recursive parents as (
        -- direct parents: active BOMs that contain the changed item as a line
        select p.id as item_id
          from public.bom_lines bl
          join public.bom_headers bh
            on bh.id = bl.bom_header_id and bh.org_id = bl.org_id
          join public.items p
            on p.org_id = bh.org_id and p.item_code = bh.product_id
         where bl.org_id = app.current_org_id()
           and bl.item_id = $1::uuid
           and bh.status = 'active'
      union
        -- transitive parents: a parent that is itself a component of another active BOM
        select p2.id as item_id
          from parents pr
          join public.bom_lines bl2
            on bl2.item_id = pr.item_id and bl2.org_id = app.current_org_id()
          join public.bom_headers bh2
            on bh2.id = bl2.bom_header_id and bh2.org_id = bl2.org_id
          join public.items p2
            on p2.org_id = bh2.org_id and p2.item_code = bh2.product_id
         where bh2.status = 'active'
     )
     select distinct item_id from parents`,
    [changedItemId],
  );

  const parentIds = ancestors.map((a) => a.item_id);
  let cascadedRowsWritten = 0;
  let overridesPreserved = 0;

  // Recompute bottom-up is unnecessary for a single-cycle correctness guarantee
  // because each parent's set is computed from its OWN active BOM's direct
  // component profiles (which already reflect the cascaded child rows once the
  // child is processed). We sort parents so intermediates are written before the
  // FGs that consume them within this cycle.
  const ordered = await orderParentsBottomUp(client, parentIds);

  for (const parentItemId of ordered) {
    const computed = await computeCascadedSet(client, parentItemId);

    for (const a of computed) {
      // Protect manual overrides: if the parent already carries a manual_override
      // for this allergen_code, the cascaded write is skipped (source preserved).
      const { rows: existing } = await client.query<{ source: string }>(
        `select source from public.item_allergen_profiles
          where org_id = app.current_org_id() and item_id = $1::uuid and allergen_code = $2`,
        [parentItemId, a.allergenCode],
      );
      if (existing[0]?.source === 'manual_override') {
        overridesPreserved += 1;
        continue;
      }

      await client.query(
        `insert into public.item_allergen_profiles
           (org_id, item_id, allergen_code, source, intensity, confidence)
         values (app.current_org_id(), $1::uuid, $2, 'cascaded', $3, $4)
         on conflict (org_id, item_id, allergen_code) do update
           set source = 'cascaded',
               intensity = excluded.intensity,
               confidence = excluded.confidence,
               declared_at = pg_catalog.now()
           where public.item_allergen_profiles.source <> 'manual_override'`,
        [parentItemId, a.allergenCode, a.intensity, a.confidence],
      );
      cascadedRowsWritten += 1;
    }
  }

  return {
    affectedParentItemIds: ordered,
    cascadedRowsWritten,
    overridesPreserved,
    durationMs: Date.now() - start,
  };
}

/**
 * Compute the cascaded allergen set for ONE parent item from its active BOM:
 *   UNION( component allergen profiles , manufacturing-op additions on the line ).
 * Highest intensity / confidence wins per allergen_code.
 */
async function computeCascadedSet(client: QueryClient, parentItemId: string): Promise<CascadedAllergen[]> {
  const { rows } = await client.query<{
    allergen_code: string;
    intensity: string | null;
    confidence: string | null;
  }>(
    `with active_bom as (
        select bh.id as bom_header_id
          from public.bom_headers bh
          join public.items p on p.org_id = bh.org_id and p.item_code = bh.product_id
         where bh.org_id = app.current_org_id()
           and p.id = $1::uuid
           and bh.status = 'active'
         order by bh.version desc
         limit 1
     ),
     -- (a) allergens carried by the BOM's components
     component_allergens as (
        select iap.allergen_code, iap.intensity, iap.confidence
          from active_bom ab
          join public.bom_lines bl
            on bl.bom_header_id = ab.bom_header_id and bl.org_id = app.current_org_id()
          join public.items component
            on component.org_id = bl.org_id
           and component.id = bl.item_id
           and component.item_type <> 'packaging'
          join public.item_allergen_profiles iap
            on iap.org_id = app.current_org_id() and iap.item_id = bl.item_id
         where bl.item_id is not null
     ),
     -- (b) allergens ADDED by the manufacturing operations used on the BOM lines
     process_allergens as (
        select moa.allergen_code, 'contains'::text as intensity, 'declared'::text as confidence
          from active_bom ab
          join public.bom_lines bl
            on bl.bom_header_id = ab.bom_header_id and bl.org_id = app.current_org_id()
          left join public.items component
            on component.org_id = bl.org_id
           and component.id = bl.item_id
          join public.manufacturing_operation_allergen_additions moa
            on moa.org_id = app.current_org_id()
           and moa.manufacturing_operation_name = bl.manufacturing_operation_name
         where bl.manufacturing_operation_name is not null
           and (bl.item_id is null or component.item_type <> 'packaging')
     )
     select allergen_code, intensity, confidence from component_allergens
     union all
     select allergen_code, intensity, confidence from process_allergens`,
    [parentItemId],
  );

  // Reduce to one row per allergen_code, keeping the strongest intensity/confidence.
  const byCode = new Map<string, CascadedAllergen>();
  for (const r of rows) {
    const code = r.allergen_code;
    const intensity = r.intensity ?? 'contains';
    const confidence = r.confidence ?? 'declared';
    const prev = byCode.get(code);
    if (!prev) {
      byCode.set(code, { allergenCode: code, intensity, confidence });
      continue;
    }
    const intensityWins = (INTENSITY_RANK[intensity] ?? 0) > (INTENSITY_RANK[prev.intensity] ?? 0);
    const confidenceWins = (CONFIDENCE_RANK[confidence] ?? 0) > (CONFIDENCE_RANK[prev.confidence] ?? 0);
    byCode.set(code, {
      allergenCode: code,
      intensity: intensityWins ? intensity : prev.intensity,
      confidence: confidenceWins ? confidence : prev.confidence,
    });
  }
  return [...byCode.values()];
}

/**
 * Order parents so that an item that is a component of another listed parent is
 * processed FIRST (intermediates before the FG that consumes them). Simple
 * topological pass over the active-BOM component edges restricted to the parent
 * set; falls back to input order on a cycle (BOMs are acyclic by construction).
 */
async function orderParentsBottomUp(client: QueryClient, parentIds: string[]): Promise<string[]> {
  if (parentIds.length <= 1) return parentIds;

  // edges: child -> parent within the candidate set (active BOMs only)
  const { rows: edges } = await client.query<{ child_item_id: string; parent_item_id: string }>(
    `select distinct bl.item_id as child_item_id, p.id as parent_item_id
       from public.bom_lines bl
       join public.bom_headers bh on bh.id = bl.bom_header_id and bh.org_id = bl.org_id
       join public.items p on p.org_id = bh.org_id and p.item_code = bh.product_id
      where bl.org_id = app.current_org_id()
        and bh.status = 'active'
        and bl.item_id = any($1::uuid[])
        and p.id = any($1::uuid[])`,
    [parentIds],
  );

  const set = new Set(parentIds);
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const id of set) indegree.set(id, 0);
  for (const e of edges) {
    if (!set.has(e.child_item_id) || !set.has(e.parent_item_id)) continue;
    children.set(e.child_item_id, [...(children.get(e.child_item_id) ?? []), e.parent_item_id]);
    indegree.set(e.parent_item_id, (indegree.get(e.parent_item_id) ?? 0) + 1);
  }

  const queue = [...set].filter((id) => (indegree.get(id) ?? 0) === 0);
  const out: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    out.push(n);
    for (const p of children.get(n) ?? []) {
      indegree.set(p, (indegree.get(p) ?? 0) - 1);
      if ((indegree.get(p) ?? 0) === 0) queue.push(p);
    }
  }
  // Append any nodes left out by a cycle (defensive — should not happen).
  for (const id of set) if (!out.includes(id)) out.push(id);
  return out;
}
