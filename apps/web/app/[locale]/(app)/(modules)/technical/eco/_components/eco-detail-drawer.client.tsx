'use client';

/**
 * N1-A — ECO detail drawer + status-appropriate workflow actions.
 *
 * Prototype parity:
 *   - The row → detail drill-in is implied by the cursor:pointer rows in
 *     `other-screens.jsx:160-174` (`EcoScreen` table). A right-hand drawer is
 *     the cheaper master-detail than a separate route and keeps the list in
 *     context (per task: "cheaper = drawer/detail panel").
 *   - The approve action mirrors `modals.jsx:417-455` (`EcoApprovalModal`,
 *     MODAL-07): "Approve → ECO moves to Implementing". Here the canonical
 *     server state machine is draft→approved→implementing→closed, so the drawer
 *     surfaces exactly the one transition legal for the current status:
 *       draft        → Approve   (gated on technical.eco.approve)
 *       approved     → Start implementation
 *       implementing → Close
 *       closed       → (terminal, no action)
 *
 * Each transition calls the matching T2 server action; `invalid_state` (a
 * concurrent transition) is surfaced inline and the drawer re-fetches.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { approveChangeOrder } from '../_actions/approve-change-order';
import { closeChangeOrder } from '../_actions/close-change-order';
import { getChangeOrder } from '../_actions/get-change-order';
import type { EcoDetail } from '../_actions/shared';
import { startChangeOrderImplementation } from '../_actions/start-change-order-implementation';
import { ECO_PRIORITY_BADGE, ECO_STATUS_BADGE, makeFallback } from './eco-ui';

type LoadState = 'loading' | 'ready' | 'error';

export function EcoDetailButton({
  id,
  canApprove,
  openLabel,
}: {
  id: string;
  canApprove: boolean;
  openLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        {openLabel}
      </button>
      {open ? (
        <EcoDetailDrawer id={id} canApprove={canApprove} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function EcoDetailDrawer({
  id,
  canApprove,
  onClose,
}: {
  id: string;
  canApprove: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Technical.eco');
  const tt = React.useMemo(() => makeFallback(t), [t]);
  const router = useRouter();
  const titleId = React.useId();

  const [loadState, setLoadState] = React.useState<LoadState>('loading');
  const [detail, setDetail] = React.useState<EcoDetail | null>(null);
  const [acting, setActing] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const errorLabels = React.useMemo<Record<string, string>>(
    () => ({
      invalid_input: tt('errors.invalid_input', 'Check the change order fields and try again.'),
      forbidden: tt('errors.forbidden', 'You do not have permission for this action.'),
      not_found: tt('errors.not_found', 'The change order was not found.'),
      already_exists: tt('errors.already_exists', 'A change order with this code already exists.'),
      invalid_state: tt('errors.invalid_state', 'The change order is no longer in the expected state — it was refreshed.'),
      persistence_failed: tt('errors.persistence_failed', 'The action could not be completed.'),
    }),
    [tt],
  );

  const load = React.useCallback(async () => {
    setLoadState('loading');
    const result = await getChangeOrder({ id });
    if (!result.ok) {
      setLoadState('error');
      return;
    }
    setDetail(result.data);
    setLoadState('ready');
  }, [id]);

  const actingRef = React.useRef(acting);
  actingRef.current = acting;

  React.useEffect(() => {
    void load();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actingRef.current) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [load, onClose]);

  async function runTransition(fn: (input: { id: string }) => Promise<{ ok: boolean; error?: string }>) {
    setActing(true);
    setActionError(null);
    const result = await fn({ id });
    setActing(false);
    if (!result.ok) {
      setActionError(errorLabels[result.error ?? 'persistence_failed'] ?? errorLabels.persistence_failed);
      // invalid_state ⇒ stale; re-fetch the canonical status so buttons re-render.
      if (result.error === 'invalid_state' || result.error === 'not_found') void load();
      return;
    }
    router.refresh();
    await load();
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !acting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box wide outline-none"
        data-testid="eco-detail-drawer"
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {detail ? detail.code : tt('detail.loading', 'Loading…')}
            </h2>
            {detail ? <p className="helper mt-0.5">{detail.title}</p> : null}
          </div>
          <button
            type="button"
            aria-label={tt('create.close', 'Close')}
            className="modal-close"
            onClick={onClose}
            disabled={acting}
          >
            x
          </button>
        </div>

        <div className="modal-body">
          {loadState === 'loading' ? (
            <p role="status">{tt('detail.loading', 'Loading…')}</p>
          ) : loadState === 'error' || !detail ? (
            <div role="alert" className="alert alert-red">
              <div className="alert-title">{tt('detail.error', 'The change order could not be loaded.')}</div>
            </div>
          ) : (
            <>
              {actionError ? (
                <div role="alert" className="alert alert-red mb-3">
                  <div className="alert-title">{actionError}</div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span className={`badge ${ECO_STATUS_BADGE[detail.status]}`}>
                  {tt(`status.${detail.status}`, detail.status)}
                </span>
                <span className={`badge ${ECO_PRIORITY_BADGE[detail.priority] ?? 'badge-gray'}`}>
                  {tt(`priority.${detail.priority}`, detail.priority)}
                </span>
                <span className="badge badge-gray">{tt(`changeType.${detail.changeType}`, detail.changeType)}</span>
              </div>

              {detail.description ? <p className="mb-3">{detail.description}</p> : null}
              {detail.impactSummary ? (
                <p className="helper mb-3">
                  {tt('detail.impact', 'Impact')}: {detail.impactSummary}
                </p>
              ) : null}

              <h3 className="helper" style={{ fontWeight: 600 }}>
                {tt('detail.lines', 'Change lines')}
              </h3>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table aria-label={tt('detail.lines', 'Change lines')}>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">{tt('detail.col.action', 'Action')}</th>
                      <th scope="col">{tt('detail.col.targetType', 'Target')}</th>
                      <th scope="col">{tt('detail.col.rationale', 'Change description')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="mono">{line.lineNo}</td>
                        <td>{tt(`lineAction.${line.action}`, line.action)}</td>
                        <td>{tt(`targetType.${line.targetType}`, line.targetType)}</td>
                        <td>{line.rationale ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={acting}>
            {tt('detail.close', 'Close')}
          </button>

          {detail?.status === 'draft' && canApprove ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={acting}
              onClick={() => runTransition((i) => approveChangeOrder(i))}
            >
              {acting ? tt('detail.working', 'Working…') : tt('detail.approve', 'Approve ECO')}
            </button>
          ) : null}

          {detail?.status === 'approved' ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={acting}
              onClick={() => runTransition((i) => startChangeOrderImplementation(i))}
            >
              {acting ? tt('detail.working', 'Working…') : tt('detail.start', 'Start implementation')}
            </button>
          ) : null}

          {detail?.status === 'implementing' ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={acting}
              onClick={() => runTransition((i) => closeChangeOrder(i))}
            >
              {acting ? tt('detail.working', 'Working…') : tt('detail.close_eco', 'Close ECO')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
