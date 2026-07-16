/**
 * Changeover events table — prototype parity: other-screens.jsx:298-397 (ChangeoverScreen).
 * The prototype renders the live changeover's risk level (304) + dual sign-off gate
 * (364-385); this read-only list surfaces every row with its allergen-risk badge
 * (low/medium/high/segregated) + sign-off status. Presentational only — strings via props.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import type { ChangeoverEventRow, ChangeoverRisk, SignOffStatus } from '../_actions/changeover-data';

export type ChangeoverTableLabels = {
  empty: string;
  none: string;
  col: {
    started: string;
    line: string;
    transition: string;
    allergens: string;
    risk: string;
    signOff: string;
  };
  risk: Record<ChangeoverRisk, string>;
  signOff: (status: SignOffStatus) => string;
  signOffVariant: (status: SignOffStatus) => BadgeVariant;
  dateFmt: (iso: string) => string;
};

const RISK_VARIANT: Record<ChangeoverRisk, BadgeVariant> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  segregated: 'info',
};

export function ChangeoverTable({
  rows,
  labels,
}: {
  rows: ChangeoverEventRow[];
  labels: ChangeoverTableLabels;
}) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="production-changeover-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
      >
        {labels.empty}
      </div>
    );
  }

  return (
    <div data-testid="production-changeover-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">{labels.col.started}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.line}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.transition}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.allergens}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.risk}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.signOff}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const allergens = r.allergenTo.length > 0 ? r.allergenTo : r.allergenFrom;
            return (
              <tr key={r.id} data-testid={`production-changeover-row-${r.id}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{labels.dateFmt(r.startedAt)}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{r.lineLabel}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {(r.woFromNumber ?? '—') + ' → ' + (r.woToNumber ?? '—')}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {allergens.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {allergens.map((a) => (
                        <Badge key={a} variant="muted">
                          {a}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-slate-400">{labels.none}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={RISK_VARIANT[r.riskLevel]} data-testid={`production-changeover-risk-${r.id}`}>
                    {labels.risk[r.riskLevel]}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={labels.signOffVariant(r.signOffStatus)} data-testid={`production-changeover-signoff-${r.id}`}>
                    {labels.signOff(r.signOffStatus)}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
