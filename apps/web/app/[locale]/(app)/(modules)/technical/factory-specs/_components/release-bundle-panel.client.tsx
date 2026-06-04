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
 * Local Dialog primitive (not the Radix-backed @monopilot/ui Modal): the workspace
 * ships a React 18 peer @radix-ui/react-dialog while apps/web runs React 19, so
 * mounting Radix in jsdom crashes with a dual-React useRef null. Production semantics
 * (role="dialog", aria-modal, focus on open, Escape + backdrop close, labelled title)
 * are preserved — the exact established deviation used by the items master island.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Textarea from '@monopilot/ui/Textarea';

import { approveReleaseBundleAction } from '../../../../../../../actions/technical/release-bundles/approve-bundle';
import { rejectReleaseBundleAction } from '../../../../../../../actions/technical/release-bundles/reject-bundle';
import {
  type BundleBlocker,
  type LoadBundleResult,
  loadReleaseBundle,
  type ReleaseBundleData,
} from '../_actions/bundle-data';

const SEVERITY_VARIANT = {
  block: 'danger',
  warn: 'warning',
  info: 'info',
} as const;

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
    <div className="rounded-md border bg-white p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <strong className="text-sm">{heading}</strong>
        {status ? <Badge variant="warning">{status}</Badge> : null}
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
  const tone =
    blocker.severity === 'block'
      ? 'bg-red-50'
      : blocker.severity === 'warn'
        ? 'bg-amber-50'
        : 'bg-blue-50';
  return (
    <div className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${tone}`}>
      <Badge variant={SEVERITY_VARIANT[blocker.severity]} className="shrink-0">
        {blocker.severity}
      </Badge>
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
}: {
  data: ReleaseBundleData;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Technical.releaseBundle');
  const router = useRouter();
  const [action, setAction] = React.useState<Action>('approve');
  const [reason, setReason] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const blockingIssues = data.blockers.filter((b) => b.severity === 'block');
  const canApprove = blockingIssues.length === 0 && data.canApprove && !data.cloneOnWrite && data.bomHeaderId != null;

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

  return (
    <>
      {!data.canApprove ? (
        <div role="alert" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('permissionDenied')}
        </div>
      ) : null}

      {data.cloneOnWrite ? (
        <div className="mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span aria-hidden>△</span>
          <span>{t('cloneBanner')}</span>
        </div>
      ) : null}

      {/* D365 informational (never blocks) */}
      {!data.d365Enabled ? (
        <div role="status" className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
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

      <div className="mb-3 rounded-md border bg-white p-3">
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
            <p className="mt-1 text-[11px] text-red-700">
              {t('approveDisabled', { count: blockingIssues.length })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-3 rounded-md border bg-white p-3">
        <strong className="text-sm">{t('historyTitle')}</strong>
        <div className="mt-2">
          {data.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noHistory')}</p>
          ) : (
            data.history.map((h, i) => (
              <div
                key={`${h.at}-${i}`}
                className="grid grid-cols-[140px_130px_1fr] gap-2 border-t py-1 text-xs first:border-t-0"
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
          className={`flex items-start gap-2 rounded-md border px-3 py-2 ${action === 'approve' ? 'bg-green-50' : 'bg-white'}`}
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
          className={`flex items-start gap-2 rounded-md border px-3 py-2 ${action === 'reject' ? 'bg-red-50' : 'bg-white'}`}
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
        <div className="mb-2 grid gap-2">
          <label className="block text-sm font-medium text-slate-700">
            {t('approveReason')}
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              aria-label={t('approveReason')}
            />
            <span className="text-[11px] text-muted-foreground">{t('approveReasonHelp')}</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('pin')}
            <Input
              type="password"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value)}
              aria-label={t('pin')}
            />
            <span className="text-[11px] text-muted-foreground">{t('pinHelp')}</span>
          </label>
        </div>
      ) : (
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {t('rejectReason')}
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            aria-label={t('rejectReason')}
          />
          <span className="text-[11px] text-muted-foreground">{t('rejectReasonHelp')}</span>
        </label>
      )}

      {error ? (
        <p role="alert" className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" className="btn-secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          className={action === 'reject' ? 'btn-danger' : 'btn-primary'}
          disabled={!valid || pending}
          aria-disabled={!valid || pending}
          title={action === 'approve' ? approveDisabledReason : undefined}
          onClick={submit}
        >
          {action === 'approve' ? (canApprove ? t('approveAction') : t('approveBlocked')) : t('rejectAction')}
        </Button>
      </div>
    </>
  );
}

export function ReleaseBundlePanelButton({
  factorySpecId,
  label,
  /** Optional pre-loaded data (used by tests / server-prefetch); else loaded on open. */
  initialData,
}: {
  factorySpecId: string;
  label: string;
  initialData?: ReleaseBundleData;
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
        className="font-medium text-blue-600 underline-offset-4 hover:underline"
        onClick={openPanel}
      >
        {label}
      </button>
      <Dialog
        open={open}
        onClose={close}
        title={t('title')}
        subtitle={data ? t('subtitle', { fg: `${data.fg.itemCode} ${data.fg.name}` }) : undefined}
        footer={null}
      >
        {done ? (
          <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
            {done}
          </div>
        ) : loadState === 'loading' ? (
          <div className="space-y-2" aria-busy>
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ) : loadState === 'error' || !data ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
            {t('error')}
          </div>
        ) : (
          <BundleModalBody data={data} onDone={setDone} onClose={close} />
        )}
      </Dialog>
    </>
  );
}
