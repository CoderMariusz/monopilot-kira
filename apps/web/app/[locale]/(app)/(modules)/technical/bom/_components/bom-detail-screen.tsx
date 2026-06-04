'use client';

/**
 * T-038 — BOM Detail screen with 7 tabs (TEC-021).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:3-65 (BOMDetail shell + 7-tab bar)
 *   - tree   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:67-157
 *   - costs  prototypes/design/Monopilot Design System/technical/bom-detail.jsx:314-375
 *   - versions+provenance prototypes/design/Monopilot Design System/technical/bom-detail.jsx:377-473
 *   - sheet  prototypes/design/Monopilot Design System/technical/bom-detail.jsx:555-608
 *
 * The prototype's 7 tabs (tree/routing/params/costs/versions/graph/sheet) are
 * translated to the 7 tabs the shared BOM SSOT actually backs with real data:
 *   1 Components  — bom_lines (the prototype Ingredients tree; SSOT lines are
 *                   single-level, rendered as an accessible Table not custom CSS)
 *   2 Co-products — bom_co_products (allocation / by-product split)
 *   3 Snapshots   — bom_snapshots (immutable WO snapshots)
 *   4 Versions    — bom_headers version history (the prototype Versions tab)
 *   5 Approval    — approval chain / status (prototype provenance + approval chain)
 *   6 Where-used  — parent BOMs referencing this FG as a component
 *   7 Recipe sheet— printable summary (prototype Recipe sheet)
 *
 * Translation-notes red-lines honoured: 7-tab layout → shadcn Tabs (TabsCounted)
 * with a `?tab=` searchParam-friendly value; BOM_TREE/ROUTING/VERSIONS globals →
 * real props; no inline styles (Tailwind only); FG canonical (no FA labels); no
 * raw <select>; released/approved rows never mutated (read-only screen). RBAC is
 * resolved server-side and never trusted from the client.
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent } from '@monopilot/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@monopilot/ui/Tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied' | 'not_found';

export type BomStatus =
  | 'draft'
  | 'in_review'
  | 'technical_approved'
  | 'active'
  | 'superseded'
  | 'archived';

export type BomLineView = {
  id: string;
  lineNo: number;
  componentCode: string;
  componentType: string | null;
  quantity: string;
  uom: string;
  scrapPct: string;
  manufacturingOperationName: string | null;
  isPhantom: boolean;
};

export type BomCoProductView = {
  id: string;
  coProductItemId: string;
  quantity: string;
  uom: string;
  allocationPct: string;
  isByproduct: boolean;
};

export type BomVersionView = {
  id: string;
  version: number;
  status: BomStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  isSelected: boolean;
};

export type BomSnapshotView = {
  id: string;
  workOrderId: string | null;
  snapshotAt: string | null;
};

export type BomWhereUsedView = {
  parentProductId: string;
  parentProductName: string | null;
  parentVersion: number;
  parentStatus: BomStatus;
  quantity: string;
  uom: string;
};

export type BomDetailData = {
  productId: string;
  productName: string | null;
  category: string | null;
  selectedVersion: number;
  status: BomStatus;
  yieldPct: string;
  effectiveFrom: string;
  notes: string | null;
  lines: BomLineView[];
  coProducts: BomCoProductView[];
  versions: BomVersionView[];
  snapshots: BomSnapshotView[];
  whereUsed: BomWhereUsedView[];
  detailHrefBase: string;
};

export type BomDetailLabels = {
  breadcrumbRoot: string;
  versionBadge: string; // "v{n}"
  yieldLabel: string;
  // tabs
  tabComponents: string;
  tabCoProducts: string;
  tabSnapshots: string;
  tabVersions: string;
  tabApproval: string;
  tabWhereUsed: string;
  tabRecipeSheet: string;
  // components
  colLine: string;
  colComponent: string;
  colType: string;
  colQty: string;
  colUom: string;
  colScrap: string;
  colOperation: string;
  phantomBadge: string;
  // co-products
  colCoProduct: string;
  colAllocation: string;
  byproductBadge: string;
  coProductBadge: string;
  // snapshots
  colSnapshot: string;
  colWorkOrder: string;
  colSnapshotAt: string;
  noWorkOrder: string;
  // versions
  colVersion: string;
  colStatus: string;
  colEffective: string;
  colApprovedBy: string;
  current: string;
  // approval
  approvalTitle: string;
  approvalStatus: string;
  approvalApprovedBy: string;
  approvalApprovedAt: string;
  approvalPending: string;
  approvalChainTitle: string;
  approvalChain: string;
  // where-used
  colParent: string;
  colParentVersion: string;
  colUsageQty: string;
  // recipe sheet
  recipeTitle: string;
  recipeBatch: string;
  recipeComponents: string;
  recipeNotes: string;
  // status chips
  statusDraft: string;
  statusInReview: string;
  statusApproved: string;
  statusActive: string;
  statusSuperseded: string;
  statusArchived: string;
  // empty states
  emptyComponents: string;
  emptyCoProducts: string;
  emptySnapshots: string;
  emptyWhereUsed: string;
  // page states
  loading: string;
  error: string;
  notFound: string;
  forbidden: string;
};

const STATUS_VARIANT: Record<BomStatus, BadgeVariant> = {
  draft: 'muted',
  in_review: 'info',
  technical_approved: 'secondary',
  active: 'success',
  superseded: 'warning',
  archived: 'danger',
};

function statusLabel(status: BomStatus, labels: BomDetailLabels): string {
  switch (status) {
    case 'draft':
      return labels.statusDraft;
    case 'in_review':
      return labels.statusInReview;
    case 'technical_approved':
      return labels.statusApproved;
    case 'active':
      return labels.statusActive;
    case 'superseded':
      return labels.statusSuperseded;
    case 'archived':
      return labels.statusArchived;
  }
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
}

function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().replace('T', ' ').slice(0, 16);
}

function StateNotice({
  state,
  labels,
}: {
  state: Exclude<PageState, 'ready'>;
  labels: BomDetailLabels;
}) {
  const map: Record<Exclude<PageState, 'ready'>, { role: 'status' | 'alert'; text: string; cls: string }> = {
    loading: { role: 'status', text: labels.loading, cls: 'border bg-white text-muted-foreground' },
    empty: { role: 'status', text: labels.notFound, cls: 'border bg-white text-muted-foreground' },
    not_found: { role: 'alert', text: labels.notFound, cls: 'border-red-200 bg-red-50 text-red-700' },
    error: { role: 'alert', text: labels.error, cls: 'border-red-200 bg-red-50 text-red-700' },
    permission_denied: { role: 'alert', text: labels.forbidden, cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  };
  const m = map[state];
  return (
    <div role={m.role} aria-live={m.role === 'status' ? 'polite' : undefined} className={`rounded-xl border px-6 py-8 text-sm ${m.cls}`}>
      {m.text}
    </div>
  );
}

const TAB_KEYS = [
  'components',
  'co-products',
  'snapshots',
  'versions',
  'approval',
  'where-used',
  'recipe',
] as const;
type TabKey = (typeof TAB_KEYS)[number];

export function BomDetailScreen({
  state,
  data,
  labels,
  defaultTab = 'components',
}: {
  state: PageState;
  data: BomDetailData | null;
  labels: BomDetailLabels;
  defaultTab?: TabKey;
}) {
  if (state !== 'ready' || !data) {
    return (
      <main data-screen="technical-bom-detail" className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6">
        <StateNotice state={state === 'ready' ? 'not_found' : state} labels={labels} />
      </main>
    );
  }

  const tabDefs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'components', label: labels.tabComponents, count: data.lines.length },
    { key: 'co-products', label: labels.tabCoProducts, count: data.coProducts.length },
    { key: 'snapshots', label: labels.tabSnapshots, count: data.snapshots.length },
    { key: 'versions', label: labels.tabVersions, count: data.versions.length },
    { key: 'approval', label: labels.tabApproval },
    { key: 'where-used', label: labels.tabWhereUsed, count: data.whereUsed.length },
    { key: 'recipe', label: labels.tabRecipeSheet },
  ];

  return (
    <main data-screen="technical-bom-detail" className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6">
      <header className="flex flex-col gap-2">
        <div className="text-xs text-muted-foreground">
          {labels.breadcrumbRoot} <span aria-hidden="true">›</span>{' '}
          <span className="font-mono">{data.productId}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{data.productName ?? data.productId}</h1>
          <Badge variant={STATUS_VARIANT[data.status]}>{statusLabel(data.status, labels)}</Badge>
          <Badge variant="info">{interpolate(labels.versionBadge, { n: data.selectedVersion })}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {labels.yieldLabel}: <span className="font-mono">{Number(data.yieldPct).toFixed(0)}%</span>
          {data.category ? <> · {data.category}</> : null}
        </p>
      </header>

      <Tabs defaultValue={defaultTab} data-testid="bom-detail-tabs">
        <TabsList
          aria-label={labels.tabComponents}
          className="flex flex-wrap gap-1 border-b border-slate-200"
        >
          {tabDefs.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              data-testid={`bom-tab-${t.key}`}
              className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-slate-700 data-[state=active]:border-slate-900 data-[state=active]:text-slate-900"
            >
              {t.label}
              {t.count != null ? (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600">
                  {t.count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 1) Components */}
        <TabsContent value="components" className="mt-4">
          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              {data.lines.length === 0 ? (
                <div className="px-6 py-10 text-sm text-muted-foreground">{labels.emptyComponents}</div>
              ) : (
                <Table aria-label={labels.tabComponents}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.colLine}</TableHead>
                      <TableHead scope="col">{labels.colComponent}</TableHead>
                      <TableHead scope="col">{labels.colType}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.colQty}</TableHead>
                      <TableHead scope="col">{labels.colUom}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.colScrap}</TableHead>
                      <TableHead scope="col">{labels.colOperation}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lines.map((l) => (
                      <TableRow key={l.id} data-testid="bom-line-row">
                        <TableCell className="font-mono text-xs text-muted-foreground">{l.lineNo}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {l.componentCode}
                          {l.isPhantom ? (
                            <Badge variant="muted" className="ml-2">
                              {labels.phantomBadge}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{l.componentType ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{l.quantity}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{l.uom}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{Number(l.scrapPct).toFixed(1)}%</TableCell>
                        <TableCell className="text-sm">{l.manufacturingOperationName ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2) Co-products */}
        <TabsContent value="co-products" className="mt-4">
          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              {data.coProducts.length === 0 ? (
                <div className="px-6 py-10 text-sm text-muted-foreground">{labels.emptyCoProducts}</div>
              ) : (
                <Table aria-label={labels.tabCoProducts}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.colCoProduct}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.colQty}</TableHead>
                      <TableHead scope="col">{labels.colUom}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.colAllocation}</TableHead>
                      <TableHead scope="col">{labels.colType}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.coProducts.map((cp) => (
                      <TableRow key={cp.id} data-testid="bom-coproduct-row">
                        <TableCell className="font-mono text-sm">{cp.coProductItemId}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{cp.quantity}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{cp.uom}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{Number(cp.allocationPct).toFixed(2)}%</TableCell>
                        <TableCell>
                          <Badge variant={cp.isByproduct ? 'warning' : 'secondary'}>
                            {cp.isByproduct ? labels.byproductBadge : labels.coProductBadge}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3) Snapshots */}
        <TabsContent value="snapshots" className="mt-4">
          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              {data.snapshots.length === 0 ? (
                <div className="px-6 py-10 text-sm text-muted-foreground">{labels.emptySnapshots}</div>
              ) : (
                <Table aria-label={labels.tabSnapshots}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.colSnapshot}</TableHead>
                      <TableHead scope="col">{labels.colWorkOrder}</TableHead>
                      <TableHead scope="col">{labels.colSnapshotAt}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.snapshots.map((s) => (
                      <TableRow key={s.id} data-testid="bom-snapshot-row">
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.id.slice(0, 8)}</TableCell>
                        <TableCell className="font-mono text-sm">{s.workOrderId ?? labels.noWorkOrder}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{fmtDateTime(s.snapshotAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4) Versions */}
        <TabsContent value="versions" className="mt-4">
          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              <Table aria-label={labels.tabVersions}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.colVersion}</TableHead>
                    <TableHead scope="col">{labels.colStatus}</TableHead>
                    <TableHead scope="col">{labels.colEffective}</TableHead>
                    <TableHead scope="col">{labels.colApprovedBy}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.versions.map((v) => (
                    <TableRow key={v.id} data-testid="bom-version-row" data-selected={v.isSelected || undefined}>
                      <TableCell className="font-mono text-sm font-semibold">
                        <a
                          href={`${data.detailHrefBase}/${encodeURIComponent(data.productId)}?v=${v.version}`}
                          className="text-slate-900 underline-offset-2 hover:underline"
                        >
                          v{v.version}
                        </a>
                        {v.isSelected ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase text-sky-600">{labels.current}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[v.status]}>{statusLabel(v.status, labels)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{fmtDate(v.effectiveFrom)}</TableCell>
                      <TableCell className="text-sm">{v.approvedByName ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5) Approval */}
        <TabsContent value="approval" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold">{labels.approvalTitle}</div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{labels.approvalStatus}</dt>
                  <dd>
                    <Badge variant={STATUS_VARIANT[data.status]}>{statusLabel(data.status, labels)}</Badge>
                  </dd>
                </div>
                {(() => {
                  const cur = data.versions.find((v) => v.isSelected);
                  const approved = cur?.approvedByName;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">{labels.approvalApprovedBy}</dt>
                        <dd className="font-medium">{approved ?? labels.approvalPending}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">{labels.approvalApprovedAt}</dt>
                        <dd className="font-mono text-xs text-muted-foreground">{fmtDateTime(cur?.approvedAt ?? null)}</dd>
                      </div>
                    </>
                  );
                })()}
              </dl>
            </Card>
            <Card className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold">{labels.approvalChainTitle}</div>
              <p className="mt-3 text-sm text-muted-foreground">{labels.approvalChain}</p>
            </Card>
          </div>
        </TabsContent>

        {/* 6) Where-used */}
        <TabsContent value="where-used" className="mt-4">
          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              {data.whereUsed.length === 0 ? (
                <div className="px-6 py-10 text-sm text-muted-foreground">{labels.emptyWhereUsed}</div>
              ) : (
                <Table aria-label={labels.tabWhereUsed}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.colParent}</TableHead>
                      <TableHead scope="col">{labels.colParentVersion}</TableHead>
                      <TableHead scope="col">{labels.colStatus}</TableHead>
                      <TableHead scope="col" className="text-right">{labels.colUsageQty}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.whereUsed.map((w) => (
                      <TableRow key={w.parentProductId} data-testid="bom-whereused-row">
                        <TableCell>
                          <a
                            href={`${data.detailHrefBase}/${encodeURIComponent(w.parentProductId)}`}
                            className="font-mono text-sm text-slate-900 underline-offset-2 hover:underline"
                          >
                            {w.parentProductId}
                          </a>
                          {w.parentProductName ? (
                            <div className="text-xs text-muted-foreground">{w.parentProductName}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">v{w.parentVersion}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[w.parentStatus]}>{statusLabel(w.parentStatus, labels)}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {w.quantity} {w.uom}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7) Recipe sheet */}
        <TabsContent value="recipe" className="mt-4">
          <Card className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{data.productName ?? data.productId}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {interpolate(labels.recipeBatch, {
                code: data.productId,
                version: data.selectedVersion,
                yield: Number(data.yieldPct).toFixed(0),
              })}
            </p>
            <h3 className="mt-5 text-sm font-semibold">{labels.recipeComponents}</h3>
            {data.lines.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{labels.emptyComponents}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.lines.map((l) => (
                  <li key={l.id} className="flex justify-between border-b border-slate-100 py-1">
                    <span className="font-mono">
                      {l.componentCode}
                      {l.manufacturingOperationName ? <span className="text-muted-foreground"> · {l.manufacturingOperationName}</span> : null}
                    </span>
                    <span className="font-mono tabular-nums">
                      {l.quantity} {l.uom}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.notes ? (
              <>
                <h3 className="mt-5 text-sm font-semibold">{labels.recipeNotes}</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{data.notes}</p>
              </>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
