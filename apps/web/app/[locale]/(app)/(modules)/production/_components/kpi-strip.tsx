/**
 * T-046 — SCR-08-01 Production Dashboard: KPI strip (4 live tiles).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/production/
 * dashboard.jsx:71-107 (the `kpi-row` of 6 KPI cards). The dashboard-landing scope
 * surfaces the 4 data-backed tiles wired to real Supabase reads (WOs in progress,
 * output today, OEE current shift, open downtime); the prototype's "QA holds" and
 * "Next changeover" tiles are owned by the 09-quality holdsGuard view and the
 * T-048 allergen-changeover surface respectively (deviation logged — out of scope
 * for this dashboard landing, see closeout).
 *
 * Presentational only — all strings arrive as props (i18n resolved by the RSC page
 * via next-intl), all numbers from real Supabase reads. Tone is never the sole
 * signal: each tone renders both a colored value and a Badge dot, plus the label.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

export type KpiTone = 'default' | 'info' | 'warning' | 'danger' | 'success';

export type KpiTile = {
  /** Stable key used for the testid + React key. */
  key: string;
  label: string;
  /** Rendered value — a formatted count / kg / percentage. */
  value: string;
  sub: string;
  tone: KpiTone;
};

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
      data-testid={`production-kpi-${tile.key}`}
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
      data-testid="production-kpi-strip"
      className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {tiles.map((tile) => (
        <Tile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}
