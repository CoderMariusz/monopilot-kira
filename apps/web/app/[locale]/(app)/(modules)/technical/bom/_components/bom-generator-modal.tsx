'use client';

/**
 * T-041 — TEC-024 BOM Generator confirm modal.
 *
 * Prototype parity:
 *   `prototypes/design/Monopilot Design System/technical/modals.jsx:619-655`
 *   (tech_modal_gallery — the canonical Technical modal frame: titled Modal +
 *   Cancel/Confirm footer). The Generator-specific body (scope radio group +
 *   output-mode radio group + multi-select FG picker) follows the UX contract;
 *   rendered with the same Modal primitives as the gallery catalog.
 *
 * Real data — NO mocks: the `selected` scope picker reads the real V-TEC-15
 * eligible-FG set via `listEligibleFgs` (only FGs whose product.status_overall
 * = 'Complete'), and Confirm enqueues the async job via the real
 * `generateBomBatch` (T-016) Server Action — which itself re-applies the
 * V-TEC-15 filter server-side. XLSX is built later by the worker (out of scope).
 *
 * Local `Dialog` (not Radix) for the React-19/jsdom reason documented in
 * bom-edit-dialog.tsx. Scope/output choices are native radios (allowed — only
 * raw <select> is a red-line).
 */

import React from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { generateBomBatch } from '../_actions/generate-batch';
import { listEligibleFgs, type EligibleFg } from '../_actions/queries';
import type { GeneratorOutputMode, GeneratorScope } from '../_actions/shared';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; jobId: string; count: number }
  | { kind: 'error'; message: string };

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
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
        className="w-full max-w-lg rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function RadioRow({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px] hover:bg-slate-50 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="accent-blue-600"
      />
      <span>{label}</span>
    </label>
  );
}

export function BomGeneratorModal({
  open,
  onClose,
  /** Optional link target for the success toast's "View job status" action. */
  jobStatusHref,
}: {
  open: boolean;
  onClose: () => void;
  jobStatusHref?: (jobId: string) => string;
}) {
  const t = useTranslations('technical.bom.generator');

  const [scope, setScope] = React.useState<GeneratorScope>('all_complete');
  const [outputMode, setOutputMode] = React.useState<GeneratorOutputMode>('per_fg');
  const [fgs, setFgs] = React.useState<EligibleFg[] | null>(null);
  const [fgsState, setFgsState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [touched, setTouched] = React.useState(false);
  const [submit, setSubmit] = React.useState<SubmitState>({ kind: 'idle' });
  const [pending, startTransition] = React.useTransition();

  // Reset on close.
  React.useEffect(() => {
    if (open) return;
    setScope('all_complete');
    setOutputMode('per_fg');
    setSearch('');
    setSelected(new Set());
    setTouched(false);
    setSubmit({ kind: 'idle' });
  }, [open]);

  // Lazy-load the eligible FG set the first time the 'selected' scope is chosen.
  React.useEffect(() => {
    if (!open || scope !== 'selected' || fgsState !== 'idle') return;
    let cancelled = false;
    setFgsState('loading');
    void (async () => {
      const res = await listEligibleFgs();
      if (cancelled) return;
      if (res.ok) {
        setFgs(res.data);
        setFgsState('ready');
      } else {
        setFgsState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scope, fgsState]);

  const filteredFgs = React.useMemo(() => {
    const list = fgs ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => f.productCode.toLowerCase().includes(q) || (f.name ?? '').toLowerCase().includes(q));
  }, [fgs, search]);

  const selectionInvalid = scope === 'selected' && selected.size === 0;
  // The Confirm button stays enabled so a 0-pick selected scope can surface the
  // validation error on click (AC2) rather than silently no-op'ing on a disabled
  // button; the guard lives in onConfirm.
  const canSubmit = !pending && submit.kind !== 'submitting';

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function onConfirm() {
    setTouched(true);
    if (selectionInvalid) return;
    setSubmit({ kind: 'submitting' });
    startTransition(async () => {
      const result = await generateBomBatch({
        scope,
        outputMode,
        productCodes: scope === 'selected' ? [...selected] : undefined,
      });
      if (result.ok) {
        setSubmit({ kind: 'success', jobId: result.data.jobId, count: result.data.expectedCount });
      } else if (result.error === 'forbidden') {
        setSubmit({ kind: 'error', message: t('forbidden') });
      } else {
        setSubmit({ kind: 'error', message: t('error') });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        submit.kind === 'success' ? (
          <Button type="button" className="btn-primary" onClick={onClose}>
            {t('cancel')}
          </Button>
        ) : (
          <>
            <Button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="button" className="btn-primary" disabled={!canSubmit} onClick={onConfirm}>
              {submit.kind === 'submitting' ? t('submitting') : t('confirm')}
            </Button>
          </>
        )
      }
    >
      {submit.kind === 'success' ? (
        <div role="status" aria-live="polite" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-medium">{t('successToast', { count: submit.count, jobId: submit.jobId })}</p>
          {jobStatusHref ? (
            <a
              href={jobStatusHref(submit.jobId)}
              className="mt-1 inline-block font-medium text-green-700 underline underline-offset-4"
            >
              {t('viewJob')}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">{t('scope')}</legend>
            <div className="grid grid-cols-1 gap-2">
              <RadioRow name="bom-gen-scope" value="all_complete" checked={scope === 'all_complete'} onChange={(v) => setScope(v as GeneratorScope)} label={t('scopeAllComplete')} />
              <RadioRow name="bom-gen-scope" value="selected" checked={scope === 'selected'} onChange={(v) => setScope(v as GeneratorScope)} label={t('scopeSelected')} />
            </div>
          </fieldset>

          {scope === 'selected' ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">{t('pickFgs')}</p>
              <Input
                aria-label={t('searchFgs')}
                placeholder={t('searchFgs')}
                className="mb-2 w-full font-mono"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-md border" role="group" aria-label={t('pickFgs')}>
                {fgsState === 'loading' ? (
                  <div className="space-y-2 p-3">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                    <p className="sr-only">{t('loadingFgs')}</p>
                  </div>
                ) : fgsState === 'error' ? (
                  <p role="alert" className="p-4 text-center text-slate-500">
                    {t('error')}
                  </p>
                ) : filteredFgs.length === 0 ? (
                  <p className="p-4 text-center text-slate-500">{t('noEligibleFgs')}</p>
                ) : (
                  filteredFgs.map((f) => (
                    <label
                      key={f.productCode}
                      className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-[13px] last:border-b-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={selected.has(f.productCode)}
                        onChange={() => toggle(f.productCode)}
                      />
                      <span className="font-mono">{f.productCode}</span>
                      <span className="truncate text-slate-500">{f.name}</span>
                    </label>
                  ))
                )}
              </div>
              {touched && selectionInvalid ? (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {t('selectAtLeastOne')}
                </p>
              ) : null}
            </div>
          ) : null}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">{t('outputMode')}</legend>
            <div className="grid grid-cols-1 gap-2">
              <RadioRow name="bom-gen-output" value="per_fg" checked={outputMode === 'per_fg'} onChange={(v) => setOutputMode(v as GeneratorOutputMode)} label={t('outputPerFg')} />
              <RadioRow name="bom-gen-output" value="single_batch" checked={outputMode === 'single_batch'} onChange={(v) => setOutputMode(v as GeneratorOutputMode)} label={t('outputSingleBatch')} />
            </div>
          </fieldset>

          {submit.kind === 'error' ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submit.message}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
