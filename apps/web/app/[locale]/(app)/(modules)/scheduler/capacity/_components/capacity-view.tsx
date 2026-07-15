import type { CapacityLineRow } from '../_actions/capacity-loaders';

export type CapacityViewLabels = {
  empty: string;
  emptyHint: string;
  horizonNote: string;
  legendWo: string;
  legendDraft: string;
  noCap: string;
  hours: (n: number) => string;
  util: (pct: number) => string;
};

export function CapacityView({
  lines,
  dayKeys,
  horizonNote,
  labels,
}: {
  lines: CapacityLineRow[];
  dayKeys: string[];
  horizonNote: string;
  labels: CapacityViewLabels;
}) {
  if (lines.length === 0) {
    return (
      <div
        data-testid="scheduler-capacity-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"
      >
        <p className="text-sm font-medium text-slate-800">{labels.empty}</p>
        <p className="mt-1 text-sm text-slate-500">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p data-testid="scheduler-capacity-horizon" className="text-sm text-slate-600">
        {horizonNote}
      </p>
      <p className="text-xs text-slate-500">
        {labels.legendWo} · {labels.legendDraft}
      </p>
      <div
        data-testid="scheduler-capacity-table"
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
      >
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-4 py-3 font-medium">Line</th>
              {dayKeys.map((day) => (
                <th key={day} className="px-3 py-3 font-medium whitespace-nowrap">
                  {day.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.lineId}
                data-testid={`scheduler-capacity-line-${line.lineCode}`}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-900">
                  <div>{line.lineCode}</div>
                  <div className="text-xs font-normal text-slate-500">{line.lineName}</div>
                  <div className="text-xs font-normal text-slate-400">
                    {line.capacityHoursPerDay === null
                      ? labels.noCap
                      : labels.hours(line.capacityHoursPerDay)}
                    /day
                  </div>
                </td>
                {line.days.map((cell) => {
                  const hot =
                    cell.utilisationPct !== null && cell.utilisationPct >= 90
                      ? 'bg-amber-50 text-amber-900'
                      : cell.occupiedHours > 0
                        ? 'bg-slate-50 text-slate-800'
                        : 'text-slate-400';
                  return (
                    <td
                      key={cell.day}
                      data-testid={`scheduler-capacity-cell-${line.lineCode}-${cell.day}`}
                      className={`px-3 py-3 align-top whitespace-nowrap ${hot}`}
                      title={`WO ${cell.sourceWoHours}h · draft ${cell.sourceDraftHours}h`}
                    >
                      <div className="font-medium">{labels.hours(cell.occupiedHours)}</div>
                      <div className="text-xs">
                        {cell.utilisationPct === null
                          ? '—'
                          : labels.util(cell.utilisationPct)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
