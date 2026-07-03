'use client';

import Link from 'next/link';

import type { WipWhereUsedRow } from '../_lib/wip-definition-contract';
import type { WipLibraryLabels } from './wip-labels';

export function WipWhereUsedPanel({
  rows,
  labels,
  locale,
}: {
  rows: WipWhereUsedRow[];
  labels: WipLibraryLabels;
  locale: string;
}) {
  return (
    <section className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="wip-where-used">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{labels.whereUsedTitle}</h2>
        <p className="text-xs text-slate-500">{labels.whereUsedSubtitle}</p>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">{labels.whereUsedEmpty}</div>
      ) : (
        <table aria-label={labels.whereUsedTitle}>
          <thead>
            <tr>
              <th scope="col">{labels.whereUsedColProject}</th>
              <th scope="col">{labels.whereUsedColFgCode}</th>
              <th scope="col">{labels.whereUsedColAcceptedVersion}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.projectId} data-testid="wip-where-used-row">
                <td>
                  <Link
                    href={`/${locale}/npd/pipeline/${row.projectId}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {row.projectName}
                  </Link>
                </td>
                <td className="mono">{row.fgCode}</td>
                <td className="mono tabular-nums">
                  {row.acceptedVersion === null ? '—' : `v${row.acceptedVersion}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
