'use client';

/**
 * T-035 — BriefCompleteModal (MODAL-03, Complete Brief for Project).
 *
 * Prototype compatibility source (1:1 structure, patched semantics):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:89-140 (BriefConvertModal)
 *
 * 2026-05-03 E2E spine patch (applied — RED LINES):
 *   - This is the "Complete Brief for Project" modal. User-facing copy MUST NOT say "Convert to FA".
 *   - FA/FG code availability is NOT a canonical blocker here — FG code creation/mapping belongs to
 *     G3 (T-095). The duplicate-FA-code check (prototype lines 91-114) is therefore REMOVED.
 *   - No D365 export/build CTA in this modal.
 *   - If a code field is shown for compatibility it is labeled as a legacy alias and is NEVER a
 *     blocker; the merged action persists it only as a legacy alias, never as an approved FG.
 *
 * Translation notes (from the prototype / prototype-index-npd.json#brief_convert_modal):
 *   - window.Modal size='wide'                    → @monopilot/ui Modal size="lg".
 *   - Pre-populated table of brief → FA fields    → read-only Summary table; values come from the
 *     parent Server Component (joins brief + brief_lines), passed down as `summary` rows.
 *   - alert-green "Gate checks pass"              → success/status banner (role="status").
 *   - alert-amber locking note                    → warning alert (role="alert") that the brief is
 *     locked on completion.
 *   - foot Cancel + "Convert →"                   → Cancel + "Complete brief for project" CTA.
 *
 * Real-data wiring: the convert/complete Server Action (T-033 convertBriefToFa, an alias of
 * completeBriefForProject) is injected. It requires brief.status='complete' server-side, so the
 * client cannot complete a brief the action would reject. This client component NEVER touches the DB.
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';

// Server Action signature (owned by T-033 — imported by the page, injected here).
export type CompleteBriefAction = (
  briefId: string,
  legacyAlias?: string | null,
) => Promise<{
  ok: true;
  briefId: string;
  npdProjectId: string;
  legacyProductCode: string | null;
  v08Status: 'PASS' | 'WARN' | 'FAIL';
}>;

export type BriefCompleteStatus = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** A single read-only summary row (FA field name → value from brief). */
export type BriefSummaryRow = { key: string; field: string; value: string | null };

export type BriefCompleteSummary = {
  briefId: string;
  devCode: string;
  productName: string | null;
  rows: BriefSummaryRow[];
};

export type BriefCompleteLabels = {
  title: string;
  subtitle: string;
  gateChecksTitle: string;
  gateCheckStatus: string;
  gateCheckRequired: string;
  gateCheckDevCode: string;
  summaryHeader: string;
  colField: string;
  colValue: string;
  legacyAliasLabel: string;
  legacyAliasHint: string;
  errorLegacyAlias: string;
  lockingWarning: string;
  emptyValue: string;
  cancel: string;
  complete: string;
  completing: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  errorGeneric: string;
};

// Optional legacy alias (compatibility only — never a blocker, never an approved FG).
// Normalisation to null happens at submit time so the RHF resolver in/out types stay aligned.
function makeSchema(labels: BriefCompleteLabels) {
  return z.object({
    legacyAlias: z.string().trim().max(80, labels.errorLegacyAlias).optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function BriefCompleteModal({
  open,
  status,
  summary,
  labels,
  completeBriefAction,
  onCompleted,
  onClose,
}: {
  open: boolean;
  status: BriefCompleteStatus;
  /** Server-fetched read-only summary; null while loading / on error / forbidden. */
  summary: BriefCompleteSummary | null;
  labels: BriefCompleteLabels;
  completeBriefAction?: CompleteBriefAction;
  onCompleted: (result: { briefId: string; npdProjectId: string }) => void;
  onClose: () => void;
}) {
  const schema = React.useMemo(() => makeSchema(labels), [labels]);
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { legacyAlias: '' },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = methods;

  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      reset({ legacyAlias: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!summary) return;
    setServerError(null);
    try {
      const result = await completeBriefAction?.(summary.briefId, values.legacyAlias?.trim() || null);
      if (result?.ok) {
        onCompleted({ briefId: result.briefId, npdProjectId: result.npdProjectId });
      }
    } catch {
      setServerError(labels.errorGeneric);
    }
  });

  // Completion is gated only on a ready summary + the (server-enforced) action — never on a code.
  const canComplete = status === 'ready' && !!summary && !isSubmitting && !!completeBriefAction;

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} size="lg" modalId="briefComplete">
      <Modal.Header title={labels.title} />
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <Modal.Body>
            {status === 'loading' ? (
              <p data-slot="brief-complete-loading" role="status" className="py-4 text-sm text-slate-600">
                {labels.loading}
              </p>
            ) : status === 'forbidden' ? (
              <p data-slot="brief-complete-forbidden" role="status" className="py-4 text-sm text-slate-700">
                {labels.forbidden}
              </p>
            ) : status === 'error' ? (
              <div role="alert" className="my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {labels.error}
              </div>
            ) : status === 'empty' || !summary ? (
              <p data-slot="brief-complete-empty" role="status" className="py-4 text-sm text-slate-600">
                {labels.empty}
              </p>
            ) : (
              <div className="grid gap-4">
                <p className="text-xs text-slate-500">{labels.subtitle}</p>

                <div
                  role="status"
                  className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                  data-testid="brief-complete-gate-checks"
                >
                  <div className="mb-1 font-semibold">{labels.gateChecksTitle}</div>
                  <ul className="space-y-0.5 text-xs">
                    <li>✓ {labels.gateCheckStatus}</li>
                    <li>✓ {labels.gateCheckRequired}</li>
                    <li>✓ {labels.gateCheckDevCode}</li>
                  </ul>
                </div>

                <div>
                  <div
                    data-slot="brief-complete-summary-header"
                    className="mb-2 text-[11px] uppercase tracking-wide text-slate-500"
                  >
                    {labels.summaryHeader}
                  </div>
                  <table className="w-full text-left text-xs" data-testid="brief-complete-summary">
                    <thead className="text-slate-500">
                      <tr>
                        <th scope="col" className="py-1 pr-4 font-medium">
                          {labels.colField}
                        </th>
                        <th scope="col" className="py-1 font-medium">
                          {labels.colValue}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.rows.map((row) => (
                        <tr key={row.key} data-field={row.key}>
                          <td className="py-1 pr-4 text-slate-500">{row.field}</td>
                          <td className="py-1 font-mono text-slate-800">
                            {row.value ?? <span className="text-slate-400">{labels.emptyValue}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-1">
                  <label htmlFor="brief-complete-legacy-alias" className="text-sm font-medium text-slate-700">
                    {labels.legacyAliasLabel}
                  </label>
                  <Input
                    id="brief-complete-legacy-alias"
                    className="font-mono"
                    aria-invalid={errors.legacyAlias ? 'true' : undefined}
                    aria-describedby={
                      errors.legacyAlias ? 'brief-complete-legacy-alias-error' : 'brief-complete-legacy-alias-hint'
                    }
                    {...register('legacyAlias')}
                  />
                  {errors.legacyAlias ? (
                    <span id="brief-complete-legacy-alias-error" role="alert" className="text-xs text-red-700">
                      {errors.legacyAlias.message}
                    </span>
                  ) : (
                    <span id="brief-complete-legacy-alias-hint" className="text-xs text-slate-500">
                      {labels.legacyAliasHint}
                    </span>
                  )}
                </div>

                <div
                  role="alert"
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  data-testid="brief-complete-locking-warning"
                >
                  {labels.lockingWarning}
                </div>

                {serverError ? (
                  <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {serverError}
                  </div>
                ) : null}
              </div>
            )}
          </Modal.Body>
          {status === 'forbidden' ? (
            <Modal.Footer>
              <Button type="button" className="btn--secondary text-sm" onClick={onClose}>
                {labels.cancel}
              </Button>
            </Modal.Footer>
          ) : (
            <Modal.Footer>
              <Button type="button" className="btn--secondary text-sm" onClick={onClose} disabled={isSubmitting}>
                {labels.cancel}
              </Button>
              <Button type="submit" className="text-sm" disabled={!canComplete}>
                {isSubmitting ? labels.completing : labels.complete}
              </Button>
            </Modal.Footer>
          )}
        </form>
      </FormProvider>
    </Modal>
  );
}

export default BriefCompleteModal;
