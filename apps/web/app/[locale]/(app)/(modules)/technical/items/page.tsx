/**
 * Lane A — 03-technical Items Master list page (T-008 list + reachability).
 *
 * Real Supabase-backed list of public.items (org-scoped via withOrgContext +
 * RLS), with a "+ New item" CTA and per-row Edit / Deactivate gated by the real
 * technical.items.* RBAC family. Loading / empty / error / permission-denied
 * states are all rendered.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:304-352 — `MaterialsListScreen` (TEC-003). Table columns
 * Code / Name / Type / UoM / Cost / Status + "+ New material" PageHeader action
 * translated 1:1 (the prototype's free-text supplier/updated columns are
 * folded into Updated; the items table has no supplier FK in scope). FLAGGED
 * for human parity review: there is no dedicated `item-master` prototype file —
 * MaterialsListScreen is the closest item-master analog (materials = rm /
 * intermediate items in the universal `items` table).
 */

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { listItems } from './_actions/list-items';
import type { ItemListItem, ItemStatus, ItemType } from './_actions/shared';
import { ItemRowActions, NewItemButton } from './_components/items-manager.client';

export const dynamic = 'force-dynamic';

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  rm: 'Raw material',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
};

const STATUS_LABELS: Record<ItemStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  deprecated: 'Deprecated',
  blocked: 'Blocked',
};

const STATUS_VARIANT: Record<ItemStatus, BadgeVariant> = {
  draft: 'muted',
  active: 'success',
  deprecated: 'warning',
  blocked: 'danger',
};

const TYPE_VARIANT: Record<ItemType, BadgeVariant> = {
  rm: 'info',
  intermediate: 'secondary',
  fg: 'default',
  co_product: 'outline',
  byproduct: 'muted',
};

function formatCost(costPerKg: string | null): string {
  if (costPerKg === null) return '—';
  const n = Number(costPerKg);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

function formatUpdated(updatedAt: string): string {
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

function ItemsTable({
  items,
  canEdit,
  canDeactivate,
}: {
  items: ItemListItem[];
  canEdit: boolean;
  canDeactivate: boolean;
}) {
  return (
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardContent className="p-0">
        <Table aria-label="Items master">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Code</TableHead>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">UoM</TableHead>
              <TableHead scope="col">Cost / kg (zł)</TableHead>
              <TableHead scope="col">Updated</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_VARIANT[item.itemType]}>{ITEM_TYPE_LABELS[item.itemType]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{item.uomBase}</TableCell>
                <TableCell className="font-mono text-sm tabular-nums">{formatCost(item.costPerKg)}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{formatUpdated(item.updatedAt)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ItemRowActions item={item} canEdit={canEdit} canDeactivate={canDeactivate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function TechnicalItemsPage() {
  const { items, canCreate, canEdit, canDeactivate, state } = await listItems();

  return (
    <main data-screen="technical-items" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Raw materials, intermediates, finished goods, co-products and by-products — the universal item
            master consumed by BOMs, NPD components and specifications.
          </p>
        </div>
        {canCreate ? <NewItemButton /> : null}
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
              {canCreate
                ? 'Create your first item to make it pickable as a component in NPD and BOMs.'
                : 'No items have been created in this organization yet.'}
            </CardDescription>
          </CardHeader>
          {canCreate ? (
            <CardContent className="px-6 pb-6">
              <NewItemButton />
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <ItemsTable items={items} canEdit={canEdit} canDeactivate={canDeactivate} />
      )}

      {!canCreate && !canEdit && !canDeactivate ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          You can view items but do not have permission to create, edit or deactivate them.
        </div>
      ) : null}
    </main>
  );
}
