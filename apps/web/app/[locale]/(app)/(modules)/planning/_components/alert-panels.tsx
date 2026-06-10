/**
 * P-L5 — Planning Dashboard alert panels (parity: dashboard.jsx:62-126).
 *
 * Three alert columns: WO alerts (real, from past-start WOs), PO alerts + TO
 * alerts (honest "module not live yet" placeholders — those tables don't exist).
 * Pure presentational. Empty-state safe.
 */
import Link from "next/link";

export type PlanningAlertRow = {
  id: string;
  woNumber: string;
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
  notLive: string;
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

function NotLivePanel({ testid, title, label }: { testid: string; title: string; label: string }) {
  return (
    <PanelShell testid={testid} title={title}>
      <div className="empty-state" data-testid={`${testid}-not-live`}>
        <div className="empty-state-icon" aria-hidden>
          🧩
        </div>
        <div className="empty-state-body">{label}</div>
      </div>
    </PanelShell>
  );
}

export function PlanningAlertPanels({
  woAlerts,
  labels,
}: {
  woAlerts: PlanningAlertRow[];
  labels: PlanningAlertLabels;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="planning-alert-cols">
      <PanelShell testid="planning-wo-alerts" title={labels.woTitle} count={woAlerts.length}>
        {woAlerts.length === 0 ? (
          <div className="empty-state" data-testid="planning-wo-alerts-empty">
            <div className="empty-state-icon" aria-hidden>
              ✓
            </div>
            <div className="empty-state-body">{labels.empty}</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {woAlerts.map((alert) => (
              <li
                key={alert.id}
                className={`alert alert-${alert.severity === "red" ? "red" : "amber"} flex items-start justify-between gap-3`}
                data-testid={`planning-wo-alert-${alert.id}`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-800">{alert.woNumber}</div>
                  <div className={alert.severity === "red" ? "text-red-700 text-sm" : "text-amber-700 text-sm"}>
                    {alert.reason}
                  </div>
                  <Link href={alert.href} prefetch={false} className="text-xs text-blue-600 hover:underline">
                    {labels.view} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>

      {/* PO / TO panels — tables not live yet (honest placeholder). */}
      <NotLivePanel testid="planning-po-alerts" title={labels.poTitle} label={labels.notLive} />
      <NotLivePanel testid="planning-to-alerts" title={labels.toTitle} label={labels.notLive} />
    </div>
  );
}
