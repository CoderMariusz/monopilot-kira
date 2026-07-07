import { Badge } from '@monopilot/ui/Badge';

import type { TraceLabels } from './labels';
import type { TraceMassBalance, TraceTruncation, TraceTruncationLayerKind } from './trace-contracts';

type ApplicableBalance = Extract<TraceMassBalance, { applicable: true }>;

const LAYER_LABEL: Record<TraceTruncationLayerKind, keyof TraceLabels['truncation']> = {
  seed_lp: 'layerSeedLp',
  seed_batch: 'layerSeedBatch',
  seed_item: 'layerSeedItem',
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

  const balance = massBalance as ApplicableBalance;
  const anyNodeUnbalanced = balance.nodes.some((node) => !node.balanced);
  const showNettedWarning = !balance.total.balanced;

  return (
    <section
      aria-label={labels.massBalance.ariaLabel}
      data-testid="trace-mass-balance"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{labels.massBalance.title}</h2>
        <Badge
          variant={balance.total.balanced && !anyNodeUnbalanced ? 'success' : 'warning'}
          data-testid="trace-mass-balance-status"
        >
          {labels.massBalance.percentAccounted.replace('{percent}', balance.total.percentAccounted)}
        </Badge>
        {showNettedWarning ? (
          <span data-testid="trace-mass-balance-unbalanced" className="text-xs font-medium text-amber-700">
            {labels.massBalance.nettedUnbalanced.replace('{delta}', `${balance.total.deltaKg} kg`)}
          </span>
        ) : null}
      </div>

      {balance.nodes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.massBalance.nodeTitle}</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table data-testid="trace-mass-balance-nodes" className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                    {labels.massBalance.nodeWo}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                    {labels.massBalance.nodeInput}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                    {labels.massBalance.nodeOutput}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                    {labels.massBalance.nodeWaste}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                    {labels.massBalance.nodeRemaining}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                    {labels.massBalance.nodeDelta}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balance.nodes.map((node) => (
                  <tr
                    key={node.woRef}
                    data-testid={`trace-mass-balance-node-${node.woRef}`}
                    className={!node.balanced ? 'bg-amber-50' : undefined}
                  >
                    <td className="px-4 py-2 font-medium text-slate-800">{node.woRef}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{node.inputKg} kg</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{node.outputKg} kg</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{node.wasteKg} kg</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{node.remainingKg} kg</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-800">{node.deltaKg} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.massBalance.totalTitle}</h3>
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
              <tr data-testid="trace-mass-balance-row-seed">
                <td className="px-4 py-2 font-medium text-slate-700">{labels.massBalance.seedInput}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{balance.total.seedInputKg} kg</td>
              </tr>
              <tr data-testid="trace-mass-balance-row-shipped">
                <td className="px-4 py-2 font-medium text-slate-700">{labels.massBalance.shipped}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{balance.total.shippedKg} kg</td>
              </tr>
              <tr data-testid="trace-mass-balance-row-on-site">
                <td className="px-4 py-2 font-medium text-slate-700">{labels.massBalance.onSite}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{balance.total.onSiteKg} kg</td>
              </tr>
              <tr data-testid="trace-mass-balance-row-waste">
                <td className="px-4 py-2 font-medium text-slate-700">{labels.massBalance.waste}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{balance.total.wasteKg} kg</td>
              </tr>
              <tr
                data-testid="trace-mass-balance-row-delta"
                className={!balance.total.balanced ? 'bg-amber-50' : undefined}
              >
                <td className="px-4 py-2 font-medium text-slate-700">{labels.massBalance.nettedDelta}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800">{balance.total.deltaKg} kg</td>
              </tr>
            </tbody>
          </table>
        </div>
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
