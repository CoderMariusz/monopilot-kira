/**
 * 03-technical Routing list + edit (TEC-060, T-051) and Routing cost preview +
 * resource utilization (TEC-062, T-052) page.
 *
 * Real Supabase-backed (org-scoped via withOrgContext + RLS). The server
 * component loads the item list + line/machine/operation references + the
 * routing RBAC gates; the client island renders the item picker, the routing
 * version list, the create/edit modal (ordered operations bound to a real
 * line/machine FK and a manufacturing-operation name), and the NUMERIC-exact
 * cost preview + resource utilization view. Loading / empty / error /
 * permission-denied states are all rendered.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:4-34
 *     (`RoutingsScreen`) + other-screens.jsx:1270-1287 (product-detail Routing tab
 *     version list) — routing list.
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:271-304
 *     (`RoutingStepAddModal`) — the operation editor.
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *     (`CostingScreen`) — the cost breakdown / utilization panel.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';

import { listRoutingItems } from './_actions/list-routing-items';
import { RoutingsManager } from './_components/routings-manager.client';

export const dynamic = 'force-dynamic';

export default async function TechnicalRoutingsPage() {
  const { items, lines, machines, operationNames, canWrite, canApprove, state } = await listRoutingItems();

  return (
    <main data-screen="technical-routings" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Routings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ordered manufacturing operations per item, bound to lines and equipment. Preview the routing cost at a
            production volume and see resource utilization across operations.
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
              Create items in the Items master to author routings for them here.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <RoutingsManager
          items={items}
          lines={lines}
          machines={machines}
          operationNames={operationNames}
          canWrite={canWrite}
          canApprove={canApprove}
        />
      )}
    </main>
  );
}
