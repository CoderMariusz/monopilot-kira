'use client';

/**
 * MODAL-HOLD-CREATE — create a quality hold (client island).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   modals.jsx:22-96 (HoldCreateModal):
 *     hold target type pills (LP/Batch/WO/PO/GRN)   → modals.jsx:42-48
 *     reference input                               → modals.jsx:50-52
 *     hold reason select / notes                    → modals.jsx:54-65
 *     priority pills (low/medium/high/critical)     → modals.jsx:67-76
 *     critical SoD warning (V-QA-HOLD-006)          → modals.jsx:78-83
 *     estimated release date                        → modals.jsx:91-93
 *     footer Cancel / Create Hold (disabled until valid) → modals.jsx:37-40
 *
 * Wires the reviewed createHold Server Action (imported, never authored). The
 * action validates server-side and gates quality.hold.create; this island only
 * collects the payload and surfaces the action's error/forbidden verbatim.
 *
 * DEVIATIONS (red-lines): the prototype's QA_HOLD_REASONS reason-code dropdown +
 * "Disposition (optional)" + auto-calculated duration helper are reduced to a
 * free-text reason (the backend accepts reasonCodeId OR reasonText).
 *
 * AUDIT DEFECT #4 FIX: the BL-QA-07 reference picker is now LIVE for LPs. When
 * referenceType='lp' the raw-UUID input is replaced by a real LP search box
 * (type number/item → dropdown of org-scoped matches → pick fills the reference
 * and shows a confirmation chip). The "additional LPs" field now accepts LP
 * NUMBERS (resolved on submit; unresolvable entries are listed inline and nothing
 * is submitted). wo/grn keep a text input but resolve number→id on submit via the
 * lookup reads (cheap org-scoped); po/batch stay honest free-text with per-type
 * help. All lookups are reads owned by ../../_actions/lookup-actions (imported,
 * never authored here); createHold/hold-actions.ts is NOT touched.
 */

import { useEffect, useRef, useState, useTransition } from 'react';

import Modal from '@monopilot/ui/Modal';

import type { createHold } from '../../_actions/hold-actions';
import type {
  resolveLpByNumber,
  searchLps,
  resolveWoByNumber,
  resolveGrnByNumber,
  LpLookupResult,
} from '../../_actions/lookup-actions';
import { HOLD_REF_TYPES } from './hold-types';
import type { HoldRefType } from './hold-types';

const REF_TYPES = HOLD_REF_TYPES;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type HoldCreateLookupLabels = {
  lpSearchLabel: string;
  lpSearchPlaceholder: string;
  lpSearchHelp: string;
  searching: string;
  noMatches: string;
  pickedChip: string;
  clearPick: string;
  resultLine: string;
  lpNumbersLabel: string;
  lpNumbersHelp: string;
  lpNumbersPlaceholder: string;
  unresolved: string;
  refTypeHelp: Record<HoldRefType, string>;
  refTypePlaceholder: Record<Exclude<HoldRefType, 'lp'>, string>;
  unresolvedRef: string;
};

export type HoldCreateLabels = {
  title: string;
  subtitle: string;
  refType: string;
  refTypeHelp: string;
  refTypeOptions: Record<HoldRefType, string>;
  referenceId: string;
  referenceIdHelp: string;
  referenceIdPlaceholder: string;
  lpIds: string;
  lpIdsHelp: string;
  lpIdsPlaceholder: string;
  reasonText: string;
  reasonTextHelp: string;
  reasonTextPlaceholder: string;
  priority: string;
  priorityOptions: Record<string, string>;
  estRelease: string;
  criticalWarning: string;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { referenceRequired: string; reasonRequired: string };
  error: string;
  success: string;
  lookup: HoldCreateLookupLabels;
};

function splitLpNumbers(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function HoldCreateModal({
  open,
  onOpenChange,
  labels,
  createHoldAction,
  resolveLpAction,
  searchLpsAction,
  resolveWoAction,
  resolveGrnAction,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: HoldCreateLabels;
  createHoldAction: typeof createHold;
  resolveLpAction: typeof resolveLpByNumber;
  searchLpsAction: typeof searchLps;
  resolveWoAction: typeof resolveWoByNumber;
  resolveGrnAction: typeof resolveGrnByNumber;
  onCreated?: () => void;
}) {
  const [refType, setRefType] = useState<HoldRefType>('lp');
  // For lp: the resolved (picked) LP whose UUID is submitted. For other types:
  // the raw reference TEXT (wo/grn resolved on submit; po/batch free-text).
  const [pickedLp, setPickedLp] = useState<LpLookupResult | null>(null);
  const [refText, setRefText] = useState('');
  const [lpQuery, setLpQuery] = useState('');
  const [lpResults, setLpResults] = useState<LpLookupResult[]>([]);
  const [lpSearching, setLpSearching] = useState(false);
  const [lpSearched, setLpSearched] = useState(false);
  const [lpIdsRaw, setLpIdsRaw] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [estRelease, setEstRelease] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const trimmedReason = reasonText.trim();
  // Reference is satisfied when: lp picked, OR (other type) the text input is non-empty.
  const hasReference = refType === 'lp' ? pickedLp !== null : refText.trim().length > 0;
  const valid = hasReference && trimmedReason.length > 0;
  const isCritical = priority === 'critical';

  // Debounced LP autocomplete (only while ref type is lp + no LP picked yet).
  const queryRef = useRef(lpQuery);
  queryRef.current = lpQuery;
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
      // Ignore stale responses (query moved on).
      if (queryRef.current.trim() !== q) return;
      setLpSearching(false);
      setLpSearched(true);
      setLpResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(handle);
  }, [lpQuery, refType, pickedLp, searchLpsAction]);

  function reset() {
    setRefType('lp');
    setPickedLp(null);
    setRefText('');
    setLpQuery('');
    setLpResults([]);
    setLpSearching(false);
    setLpSearched(false);
    setLpIdsRaw('');
    setReasonText('');
    setPriority('medium');
    setEstRelease('');
    setError(null);
    setUnresolved([]);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function changeRefType(rt: HoldRefType) {
    setRefType(rt);
    setPickedLp(null);
    setRefText('');
    setLpQuery('');
    setLpResults([]);
    setLpSearched(false);
    setError(null);
    setUnresolved([]);
  }

  function pickLp(lp: LpLookupResult) {
    setPickedLp(lp);
    setLpResults([]);
    setLpSearched(false);
    setLpQuery('');
    setError(null);
  }

  function submit() {
    setError(null);
    setUnresolved([]);
    if (!valid) {
      setError(!hasReference ? labels.validation.referenceRequired : labels.validation.reasonRequired);
      return;
    }

    startTransition(async () => {
      // 1) Resolve the primary reference to a UUID.
      let referenceId: string;
      if (refType === 'lp') {
        referenceId = pickedLp!.id;
      } else if (refType === 'wo') {
        const res = await resolveWoAction({ woNumber: refText.trim() });
        if (!res.ok) {
          setError(labels.error.replace('{message}', res.message ?? res.reason));
          return;
        }
        if (!res.data) {
          setError(labels.lookup.unresolvedRef.replace('{value}', refText.trim()));
          return;
        }
        referenceId = res.data.id;
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
        // po / batch — free-text reference passed through verbatim.
        referenceId = refText.trim();
      }

      // 2) Resolve the additional-LP NUMBERS to UUIDs (atomic: any miss → abort).
      const lpNumbers = splitLpNumbers(lpIdsRaw);
      const lpIds: string[] = [];
      const missing: string[] = [];
      for (const num of lpNumbers) {
        const res = await resolveLpAction({ lpNumber: num });
        if (!res.ok) {
          setError(labels.error.replace('{message}', res.message ?? res.reason));
          return;
        }
        if (res.data) lpIds.push(res.data.id);
        else missing.push(num);
      }
      if (missing.length > 0) {
        setUnresolved(missing);
        setError(labels.lookup.unresolved.replace('{list}', missing.join(', ')));
        return;
      }

      const result = await createHoldAction({
        referenceType: refType,
        referenceId,
        reasonText: trimmedReason,
        priority,
        ...(lpIds.length > 0 ? { lpIds } : {}),
        ...(estRelease ? { estimatedReleaseAt: estRelease } : {}),
      });
      if (!result.ok) {
        setError(labels.error.replace('{message}', result.message ?? result.reason));
        return;
      }
      close();
      onCreated?.();
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="hold_create_modal">
      <Modal.Header title={labels.title} />
      <Modal.Body>
        <div data-testid="hold-create-form" className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-slate-500">{labels.subtitle}</p>

          {/* Reference type pills (parity modals.jsx:42-48) — no raw <select>. */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">{labels.refType}</legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.refType}>
              {REF_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  data-testid={`hold-create-reftype-${rt}`}
                  aria-pressed={refType === rt}
                  onClick={() => changeRefType(rt)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs transition',
                    refType === rt
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.refTypeOptions[rt]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400" data-testid="hold-create-reftype-help">
              {labels.lookup.refTypeHelp[refType]}
            </p>
          </fieldset>

          {/* Reference (parity modals.jsx:50-52).
              AUDIT #4: lp → live LP search/pick; wo/grn/po/batch → honest text. */}
          {refType === 'lp' ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.lookup.lpSearchLabel} <span aria-hidden className="text-red-500">*</span>
              </span>
              {pickedLp ? (
                <div
                  data-testid="hold-create-lp-chip"
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
                    data-testid="hold-create-lp-clear"
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
                    data-testid="hold-create-lp-search"
                    value={lpQuery}
                    onChange={(e) => setLpQuery(e.target.value)}
                    placeholder={labels.lookup.lpSearchPlaceholder}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                  />
                  {lpSearching && (
                    <span data-testid="hold-create-lp-searching" className="text-xs text-slate-400">
                      {labels.lookup.searching}
                    </span>
                  )}
                  {lpResults.length > 0 && (
                    <ul
                      role="listbox"
                      data-testid="hold-create-lp-results"
                      className="z-10 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm"
                    >
                      {lpResults.map((lp) => (
                        <li key={lp.id} role="option" aria-selected={false}>
                          <button
                            type="button"
                            data-testid={`hold-create-lp-result-${lp.id}`}
                            onClick={() => pickLp(lp)}
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
                    <span data-testid="hold-create-lp-nomatch" className="text-xs text-slate-500">
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
                {labels.referenceId} <span aria-hidden className="text-red-500">*</span>
              </span>
              <input
                type="text"
                data-testid="hold-create-reference"
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder={labels.lookup.refTypePlaceholder[refType]}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
              <span className="text-xs text-slate-400">{labels.lookup.refTypeHelp[refType]}</span>
            </label>
          )}

          {/* Additional LPs by NUMBER (AUDIT #4: numbers, not UUIDs; resolved on
              submit, unresolvable entries listed below + nothing submitted). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.lookup.lpNumbersLabel}</span>
            <textarea
              data-testid="hold-create-lpids"
              value={lpIdsRaw}
              onChange={(e) => setLpIdsRaw(e.target.value)}
              placeholder={labels.lookup.lpNumbersPlaceholder}
              rows={2}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.lookup.lpNumbersHelp}</span>
            {unresolved.length > 0 && (
              <ul
                role="alert"
                data-testid="hold-create-lp-unresolved"
                className="mt-1 list-disc rounded-md border border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700"
              >
                {unresolved.map((num) => (
                  <li key={num} className="font-mono">{num}</li>
                ))}
              </ul>
            )}
          </label>

          {/* Reason free text (parity modals.jsx:54-65). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">
              {labels.reasonText} <span aria-hidden className="text-red-500">*</span>
            </span>
            <textarea
              data-testid="hold-create-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={labels.reasonTextPlaceholder}
              rows={3}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400">{labels.reasonTextHelp}</span>
          </label>

          {/* Priority pills (parity modals.jsx:67-76). */}
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">{labels.priority}</legend>
            <div className="flex flex-wrap gap-1" role="group" aria-label={labels.priority}>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`hold-create-priority-${p}`}
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs capitalize transition',
                    priority === p
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  ].join(' ')}
                >
                  {labels.priorityOptions[p] ?? p}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Critical SoD warning (parity modals.jsx:78-83). */}
          {isCritical && (
            <div
              role="note"
              data-testid="hold-create-sod-warning"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠ {labels.criticalWarning}
            </div>
          )}

          {/* Estimated release date (parity modals.jsx:91-93). */}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{labels.estRelease}</span>
            <input
              type="date"
              data-testid="hold-create-estrelease"
              value={estRelease}
              onChange={(e) => setEstRelease(e.target.value)}
              className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" data-testid="hold-create-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="hold-create-cancel"
          onClick={close}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="hold-create-submit"
          disabled={!valid || pending}
          onClick={submit}
          title={!valid ? labels.formIncomplete : undefined}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
