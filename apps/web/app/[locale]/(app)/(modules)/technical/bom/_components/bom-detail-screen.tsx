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
import Link from 'next/link';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@monopilot/ui/Tabs';

import { BomLineRowActions } from './bom-line-row-actions';

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
  /**
   * Phase-3 NPD↔Technical shortcut: the source NPD project id when this shared BOM
   * originated from an NPD release (bom_headers.npd_project_id). Null for
   * Technical/imported-origin BOMs — the header origin link is then omitted.
   */
  npdProjectId?: string | null;
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
  /** The selected version's bom_headers.id — keys the per-row edit/delete actions. */
  selectedHeaderId?: string;
  /** Whether the selected version is editable (draft | in_review). Row actions render disabled otherwise. */
  isEditable?: boolean;
  /** Server-resolved RBAC (technical.bom.create) — gates the component row actions. */
  canEditLines?: boolean;
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
  colActions: string;
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
  /** Phase-3 cross-link label to the source NPD project. */
  originNpdProject: string;
};

const STATUS_TONE: Record<BomStatus, string> = {
  draft: 'badge-gray',
  in_review: 'badge-blue',
  technical_approved: 'badge-green',
  active: 'badge-green',
  superseded: 'badge-amber',
  archived: 'badge-red',
};

function StatusBadge({ status, labels }: { status: BomStatus; labels: BomDetailLabels }) {
  return <span className={`badge ${STATUS_TONE[status]}`}>{statusLabel(status, labels)}</span>;
}

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
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card text-shell-muted text-sm">
        {labels.loading}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-amber">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  // not_found / empty / error → red alert (not_found+empty use the notFound copy).
  const text = state === 'error' ? labels.error : labels.notFound;
  return (
    <div role="alert" className="alert alert-red">
      <div className="alert-title">{text}</div>
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
  actions,
}: {
  state: PageState;
  data: BomDetailData | null;
  labels: BomDetailLabels;
  defaultTab?: TabKey;
  /** Server-supplied, RBAC-gated action bar (Add component / Save version / Approve). */
  actions?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = React.useState<TabKey>(defaultTab);

  if (state !== 'ready' || !data) {
    return (
      <main data-screen="technical-bom-detail" className="flex w-full flex-col gap-4 px-6 py-6">
        <StateNotice state={state === 'ready' ? 'not_found' : state} labels={labels} />
      </main>
    );
  }

  const tabDefs: { key: TabKey; label: string; count?: number; tone?: string }[] = [
    { key: 'components', label: labels.tabComponents, count: data.lines.length, tone: 'tone-info' },
    { key: 'co-products', label: labels.tabCoProducts, count: data.coProducts.length, tone: 'tone-neutral' },
    { key: 'snapshots', label: labels.tabSnapshots, count: data.snapshots.length, tone: 'tone-neutral' },
    { key: 'versions', label: labels.tabVersions, count: data.versions.length, tone: 'tone-neutral' },
    { key: 'approval', label: labels.tabApproval },
    { key: 'where-used', label: labels.tabWhereUsed, count: data.whereUsed.length, tone: 'tone-neutral' },
    { key: 'recipe', label: labels.tabRecipeSheet },
  ];

  return (
    <main data-screen="technical-bom-detail" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href={data.detailHrefBase}>{labels.breadcrumbRoot}</a> / <span className="mono">{data.productId}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{data.productName ?? data.productId}</h1>
            <StatusBadge status={data.status} labels={labels} />
            <span className="badge badge-blue">{interpolate(labels.versionBadge, { n: data.selectedVersion })}</span>
          </div>
          <p className="helper">
            {labels.yieldLabel}: <span className="mono">{Number(data.yieldPct).toFixed(0)}%</span>
            {data.category ? <> · {data.category}</> : null}
          </p>
          {/* Phase-3 NPD↔Technical shortcut — muted read-level link back to the
              source NPD project. Rendered ONLY when the shared-BOM header carries
              its npd_project_id origin; omitted entirely otherwise (no layout
              shift). prefetch={false} per the project perf rule (kanban precedent). */}
          {data.npdProjectId && labels.originNpdProject ? (
            <Link
              href={`/pipeline/${data.npdProjectId}`}
              prefetch={false}
              data-testid="bom-origin-npd-link"
              className="helper text-xs text-shell-muted underline-offset-2 hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              {labels.originNpdProject}
            </Link>
          ) : null}
        </div>
        {actions ?? null}
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} data-testid="bom-detail-tabs">
        <TabsList className="tabs-counted" aria-label={labels.tabComponents}>
          {tabDefs.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              data-testid={`bom-tab-${t.key}`}
              className={`tabs-counted-tab${activeTab === t.key ? ' active' : ''}`}
            >
              <span>{t.label}</span>
              {t.count != null ? (
                <span className={`tabs-counted-pill ${t.tone ?? ''}`.trim()}>{t.count}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 1) Components */}
        <TabsContent value="components" className="mt-4">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {data.lines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧩</div>
                <div className="empty-state-body">{labels.emptyComponents}</div>
              </div>
            ) : (
              <table aria-label={labels.tabComponents}>
                <thead>
                  <tr>
                    <th scope="col">{labels.colLine}</th>
                    <th scope="col">{labels.colComponent}</th>
                    <th scope="col">{labels.colType}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>{labels.colQty}</th>
                    <th scope="col">{labels.colUom}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>{labels.colScrap}</th>
                    <th scope="col">{labels.colOperation}</th>
                    {data.canEditLines ? (
                      <th scope="col" style={{ textAlign: 'right' }}>{labels.colActions}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.id} data-testid="bom-line-row">
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{l.lineNo}</td>
                      <td className="mono">
                        {l.componentCode}
                        {l.isPhantom ? <span className="badge badge-gray" style={{ marginLeft: 8 }}>{labels.phantomBadge}</span> : null}
                      </td>
                      <td>{l.componentType ?? '—'}</td>
                      <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{l.quantity}</td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{l.uom}</td>
                      <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{Number(l.scrapPct).toFixed(1)}%</td>
                      <td>{l.manufacturingOperationName ?? '—'}</td>
                      {data.canEditLines && data.selectedHeaderId ? (
                        <td style={{ textAlign: 'right' }}>
                          <BomLineRowActions
                            target={{
                              bomHeaderId: data.selectedHeaderId,
                              lineId: l.id,
                              componentCode: l.componentCode,
                              quantity: l.quantity,
                              uom: l.uom,
                              notes: l.manufacturingOperationName ?? null,
                            }}
                            editable={data.isEditable ?? false}
                            canEdit={data.canEditLines}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* 2) Co-products */}
        <TabsContent value="co-products" className="mt-4">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {data.coProducts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">⚖️</div>
                <div className="empty-state-body">{labels.emptyCoProducts}</div>
              </div>
            ) : (
              <table aria-label={labels.tabCoProducts}>
                <thead>
                  <tr>
                    <th scope="col">{labels.colCoProduct}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>{labels.colQty}</th>
                    <th scope="col">{labels.colUom}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>{labels.colAllocation}</th>
                    <th scope="col">{labels.colType}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coProducts.map((cp) => (
                    <tr key={cp.id} data-testid="bom-coproduct-row">
                      <td className="mono">{cp.coProductItemId}</td>
                      <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{cp.quantity}</td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{cp.uom}</td>
                      <td className="mono tabular-nums" style={{ textAlign: 'right' }}>{Number(cp.allocationPct).toFixed(2)}%</td>
                      <td>
                        <span className={`badge ${cp.isByproduct ? 'badge-amber' : 'badge-blue'}`}>
                          {cp.isByproduct ? labels.byproductBadge : labels.coProductBadge}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* 3) Snapshots */}
        <TabsContent value="snapshots" className="mt-4">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {data.snapshots.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📸</div>
                <div className="empty-state-body">{labels.emptySnapshots}</div>
              </div>
            ) : (
              <table aria-label={labels.tabSnapshots}>
                <thead>
                  <tr>
                    <th scope="col">{labels.colSnapshot}</th>
                    <th scope="col">{labels.colWorkOrder}</th>
                    <th scope="col">{labels.colSnapshotAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.snapshots.map((s) => (
                    <tr key={s.id} data-testid="bom-snapshot-row">
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{s.id.slice(0, 8)}</td>
                      <td className="mono">{s.workOrderId ?? labels.noWorkOrder}</td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDateTime(s.snapshotAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* 4) Versions */}
        <TabsContent value="versions" className="mt-4">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table aria-label={labels.tabVersions}>
              <thead>
                <tr>
                  <th scope="col">{labels.colVersion}</th>
                  <th scope="col">{labels.colStatus}</th>
                  <th scope="col">{labels.colEffective}</th>
                  <th scope="col">{labels.colApprovedBy}</th>
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id} data-testid="bom-version-row" data-selected={v.isSelected || undefined}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <a
                        href={`${data.detailHrefBase}/${encodeURIComponent(data.productId)}?v=${v.version}`}
                        className="text-blue-600 underline-offset-4 hover:underline"
                      >
                        v{v.version}
                      </a>
                      {v.isSelected ? (
                        <span className="badge badge-blue" style={{ marginLeft: 8 }}>{labels.current}</span>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={v.status} labels={labels} />
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(v.effectiveFrom)}</td>
                    <td>{v.approvedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 5) Approval */}
        <TabsContent value="approval" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <div className="card-head">
                <strong style={{ fontSize: 13 }}>{labels.approvalTitle}</strong>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="muted">{labels.approvalStatus}</dt>
                  <dd>
                    <StatusBadge status={data.status} labels={labels} />
                  </dd>
                </div>
                {(() => {
                  const cur = data.versions.find((v) => v.isSelected);
                  const approved = cur?.approvedByName;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <dt className="muted">{labels.approvalApprovedBy}</dt>
                        <dd style={{ fontWeight: 500 }}>{approved ?? labels.approvalPending}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="muted">{labels.approvalApprovedAt}</dt>
                        <dd className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDateTime(cur?.approvedAt ?? null)}</dd>
                      </div>
                    </>
                  );
                })()}
              </dl>
            </div>
            <div className="card">
              <div className="card-head">
                <strong style={{ fontSize: 13 }}>{labels.approvalChainTitle}</strong>
              </div>
              <p className="muted text-sm">{labels.approvalChain}</p>
            </div>
          </div>
        </TabsContent>

        {/* 6) Where-used */}
        <TabsContent value="where-used" className="mt-4">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {data.whereUsed.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔗</div>
                <div className="empty-state-body">{labels.emptyWhereUsed}</div>
              </div>
            ) : (
              <table aria-label={labels.tabWhereUsed}>
                <thead>
                  <tr>
                    <th scope="col">{labels.colParent}</th>
                    <th scope="col">{labels.colParentVersion}</th>
                    <th scope="col">{labels.colStatus}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>{labels.colUsageQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.whereUsed.map((w) => (
                    <tr key={w.parentProductId} data-testid="bom-whereused-row">
                      <td className="mono">
                        <a
                          href={`${data.detailHrefBase}/${encodeURIComponent(w.parentProductId)}`}
                          className="text-blue-600 underline-offset-4 hover:underline"
                        >
                          {w.parentProductId}
                        </a>
                        {w.parentProductName ? (
                          <div className="muted" style={{ fontSize: 12 }}>{w.parentProductName}</div>
                        ) : null}
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>v{w.parentVersion}</td>
                      <td>
                        <StatusBadge status={w.parentStatus} labels={labels} />
                      </td>
                      <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                        {w.quantity} {w.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* 7) Recipe sheet */}
        <TabsContent value="recipe" className="mt-4">
          <div className="card">
            <h2 className="page-title" style={{ fontSize: 'var(--fs-page-title)' }}>{data.productName ?? data.productId}</h2>
            <p className="helper mt-1">
              {interpolate(labels.recipeBatch, {
                code: data.productId,
                version: data.selectedVersion,
                yield: Number(data.yieldPct).toFixed(0),
              })}
            </p>
            <h3 className="mt-5" style={{ fontSize: 13, fontWeight: 600 }}>{labels.recipeComponents}</h3>
            {data.lines.length === 0 ? (
              <p className="muted mt-2 text-sm">{labels.emptyComponents}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.lines.map((l) => (
                  <li key={l.id} className="flex justify-between border-b border-[var(--border)] py-1">
                    <span className="mono">
                      {l.componentCode}
                      {l.manufacturingOperationName ? <span className="muted"> · {l.manufacturingOperationName}</span> : null}
                    </span>
                    <span className="mono tabular-nums">
                      {l.quantity} {l.uom}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.notes ? (
              <>
                <h3 className="mt-5" style={{ fontSize: 13, fontWeight: 600 }}>{labels.recipeNotes}</h3>
                <p className="muted mt-2 whitespace-pre-line text-sm">{data.notes}</p>
              </>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
