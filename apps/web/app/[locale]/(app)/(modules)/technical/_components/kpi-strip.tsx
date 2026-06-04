/**
 * TEC-080 Technical Dashboard — KPI strip (5 tiles).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:242-301 (TechDashboardScreen) → the `TEC_DASH_KPIS.map(...)`
 * KPI grid (data.jsx:318-325) + the shared `KPI` tile (bom-list.jsx:115-124):
 * uppercase label, large mono value, muted sub-line, semantic tone. Translated to
 * the @monopilot/ui Card primitive (no inline styles; Tailwind utility classes).
 *
 * Presentational only — all strings arrive as props (i18n resolved by the RSC
 * page via next-intl), all numbers from real Supabase reads. This keeps the tile
 * grid RTL-testable without a DB.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

import type { D365SyncStatus } from '../_actions/dashboard-kpis';

export type KpiTone = 'default' | 'info' | 'warning' | 'danger' | 'success';

export type KpiTile = {
  /** Stable key used for the testid + React key. */
  key: string;
  label: string;
  /** Rendered value — a formatted count or a D365 status badge label. */
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

const TONE_TO_VARIANT: Record<KpiTone, BadgeVariant> = {
  default: 'muted',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
};

const TONE_VALUE_CLASS: Record<KpiTone, string> = {
  default: 'text-slate-900',
  info: 'text-sky-600',
  warning: 'text-amber-600',
  danger: 'text-red-600',
  success: 'text-emerald-600',
};

function Tile({ tile }: { tile: KpiTile }) {
  return (
    <Card
      data-testid={`technical-kpi-${tile.key}`}
      data-tone={tile.tone}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tile.label}</span>
        {tile.tone !== 'default' ? (
          <Badge variant={TONE_TO_VARIANT[tile.tone]} className="shrink-0">
            <span aria-hidden>●</span>
          </Badge>
        ) : null}
      </div>
      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${TONE_VALUE_CLASS[tile.tone]}`}>
        {tile.value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{tile.sub}</div>
    </Card>
  );
}

export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div
      data-testid="technical-kpi-strip"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {tiles.map((tile) => (
        <Tile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}
