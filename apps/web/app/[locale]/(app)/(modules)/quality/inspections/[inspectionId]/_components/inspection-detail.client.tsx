'use client';

/**
 * QA-005a — Inspection detail & results form (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   inspection-screens.jsx:100-297 (QaInspectionDetail):
 *     header (inspection # + status badge)              → inspection-screens.jsx:135-145
 *     immutable signed banner when decided (21 CFR)     → inspection-screens.jsx:154-159
 *     Test Parameters table (param / target / measured
 *       / auto result)                                  → inspection-screens.jsx:171-196
 *     editable measured value + per-row pass/fail       → inspection-screens.jsx:179-191
 *     overall result banner (auto-computed)             → inspection-screens.jsx:198-210
 *     action bar: Submit (e-sign) per overall result    → inspection-screens.jsx:235-245
 *     e-sign modal (password)                           → inspection-screens.jsx:240-242
 *     reference context sidebar (GRN/product)           → inspection-screens.jsx:249-262
 *
 * Presentational + owns ONLY the editable parameter rows, the result-notes draft and
 * the e-sign modal open state. RBAC (canDecide) is resolved SERVER-side and passed
 * in; a decided/cancelled inspection renders the immutable banner and NO editable
 * inputs / decision buttons (parity hard rule). recordInspectionResult +
 * submitInspectionDecision are passed in as props (imported from _actions, never
 * authored here); the e-sign signature is verified server-side.
 *
 * DEVIATIONS (red-lines): the prototype's auto pass/fail computed from numeric
 * min/max + sampling-plan AQL progress + auto-NCR preview are reduced to an explicit
 * per-row pass/fail toggle keyed off the backend's parameter shape ({name, expected,
 * actual, pass}); overall result is derived (any fail → fail, all pass → pass, else
 * pending). "Draw Sample" / "Add lab result" / "Save draft" / "Cancel inspection"
 * secondary actions and the spec/sampling-plan/LP sidebar cards are OUT OF SCOPE —
 * the live sidebar shows the resolved reference + product from the contract.
 */

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  InspectionDecision,
  InspectionDetail,
  InspectionParameter,
  InspectionStatus,
  RecordInspectionResultAction,
  SubmitInspectionDecisionAction,
} from '../../_components/inspection-contracts';

const STATUS_VARIANT: Record<InspectionStatus, BadgeVariant> = {
  pending: 'muted',
  in_progress: 'info',
  passed: 'success',
  failed: 'danger',
  on_hold: 'warning',
  cancelled: 'muted',
};

export type InspectionDetailLabels = {
  backToInspections: string;
  signedBanner: string;
  header: {
    title: string;
    context: string;
    product: string;
    assigned: string;
    due: string;
    created: string;
    unassigned: string;
  };
  params: {
    name: string;
    expected: string;
    actual: string;
    result: string;
    pass: string;
    fail: string;
    actualPlaceholder: string;
    empty: string;
    save: string;
    saving: string;
    saved: string;
    saveError: string;
    notes: string;
    notesPlaceholder: string;
    formIncomplete: string;
  };
  overall: {
    label: string;
    pass: string;
    fail: string;
    pending: string;
    passBody: string;
    failBody: string;
    pendingBody: string;
  };
  decision: {
    title: string;
    pass: string;
    fail: string;
    hold: string;
    held: string;
    holdLink: string;
    passed: string;
    failed: string;
  };
  esign: {
    title: string;
    meaning: string;
    password: string;
    passwordHelp: string;
    passwordPlaceholder: string;
    note: string;
    notePlaceholder: string;
    cancel: string;
    submit: string;
    submitting: string;
    formIncomplete: string;
    validation: { passwordRequired: string };
    error: string;
    success: string;
  };
  status: Record<InspectionStatus, string>;
};

type Overall = 'pass' | 'fail' | 'pending';

/** Editable row: pass may be undefined until the inspector toggles it. */
type EditableParam = Omit<InspectionParameter, 'actual' | 'pass'> & {
  actual: string;
  pass: boolean | null;
};

function toEditable(p: InspectionParameter): EditableParam {
  return { name: p.name, expected: p.expected, actual: p.actual ?? '', pass: p.pass ?? null };
}

function computeOverall(params: EditableParam[]): Overall {
  if (params.length === 0) return 'pending';
  if (params.some((p) => p.pass === false)) return 'fail';
  if (params.every((p) => p.pass === true)) return 'pass';
  return 'pending';
}

/** Display name for the action's person object ({id,email,name} | null). */
function personLabel(p?: InspectionDetail['decidedBy']): string {
  if (!p) return '—';
  return p.name ?? p.email ?? p.id;
}

export function InspectionDetailClient({
  inspection,
  canDecide,
  labels,
  locale,
  recordResultAction,
  submitDecisionAction,
}: {
  inspection: InspectionDetail;
  canDecide: boolean;
  labels: InspectionDetailLabels;
  locale: string;
  recordResultAction: RecordInspectionResultAction;
  submitDecisionAction: SubmitInspectionDecisionAction;
}) {
  const decided =
    inspection.status === 'passed' ||
    inspection.status === 'failed' ||
    inspection.status === 'cancelled' ||
    inspection.decidedAt != null;
  const editable = canDecide && !decided;

  const [params, setParams] = useState<EditableParam[]>(
    (inspection.parameters ?? []).map(toEditable),
  );
  const [notes, setNotes] = useState(inspection.resultNotes ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [esignOpen, setEsignOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<InspectionDecision | null>(null);

  const overall = useMemo(() => computeOverall(params), [params]);
  const pendingCount = params.filter((p) => p.pass == null).length;

  function setActual(idx: number, value: string) {
    setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, actual: value } : p)));
    setSaveState('idle');
  }
  function setPass(idx: number, value: boolean) {
    setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, pass: value } : p)));
    setSaveState('idle');
  }

  function saveResults() {
    setSaveError(null);
    // The action requires actual:string + pass:boolean — default un-toggled rows
    // to pass=false so the payload is well-formed (the action re-validates).
    const payload: InspectionParameter[] = params.map((p) => ({
      name: p.name,
      ...(p.expected != null ? { expected: p.expected } : {}),
      actual: p.actual,
      pass: p.pass ?? false,
    }));
    startSave(async () => {
      const result = await recordResultAction({
        inspectionId: inspection.id,
        parameters: payload,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!result.ok) {
        setSaveState('error');
        setSaveError(labels.params.saveError.replace('{message}', result.message ?? result.reason));
        return;
      }
      setSaveState('saved');
    });
  }

  function openEsign(decision: InspectionDecision) {
    setPendingDecision(decision);
    setEsignOpen(true);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header (parity inspection-screens.jsx:135-145). */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${locale}/quality/inspections`}
          data-testid="inspection-detail-back"
          className="text-sm text-sky-700 hover:underline"
        >
          ← {labels.backToInspections}
        </Link>
        <h1 className="font-mono text-xl font-semibold text-slate-950">{inspection.inspectionNumber}</h1>
        <Badge variant={STATUS_VARIANT[inspection.status] ?? 'muted'} data-testid="inspection-detail-status">
          {labels.status[inspection.status] ?? inspection.status}
        </Badge>
        {decided && inspection.decidedAt && <span aria-hidden>🔒</span>}
      </div>

      {/* Immutable signed banner when decided (parity inspection-screens.jsx:154-159). */}
      {decided && inspection.decidedAt && (
        <div
          role="note"
          data-testid="inspection-detail-signed-banner"
          data-state="decided"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <span aria-hidden>🔒</span>
          <span>
            {labels.signedBanner
              .replace('{date}', inspection.decidedAt.slice(0, 10))
              .replace('{user}', personLabel(inspection.decidedBy))}
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Test parameters (parity inspection-screens.jsx:171-196). */}
          <Card data-testid="inspection-detail-params" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              {labels.header.title}
            </h2>
            {params.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{labels.params.empty}</p>
            ) : (
              <Table aria-label={labels.header.title}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.params.name}</TableHead>
                    <TableHead scope="col">{labels.params.expected}</TableHead>
                    <TableHead scope="col">{labels.params.actual}</TableHead>
                    <TableHead scope="col">{labels.params.result}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {params.map((p, idx) => (
                    <TableRow key={`${p.name}-${idx}`} data-testid={`inspection-param-${idx}`}>
                      <TableCell className="text-xs font-medium text-slate-800">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{p.expected ?? '—'}</TableCell>
                      <TableCell>
                        <input
                          type="text"
                          data-testid={`inspection-param-actual-${idx}`}
                          value={p.actual ?? ''}
                          disabled={!editable}
                          onChange={(e) => setActual(idx, e.target.value)}
                          placeholder={labels.params.actualPlaceholder}
                          aria-label={`${labels.params.actual} — ${p.name}`}
                          className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" role="group" aria-label={`${labels.params.result} — ${p.name}`}>
                          <button
                            type="button"
                            data-testid={`inspection-param-pass-${idx}`}
                            aria-pressed={p.pass === true}
                            disabled={!editable}
                            onClick={() => setPass(idx, true)}
                            className={[
                              'rounded-md border px-2 py-0.5 text-[11px] transition',
                              p.pass === true
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 text-slate-600 hover:border-slate-400 disabled:opacity-50',
                            ].join(' ')}
                          >
                            {labels.params.pass}
                          </button>
                          <button
                            type="button"
                            data-testid={`inspection-param-fail-${idx}`}
                            aria-pressed={p.pass === false}
                            disabled={!editable}
                            onClick={() => setPass(idx, false)}
                            className={[
                              'rounded-md border px-2 py-0.5 text-[11px] transition',
                              p.pass === false
                                ? 'border-red-600 bg-red-600 text-white'
                                : 'border-slate-300 text-slate-600 hover:border-slate-400 disabled:opacity-50',
                            ].join(' ')}
                          >
                            {labels.params.fail}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Result notes + save (editable only). */}
            {editable && (
              <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-700">{labels.params.notes}</span>
                  <textarea
                    data-testid="inspection-result-notes"
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setSaveState('idle');
                    }}
                    placeholder={labels.params.notesPlaceholder}
                    rows={2}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid="inspection-result-save"
                    disabled={saving || params.length === 0}
                    onClick={saveResults}
                    title={params.length === 0 ? labels.params.formIncomplete : undefined}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition enabled:hover:bg-slate-50 disabled:opacity-50"
                  >
                    {saving ? labels.params.saving : labels.params.save}
                  </button>
                  {saveState === 'saved' && (
                    <span data-testid="inspection-result-saved" role="status" className="text-xs text-emerald-700">
                      {labels.params.saved}
                    </span>
                  )}
                  {saveState === 'error' && saveError && (
                    <span data-testid="inspection-result-save-error" role="alert" className="text-xs text-red-600">
                      {saveError}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Overall result banner (parity inspection-screens.jsx:198-210). */}
          <div
            data-testid="inspection-overall"
            data-overall={overall}
            className={[
              'flex items-center gap-4 rounded-xl border px-4 py-3',
              overall === 'pass'
                ? 'border-emerald-200 bg-emerald-50'
                : overall === 'fail'
                  ? 'border-red-200 bg-red-50'
                  : 'border-slate-200 bg-slate-50',
            ].join(' ')}
          >
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {labels.overall.label}
              </div>
              <div
                className={[
                  'text-2xl font-bold',
                  overall === 'pass'
                    ? 'text-emerald-700'
                    : overall === 'fail'
                      ? 'text-red-700'
                      : 'text-slate-500',
                ].join(' ')}
              >
                {overall === 'pass'
                  ? labels.overall.pass
                  : overall === 'fail'
                    ? labels.overall.fail
                    : labels.overall.pending}
              </div>
            </div>
            <p className="flex-1 text-xs text-slate-600">
              {overall === 'pass'
                ? labels.overall.passBody
                : overall === 'fail'
                  ? labels.overall.failBody
                  : labels.overall.pendingBody.replace('{count}', String(pendingCount))}
            </p>
          </div>
        </div>

        {/* Sidebar: reference context (parity inspection-screens.jsx:249-262). */}
        <aside className="flex flex-col gap-4">
          <Card data-testid="inspection-detail-context" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{labels.header.context}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">{labels.header.context}</dt>
              <dd className="font-mono text-[11px] text-sky-700">
                {inspection.referenceDisplay ?? inspection.referenceId ?? '—'}
              </dd>
              <dt className="text-slate-500">{labels.header.product}</dt>
              <dd className="text-slate-800">{inspection.productCode ?? '—'}</dd>
              <dt className="text-slate-500">{labels.header.assigned}</dt>
              <dd className="text-slate-800">
                {inspection.assignedTo ? personLabel(inspection.assignedTo) : labels.header.unassigned}
              </dd>
              <dt className="text-slate-500">{labels.header.due}</dt>
              <dd className="font-mono text-xs text-slate-700">
                {inspection.dueDate ? inspection.dueDate.slice(0, 10) : '—'}
              </dd>
              <dt className="text-slate-500">{labels.header.created}</dt>
              <dd className="font-mono text-xs text-slate-700">{inspection.createdAt.slice(0, 10)}</dd>
            </dl>
          </Card>

          {/* Decision footer (parity inspection-screens.jsx:235-245). */}
          <Card data-testid="inspection-detail-decision" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{labels.decision.title}</h2>
            {decided ? (
              <div data-testid="inspection-decision-result" className="text-sm">
                {inspection.status === 'on_hold' ? (
                  <p className="text-amber-800" data-testid="inspection-decision-held">
                    {labels.decision.held.replace('{link}', '')}{' '}
                    <Link
                      // Deep-link to the specific hold when getInspectionDetail
                      // resolved one for this LP; otherwise fall back to the holds
                      // list (e.g. grn/wo_output references have no LP hold row).
                      href={
                        inspection.holdId
                          ? `/${locale}/quality/holds/${inspection.holdId}`
                          : `/${locale}/quality/holds`
                      }
                      data-testid="inspection-decision-hold-link"
                      className="text-sky-700 hover:underline"
                    >
                      {labels.decision.holdLink}
                    </Link>
                  </p>
                ) : inspection.status === 'failed' ? (
                  <p className="text-red-700">{labels.decision.failed}</p>
                ) : inspection.status === 'passed' ? (
                  <p className="text-emerald-700">{labels.decision.passed}</p>
                ) : (
                  <p className="text-slate-600">{labels.status[inspection.status] ?? inspection.status}</p>
                )}
              </div>
            ) : canDecide ? (
              <div className="flex flex-col gap-2" data-testid="inspection-decision-buttons">
                <button
                  type="button"
                  data-testid="inspection-decision-pass"
                  onClick={() => openEsign('pass')}
                  className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  🔒 {labels.decision.pass}
                </button>
                <button
                  type="button"
                  data-testid="inspection-decision-fail"
                  onClick={() => openEsign('fail')}
                  className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  🔒 {labels.decision.fail}
                </button>
                <button
                  type="button"
                  data-testid="inspection-decision-hold"
                  onClick={() => openEsign('hold')}
                  className="w-full rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
                >
                  🔒 {labels.decision.hold}
                </button>
              </div>
            ) : (
              <p data-testid="inspection-decision-denied" className="text-xs text-slate-400">
                {labels.decision.title}
              </p>
            )}
          </Card>
        </aside>
      </div>

      {canDecide && !decided && pendingDecision && (
        <InspectionEsignModal
          open={esignOpen}
          onOpenChange={setEsignOpen}
          decision={pendingDecision}
          decisionLabel={
            pendingDecision === 'pass'
              ? labels.decision.pass
              : pendingDecision === 'fail'
                ? labels.decision.fail
                : labels.decision.hold
          }
          inspectionId={inspection.id}
          labels={labels.esign}
          submitDecisionAction={submitDecisionAction}
        />
      )}
    </div>
  );
}

/**
 * E-sign decision modal — mirrors MODAL-HOLD-RELEASE (holds release password
 * pattern). Collects the account password + optional note and verifies the
 * signature SERVER-side via submitInspectionDecision; surfaces failures verbatim.
 */
function InspectionEsignModal({
  open,
  onOpenChange,
  decision,
  decisionLabel,
  inspectionId,
  labels,
  submitDecisionAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: InspectionDecision;
  decisionLabel: string;
  inspectionId: string;
  labels: InspectionDetailLabels['esign'];
  submitDecisionAction: SubmitInspectionDecisionAction;
}) {
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = password.length > 0;

  function close() {
    setPassword('');
    setNote('');
    setError(null);
    onOpenChange(false);
  }

  function submit() {
    setError(null);
    if (password.length === 0) {
      setError(labels.validation.passwordRequired);
      return;
    }
    startTransition(async () => {
      const result = await submitDecisionAction({
        inspectionId,
        decision,
        signature: { password },
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      close();
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="inspection_esign_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="inspection-esign-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">
            {labels.meaning.replace('{decision}', decisionLabel)}
          </p>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.title}</div>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">
                {labels.password} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="password"
                data-testid="inspection-esign-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={labels.passwordPlaceholder}
                autoComplete="current-password"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.passwordHelp}</p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.note}</span>
            <textarea
              data-testid="inspection-esign-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="inspection-esign-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="inspection-esign-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="inspection-esign-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          🔒 {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
