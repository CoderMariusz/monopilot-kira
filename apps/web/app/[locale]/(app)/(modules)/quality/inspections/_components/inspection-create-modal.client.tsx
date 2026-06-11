'use client';

/**
 * MODAL-INSPECTION-CREATE — create a manual inspection (client island).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/quality/
 *   inspection-screens.jsx:26 ("Create manual inspection" opens the inspectionAssign
 *   modal). The prototype's assign modal markup lives in modals.jsx (out of this
 *   lane's anchor); this is a faithful minimal create form covering the backend's
 *   createInspection contract: reference type, reference, assignee, due date, notes.
 *
 * Wires the reviewed createInspection Server Action (imported, never authored). The
 * action validates server-side (referenceId + assignedTo are UUIDs) and gates the
 * create permission; this island only collects the payload, RESOLVES human-typed
 * references/assignees to UUIDs via the reviewed reference reads, and surfaces the
 * action's error/forbidden verbatim.
 *
 * K3b GAP-1 FIX — the raw-UUID dead-end is replaced by real pickers (mirrors the
 * MODAL-HOLD-CREATE LP lookup pattern, hold-create-modal.client.tsx):
 *   - referenceType 'lp'        → live searchable LP picker (searchInspectionLps →
 *                                 dropdown → pick fills the resolved UUID + chip).
 *   - referenceType 'grn'       → GRN number input, resolved on submit
 *                                 (resolveInspectionGrn); unresolvable → inline error.
 *   - referenceType 'wo_output' → WO output BATCH number input, resolved on submit
 *                                 (resolveInspectionWoOutput); unresolvable → inline.
 *   - assignee                  → searchable org-user picker (searchInspectionAssignees)
 *                                 → pick fills the user UUID the schema requires.
 * All lookups are reviewed reads owned by ../../_actions/inspection-actions
 * (imported, never authored here). No raw <select>: reference type is the shadcn Select.
 */

import { useEffect, useRef, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';

import type {
  CreateInspectionAction,
  InspectionReferenceType,
  InspectionLpReference,
  InspectionAssignee,
  SearchInspectionLpsAction,
  ResolveInspectionGrnAction,
  ResolveInspectionWoOutputAction,
  SearchInspectionAssigneesAction,
} from './inspection-contracts';

const REF_TYPES: InspectionReferenceType[] = ['lp', 'grn', 'wo_output'];

export type InspectionCreateLookupLabels = {
  lpSearchLabel: string;
  lpSearchPlaceholder: string;
  lpSearchHelp: string;
  searching: string;
  noMatches: string;
  pickedChip: string;
  clearPick: string;
  resultLine: string;
  /** non-lp reference inputs (grn / wo_output) */
  refInputLabel: Record<Exclude<InspectionReferenceType, 'lp'>, string>;
  refInputHelp: Record<Exclude<InspectionReferenceType, 'lp'>, string>;
  refInputPlaceholder: Record<Exclude<InspectionReferenceType, 'lp'>, string>;
  unresolvedRef: string;
  /** assignee picker */
  assigneeSearchPlaceholder: string;
  assigneePickedChip: string;
  assigneeResultLine: string;
  assigneeNoMatches: string;
};

export type InspectionCreateLabels = {
  title: string;
  subtitle: string;
  refType: string;
  refTypeOptions: Record<InspectionReferenceType, string>;
  referenceId: string;
  referenceIdHelp: string;
  referenceIdPlaceholder: string;
  assignee: string;
  assigneeHelp: string;
  assigneePlaceholder: string;
  dueDate: string;
  notes: string;
  notesPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  validation: { referenceRequired: string };
  error: string;
  success: string;
  lookup: InspectionCreateLookupLabels;
};

export function InspectionCreateModal({
  open,
  onOpenChange,
  labels,
  createInspectionAction,
  searchLpsAction,
  resolveGrnAction,
  resolveWoOutputAction,
  searchAssigneesAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: InspectionCreateLabels;
  createInspectionAction: CreateInspectionAction;
  searchLpsAction: SearchInspectionLpsAction;
  resolveGrnAction: ResolveInspectionGrnAction;
  resolveWoOutputAction: ResolveInspectionWoOutputAction;
  searchAssigneesAction: SearchInspectionAssigneesAction;
  onCreated?: (id: string) => void;
}) {
  const [refType, setRefType] = useState<InspectionReferenceType>('lp');
  // For lp: the resolved (picked) LP whose UUID is submitted. For grn/wo_output:
  // the raw reference TEXT (number / batch), resolved to a UUID on submit.
  const [pickedLp, setPickedLp] = useState<InspectionLpReference | null>(null);
  const [refText, setRefText] = useState('');
  const [lpQuery, setLpQuery] = useState('');
  const [lpResults, setLpResults] = useState<InspectionLpReference[]>([]);
  const [lpSearching, setLpSearching] = useState(false);
  const [lpSearched, setLpSearched] = useState(false);

  // Assignee picker (resolves to a user UUID — the schema requires a uuid).
  const [pickedAssignee, setPickedAssignee] = useState<InspectionAssignee | null>(null);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<InspectionAssignee[]>([]);
  const [assigneeSearching, setAssigneeSearching] = useState(false);
  const [assigneeSearched, setAssigneeSearched] = useState(false);

  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reference is satisfied when: lp picked, OR (grn/wo_output) the text input is non-empty.
  const hasReference = refType === 'lp' ? pickedLp !== null : refText.trim().length > 0;
  const valid = hasReference;

  // Debounced LP autocomplete (only while ref type is lp + no LP picked yet).
  const lpQueryRef = useRef(lpQuery);
  lpQueryRef.current = lpQuery;
  useEffect(() => {
    if (refType !== 'lp' || pickedLp) return;
    const q = lpQuery.trim();
    if (q.length === 0) {
      setLpResults([]);
      setLpSearched(false);
      return;
    }
    setLpSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchLpsAction({ query: q, limit: 10 });
      if (lpQueryRef.current.trim() !== q) return; // ignore stale
      setLpSearching(false);
      setLpSearched(true);
      setLpResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(handle);
  }, [lpQuery, refType, pickedLp, searchLpsAction]);

  // Debounced assignee autocomplete (only while no assignee picked yet).
  const assigneeQueryRef = useRef(assigneeQuery);
  assigneeQueryRef.current = assigneeQuery;
  useEffect(() => {
    if (pickedAssignee) return;
    const q = assigneeQuery.trim();
    if (q.length === 0) {
      setAssigneeResults([]);
      setAssigneeSearched(false);
      return;
    }
    setAssigneeSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchAssigneesAction({ query: q, limit: 10 });
      if (assigneeQueryRef.current.trim() !== q) return; // ignore stale
      setAssigneeSearching(false);
      setAssigneeSearched(true);
      setAssigneeResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(handle);
  }, [assigneeQuery, pickedAssignee, searchAssigneesAction]);

  function reset() {
    setRefType('lp');
    setPickedLp(null);
    setRefText('');
    setLpQuery('');
    setLpResults([]);
    setLpSearching(false);
    setLpSearched(false);
    setPickedAssignee(null);
    setAssigneeQuery('');
    setAssigneeResults([]);
    setAssigneeSearching(false);
    setAssigneeSearched(false);
    setDueDate('');
    setNotes('');
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function changeRefType(rt: InspectionReferenceType) {
    setRefType(rt);
    setPickedLp(null);
    setRefText('');
    setLpQuery('');
    setLpResults([]);
    setLpSearched(false);
    setError(null);
  }

  function assigneeLabel(a: InspectionAssignee): string {
    return a.name ?? a.email ?? a.id;
  }

  function submit() {
    setError(null);
    if (!valid) {
      setError(labels.validation.referenceRequired);
      return;
    }
    startTransition(async () => {
      // 1) Resolve the reference to a UUID.
      let referenceId: string;
      if (refType === 'lp') {
        referenceId = pickedLp!.id;
      } else if (refType === 'grn') {
        const res = await resolveGrnAction({ grnNumber: refText.trim() });
        if (!res.ok) {
          setError(labels.error.replace('{message}', res.message ?? res.reason));
          return;
        }
        if (!res.data) {
          setError(labels.lookup.unresolvedRef.replace('{value}', refText.trim()));
          return;
        }
        referenceId = res.data.id;
      } else {
        const res = await resolveWoOutputAction({ batchNumber: refText.trim() });
        if (!res.ok) {
          setError(labels.error.replace('{message}', res.message ?? res.reason));
          return;
        }
        if (!res.data) {
          setError(labels.lookup.unresolvedRef.replace('{value}', refText.trim()));
          return;
        }
        referenceId = res.data.id;
      }

      const result = await createInspectionAction({
        referenceType: refType,
        referenceId,
        ...(pickedAssignee ? { assignedTo: pickedAssignee.id } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      const id = result.data?.id;
      reset();
      onOpenChange(false);
      if (id) onCreated?.(id);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="inspection_create_modal" dismissible={!pending}>
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="inspection-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Reference type (shadcn Select — no raw <select>). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.refType}</span>
            <div data-testid="inspection-create-reftype">
              <Select
                aria-label={labels.refType}
                value={refType}
                onValueChange={(v) => changeRefType(v as InspectionReferenceType)}
                options={REF_TYPES.map((rt) => ({ value: rt, label: labels.refTypeOptions[rt] }))}
              />
            </div>
          </label>

          {/* Reference — lp → live search/pick; grn/wo_output → number/batch input
              resolved on submit (no raw UUID). */}
          {refType === 'lp' ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.lookup.lpSearchLabel} <span aria-hidden className="text-red-500">*</span>
              </span>
              {pickedLp ? (
                <div
                  data-testid="inspection-create-lp-chip"
                  className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
                >
                  <span className="font-mono text-xs text-emerald-900">
                    {labels.lookup.pickedChip
                      .replace('{lpNumber}', pickedLp.lpNumber)
                      .replace('{itemCode}', pickedLp.itemCode ?? '—')
                      .replace('{qty}', pickedLp.qty)
                      .replace('{uom}', pickedLp.uom)}
                  </span>
                  <button
                    type="button"
                    data-testid="inspection-create-lp-clear"
                    onClick={() => setPickedLp(null)}
                    className="shrink-0 rounded border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100"
                  >
                    {labels.lookup.clearPick}
                  </button>
                </div>
              ) : (
                <div className="relative flex flex-col gap-1">
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={lpResults.length > 0}
                    aria-autocomplete="list"
                    data-testid="inspection-create-lp-search"
                    value={lpQuery}
                    onChange={(e) => setLpQuery(e.target.value)}
                    placeholder={labels.lookup.lpSearchPlaceholder}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                  />
                  {lpSearching && (
                    <span data-testid="inspection-create-lp-searching" className="text-xs text-slate-400">
                      {labels.lookup.searching}
                    </span>
                  )}
                  {lpResults.length > 0 && (
                    <ul
                      role="listbox"
                      data-testid="inspection-create-lp-results"
                      className="z-10 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm"
                    >
                      {lpResults.map((lp) => (
                        <li key={lp.id} role="option" aria-selected={false}>
                          <button
                            type="button"
                            data-testid={`inspection-create-lp-result-${lp.id}`}
                            onClick={() => {
                              setPickedLp(lp);
                              setLpResults([]);
                              setLpSearched(false);
                              setLpQuery('');
                              setError(null);
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="font-mono text-slate-800">
                              {labels.lookup.resultLine
                                .replace('{lpNumber}', lp.lpNumber)
                                .replace('{itemCode}', lp.itemCode ?? '—')
                                .replace('{qty}', lp.qty)
                                .replace('{uom}', lp.uom)
                                .replace('{status}', lp.status)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!lpSearching && lpSearched && lpResults.length === 0 && (
                    <span data-testid="inspection-create-lp-nomatch" className="text-xs text-slate-500">
                      {labels.lookup.noMatches.replace('{query}', lpQuery.trim())}
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-slate-400">{labels.lookup.lpSearchHelp}</span>
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.lookup.refInputLabel[refType]} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="text"
                data-testid="inspection-create-reference"
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder={labels.lookup.refInputPlaceholder[refType]}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
              <span className="text-xs text-slate-400">{labels.lookup.refInputHelp[refType]}</span>
            </label>
          )}

          {/* Assignee — searchable org-user picker (resolves to a user UUID). */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.assignee}</span>
            {pickedAssignee ? (
              <div
                data-testid="inspection-create-assignee-chip"
                className="flex items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2"
              >
                <span className="text-xs text-sky-900">
                  {labels.lookup.assigneePickedChip
                    .replace('{name}', pickedAssignee.name ?? '—')
                    .replace('{email}', pickedAssignee.email ?? '—')}
                </span>
                <button
                  type="button"
                  data-testid="inspection-create-assignee-clear"
                  onClick={() => setPickedAssignee(null)}
                  className="shrink-0 rounded border border-sky-300 px-2 py-0.5 text-[11px] text-sky-800 hover:bg-sky-100"
                >
                  {labels.lookup.clearPick}
                </button>
              </div>
            ) : (
              <div className="relative flex flex-col gap-1">
                <input
                  type="text"
                  role="combobox"
                  aria-expanded={assigneeResults.length > 0}
                  aria-autocomplete="list"
                  data-testid="inspection-create-assignee"
                  value={assigneeQuery}
                  onChange={(e) => setAssigneeQuery(e.target.value)}
                  placeholder={labels.lookup.assigneeSearchPlaceholder}
                  autoComplete="off"
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
                {assigneeSearching && (
                  <span data-testid="inspection-create-assignee-searching" className="text-xs text-slate-400">
                    {labels.lookup.searching}
                  </span>
                )}
                {assigneeResults.length > 0 && (
                  <ul
                    role="listbox"
                    data-testid="inspection-create-assignee-results"
                    className="z-10 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm"
                  >
                    {assigneeResults.map((a) => (
                      <li key={a.id} role="option" aria-selected={false}>
                        <button
                          type="button"
                          data-testid={`inspection-create-assignee-result-${a.id}`}
                          onClick={() => {
                            setPickedAssignee(a);
                            setAssigneeResults([]);
                            setAssigneeSearched(false);
                            setAssigneeQuery('');
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                        >
                          <span className="text-slate-800">
                            {labels.lookup.assigneeResultLine
                              .replace('{name}', a.name ?? '—')
                              .replace('{email}', a.email ?? '—')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!assigneeSearching && assigneeSearched && assigneeResults.length === 0 && (
                  <span data-testid="inspection-create-assignee-nomatch" className="text-xs text-slate-500">
                    {labels.lookup.assigneeNoMatches.replace('{query}', assigneeQuery.trim())}
                  </span>
                )}
              </div>
            )}
            <span className="text-xs text-slate-400">{labels.assigneeHelp}</span>
          </div>

          {/* Due date. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.dueDate}</span>
            <input
              type="date"
              data-testid="inspection-create-due"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {/* Notes. */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.notes}</span>
            <textarea
              data-testid="inspection-create-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={labels.notesPlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="inspection-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="inspection-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="inspection-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
