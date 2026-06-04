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
 * Local Dialog primitive (not Radix) — same established React-19/jsdom deviation as
 * the items master island. Production a11y semantics preserved.
 */

import React from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';

import { specBadge } from '../../../../../../../lib/technical/release-state-adapters';
import type { FactorySpecListItem } from '../_actions/shared';
import { ReleaseBundlePanelButton } from './release-bundle-panel.client';

function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
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
        className="w-full max-w-2xl rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-5 flex justify-end gap-2">{footer}</div>
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

export function FactorySpecRowActions({
  spec,
  canApprove,
  reviewLabel,
}: {
  spec: FactorySpecListItem;
  canApprove: boolean;
  reviewLabel: string;
}) {
  const t = useTranslations('Technical.factorySpecs');
  const [open, setOpen] = React.useState(false);

  const badge = specBadge(spec.status);
  const isImmutable = spec.status === 'approved_for_factory' || spec.status === 'released_to_factory';
  const bomPending = spec.bomStatus != null && ['draft', 'in_review'].includes(spec.bomStatus);

  return (
    <span className="flex items-center justify-end gap-3">
      <button
        type="button"
        className="font-medium text-blue-600 underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        {reviewLabel}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('modal.title', { spec: spec.specCode })}
        subtitle={t('modal.subtitle', { name: `${spec.fgItemCode} ${spec.fgName}`, version: spec.version })}
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t('modal.close')}
            </Button>
            {canApprove ? (
              <Button type="button" className="btn-primary">
                {t('modal.markReviewed')}
              </Button>
            ) : null}
          </>
        }
      >
        <dl className="rounded-md border bg-slate-50 px-4 py-2 text-sm">
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
          <Badge
            variant={
              badge.colorToken === 'red'
                ? 'danger'
                : badge.colorToken === 'amber'
                  ? 'warning'
                  : badge.colorToken === 'blue'
                    ? 'info'
                    : 'success'
            }
          >
            {badge.label}
          </Badge>
          {badge.blockingReasonCode ? (
            <span className="text-xs text-muted-foreground">{badge.blockingReasonCode}</span>
          ) : null}
        </div>

        {isImmutable ? (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span aria-hidden>△</span>
            <span>{t('modal.cloneOnWrite')}</span>
          </div>
        ) : null}

        {bomPending ? (
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            {t('modal.g4Note')}
          </div>
        ) : null}

        {canApprove ? (
          <div className="mt-4 border-t pt-3">
            <ReleaseBundlePanelButton factorySpecId={spec.id} label={t('modal.openBundle')} />
          </div>
        ) : (
          <div role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('modal.permissionDenied')}
          </div>
        )}
      </Dialog>
    </span>
  );
}
