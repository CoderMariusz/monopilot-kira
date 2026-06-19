'use client';

/**
 * T-060 — Factory Specs Review modal (TEC-085) + per-row actions.
 *
 * Translated from `prototypes/design/Monopilot Design System/technical/modals.jsx:460-483`
 * (`SpecReviewModal`): a wide review Modal with a Summary block + a "Close" /
 * "Mark reviewed" footer. Augmented per the task contract to surface the shared
 * RELEASE status, the paired BOM status, the clone-on-write warning for
 * released/approved (immutable) versions, the RM-usability/release blockers, and a
 * link into the T-090 FactorySpec+BOM bundle approval panel. The legacy `SP-*` id and
 * `FA*` copy are red-lined to the canonical spec_code + FG vocabulary.
 *
 * MON-design-system parity (TW1-cost lane): the prior build had drifted to raw
 * Tailwind chrome (bg-black/40, rounded-xl border shadow-lg, bg-slate-50/amber-50,
 * text-blue-600). Restyled to the locked `.modal-overlay`/`.modal-box`/`.modal-head`/
 * `.modal-body`/`.modal-foot` + `.alert-*` + `.btn-*` classes. The dead "Mark
 * reviewed" footer button (no onClick → no backend) is wired to the actual
 * review→approve workflow: it opens the T-090 bundle-approval panel.
 *
 * Local Dialog primitive (not Radix) — same established React-19/jsdom deviation as
 * the items master island. Production a11y semantics preserved.
 */

import React from 'react';
import { useTranslations } from 'next-intl';

import { specBadge } from '../../../../../../../lib/technical/release-state-adapters';
import type { FactorySpecListItem } from '../_actions/shared';
import { ReleaseBundlePanelButton } from './release-bundle-panel.client';
import { RecallSpecButton } from './recall-spec.client';

function Dialog({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  closeLabel: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box wide outline-none"
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle ? <p className="helper mt-0.5">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label={closeLabel} className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </div>
  );
}

// Map the 5 semantic colour tokens to a .badge tone class (MON-design-system rule 8).
const BADGE_TONE: Record<string, string> = {
  red: 'badge-red',
  amber: 'badge-amber',
  blue: 'badge-blue',
  green: 'badge-green',
  gray: 'badge-gray',
};

export function FactorySpecRowActions({
  spec,
  canApprove,
  canRecall = false,
  reviewLabel,
}: {
  spec: FactorySpecListItem;
  canApprove: boolean;
  /** R4-CL2 — caller holds technical.factory_spec.recall (gates "Recall to draft"). */
  canRecall?: boolean;
  reviewLabel: string;
}) {
  const t = useTranslations('Technical.factorySpecs');
  const [open, setOpen] = React.useState(false);

  const badge = specBadge(spec.status);
  const isImmutable = spec.status === 'approved_for_factory' || spec.status === 'released_to_factory';
  const bomPending = spec.bomStatus != null && ['draft', 'in_review'].includes(spec.bomStatus);
  // R4-CL2 — the recall affordance only applies to a released spec.
  const isReleased = spec.status === 'released_to_factory';

  return (
    <span className="flex items-center justify-end gap-3">
      <button
        type="button"
        className="font-medium hover:underline"
        style={{ color: 'var(--blue)' }}
        onClick={() => setOpen(true)}
      >
        {reviewLabel}
      </button>

      {isReleased ? (
        <RecallSpecButton specId={spec.id} specCode={spec.specCode} canRecall={canRecall} />
      ) : null}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={t('modal.close')}
        title={t('modal.title', { spec: spec.specCode })}
        subtitle={t('modal.subtitle', { name: `${spec.fgItemCode} ${spec.fgName}`, version: spec.version })}
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
              {t('modal.close')}
            </button>
            {canApprove ? (
              // "Mark reviewed" = the review→approve workflow → opens the T-090
              // bundle-approval panel (previously a dead no-op button).
              <ReleaseBundlePanelButton
                factorySpecId={spec.id}
                label={t('modal.markReviewed')}
                triggerClassName="btn btn-primary btn-sm"
              />
            ) : null}
          </>
        }
      >
        <dl className="ff" style={{ background: 'var(--gray-050)', borderRadius: 4, padding: '8px 14px' }}>
          <SummaryRow label={t('modal.releaseStatus')} value={badge.label} />
          <SummaryRow
            label={t('modal.pairedBom')}
            value={spec.bomVersion != null ? t('modal.bomVersion', { version: spec.bomVersion }) : t('modal.noBom')}
            mono
          />
          <SummaryRow label={t('modal.shelfLife')} value={spec.shelfLifeDays != null ? `${spec.shelfLifeDays} d` : '—'} mono />
          <SummaryRow label={t('modal.source')} value={spec.source} />
        </dl>

        <div className="mt-3 flex items-center gap-2">
          <span className={`badge ${BADGE_TONE[badge.colorToken] ?? 'badge-gray'}`}>{badge.label}</span>
          {badge.blockingReasonCode ? (
            <span className="text-xs text-muted-foreground">{badge.blockingReasonCode}</span>
          ) : null}
        </div>

        {isImmutable ? (
          <div className="alert alert-amber mt-3" style={{ fontSize: 12 }}>
            <span aria-hidden>△</span>
            <span>{t('modal.cloneOnWrite')}</span>
          </div>
        ) : null}

        {bomPending ? (
          <div className="alert alert-blue mt-3" style={{ fontSize: 12 }}>
            {t('modal.g4Note')}
          </div>
        ) : null}

        {canApprove ? (
          <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <ReleaseBundlePanelButton factorySpecId={spec.id} label={t('modal.openBundle')} />
          </div>
        ) : (
          <div role="status" className="alert alert-amber mt-4" style={{ fontSize: 12 }}>
            {t('modal.permissionDenied')}
          </div>
        )}
      </Dialog>
    </span>
  );
}
