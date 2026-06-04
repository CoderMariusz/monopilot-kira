'use server';

/**
 * T-089 — TEC-052 Cost Import from D365: page-load action.
 *
 * Spec-driven Wave0 surface (PRD §0/§5/§17). OPTIONAL integration (R15
 * anti-corruption): D365 is NEVER the system of record and never blocks factory
 * release. Local `item_cost_history` (TEC-050) is the source of truth.
 *
 * Consumes the EXISTING D365 lib:
 *   - `isD365Enabled` (lib/integrations/d365/gate.ts) for the connector toggle +
 *     the disabled-state banner (V-TEC-70).
 *   - `hasD365SyncPermission` (lib/integrations/d365/rbac.ts,
 *     `technical.d365.sync_trigger`) to gate the import trigger.
 *
 * The diff preview compares the current ACTIVE local cost (items.cost_per_kg /
 * the open item_cost_history row) against the most recent INCOMING D365 snapshot
 * recorded by the pull worker (item_cost_history rows tagged source='d365_sync'
 * that are NOT the active row). Δ% is computed in SQL NUMERIC space — no JS float
 * touches a cost. Applying an import NEVER overwrites in place; it appends a new
 * cost entry (handled by the existing postCost path, source='d365_sync').
 *
 * Read-only, org-scoped via withOrgContext + RLS. No mocks. FG canonical.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { isD365Enabled } from '../../../../../../../../lib/integrations/d365/gate';
import { hasD365SyncPermission } from '../../../../../../../../lib/integrations/d365/rbac';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type CostDiffRow = {
  itemId: string;
  itemCode: string;
  name: string;
  /** current active local cost — NUMERIC as string (exact, never float). */
  current: string | null;
  /** most recent incoming D365 snapshot cost — NUMERIC as string. */
  incoming: string | null;
  /** signed percent delta (incoming vs current) — NUMERIC as string; null when current is 0/absent. */
  deltaPct: string | null;
  /** true when |Δ%| >= 5 — requires Technical sign-off before apply. */
  needsSignoff: boolean;
  source: string | null;
};

export type LoadD365CostImportResult =
  | {
      ok: true;
      d365Enabled: boolean;
      canTrigger: boolean;
      state: 'ready' | 'empty';
      rows: CostDiffRow[];
      counts: { changed: number; over5: number; same: number };
    }
  | { ok: true; d365Enabled: false; canTrigger: false; state: 'disabled'; rows: []; counts: { changed: 0; over5: 0; same: 0 } }
  | { ok: false; state: 'error' };

type DiffDbRow = {
  item_id: string;
  item_code: string;
  name: string;
  current_cost: string | null;
  incoming_cost: string | null;
  delta_pct: string | null;
  source: string | null;
};

export async function loadD365CostImport(): Promise<LoadD365CostImportResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LoadD365CostImportResult> => {
      const qc = client as QueryClient;

      const [enabled, canTrigger] = await Promise.all([
        isD365Enabled(qc),
        hasD365SyncPermission(qc, userId, orgId),
      ]);

      if (!enabled) {
        // Disabled state must keep the rest of Technical usable; show the banner
        // and surface NO diff (cost import unavailable, never blocking release).
        return {
          ok: true,
          d365Enabled: false,
          canTrigger: false,
          state: 'disabled',
          rows: [],
          counts: { changed: 0, over5: 0, same: 0 },
        };
      }

      // Build the diff: current active cost vs the most recent d365_sync snapshot
      // that is NOT the active row. Δ% computed NUMERIC-exact in SQL.
      const { rows } = await qc.query<DiffDbRow>(
        `with active_cost as (
            select distinct on (ch.item_id)
                   ch.item_id, ch.cost_per_kg as cost
              from public.item_cost_history ch
             where ch.org_id = app.current_org_id()
               and ch.effective_to is null
             order by ch.item_id, ch.effective_from desc
          ),
          incoming as (
            select distinct on (ch.item_id)
                   ch.item_id, ch.cost_per_kg as cost, ch.source, ch.effective_from
              from public.item_cost_history ch
             where ch.org_id = app.current_org_id()
               and ch.source = 'd365_sync'
               and ch.effective_to is not null
             order by ch.item_id, ch.effective_from desc
          )
          select i.id as item_id,
                 i.item_code,
                 i.name,
                 ac.cost::text as current_cost,
                 inc.cost::text as incoming_cost,
                 case
                   when ac.cost is not null and ac.cost <> 0 and inc.cost is not null
                   then round(((inc.cost - ac.cost) / ac.cost) * 100, 2)::text
                   else null
                 end as delta_pct,
                 inc.source
            from public.items i
            join incoming inc on inc.item_id = i.id
            left join active_cost ac on ac.item_id = i.id
           where i.org_id = app.current_org_id()
           order by i.item_code asc`,
      );

      const diffRows: CostDiffRow[] = rows.map((r) => {
        const deltaAbs = r.delta_pct != null ? Math.abs(Number(r.delta_pct)) : 0;
        return {
          itemId: String(r.item_id),
          itemCode: r.item_code,
          name: r.name,
          current: r.current_cost,
          incoming: r.incoming_cost,
          deltaPct: r.delta_pct,
          needsSignoff: deltaAbs >= 5,
          source: r.source,
        };
      });

      const changed = diffRows.filter((r) => r.deltaPct != null && Number(r.deltaPct) !== 0).length;
      const over5 = diffRows.filter((r) => r.needsSignoff).length;
      const same = diffRows.filter((r) => r.deltaPct != null && Number(r.deltaPct) === 0).length;

      return {
        ok: true,
        d365Enabled: true,
        canTrigger,
        state: diffRows.length ? 'ready' : 'empty',
        rows: diffRows,
        counts: { changed, over5, same },
      };
    });
  } catch (error) {
    console.error('[technical/costs/d365-import] loadD365CostImport failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, state: 'error' };
  }
}
