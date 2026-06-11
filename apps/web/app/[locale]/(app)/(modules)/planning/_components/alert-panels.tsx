/**
 * P-L5 / W9-M2 — Planning Dashboard alert panels (parity: dashboard.jsx:62-126).
 *
 * Three alert columns: WO alerts (past-start WOs), PO alerts (overdue expected
 * delivery on open POs, mig 262) and TO alerts (overdue scheduled date on open
 * TOs, mig 263). All three are REAL org-scoped reads now — the former PO/TO
 * "module not live yet" placeholders were lying after wave 8 and were removed.
 * Pure presentational. Empty-state safe.
 */
import Link from "next/link";

export type PlanningAlertRow = {
  id: string;
  /** Document reference (WO/PO/TO number). */
  refNumber: string;
  /** Pre-translated reason text. */
  reason: string;
  severity: "red" | "amber";
  href: string;
};

export type PlanningAlertLabels = {
  woTitle: string;
  poTitle: string;
  toTitle: string;
  empty: string;
  view: string;
};

function PanelShell({
  testid,
  title,
  count,
  children,
}: {
  testid: string;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="card" data-testid={testid}>
      <div className="card-head">
        <h3 className="card-title flex items-center gap-2">
          <span aria-hidden>⚠</span>
          {title}
          {typeof count === "number" ? (
            <span className="badge badge-gray" data-testid={`${testid}-count`}>
              {count}
            </span>
          ) : null}
        </h3>
      </div>
      {children}
    </div>
  );
}

function AlertList({
  testid,
  rows,
  emptyLabel,
  viewLabel,
}: {
  testid: string;
  rows: PlanningAlertRow[];
  emptyLabel: string;
  viewLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state" data-testid={`${testid}-empty`}>
        <div className="empty-state-icon" aria-hidden>
          ✓
        </div>
        <div className="empty-state-body">{emptyLabel}</div>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((alert) => (
        <li
          key={alert.id}
          className={`alert alert-${alert.severity === "red" ? "red" : "amber"} flex items-start justify-between gap-3`}
          data-testid={`${testid}-row-${alert.id}`}
        >
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold text-slate-800">{alert.refNumber}</div>
            <div className={alert.severity === "red" ? "text-red-700 text-sm" : "text-amber-700 text-sm"}>
              {alert.reason}
            </div>
            <Link href={alert.href} prefetch={false} className="text-xs text-blue-600 hover:underline">
              {viewLabel} →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PlanningAlertPanels({
  woAlerts,
  poAlerts,
  toAlerts,
  labels,
}: {
  woAlerts: PlanningAlertRow[];
  poAlerts: PlanningAlertRow[];
  toAlerts: PlanningAlertRow[];
  labels: PlanningAlertLabels;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="planning-alert-cols">
      <PanelShell testid="planning-wo-alerts" title={labels.woTitle} count={woAlerts.length}>
        <AlertList testid="planning-wo-alerts" rows={woAlerts} emptyLabel={labels.empty} viewLabel={labels.view} />
      </PanelShell>
      <PanelShell testid="planning-po-alerts" title={labels.poTitle} count={poAlerts.length}>
        <AlertList testid="planning-po-alerts" rows={poAlerts} emptyLabel={labels.empty} viewLabel={labels.view} />
      </PanelShell>
      <PanelShell testid="planning-to-alerts" title={labels.toTitle} count={toAlerts.length}>
        <AlertList testid="planning-to-alerts" rows={toAlerts} emptyLabel={labels.empty} viewLabel={labels.view} />
      </PanelShell>
    </div>
  );
}
