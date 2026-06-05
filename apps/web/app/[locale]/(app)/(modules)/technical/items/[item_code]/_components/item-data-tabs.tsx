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

import type {
  BomTabData,
  CostTabData,
  RoutingTabData,
  LabTabData,
  D365TabData,
} from '../_actions/tab-data';

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

// Section header inside a padding-0 card (prototype `padding: "10px 14px"` +
// bottom rule), so the title aligns with the dense table below it.
const SECTION_HEAD: CSSProperties = {
  padding: '10px 14px',
  margin: 0,
  borderBottom: '1px solid var(--border)',
};

function EmptyCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="empty-state">
        <div className="empty-state-icon">{icon}</div>
        <div className="empty-state-title">{title}</div>
        <div className="empty-state-body">{body}</div>
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
};

export function BomTab({ data, labels }: { data: BomTabData; labels: BomTabLabels }) {
  if (data.state === 'error') return <ErrorCard message={labels.error} />;
  if (data.state === 'empty')
    return <EmptyCard icon="🧬" title={labels.empty} body={labels.emptyBody} />;
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
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-slate-900 ${mono ? 'font-mono tabular-nums' : 'font-medium'}`}>
        {badge ?? value}
      </dd>
    </div>
  );
}

// ── Supplier-specs tab (honest stub — no API yet) ─────────────────────────────
export type SupplierTabLabels = { title: string; pending: string; pendingBody: string };

export function SupplierSpecsTab({ labels }: { labels: SupplierTabLabels }) {
  return (
    <div data-testid="supplier-specs-tab">
      <EmptyCard icon="📄" title={labels.pending} body={labels.pendingBody} />
    </div>
  );
}
