'use client';

import type { MwoListRow, MwoTransition } from '../_actions/mwo-actions';
import type { MwoActionPermissions, MwoListLabels } from './mwo-list.client';

/** Per-status row action (work-orders.jsx:222-227): open→Start, in_progress→Complete, + Cancel. */
export function RowActions({
  row,
  labels,
  permissions,
  onTransition,
}: {
  row: MwoListRow;
  labels: MwoListLabels;
  permissions: MwoActionPermissions;
  onTransition: (to: MwoTransition) => void;
}) {
  const terminal = row.state === 'completed' || row.state === 'cancelled';
  if (terminal) return <span className="text-xs text-slate-300">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {row.state === 'open' && permissions.canExecute ? (
        <button
          type="button"
          data-testid={`mwo-start-${row.id}`}
          onClick={() => onTransition('in_progress')}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {labels.action.start}
        </button>
      ) : null}
      {row.state === 'in_progress' && permissions.canExecute ? (
        <button
          type="button"
          data-testid={`mwo-complete-${row.id}`}
          onClick={() => onTransition('completed')}
          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          {labels.action.complete}
        </button>
      ) : null}
      {permissions.canCancel ? (
        <button
          type="button"
          data-testid={`mwo-cancel-${row.id}`}
          onClick={() => onTransition('cancelled')}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-red-200 hover:text-red-600"
        >
          {labels.action.cancel}
        </button>
      ) : null}
      {!permissions.canExecute && !permissions.canCancel ? (
        <span className="text-xs text-slate-300">—</span>
      ) : null}
    </div>
  );
}
