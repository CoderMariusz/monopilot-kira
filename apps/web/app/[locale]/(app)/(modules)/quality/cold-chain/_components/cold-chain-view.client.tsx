'use client';

/**
 * Cold-chain viewer (gaps #9) — read-only presentational island.
 *
 * Renders two tables: (1) the configured per-product temperature ranges and
 * (2) the recent delivery-condition checks (pass/fail + measured temp + site).
 * Recording happens at GRN receive (submitConditionCheck) — this v1 is
 * read-only, so there is no mutation / optimistic path here. The Server Action
 * data is fetched by the RSC parent and passed in as plain props, so this
 * island is trivially testable with no network.
 *
 * Status is never colour-only (parity a11y rule): each result cell carries a
 * text label + a data-result attribute alongside the badge tint.
 */

import type { ColdChainConditionCheck, ColdChainTempRange } from '../_actions/cold-chain-view-types';
import type { ColdChainLabels } from './labels';

type Props = {
  ranges: ColdChainTempRange[];
  checks: ColdChainConditionCheck[];
  labels: ColdChainLabels;
  locale: string;
};

function formatTemp(value: number | null, unbounded: string): string {
  return value === null ? unbounded : `${value} °C`;
}

function formatRange(min: number | null, max: number | null, unbounded: string): string {
  if (min === null && max === null) return unbounded;
  return `${formatTemp(min, unbounded)} – ${formatTemp(max, unbounded)}`;
}

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function ColdChainView({ ranges, checks, labels, locale }: Props) {
  return (
    <div data-testid="cold-chain-view" data-state="ready" className="flex flex-col gap-8">
      {/* ── Configured product temperature ranges ─────────────────────────── */}
      <section data-testid="cold-chain-ranges" aria-labelledby="cold-chain-ranges-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="cold-chain-ranges-heading" className="text-lg font-semibold text-slate-950">
            {labels.ranges.heading}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{labels.ranges.caption}</p>
        </div>

        {ranges.length === 0 ? (
          <div
            data-testid="cold-chain-ranges-empty"
            data-state="empty"
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500"
          >
            {labels.ranges.empty}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.ranges.colProduct}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.ranges.colSite}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.ranges.colMin}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.ranges.colMax}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.ranges.colRequiresCheck}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranges.map((row) => (
                  <tr key={row.id} data-testid={`cold-chain-range-${row.id}`} className="text-slate-700">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-500">{row.itemCode}</span>
                      <span className="ml-2 text-slate-900">{row.itemName}</span>
                    </td>
                    <td className="px-4 py-3">{row.siteName ?? labels.ranges.siteAll}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTemp(row.minTempC, labels.ranges.unbounded)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTemp(row.maxTempC, labels.ranges.unbounded)}</td>
                    <td className="px-4 py-3">
                      {row.requiresCheck ? labels.ranges.requiresCheckYes : labels.ranges.requiresCheckNo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Recent delivery-condition checks ──────────────────────────────── */}
      <section data-testid="cold-chain-checks" aria-labelledby="cold-chain-checks-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="cold-chain-checks-heading" className="text-lg font-semibold text-slate-950">
            {labels.checks.heading}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{labels.checks.caption}</p>
        </div>

        {checks.length === 0 ? (
          <div
            data-testid="cold-chain-checks-empty"
            data-state="empty"
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500"
          >
            {labels.checks.empty}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.checks.colProduct}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.checks.colSite}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.checks.colMeasured}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.checks.colRange}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.checks.colResult}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{labels.checks.colWhen}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checks.map((row) => (
                  <tr key={row.id} data-testid={`cold-chain-check-${row.id}`} className="text-slate-700">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-500">{row.itemCode}</span>
                      <span className="ml-2 text-slate-900">{row.itemName}</span>
                    </td>
                    <td className="px-4 py-3">{row.siteName ?? labels.checks.unknownSite}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatTemp(row.measuredTempC, labels.ranges.unbounded)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatRange(row.minTempC, row.maxTempC, labels.ranges.unbounded)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        data-testid={`cold-chain-result-${row.id}`}
                        data-result={row.inRange ? 'pass' : 'fail'}
                        className={
                          row.inRange
                            ? 'inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                            : 'inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700'
                        }
                      >
                        {row.inRange ? labels.checks.pass : labels.checks.fail}
                      </span>
                      {row.hasHold ? (
                        <span
                          data-testid={`cold-chain-hold-${row.id}`}
                          className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        >
                          {labels.checks.hold}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatWhen(row.checkedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p data-testid="cold-chain-record-hint" className="text-xs text-slate-400">
        {labels.recordHint}
      </p>
    </div>
  );
}
