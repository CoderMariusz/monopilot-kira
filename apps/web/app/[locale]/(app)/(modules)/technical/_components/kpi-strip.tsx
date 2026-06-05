/**
 * TEC-080 Technical Dashboard — KPI strip (5 tiles).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:242-301 (TechDashboardScreen) → the `TEC_DASH_KPIS.map(...)`
 * KPI grid (data.jsx:318-325) + the shared `KPI` tile (bom-list.jsx:115-124).
 *
 * Conformance to the LOCKED design system (MON-design-system §golden rules 2 & 4):
 *   - canonical `.kpi` tile = 1px border + 6px radius + 3px coloured bottom accent
 *   - value is `.kpi-value` → Inter 26/700 (NEVER mono — overrides the prototype's
 *     `.mono` value class, which is a documented A1 drift)
 *   - uppercase `.kpi-label`, muted `.kpi-change` sub-line
 *   - tone drives the bottom-accent colour only (default=blue, info=blue,
 *     success=green, warning=amber, danger=red), not a per-tile palette
 *
 * Presentational only — all strings arrive as props (i18n resolved by the RSC
 * page via next-intl), all numbers from real Supabase reads. This keeps the tile
 * grid RTL-testable without a DB.
 */
import type { D365SyncStatus } from '../_actions/dashboard-kpis';

export type KpiTone = 'default' | 'info' | 'warning' | 'danger' | 'success';

export type KpiTile = {
  /** Stable key used for the testid + React key. */
  key: string;
  label: string;
  /** Rendered value — a formatted count or a D365 status label (Inter, never mono). */
  value: string;
  sub: string;
  tone: KpiTone;
};

/**
 * Maps the latest D365 job status to a tile tone. `null` (no run yet) is the
 * neutral default so the tile never looks broken on a fresh org.
 */
export function d365Tone(status: D365SyncStatus | null): KpiTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
    case 'pending':
      return 'info';
    case 'failed':
    case 'dead_lettered':
      return 'danger';
    default:
      return 'default';
  }
}

/** Maps a tile tone → the canonical `.kpi` bottom-accent modifier class. */
const TONE_ACCENT_CLASS: Record<KpiTone, string> = {
  default: '', // base `.kpi` accent is `--blue`
  info: '', // info reads the same blue accent
  success: 'green',
  warning: 'amber',
  danger: 'red',
};

function Tile({ tile }: { tile: KpiTile }) {
  const accent = TONE_ACCENT_CLASS[tile.tone];
  return (
    <div data-testid={`technical-kpi-${tile.key}`} data-tone={tile.tone} className={`kpi${accent ? ` ${accent}` : ''}`}>
      <div className="kpi-label">{tile.label}</div>
      <div className="kpi-value">{tile.value}</div>
      <div className="kpi-change muted">{tile.sub}</div>
    </div>
  );
}

export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div data-testid="technical-kpi-strip" className="kpi-row">
      {tiles.map((tile) => (
        <Tile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}
