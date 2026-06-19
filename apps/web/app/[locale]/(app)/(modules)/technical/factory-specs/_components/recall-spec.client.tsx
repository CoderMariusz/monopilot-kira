'use client';

/**
 * R4-CL2 — "Recall to draft" affordance for a released factory specification.
 *
 * Reversibility UI for the Technical release lifecycle: a Technical lead recalls a
 * `released_to_factory` factory_spec back to `draft` (clearing approval + release) so
 * it can be re-edited. Shown only when status === 'released_to_factory'. Gated on the
 * `technical.factory_spec.recall` permission (disabled + tooltip if absent) — the
 * recallFactorySpec action re-checks server-side, so the client never owns the RBAC
 * decision.
 *
 * Confirm dialog with an OPTIONAL reason, modelled on the in-repo confirm/modal
 * precedent (review-modal.client.tsx's local Dialog + the void/reverse correction
 * modals' reason-then-submit shape). No prototype recall screen exists under
 * prototypes/design/Monopilot Design System/technical/, so this is spec-driven off
 * those patterns + the recallFactorySpec action contract.
 *
 * The WO-blocking error from the server ("…released or in-progress work orders
 * reference it: <wo numbers>") is surfaced VERBATIM — it already names the blocking WO
 * numbers (no raw UUIDs). The forbidden + generic cases get localized copy.
 *
 * States: idle (button), confirm (dialog), optimistic (submit disabled +
 * "Recalling…"), error (inline alert), success (router.refresh).
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { recallFactorySpec } from '../_actions/recall-spec';

export function RecallSpecButton({
  specId,
  specCode,
  canRecall,
}: {
  specId: string;
  specCode: string;
  canRecall: boolean;
}) {
  const t = useTranslations('Technical.factorySpecs.recall');
  const router = useRouter();
  const titleId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, pending]);

  function mapError(raw: string): string {
    // forbidden gets localized copy; the WO-blocking + status messages are surfaced
    // verbatim from the server (they already name the blocking WO numbers / status).
    if (raw === 'forbidden') return t('errors.forbidden');
    if (raw === 'persistence_failed') return t('errors.generic');
    return raw;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const reason_ = reason.trim() ? reason.trim() : undefined;
      const result = await recallFactorySpec({ specId, reason: reason_ });
      if ('error' in result) {
        setError(mapError(result.error));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        data-testid={`factory-spec-recall-${specId}`}
        className="font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
        style={{ color: 'var(--red)' }}
        disabled={!canRecall}
        aria-disabled={!canRecall}
        title={canRecall ? undefined : t('permissionTooltip')}
        onClick={() => setOpen(true)}
      >
        {t('action')}
      </button>

      {open ? (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-box outline-none">
            <div className="modal-head">
              <h2 id={titleId} className="modal-title">
                {t('title')}
              </h2>
              <button
                type="button"
                aria-label={t('cancel')}
                className="modal-close"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="helper">{t('body', { spec: specCode })}</p>

              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  {t('reasonLabel')}{' '}
                  <span className="helper" style={{ fontWeight: 400 }}>
                    ({t('reasonOptional')})
                  </span>
                </span>
                <textarea
                  data-testid="factory-spec-recall-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t('reasonPlaceholder')}
                  rows={3}
                  disabled={pending}
                  className="rounded-md border px-2.5 py-1.5 focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>

              {error ? (
                <div role="alert" className="alert alert-red mt-3" style={{ fontSize: 12 }} data-testid="factory-spec-recall-error">
                  {error}
                </div>
              ) : null}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setOpen(false)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                data-testid="factory-spec-recall-confirm"
                className="btn btn-danger btn-sm"
                disabled={pending}
                aria-busy={pending}
                onClick={submit}
              >
                {pending ? t('submitting') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
