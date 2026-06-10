/**
 * P-L5 — Planning Dashboard KPI strip (parity: dashboard.jsx:32-50).
 *
 * Pure presentational tiles. Honest not-live tiles render "—" + a "module not
 * live yet" hint (same pattern as the org dashboard Pending POs tile); live tiles
 * render the count + a descriptive sub-hint.
 */
export type PlanningKpiTile = {
  key: string;
  label: string;
  /** Pre-formatted value ("—" for null / not-live). */
  value: string;
  sub: string;
  color: "blue" | "amber" | "red" | "green";
  notLive: boolean;
};

function kpiColorClass(color: PlanningKpiTile["color"]): string {
  switch (color) {
    case "green":
      return "kpi green";
    case "amber":
      return "kpi amber";
    case "red":
      return "kpi red";
    default:
      return "kpi";
  }
}

export function PlanningKpiStrip({ tiles }: { tiles: PlanningKpiTile[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      data-testid="planning-kpis"
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={kpiColorClass(tile.color)}
          data-testid={`planning-kpi-${tile.key}`}
          data-not-live={tile.notLive ? "true" : undefined}
        >
          <div className="kpi-label">{tile.label}</div>
          <div className="kpi-value">{tile.value}</div>
          <div className="kpi-change text-slate-400">{tile.sub}</div>
        </div>
      ))}
    </div>
  );
}
