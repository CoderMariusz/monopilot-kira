/**
 * 03-technical Cost History + Cost Edit page (TEC-050, T-050).
 *
 * Real Supabase-backed cost surface (org-scoped via withOrgContext + RLS). The
 * server component loads the item list + `technical.cost.edit` gate; the client
 * island renders the item picker, the cost-history sparkline + table, and the
 * cost-edit modal (which calls the real postCost Server Action with the >20%
 * variance approver gate). Loading / empty / error / permission-denied states
 * are all rendered (loading + per-item history are inside the client island).
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:633-692
 *     (`CostHistoryScreen`, TEC-015) — sparkline + Date/Source/Cost/Δ%/Reason table.
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *     (`CostingScreen`, TEC-013) — the cost edit/recompute CTA.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Dual ownership (Technical + Finance): Technical edits ONLY items.cost_per_kg +
 * item_cost_history; it never writes Finance standard-cost/valuation tables.
 * NUMERIC-exact: cost values are exact decimal strings, displayed without float.
 */

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';

import { listCostItems } from './_actions/list-cost-items';
import { CostManager } from './_components/cost-manager.client';

export const dynamic = 'force-dynamic';

export default async function TechnicalCostPage() {
  const { items, canEdit, state } = await listCostItems();

  return (
    <main data-screen="technical-cost" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cost history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Timeline of cost-per-kg changes per item. Technical owns the master cost and its history (dual-owned
            with Finance) — changes above 20% require an approver.
          </p>
        </div>
      </header>

      {state === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          Unable to load items. Please try again.
        </div>
      ) : state === 'empty' ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardHeader className="space-y-1 px-6 py-6">
            <h2 className="text-lg font-semibold tracking-tight">No items yet</h2>
            <CardDescription className="text-sm text-muted-foreground">
              Create items in the Items master to record and track their cost history here.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <CostManager items={items} canEdit={canEdit} />
      )}
    </main>
  );
}
