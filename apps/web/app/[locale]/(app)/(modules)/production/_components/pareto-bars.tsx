/**
 * Production Pareto bar list — mirrors the prototype `.pareto-bar` rows:
 *   - Downtime Pareto: other-screens.jsx:150-162 (label · track/fill · value · count)
 *   - Waste Pareto:    new-screens.jsx:74-87
 *
 * Presentational only — all labels/values resolved by the calling RSC. Each row is a
 * label, a proportional fill bar (width = value / max), a primary value and a
 * secondary count. Tone never relies on color alone (the numeric value is always
 * present in text).
 */

export type ParetoTone = 'plant' | 'process' | 'people' | 'neutral';

export type ParetoBar = {
  key: string;
  label: string;
  /** Numeric magnitude that drives the bar width (e.g. minutes or kg). */
  value: number;
  /** Pre-formatted primary value text (e.g. "312 min" / "8 kg"). */
  valueLabel: string;
  /** Pre-formatted secondary count text (e.g. "4 ev"). */
  countLabel: string;
  tone: ParetoTone;
};

const TONE_FILL: Record<ParetoTone, string> = {
  plant: 'bg-red-500',
  process: 'bg-amber-500',
  people: 'bg-sky-500',
  neutral: 'bg-slate-400',
};

export function ParetoBars({ bars, testid }: { bars: ParetoBar[]; testid?: string }) {
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0) || 1;
  return (
    <div data-testid={testid} className="flex flex-col">
      {bars.map((b) => {
        const pct = Math.max(0, Math.min(100, (b.value / max) * 100));
        return (
          <div key={b.key} className="grid grid-cols-[minmax(120px,1fr)_2fr_auto_auto] items-center gap-3 py-1.5">
            <div className="truncate text-sm text-slate-700">{b.label}</div>
            <div className="h-2.5 overflow-hidden rounded bg-slate-100">
              <div className={`h-full rounded ${TONE_FILL[b.tone]}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-right font-mono text-xs tabular-nums text-slate-900">{b.valueLabel}</div>
            <div className="w-12 text-right font-mono text-xs tabular-nums text-slate-500">{b.countLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
