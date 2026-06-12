/**
 * Waste events table — prototype parity: new-screens.jsx:174-199 (Waste events card +
 * table). Columns: Time · Line · WO · Category · Qty (kg) · Operator · Reason.
 * Presentational only — all strings arrive as props (i18n resolved by the RSC page).
 */
import { Badge } from '@monopilot/ui/Badge';

import type { WasteEventRow } from '../_actions/waste-data';

export type WasteTableLabels = {
  empty: string;
  uncategorized: string;
  col: {
    time: string;
    line: string;
    wo: string;
    category: string;
    qty: string;
    operator: string;
    reason: string;
  };
  /** C-R2 — corrected-original badge (same copy family as wo-detail). */
  voidedBadge: string;
  qtyFmt: (kg: number) => string;
  dateFmt: (iso: string) => string;
  /** C-R2 — "Correction of #…" counter-row badge (ref = original id prefix). */
  correctionOfFmt: (ref: string) => string;
};

export function WasteTable({ rows, labels }: { rows: WasteEventRow[]; labels: WasteTableLabels }) {
  // C-R2 correction index (same pattern as wo-detail-screen): counter rows carry
  // correctionOfId; their originals render struck-through with a "Voided" badge,
  // the counter rows themselves get a "Correction of #…" badge.
  const correctedOriginalIds = new Set<string>();
  for (const r of rows) {
    if (r.correctionOfId) correctedOriginalIds.add(r.correctionOfId);
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid="production-waste-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500"
      >
        {labels.empty}
      </div>
    );
  }

  return (
    <div data-testid="production-waste-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">{labels.col.time}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.line}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.wo}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.category}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.col.qty}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.operator}</th>
            <th className="px-3 py-2 font-semibold">{labels.col.reason}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isVoided = correctedOriginalIds.has(r.id);
            const correctionRef = r.correctionOfId;
            return (
              <tr
                key={r.id}
                data-testid={`production-waste-row-${r.id}`}
                className={`border-b border-slate-100 last:border-0${isVoided ? ' opacity-60' : ''}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{labels.dateFmt(r.recordedAt)}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{r.lineId ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.woNumber ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {r.categoryName ? (
                      <Badge variant="warning">{r.categoryName}</Badge>
                    ) : (
                      <span className="text-slate-400">{labels.uncategorized}</span>
                    )}
                    {isVoided ? (
                      <Badge variant="muted" className="text-[10px]" data-testid={`production-waste-voided-${r.id}`}>
                        {labels.voidedBadge}
                      </Badge>
                    ) : null}
                    {correctionRef ? (
                      <Badge variant="info" className="text-[10px]" data-testid={`production-waste-correction-${r.id}`}>
                        {labels.correctionOfFmt(correctionRef.slice(0, 8))}
                      </Badge>
                    ) : null}
                  </span>
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono tabular-nums ${isVoided ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                >
                  {labels.qtyFmt(r.qtyKg)}
                </td>
                <td className="px-3 py-2 text-slate-700">{r.operatorName ?? '—'}</td>
                <td className="max-w-[260px] px-3 py-2 text-slate-700">{r.reason ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
