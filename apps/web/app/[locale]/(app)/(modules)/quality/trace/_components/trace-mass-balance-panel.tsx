import { Badge } from '@monopilot/ui/Badge';

import type { TraceLabels } from './labels';
import type { TraceMassBalance, TraceMassBalanceLine, TraceTruncation, TraceTruncationLayerKind } from './trace-contracts';

type ApplicableBalance = Extract<TraceMassBalance, { applicable: true }>;

const LAYER_LABEL: Record<TraceTruncationLayerKind, keyof TraceLabels['truncation']> = {
  seed_lp: 'layerSeedLp',
  seed_batch: 'layerSeedBatch',
  seed_item: 'layerSeedItem',
};

const LINE_LABEL: Record<ApplicableBalance['lines'][number]['key'], keyof TraceLabels['massBalance']> = {
  produced: 'produced',
  on_site: 'onSite',
  shipped: 'shipped',
  waste: 'waste',
  recovered: 'recovered',
  delta: 'delta',
};

export function TraceTruncationBanner({
  labels,
  truncation,
}: {
  labels: TraceLabels;
  truncation: TraceTruncation;
}) {
  if (!truncation.truncated) return null;

  const layerText = truncation.layers
    .map((layer) => labels.truncation[LAYER_LABEL[layer.layer]].replace('{limit}', String(layer.limit)))
    .join('; ');

  return (
    <div
      role="alert"
      data-testid="trace-truncation-banner"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <p className="font-semibold">{labels.truncation.banner}</p>
      {layerText ? <p className="mt-1 text-amber-800">{layerText}</p> : null}
    </div>
  );
}

export function TraceMassBalancePanel({
  labels,
  massBalance,
}: {
  labels: TraceLabels;
  massBalance: TraceMassBalance;
}) {
  // F2: site-restricted users cannot compute a meaningful mass balance because
  // their license_plates are site-pruned while wo_outputs / wo_waste_log are
  // org-wide.  Render an explicit notice instead of fabricated numbers.
  if ('scopeLimited' in massBalance && massBalance.scopeLimited) {
    return (
      <section
        aria-label={labels.massBalance.ariaLabel}
        data-testid="trace-mass-balance"
        className="flex flex-col gap-2"
      >
        <h2 className="text-sm font-semibold text-slate-800">{labels.massBalance.title}</h2>
        <div
          role="alert"
          data-testid="trace-mass-balance-scope-limited"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        >
          {labels.massBalance.scopeLimited}
        </div>
      </section>
    );
  }

  // TypeScript cannot narrow the union type after the early return above because
  // `massBalance` is still typed as the full union. Cast to the applicable variant.
  const balance = massBalance as ApplicableBalance;
  const deltaLine = balance.lines.find((line: TraceMassBalanceLine) => line.key === 'delta');

  return (
    <section
      aria-label={labels.massBalance.ariaLabel}
      data-testid="trace-mass-balance"
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{labels.massBalance.title}</h2>
        <Badge variant={balance.balanced ? 'success' : 'warning'} data-testid="trace-mass-balance-status">
          {labels.massBalance.percentRecovered.replace('{percent}', balance.percentRecovered)}
        </Badge>
        {!balance.balanced && deltaLine ? (
          <span data-testid="trace-mass-balance-unbalanced" className="text-xs font-medium text-amber-700">
            {labels.massBalance.unbalanced.replace('{delta}', `${deltaLine.qtyKg} kg`)}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table data-testid="trace-mass-balance-table" className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                {labels.table.type}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                {labels.table.qty}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {balance.lines.map((line: TraceMassBalanceLine) => (
              <tr
                key={line.key}
                data-testid={`trace-mass-balance-row-${line.key}`}
                className={line.key === 'delta' && !balance.balanced ? 'bg-amber-50' : undefined}
              >
                <td className="px-4 py-2 font-medium text-slate-700">{labels.massBalance[LINE_LABEL[line.key]]}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{line.qtyKg} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {balance.unreconciled.length > 0 ? (
        <div
          data-testid="trace-mass-balance-unreconciled"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        >
          <p className="font-medium">{labels.massBalance.unreconciledTitle}</p>
          <ul className="mt-1 list-disc pl-5">
            {balance.unreconciled.map((row) => (
              <li key={`${row.bucket}:${row.ref}:${row.uom}`}>
                {labels.massBalance.unreconciledRow
                  .replace('{ref}', row.ref)
                  .replace('{qty}', row.qty)
                  .replace('{uom}', row.uom)
                  .replace('{bucket}', row.bucket)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
