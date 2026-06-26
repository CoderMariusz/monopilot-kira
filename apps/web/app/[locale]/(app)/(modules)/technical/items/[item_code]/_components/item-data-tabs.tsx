/**
 * Lane A1 — 03-technical Item Detail · deferred-tab bodies (TEC-012).
 *
 * Server-rendered presentational panels for the BOM / Cost / Routing / Lab /
 * D365 / Supplier-spec tabs. Each receives REAL data (from tab-data.ts loaders,
 * withOrgContext + RLS) + pre-localized labels — no client state, no Radix, no
 * mocks. Design-system conformant: `.card` blocks, dense `.table`, mono codes,
 * the five semantic status badges, and an `.empty-state` for every empty list.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:1177-1347 (`ProductDetailScreen` BOMs / Costing / Routing /
 * Lab Results / D365 tab panels). Legacy copy (FA, zł literals, mock rows) is
 * translated to the canonical vocabulary + real data per T-083 red-lines.
 */

import type { CSSProperties, ReactNode } from 'react';

import Link from 'next/link';

import type {
  BomTabData,
  CostTabData,
  RoutingTabData,
  LabTabData,
  D365TabData,
} from '../_actions/tab-data';
import type { SupplierSpecRow, SupplierSpecsData } from '../_actions/list-supplier-specs';

// ── shared label bundles ──────────────────────────────────────────────────────
export type TabStateLabels = { loading: string; empty: string; emptyBody: string; error: string };

function fmtDate(value: string | null, none: string): string {
  if (!value) return none;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? none : d.toISOString().slice(0, 10);
}

// Map a domain status to one of the five semantic badge tones.
const BOM_STATUS_TONE: Record<string, string> = {
  draft: 'badge-gray',
  in_review: 'badge-blue',
  technical_approved: 'badge-blue',
  active: 'badge-green',
  superseded: 'badge-gray',
  archived: 'badge-gray',
};
const ROUTING_STATUS_TONE: Record<string, string> = {
  draft: 'badge-gray',
  approved: 'badge-blue',
  active: 'badge-green',
  superseded: 'badge-gray',
};
const LAB_STATUS_TONE: Record<string, string> = {
  pass: 'badge-green',
  fail: 'badge-red',
  inconclusive: 'badge-amber',
  pending: 'badge-gray',
  hold: 'badge-amber',
};
const D365_STATUS_TONE: Record<string, string> = {
  synced: 'badge-green',
  drift: 'badge-amber',
  error: 'badge-red',
  unsynced: 'badge-gray',
};
const SUPPLIER_STATUS_TONE: Record<string, string> = {
  pending: 'badge-gray',
  approved: 'badge-green',
  blocked: 'badge-red',
};
const SUPPLIER_LIFECYCLE_TONE: Record<string, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  expired: 'badge-amber',
  superseded: 'badge-gray',
  blocked: 'badge-red',
};
const SUPPLIER_REVIEW_TONE: Record<string, string> = {
  pending: 'badge-gray',
  approved: 'badge-green',
  rejected: 'badge-red',
  blocked: 'badge-red',
};

// Section header inside a padding-0 card (prototype `padding: "10px 14px"` +
// bottom rule), so the title aligns with the dense table below it.
const SECTION_HEAD: CSSProperties = {
  padding: '10px 14px',
  margin: 0,
  borderBottom: '1px solid var(--border)',
};

function EmptyCard({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="empty-state">
        <div className="empty-state-icon">{icon}</div>
        <div className="empty-state-title">{title}</div>
        <div className="empty-state-body">{body}</div>
        {action ? <div className="empty-state-action">{action}</div> : null}
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div role="alert" className="alert alert-red">
      <div className="alert-title">{message}</div>
    </div>
  );
}

// ── BOM tab ───────────────────────────────────────────────────────────────────
export type BomTabLabels = TabStateLabels & {
  title: string;
  version: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string;
  lines: string;
  approved: string;
  none: string;
  /** "+ New BOM" CTA label, shown in the empty state for an FG item. */
  createCta?: string;
  /** Per-row deep-link to the BOM detail screen for this FG version. */
  openBom?: string;
};

/**
 * The BOM tab. When an item has NO shared BOM version it renders the empty
 * state; for a finished good (and when the caller may create), that empty state
 * gets a "+ New BOM" CTA that links straight to the BOM authoring entry for this
 * FG (`createBomHref`) — closing the previously dead-end where an FG item had no
 * way to start its first BOM from the detail screen.
 */
export function BomTab({
  data,
  labels,
  isFinishedGood = false,
  canCreateBom = false,
  createBomHref,
  itemCode,
}: {
  data: BomTabData;
  labels: BomTabLabels;
  isFinishedGood?: boolean;
  canCreateBom?: boolean;
  createBomHref?: string;
  /**
   * The FG item_code (= bom_headers.product_id) — keys the per-row "Open BOM →"
   * deep-link so the owner no longer has to navigate to /technical/bom and search
   * manually. BOM detail is routed by product_id, not by header id.
   */
  itemCode?: string;
}) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  if (data.state === 'empty') {
    const showCta = isFinishedGood && canCreateBom && Boolean(createBomHref);
    return (
      <EmptyCard
        icon="🧬"
        title={labels.empty}
        body={labels.emptyBody}
        action={
          showCta ? (
            <Link href={createBomHref!} className="btn btn-primary btn-sm" data-testid="item-bom-new-cta">
              {labels.createCta ?? '+ New BOM'}
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="bom-tab">
      <div className="card-head" style={SECTION_HEAD}>
        <strong>{labels.title}</strong>
      </div>
      <table aria-label={labels.title}>
        <thead>
          <tr>
            <th scope="col">{labels.version}</th>
            <th scope="col">{labels.status}</th>
            <th scope="col">{labels.effectiveFrom}</th>
            <th scope="col">{labels.effectiveTo}</th>
            <th scope="col">{labels.lines}</th>
            <th scope="col">{labels.approved}</th>
            {itemCode ? <th scope="col" style={{ textAlign: 'right' }} /> : null}
          </tr>
        </thead>
        <tbody>
          {data.versions.map((v) => (
            <tr key={v.id}>
              <td className="mono">v{v.version}</td>
              <td>
                <span className={`badge ${BOM_STATUS_TONE[v.status] ?? 'badge-gray'}`}>{v.status}</span>
              </td>
              <td className="mono">{fmtDate(v.effectiveFrom, labels.none)}</td>
              <td className="mono" style={{ color: 'var(--muted)' }}>
                {fmtDate(v.effectiveTo, labels.none)}
              </td>
              <td className="mono tabular-nums">{v.lineCount}</td>
              <td className="mono" style={{ color: 'var(--muted)' }}>
                {fmtDate(v.approvedAt, labels.none)}
              </td>
              {itemCode ? (
                <td style={{ textAlign: 'right' }}>
                  <Link
                    href={`/technical/bom/${encodeURIComponent(itemCode)}?v=${v.version}`}
                    className="text-blue-600 underline-offset-4 hover:underline"
                    data-testid="item-bom-open-link"
                  >
                    {labels.openBom ?? 'Open BOM →'}
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cost tab ──────────────────────────────────────────────────────────────────
export type CostTabLabels = TabStateLabels & {
  current: string;
  perKg: string;
  effective: string;
  history: string;
  date: string;
  cost: string;
  source: string;
  none: string;
  approvalNote: string;
  sources: Record<string, string>;
};

export function CostTab({ data, labels }: { data: CostTabData; labels: CostTabLabels }) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  if (data.state === 'empty' || !data.current)
    return <EmptyCard icon="💰" title={labels.empty} body={labels.emptyBody} />;
  return (
    <div className="space-y-3" data-testid="cost-tab">
      <div className="card">
        <div className="kpi-label">{labels.current}</div>
        <div className="kpi-value">
          <span className="mono">{data.current.costPerKg}</span>{' '}
          <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>
            {data.current.currency} / {labels.perKg}
          </span>
        </div>
        <div className="kpi-change" style={{ color: 'var(--muted)' }}>
          {labels.effective} {fmtDate(data.current.effectiveFrom, labels.none)}
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="card-head" style={SECTION_HEAD}>
          <strong>{labels.history}</strong>
        </div>
        <table aria-label={labels.history}>
          <thead>
            <tr>
              <th scope="col">{labels.effective}</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {labels.cost}
              </th>
              <th scope="col">{labels.source}</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.id}>
                <td className="mono">{fmtDate(h.effectiveFrom, labels.none)}</td>
                <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                  {h.costPerKg} {h.currency}
                </td>
                <td>{h.source ? (labels.sources[h.source] ?? h.source) : labels.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="alert alert-amber" role="note">
        <span aria-hidden>△</span> {labels.approvalNote}
      </div>
    </div>
  );
}

// ── Routing tab ───────────────────────────────────────────────────────────────
export type RoutingTabLabels = TabStateLabels & {
  title: string;
  version: string;
  operations: string;
  setup: string;
  status: string;
  effectiveFrom: string;
  approved: string;
  none: string;
};

export function RoutingTab({ data, labels }: { data: RoutingTabData; labels: RoutingTabLabels }) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  if (data.state === 'empty')
    return <EmptyCard icon="🛠️" title={labels.empty} body={labels.emptyBody} />;
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="routing-tab">
      <div className="card-head" style={SECTION_HEAD}>
        <strong>{labels.title}</strong>
      </div>
      <table aria-label={labels.title}>
        <thead>
          <tr>
            <th scope="col">{labels.version}</th>
            <th scope="col">{labels.operations}</th>
            <th scope="col">{labels.setup}</th>
            <th scope="col">{labels.status}</th>
            <th scope="col">{labels.effectiveFrom}</th>
            <th scope="col">{labels.approved}</th>
          </tr>
        </thead>
        <tbody>
          {data.routings.map((r) => (
            <tr key={r.id}>
              <td className="mono">v{r.version}</td>
              <td className="mono tabular-nums">{r.operationCount}</td>
              <td className="mono tabular-nums">{r.totalSetupMin} min</td>
              <td>
                <span className={`badge ${ROUTING_STATUS_TONE[r.status] ?? 'badge-gray'}`}>{r.status}</span>
              </td>
              <td className="mono">{fmtDate(r.effectiveFrom, labels.none)}</td>
              <td className="mono" style={{ color: 'var(--muted)' }}>
                {fmtDate(r.approvedAt, labels.none)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Lab results tab (read-only) ───────────────────────────────────────────────
export type LabTabLabels = TabStateLabels & {
  title: string;
  readOnly: string;
  date: string;
  testType: string;
  result: string;
  unit: string;
  status: string;
  provider: string;
  none: string;
  testTypes: Record<string, string>;
  statuses: Record<string, string>;
};

export function LabTab({ data, labels }: { data: LabTabData; labels: LabTabLabels }) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  if (data.state === 'empty')
    return <EmptyCard icon="🧪" title={labels.empty} body={labels.emptyBody} />;
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="lab-tab">
      <div className="card-head" style={SECTION_HEAD}>
        <strong>{labels.title}</strong>
        <span className="badge badge-gray">{labels.readOnly}</span>
      </div>
      <table aria-label={labels.title}>
        <thead>
          <tr>
            <th scope="col">{labels.date}</th>
            <th scope="col">{labels.testType}</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              {labels.result}
            </th>
            <th scope="col">{labels.unit}</th>
            <th scope="col">{labels.status}</th>
            <th scope="col">{labels.provider}</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((r) => (
            <tr key={r.id}>
              <td className="mono">{fmtDate(r.testedAt, labels.none)}</td>
              <td>{labels.testTypes[r.testType] ?? r.testType}</td>
              <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                {r.resultValue ?? labels.none}
              </td>
              <td className="mono">{r.resultUnit ?? labels.none}</td>
              <td>
                <span className={`badge ${LAB_STATUS_TONE[r.resultStatus] ?? 'badge-gray'}`}>
                  {labels.statuses[r.resultStatus] ?? r.resultStatus}
                </span>
              </td>
              <td>{r.labProvider ?? labels.none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── D365 tab ──────────────────────────────────────────────────────────────────
export type D365TabLabels = {
  title: string;
  itemId: string;
  syncStatus: string;
  lastSync: string;
  none: string;
  error: string;
  statuses: Record<string, string>;
};

export function D365Tab({ data, labels }: { data: D365TabData; labels: D365TabLabels }) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  const status = data.syncStatus ?? 'unsynced';
  return (
    <div className="card" data-testid="d365-tab">
      <div className="card-head">
        <strong>{labels.title}</strong>
      </div>
      <dl className="mt-2">
        <DRow label={labels.itemId} value={data.d365ItemId ?? labels.none} mono />
        <DRow
          label={labels.syncStatus}
          badge={
            <span className={`badge ${D365_STATUS_TONE[status] ?? 'badge-gray'}`}>
              {labels.statuses[status] ?? status}
            </span>
          }
        />
        <DRow label={labels.lastSync} value={fmtDate(data.lastSyncAt, labels.none)} mono />
      </dl>
    </div>
  );
}

function DRow({
  label,
  value,
  badge,
  mono,
}: {
  label: string;
  value?: string;
  badge?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-1.5"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <dt className="text-sm" style={{ color: 'var(--muted)' }}>
        {label}
      </dt>
      <dd className={`text-sm ${mono ? 'mono tabular-nums' : 'font-medium'}`}>{badge ?? value}</dd>
    </div>
  );
}

// ── Supplier-specs tab (read-only) ────────────────────────────────────────────
export type SupplierTabLabels = TabStateLabels & {
  title: string;
  supplier: string;
  supplierStatus: string;
  lifecycleStatus: string;
  reviewStatus: string;
  specVersion: string;
  effectiveFrom: string;
  expiryDate: string;
  documents: string;
  none: string;
  document: string;
  certificates: string;
};

/**
 * The supplier-specs tab. `addAction` is the "+ Add supplier" island (the
 * SupplierSpecAdd modal, gated by technical.items.edit). It is surfaced in BOTH
 * the empty state and the populated header so an item that was NOT born in NPD
 * can finally get an approved supplier_spec — which is what clears the BOM
 * readiness gates SUPPLIER_NOT_APPROVED / SUPPLIER_SPEC_NOT_ACTIVE
 * (apps/web/lib/technical/rm-usability.ts). The page injects it as a prop seam.
 */
export function SupplierSpecsTab({
  data,
  labels,
  addAction,
  rowActions,
}: SupplierSpecsTabProps) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  if (data.state === 'empty')
    return <EmptyCard icon="📄" title={labels.empty} body={labels.emptyBody} action={addAction} />;

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="supplier-specs-tab">
      <div className="card-head" style={{ ...SECTION_HEAD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{labels.title}</strong>
        {addAction}
      </div>
      <table aria-label={labels.title}>
        <thead>
          <tr>
            <th scope="col">{labels.supplier}</th>
            <th scope="col">{labels.supplierStatus}</th>
            <th scope="col">{labels.lifecycleStatus}</th>
            <th scope="col">{labels.reviewStatus}</th>
            <th scope="col">{labels.specVersion}</th>
            <th scope="col">{labels.effectiveFrom}</th>
            <th scope="col">{labels.expiryDate}</th>
            <th scope="col">{labels.documents}</th>
            {rowActions ? <th scope="col" style={{ width: 96 }} /> : null}
          </tr>
        </thead>
        <tbody>
          {data.specs.map((spec) => (
            <tr key={spec.id}>
              <td className="mono">{spec.supplierCode}</td>
              <td>
                <span className={`badge ${SUPPLIER_STATUS_TONE[spec.supplierStatus] ?? 'badge-gray'}`}>
                  {spec.supplierStatus}
                </span>
              </td>
              <td>
                <span className={`badge ${SUPPLIER_LIFECYCLE_TONE[spec.lifecycleStatus] ?? 'badge-gray'}`}>
                  {spec.lifecycleStatus}
                </span>
              </td>
              <td>
                <span className={`badge ${SUPPLIER_REVIEW_TONE[spec.reviewStatus] ?? 'badge-gray'}`}>
                  {spec.reviewStatus}
                </span>
              </td>
              <td className="mono">{spec.specVersion}</td>
              <td className="mono">{fmtDate(spec.effectiveFrom, labels.none)}</td>
              <td className="mono">{fmtDate(spec.expiryDate, labels.none)}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {spec.specDocumentUrl ? (
                    <a className="badge badge-blue" href={spec.specDocumentUrl}>
                      {labels.document}
                    </a>
                  ) : null}
                  {spec.certificateRefs.length > 0 ? (
                    <span className="badge badge-gray">
                      {labels.certificates}: {spec.certificateRefs.length}
                    </span>
                  ) : null}
                  {!spec.specDocumentUrl && spec.certificateRefs.length === 0 ? labels.none : null}
                </div>
              </td>
              {rowActions ? <td style={{ textAlign: 'right' }}>{rowActions(spec)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type SupplierSpecsTabProps = {
  data: SupplierSpecsData;
  labels: SupplierTabLabels;
  addAction?: ReactNode;
  rowActions?: (spec: SupplierSpecRow) => ReactNode;
};
