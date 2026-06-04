'use client';

/**
 * T-075 — WaterfallBar (one step of the 9-step costing waterfall).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:113-124
 *   (the `.waterfall` / `.waterfall-bar` block — floating cumulative fill + label + value)
 *
 * Translation notes (prototype-index-npd.json#costing_screen):
 *   - prototype `.waterfall-bar` CSS bars (float div widths) → an accessible
 *     <li> row with a label, a width-scaled bar (the cumulative running total)
 *     and the formatted euro value. The TOTAL/Retail step renders bold + full
 *     opacity, intermediate steps render at reduced opacity (parity with the
 *     prototype's 0.3 / 1 opacity split).
 *   - money is rendered from a NUMERIC decimal STRING — never a JS float. We do
 *     NOT parse it for display; only the BAR WIDTH (a layout-only %, not money)
 *     is derived numerically from the value/scale.
 */

import React from 'react';

export type WaterfallStepKind = 'add' | 'total';

export interface WaterfallBarProps {
  /** Canonical step name (also used as the row test label). */
  label: string;
  /** Formatted, currency-prefixed display value (e.g. "€15.17"). */
  displayValue: string;
  /** Layout-only fill width 0..100 (NOT money — safe to compute as a number). */
  fillPct: number;
  kind: WaterfallStepKind;
  /** Optional step-over-step delta, already formatted (e.g. "+11.1%"). */
  deltaText?: string | null;
}

export function WaterfallBar({ label, displayValue, fillPct, kind, deltaText }: WaterfallBarProps) {
  const isTotal = kind === 'total';
  const width = Math.max(0, Math.min(100, fillPct));

  return (
    <li
      data-testid="waterfall-step"
      data-kind={kind}
      className="grid grid-cols-[10rem_1fr_5.5rem] items-center gap-3 py-1.5"
    >
      <span
        data-testid="waterfall-step-label"
        className={['truncate text-sm', isTotal ? 'font-bold text-slate-950' : 'text-slate-700'].join(
          ' ',
        )}
      >
        {label}
      </span>

      <span
        className="relative h-5 overflow-hidden rounded bg-slate-100"
        role="img"
        aria-label={`${label}: ${displayValue}`}
      >
        <span
          aria-hidden="true"
          data-testid="waterfall-step-fill"
          className={[
            'absolute inset-y-0 left-0 rounded',
            isTotal ? 'bg-slate-900' : 'bg-sky-500/70',
          ].join(' ')}
          style={{ width: `${width}%` }}
        />
      </span>

      <span
        data-testid="waterfall-step-value"
        className={[
          'text-right font-mono text-sm tabular-nums',
          isTotal ? 'font-bold text-slate-950' : 'text-slate-700',
        ].join(' ')}
      >
        {displayValue}
        {deltaText ? (
          <span className="ml-1 text-[11px] font-normal text-slate-400">{deltaText}</span>
        ) : null}
      </span>
    </li>
  );
}

export default WaterfallBar;
