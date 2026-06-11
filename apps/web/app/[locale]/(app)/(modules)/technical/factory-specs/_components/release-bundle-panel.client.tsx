'use client';

/**
 * T-090 — FactorySpec + BOM bundle approval panel/modal.
 *
 * Renders the paired-status grid, blockers/preflight panel, approval/rejection
 * history, the approve/reject radio (disabled-on-blocker), the clone-on-write
 * banner, the D365-disabled messaging and the CFR 21 Part 11 e-signature PIN
 * confirm — translated from the layout-primitive prototype
 * `prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:653-781`
 * (`FactorySpecBomBundleApprovalModal`). Legacy `FA*`/`PR-code` copy is red-lined to
 * the canonical FG / WIP-intermediate / factory_spec vocabulary.
 *
 * UI-ONLY: it CONSUMES the existing T-080 actions
 * (`approveReleaseBundleAction` / `rejectReleaseBundleAction`) and the T-090
 * `loadReleaseBundle` read model — it implements NO backend release logic.
 *
 * MON-design-system parity (TW1-cost lane): the prior build had drifted to raw
 * Tailwind chrome (bg-black/40, rounded-xl border shadow-lg, bg-slate/amber/red/blue-50,
 * text-slate-700). Restyled to the locked `.modal-*` + `.alert-*` + `.ff` + `.btn-*`
 * + `.badge-*` classes. Functionality (approve/reject via the T-080 actions, the
 * PIN + reason e-signature) is unchanged.
 *
 * Local Dialog primitive (not the Radix-backed @monopilot/ui Modal): the workspace
 * ships a React 18 peer @radix-ui/react-dialog while apps/web runs React 19, so
 * mounting Radix in jsdom crashes with a dual-React useRef null. Production semantics
 * (role="dialog", aria-modal, focus on open, Escape + backdrop close, labelled title)
 * are preserved — the exact established deviation used by the items master island.
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { approveReleaseBundleAction } from '../../../../../../../actions/technical/release-bundles/approve-bundle';
import { rejectReleaseBundleAction } from '../../../../../../../actions/technical/release-bundles/reject-bundle';
import { linkFactorySpecBom, submitFactorySpecForReview } from '../actions/factory-spec-flow';
import {
  type BundleBlocker,
  type LoadBundleResult,
  loadReleaseBundle,
  type ReleaseBundleData,
} from '../_actions/bundle-data';

// Blocker severity → .badge tone class (MON-design-system rule 8).
const SEVERITY_BADGE = {
  block: 'badge-red',
  warn: 'badge-amber',
  info: 'badge-blue',
} as const;

// Blocker severity → .alert tone class for the row background.
const SEVERITY_ALERT = {
  block: 'alert-red',
  warn: 'alert-amber',
  info: 'alert-blue',
} as const;

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
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

function PairedStatusCard({
  heading,
  status,
  rows,
}: {
  heading: string;
  status: string | null;
  rows: { label: string; value: string; mono?: boolean }[];
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="mb-1.5 flex items-center justify-between">
        <strong className="text-sm">{heading}</strong>
        {status ? <span className="badge badge-amber">{status}</span> : null}
      </div>
      <dl className="grid gap-1 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={row.mono ? 'font-mono' : ''}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BlockerRow({ blocker, blockerKindLabel }: { blocker: BundleBlocker; blockerKindLabel: (k: BundleBlocker['kind']) => string }) {
  return (
    <div className={`alert ${SEVERITY_ALERT[blocker.severity]}`} style={{ fontSize: 12, alignItems: 'flex-start' }}>
      <span className={`badge ${SEVERITY_BADGE[blocker.severity]} shrink-0`}>{blocker.severity}</span>
      <span>
        <b className="mr-1.5 font-mono text-[11px]">{blockerKindLabel(blocker.kind)}</b>
        {blocker.message}
      </span>
    </div>
  );
}

type Action = 'approve' | 'reject';

function BundleModalBody({
  data,
  onDone,
  onClose,
  onDataChange,
}: {
  data: ReleaseBundleData;
  onDone: (message: string) => void;
  onClose: () => void;
  onDataChange: (data: ReleaseBundleData) => void;
}) {
  const t = useTranslations('Technical.releaseBundle');
  const router = useRouter();
  const [action, setAction] = React.useState<Action>('approve');
  const [reason, setReason] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [flowMessage, setFlowMessage] = React.useState<string | null>(null);
  const [selectedBomHeaderId, setSelectedBomHeaderId] = React.useState(data.bomHeaderId ?? '');
  const [pending, startTransition] = React.useTransition();
  const [linkPending, startLinkTransition] = React.useTransition();
  const [submitPending, startSubmitTransition] = React.useTransition();

  React.useEffect(() => {
    setSelectedBomHeaderId(data.bomHeaderId ?? '');
  }, [data.bomHeaderId]);

  const blockingIssues = data.blockers.filter((b) => b.severity === 'block');
  const canApprove = blockingIssues.length === 0 && data.canApprove && !data.cloneOnWrite && data.bomHeaderId != null;
  const canSubmitForReview = data.canApprove && data.spec.status === 'draft';
  const canLinkBom =
    data.canApprove &&
    ['draft', 'in_review'].includes(data.spec.status) &&
    data.bomOptions.length > 0 &&
    selectedBomHeaderId.length > 0 &&
    selectedBomHeaderId !== data.bomHeaderId;

  const reasonValid = reason.trim().length >= 10;
  const valid =
    action === 'approve' ? canApprove && pin.trim().length > 0 && reasonValid : reasonValid;

  const blockerKindLabel = (kind: BundleBlocker['kind']): string => t(`blocker.${kind}`);

  function submit() {
    if (!valid || !data.bomHeaderId) return;
    setError(null);
    startTransition(async () => {
      if (action === 'approve') {
        const result = await approveReleaseBundleAction({
          factorySpecId: data.factorySpecId,
          bomHeaderId: data.bomHeaderId,
          pin,
          reason,
        });
        if (result.ok) {
          router.refresh();
          onDone(t('approved'));
        } else {
          setError(t('actionError'));
        }
      } else {
        const result = await rejectReleaseBundleAction({
          factorySpecId: data.factorySpecId,
          bomHeaderId: data.bomHeaderId,
          reason,
        });
        if (result.ok) {
          router.refresh();
          onDone(t('rejected'));
        } else {
          setError(t('actionError'));
        }
      }
    });
  }

  const approveDisabledReason = !data.canApprove
    ? t('permissionDenied')
    : !canApprove
      ? t('approveDisabled', { count: blockingIssues.length })
      : undefined;

  async function reloadBundle() {
    const fresh = await loadReleaseBundle(data.factorySpecId);
    if (fresh.ok) onDataChange(fresh.data);
  }

  function submitForReview() {
    if (!canSubmitForReview) return;
    setError(null);
    setFlowMessage(null);
    startSubmitTransition(async () => {
      const result = await submitFactorySpecForReview({ specId: data.factorySpecId });
      if (!result.ok) {
        setError(result.message ?? result.error);
        return;
      }
      await reloadBundle();
      router.refresh();
      setFlowMessage(t('submitted'));
    });
  }

  function linkBom() {
    if (!canLinkBom) return;
    setError(null);
    setFlowMessage(null);
    startLinkTransition(async () => {
      const result = await linkFactorySpecBom({
        specId: data.factorySpecId,
        bomHeaderId: selectedBomHeaderId,
      });
      if (!result.ok) {
        setError(result.message ?? result.error);
        return;
      }
      await reloadBundle();
      router.refresh();
      setFlowMessage(t('bomLinked', { version: result.data.bomVersion }));
    });
  }

  return (
    <>
      {!data.canApprove ? (
        <div role="alert" className="alert alert-amber mb-3" style={{ fontSize: 12 }}>
          {t('permissionDenied')}
        </div>
      ) : null}

      {data.cloneOnWrite ? (
        <div className="alert alert-amber mb-3" style={{ fontSize: 12 }}>
          <span aria-hidden>△</span>
          <span>{t('cloneBanner')}</span>
        </div>
      ) : null}

      {/* D365 informational (never blocks) */}
      {!data.d365Enabled ? (
        <div role="status" className="alert alert-blue mb-3" style={{ fontSize: 12 }}>
          {t('d365Disabled')}
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PairedStatusCard
          heading={t('factorySpec')}
          status={data.spec.status}
          rows={[
            { label: t('specId'), value: `${data.spec.specCode} v${data.spec.version}`, mono: true },
            { label: t('owner'), value: data.spec.owner },
            { label: t('lastEdit'), value: data.spec.lastEdit.slice(0, 16).replace('T', ' '), mono: true },
          ]}
        />
        <PairedStatusCard
          heading={t('sharedBom')}
          status={data.bom.status}
          rows={[
            { label: t('bomId'), value: data.bom.id ? data.bom.id.slice(0, 8) : '—', mono: true },
            { label: t('version'), value: data.bom.version != null ? `v${data.bom.version}` : '—', mono: true },
            { label: t('clonedFrom'), value: data.bom.clonedFrom ?? '—' },
          ]}
        />
      </div>

      <div className="card mb-3" style={{ padding: 12 }}>
        {flowMessage ? (
          <div role="status" className="alert alert-green mb-2" style={{ fontSize: 12 }}>
            {flowMessage}
          </div>
        ) : null}
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <strong className="text-sm">{t('flowTitle')}</strong>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('flowHelp')}</p>
          </div>
          {data.spec.status === 'draft' ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canSubmitForReview || submitPending}
              title={!data.canApprove ? t('permissionDenied') : undefined}
              onClick={submitForReview}
            >
              {submitPending ? t('submitting') : t('submitForReview')}
            </button>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="ff" title={data.bomOptions.length === 0 ? t('noBomOptionsTitle') : undefined}>
            <label htmlFor="factory-spec-bom-link">{t('linkBomLabel')}</label>
            <Select
              value={selectedBomHeaderId}
              onValueChange={setSelectedBomHeaderId}
              disabled={data.bomOptions.length === 0 || !['draft', 'in_review'].includes(data.spec.status)}
              options={data.bomOptions.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
            >
              <SelectTrigger id="factory-spec-bom-link" aria-label={t('linkBomLabel')}>
                <SelectValue placeholder={t('linkBomPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {data.bomOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {t('bomOption', { version: option.version, status: option.status })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ff-help">
              {data.bomOptions.length === 0 ? t('noBomOptionsHelp') : t('linkBomHelp')}
            </span>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!canLinkBom || linkPending}
              title={
                data.bomOptions.length === 0
                  ? t('noBomOptionsTitle')
                  : !['draft', 'in_review'].includes(data.spec.status)
                    ? t('linkBomImmutable')
                    : undefined
              }
              onClick={linkBom}
            >
              {linkPending ? t('linkingBom') : t('linkBomAction')}
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-3" style={{ padding: 12 }}>
        <strong className="text-sm">{t('blockersTitle')}</strong>
        <div className="mt-2 grid gap-1.5">
          {data.blockers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noBlockers')}</p>
          ) : (
            data.blockers.map((b, i) => (
              <BlockerRow key={`${b.code}-${i}`} blocker={b} blockerKindLabel={blockerKindLabel} />
            ))
          )}
          {blockingIssues.length > 0 ? (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--red-700)' }}>
              {t('approveDisabled', { count: blockingIssues.length })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="card mb-3" style={{ padding: 12 }}>
        <strong className="text-sm">{t('historyTitle')}</strong>
        <div className="mt-2">
          {data.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noHistory')}</p>
          ) : (
            data.history.map((h, i) => (
              <div
                key={`${h.at}-${i}`}
                className="grid grid-cols-[140px_130px_1fr] gap-2 border-t py-1 text-xs first:border-t-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="font-mono text-muted-foreground">{h.at.slice(0, 16).replace('T', ' ')}</span>
                <span>{h.who}</span>
                <span>{h.action}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <fieldset className="mb-3 grid gap-2">
        <label
          className="flex items-start gap-2 rounded-md border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: action === 'approve' ? 'var(--green-050a)' : '#fff' }}
        >
          <input
            type="radio"
            name="bundle-action"
            checked={action === 'approve'}
            disabled={!canApprove}
            onChange={() => setAction('approve')}
            aria-label={t('approveOption')}
          />
          <span>
            <b>{t('approveOption')}</b>
            <span className="block text-[11px] text-muted-foreground">{t('approveHelp')}</span>
          </span>
        </label>
        <label
          className="flex items-start gap-2 rounded-md border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: action === 'reject' ? 'var(--red-050a)' : '#fff' }}
        >
          <input
            type="radio"
            name="bundle-action"
            checked={action === 'reject'}
            onChange={() => setAction('reject')}
            aria-label={t('rejectOption')}
          />
          <span>
            <b>{t('rejectOption')}</b>
            <span className="block text-[11px] text-muted-foreground">{t('rejectHelp')}</span>
          </span>
        </label>
      </fieldset>

      {action === 'approve' ? (
        <>
          <div className="ff">
            <label htmlFor="bundle-approve-reason">{t('approveReason')}</label>
            <textarea
              id="bundle-approve-reason"
              className="form-input"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              aria-label={t('approveReason')}
            />
            <span className="ff-help">{t('approveReasonHelp')}</span>
          </div>
          <div className="ff">
            <label htmlFor="bundle-pin">{t('pin')}</label>
            <input
              id="bundle-pin"
              className="form-input font-mono"
              type="password"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value)}
              aria-label={t('pin')}
            />
            <span className="ff-help">
              {t('pinHelp')}{' '}
              {/* W9-L7 — the shared scanner/e-sign PIN is managed on /account/pin. */}
              <Link href="/account/pin" className="underline" data-testid="bundle-pin-setup-link">
                {t('pinSetupLink')}
              </Link>
            </span>
          </div>
        </>
      ) : (
        <div className="ff">
          <label htmlFor="bundle-reject-reason">{t('rejectReason')}</label>
          <textarea
            id="bundle-reject-reason"
            className="form-input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            aria-label={t('rejectReason')}
          />
          <span className="ff-help">{t('rejectReasonHelp')}</span>
        </div>
      )}

      {error ? (
        <p role="alert" className="alert alert-red mb-2" style={{ fontSize: 12 }}>
          {error}
        </p>
      ) : null}

      <div className="modal-foot" style={{ padding: 0, borderTop: 0 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`}
          disabled={!valid || pending}
          aria-disabled={!valid || pending}
          title={action === 'approve' ? approveDisabledReason : undefined}
          onClick={submit}
        >
          {action === 'approve' ? (canApprove ? t('approveAction') : t('approveBlocked')) : t('rejectAction')}
        </button>
      </div>
    </>
  );
}

export function ReleaseBundlePanelButton({
  factorySpecId,
  label,
  /** Optional pre-loaded data (used by tests / server-prefetch); else loaded on open. */
  initialData,
  /** Trigger styling — a text link by default, or a full `.btn` when used as a modal CTA. */
  triggerClassName,
}: {
  factorySpecId: string;
  label: string;
  initialData?: ReleaseBundleData;
  triggerClassName?: string;
}) {
  const t = useTranslations('Technical.releaseBundle');
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<ReleaseBundleData | null>(initialData ?? null);
  const [loadState, setLoadState] = React.useState<'idle' | 'loading' | 'error'>('idle');
  const [done, setDone] = React.useState<string | null>(null);

  function openPanel() {
    setDone(null);
    setOpen(true);
    if (data) return;
    setLoadState('loading');
    void (async () => {
      const result: LoadBundleResult = await loadReleaseBundle(factorySpecId);
      if (result.ok) {
        setData(result.data);
        setLoadState('idle');
      } else {
        setLoadState('error');
      }
    })();
  }

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? 'font-medium underline-offset-4 hover:underline'}
        style={triggerClassName ? undefined : { color: 'var(--blue)' }}
        onClick={openPanel}
      >
        {label}
      </button>
      <Dialog
        open={open}
        onClose={close}
        closeLabel={t('cancel')}
        title={t('title')}
        subtitle={data ? t('subtitle', { fg: `${data.fg.itemCode} ${data.fg.name}` }) : undefined}
        footer={null}
      >
        {done ? (
          <div role="status" className="alert alert-green" style={{ fontSize: 13 }}>
            {done}
          </div>
        ) : loadState === 'loading' ? (
          <div className="space-y-2" aria-busy>
            <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: 'var(--gray-100)' }} />
            <div className="h-24 w-full animate-pulse rounded" style={{ background: 'var(--gray-050)' }} />
          </div>
        ) : loadState === 'error' || !data ? (
          <div role="alert" className="alert alert-red" style={{ fontSize: 13 }}>
            {t('error')}
          </div>
        ) : (
          <BundleModalBody data={data} onDone={setDone} onClose={close} onDataChange={setData} />
        )}
      </Dialog>
    </>
  );
}
