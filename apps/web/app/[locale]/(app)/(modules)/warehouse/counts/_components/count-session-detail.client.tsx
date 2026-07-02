'use client';

/**
 * WAVE E10 — count-session detail (client island): BLIND-count entry + VARIANCE
 * review + e-sign approve/apply.
 *
 * Spec-driven (no JSX prototype exists under
 * prototypes/design/Monopilot Design System/warehouse/ for stock counts). The
 * e-sign approve modal reuses the in-repo correction-modal pattern — the WO
 * reverse-consumption modal (production/wos/[id]/_components/reverse-consumption-
 * modal.tsx): a facts summary, a `{ password }` e-sign block, typed-error→copy
 * mapping, and an optimistic submit state. The list/tables follow the warehouse
 * reservations convention (shadcn Table + Badge; NO raw <select>).
 *
 * BLIND COUNT (owner red-line): the system quantity is NOT revealed on the entry
 * tab until the line has been counted — the entry table shows only location +
 * item + a counted-qty input. systemQty surfaces only on the variance-review tab
 * (after a count exists) and inside the approve modal.
 *
 * Variance semantics (made explicit in copy): approving a POSITIVE variance mints
 * a NEW pallet (LP) for the found stock; approving a NEGATIVE variance reduces
 * on-hand. Both run through approveAndApplyVariance behind the e-sign.
 *
 * Server Actions (recordCount, approveAndApplyVariance) are OWNED by the backend
 * lane (imported, never authored) and passed in as props. RBAC is enforced
 * server-side; `forbidden` surfaces inline and is never trusted client-side. Each
 * mutation router.refresh()es so the server-recomputed session is re-read.
 *
 * All five UI states: loading (page Suspense skeleton), empty (entry/review empty
 * rows), error (inline per-row / modal banner), permission-denied (caller panel /
 * inline `forbidden`), optimistic (record + approve disable + pending labels).
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { CountLine, CountSessionDetail } from '../_actions/count-types';
import type { CountClientResult } from './count-client-result';

/**
 * Page-authored adapters: the island never sends the (blind) systemQty — it
 * passes the location/item/lp identity + the counted qty; the server recomputes
 * the variance against the live on-hand. Approve takes only the line id + the
 * e-sign password. Both map a thrown error to a CountClientResult code.
 */
type RecordAction = (input: {
  locationId: string;
  itemId: string;
  lpId?: string | null;
  countedQty: number;
}) => Promise<CountClientResult<CountLine>>;
type ApproveAction = (input: {
  countLineId: string;
  signature: { password: string };
}) => Promise<CountClientResult<{ countLineId: string }>>;
type CloseSessionAction = () => Promise<CountClientResult<void>>;

const LINE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: 'muted',
  counted: 'warning',
  approved: 'info',
  applied: 'success',
  rejected: 'danger',
};

/** Variance string → number; null/'' → 0. */
function varNum(v: string | null): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Derive the system on-hand from counted − variance (lines never carry systemQty — blind). */
function systemQty(line: CountLine): number {
  return varNum(line.countedQty) - varNum(line.varianceQty);
}

export type CountSessionDetailLabels = {
  none: string;
  /**
   * Shown when the session's site is restricted for this user. The header
   * (warehouse, status, type) is visible but the line quantities are not.
   */
  linesRestricted?: string;
  tabs: { entry: string; review: string };
  entry: {
    heading: string;
    intro: string;
    empty: string;
    blind: string;
    columns: { location: string; item: string; counted: string; actions: string };
    qtyPlaceholder: string;
    save: string;
    saving: string;
    saved: string;
    recount: string;
    denied: string;
    error: string;
  };
  review: {
    heading: string;
    intro: string;
    empty: string;
    columns: {
      location: string;
      item: string;
      system: string;
      counted: string;
      variance: string;
      status: string;
      actions: string;
    };
    positiveHint: string;
    negativeHint: string;
    matchHint: string;
    applied: string;
    approve: string;
  };
  esign: {
    title: string;
    intro: string;
    factsLocation: string;
    factsItem: string;
    factsSystem: string;
    factsCounted: string;
    factsVariance: string;
    positiveEffect: string;
    negativeEffect: string;
    block: string;
    blockMeaning: string;
    password: string;
    passwordPlaceholder: string;
    passwordHelp: string;
    cancel: string;
    submit: string;
    submitting: string;
    formIncomplete: string;
    errors: {
      forbidden: string;
      not_found: string;
      already_applied: string;
      esign_failed: string;
      invalid_input: string;
      error: string;
    };
  };
  closeSession: string;
  closingSession: string;
  closeSessionConfirm: string;
  closeSessionError: string;
  closeSessionDenied: string;
};

type Tab = 'entry' | 'review';

function fmtVariance(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

export function CountSessionDetailClient({
  session,
  labels,
  recordAction,
  approveAction,
  closeSessionAction,
}: {
  session: CountSessionDetail;
  labels: CountSessionDetailLabels;
  recordAction: RecordAction;
  approveAction: ApproveAction;
  closeSessionAction?: CloseSessionAction;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('entry');
  const dash = labels.none;

  const sessionClosed = session.status === 'closed' || session.status === 'cancelled';

  // Lines awaiting a blind count (or being recounted).
  const entryLines = session.lines;
  // Lines that have a count → variance review.
  const reviewLines = useMemo(
    () => session.lines.filter((l) => l.countedQty !== null),
    [session.lines],
  );

  /* F1 — site-restricted: return the header notice; suppress both tabs. */
  if (session.linesRestricted) {
    return (
      <div
        role="alert"
        data-testid="count-lines-restricted"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {labels.linesRestricted ?? "The count line details are restricted to members of this session's site."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {closeSessionAction && !sessionClosed ? (
        <CloseSessionBar labels={labels} closeSessionAction={closeSessionAction} onClosed={() => router.refresh()} />
      ) : null}
      {/* Tabs (custom — shadcn Tabs composition; no raw control). */}
      <div role="tablist" aria-label={labels.entry.heading} className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'entry'}
          data-testid="count-tab-entry"
          onClick={() => setTab('entry')}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
            tab === 'entry'
              ? 'border-sky-600 text-sky-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {labels.tabs.entry}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'review'}
          data-testid="count-tab-review"
          onClick={() => setTab('review')}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
            tab === 'review'
              ? 'border-sky-600 text-sky-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {labels.tabs.review}
          {reviewLines.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-[11px] tabular-nums text-slate-600">
              {reviewLines.length}
            </span>
          ) : null}
        </button>
      </div>

      {tab === 'entry' ? (
        <BlindCountEntry
          lines={entryLines}
          labels={labels}
          recordAction={recordAction}
          onRecorded={() => router.refresh()}
          dash={dash}
        />
      ) : (
        <VarianceReview
          lines={reviewLines}
          labels={labels}
          approveAction={approveAction}
          onApplied={() => router.refresh()}
          dash={dash}
        />
      )}
    </div>
  );
}

function CloseSessionBar({
  labels,
  closeSessionAction,
  onClosed,
}: {
  labels: CountSessionDetailLabels;
  closeSessionAction: CloseSessionAction;
  onClosed: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    if (!window.confirm(labels.closeSessionConfirm)) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await closeSessionAction();
      if (res.ok) {
        onClosed();
        return;
      }
      if (res.code === 'forbidden') setErrorMsg(labels.closeSessionDenied);
      else setErrorMsg(labels.closeSessionError);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {errorMsg ? (
        <span role="alert" data-testid="count-close-session-error" className="text-sm text-red-600">
          {errorMsg}
        </span>
      ) : null}
      <button
        type="button"
        data-testid="count-close-session"
        onClick={close}
        disabled={isPending}
        aria-busy={isPending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? labels.closingSession : labels.closeSession}
      </button>
    </div>
  );
}

// ── Blind count entry ─────────────────────────────────────────────────────────

function BlindCountEntry({
  lines,
  labels,
  recordAction,
  onRecorded,
  dash,
}: {
  lines: CountLine[];
  labels: CountSessionDetailLabels;
  recordAction: RecordAction;
  onRecorded: () => void;
  dash: string;
}) {
  return (
    <section data-testid="count-entry" className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{labels.entry.heading}</h2>
        <p className="mt-1 text-sm text-slate-600">{labels.entry.intro}</p>
      </div>
      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {lines.length === 0 ? (
          <p data-testid="count-entry-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.entry.empty}
          </p>
        ) : (
          <Table aria-label={labels.entry.heading}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.entry.columns.location}</TableHead>
                <TableHead scope="col">{labels.entry.columns.item}</TableHead>
                <TableHead scope="col" className="w-64">{labels.entry.columns.counted}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <BlindCountRow
                  key={line.id}
                  line={line}
                  labels={labels}
                  recordAction={recordAction}
                  onRecorded={onRecorded}
                  dash={dash}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}

function BlindCountRow({
  line,
  labels,
  recordAction,
  onRecorded,
  dash,
}: {
  line: CountLine;
  labels: CountSessionDetailLabels;
  recordAction: RecordAction;
  onRecorded: () => void;
  dash: string;
}) {
  const counted = line.countedQty !== null;
  const [value, setValue] = useState(counted ? String(line.countedQty) : '');
  const [editing, setEditing] = useState(!counted);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const num = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(num) && num >= 0;

  function save() {
    if (!valid) return;
    setErrorMsg(null);
    startTransition(async () => {
      // sessionId is bound server-side by the page adapter; the island sends the
      // location/item/lp identity + counted qty only (never the blind systemQty).
      const res = await recordAction({
        locationId: line.locationId,
        itemId: line.itemId,
        lpId: line.lpId ?? null,
        countedQty: num,
      });
      if (res.ok) {
        setEditing(false);
        onRecorded();
        return;
      }
      if (res.code === 'forbidden') setErrorMsg(labels.entry.denied);
      else setErrorMsg(labels.entry.error);
    });
  }

  return (
    <TableRow data-testid={`count-entry-row-${line.id}`}>
      <TableCell className="font-mono text-sm text-slate-900">{line.locationCode || dash}</TableCell>
      <TableCell className="text-sm">
        <div className="flex flex-col">
          <span className="text-slate-900">{line.itemName || dash}</span>
          {line.itemCode ? <span className="font-mono text-[11px] text-slate-500">{line.itemCode}</span> : null}
        </div>
      </TableCell>
      <TableCell>
        {/* BLIND: no systemQty shown here. */}
        {counted && !editing ? (
          <div className="flex items-center gap-3">
            <Badge variant="success" data-testid={`count-entry-saved-${line.id}`}>
              {labels.entry.saved}: <span className="ml-1 font-mono tabular-nums">{line.countedQty} {line.uom}</span>
            </Badge>
            <button
              type="button"
              data-testid={`count-entry-recount-${line.id}`}
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              {labels.entry.recount}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                data-testid={`count-entry-input-${line.id}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={labels.entry.qtyPlaceholder}
                disabled={isPending}
                aria-label={`${labels.entry.columns.counted} — ${line.locationCode} ${line.itemCode}`}
                className="w-28 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-slate-500">{line.uom}</span>
              <button
                type="button"
                data-testid={`count-entry-save-${line.id}`}
                onClick={save}
                disabled={!valid || isPending}
                aria-busy={isPending}
                className="rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? labels.entry.saving : labels.entry.save}
              </button>
            </div>
            {errorMsg ? (
              <span role="alert" data-testid={`count-entry-error-${line.id}`} className="text-xs text-red-600">
                {errorMsg}
              </span>
            ) : null}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Variance review + e-sign approve ──────────────────────────────────────────

function VarianceReview({
  lines,
  labels,
  approveAction,
  onApplied,
  dash,
}: {
  lines: CountLine[];
  labels: CountSessionDetailLabels;
  approveAction: ApproveAction;
  onApplied: () => void;
  dash: string;
}) {
  const [target, setTarget] = useState<CountLine | null>(null);

  return (
    <section data-testid="count-review" className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{labels.review.heading}</h2>
        {/* Explicit +ve → mint LP / −ve → reduce stock copy. */}
        <p className="mt-1 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span aria-hidden>ⓘ</span>
          <span>{labels.review.intro}</span>
        </p>
      </div>
      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {lines.length === 0 ? (
          <p data-testid="count-review-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.review.empty}
          </p>
        ) : (
          <Table aria-label={labels.review.heading}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.review.columns.location}</TableHead>
                <TableHead scope="col">{labels.review.columns.item}</TableHead>
                <TableHead scope="col" className="text-right">{labels.review.columns.system}</TableHead>
                <TableHead scope="col" className="text-right">{labels.review.columns.counted}</TableHead>
                <TableHead scope="col" className="text-right">{labels.review.columns.variance}</TableHead>
                <TableHead scope="col">{labels.review.columns.status}</TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{labels.review.approve}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const variance = varNum(line.varianceQty);
                const uom = line.uom ?? '';
                const positive = variance > 0;
                const negative = variance < 0;
                const varianceClass = positive
                  ? 'text-emerald-700'
                  : negative
                    ? 'text-red-700'
                    : 'text-slate-500';
                const hint = positive
                  ? labels.review.positiveHint
                  : negative
                    ? labels.review.negativeHint
                    : labels.review.matchHint;
                const applied = line.status === 'applied';
                return (
                  <TableRow key={line.id} data-testid={`count-review-row-${line.id}`}>
                    <TableCell className="font-mono text-sm text-slate-900">{line.locationCode || dash}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className="text-slate-900">{line.itemName || dash}</span>
                        {line.itemCode ? (
                          <span className="font-mono text-[11px] text-slate-500">{line.itemCode}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                      {systemQty(line)} {uom}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-slate-900">
                      {line.countedQty ?? dash} {uom}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-semibold tabular-nums ${varianceClass}`}
                      data-testid={`count-review-variance-${line.id}`}
                    >
                      {fmtVariance(variance)} {uom}
                      <span className="ml-1 block text-[10px] font-normal leading-tight text-slate-400">{hint}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={LINE_STATUS_VARIANT[line.status] ?? 'muted'} data-testid={`count-review-status-${line.id}`}>
                        {applied ? labels.review.applied : line.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {applied ? (
                        <span className="text-xs text-slate-400" data-testid={`count-review-done-${line.id}`}>
                          {labels.review.applied}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`count-review-approve-${line.id}`}
                          onClick={() => setTarget(line)}
                          className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100"
                        >
                          {labels.review.approve}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ApproveVarianceModal
        target={target}
        labels={labels}
        approveAction={approveAction}
        onClose={() => setTarget(null)}
        onApplied={() => {
          setTarget(null);
          onApplied();
        }}
        dash={dash}
      />
    </section>
  );
}

function ApproveVarianceModal({
  target,
  labels,
  approveAction,
  onClose,
  onApplied,
  dash,
}: {
  target: CountLine | null;
  labels: CountSessionDetailLabels;
  approveAction: ApproveAction;
  onClose: () => void;
  onApplied: () => void;
  dash: string;
}) {
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!target) return;
    setPassword('');
    setErrorMsg(null);
  }, [target?.id]);

  const open = target !== null;
  const variance = varNum(target?.varianceQty ?? null);
  const uom = target?.uom ?? '';
  const positive = variance > 0;
  const valid = password.length > 0 && !isPending;

  function mapError(code: string): string {
    const e = labels.esign.errors;
    switch (code) {
      case 'forbidden':
        return e.forbidden;
      case 'not_found':
        return e.not_found;
      case 'already_applied':
        return e.already_applied;
      case 'esign_failed':
        return e.esign_failed;
      case 'invalid_input':
        return e.invalid_input;
      default:
        return e.error;
    }
  }

  function submit() {
    if (!target || !valid) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await approveAction({ countLineId: target.id, signature: { password } });
      if (res.ok) {
        onApplied();
        return;
      }
      // forbidden / typed errors surface INLINE — never trusted client-side.
      setErrorMsg(mapError(res.code));
    });
  }

  function close() {
    if (isPending) return;
    onClose();
  }

  return (
    <Modal open={open} onOpenChange={(o) => (!o ? close() : undefined)} modalId="approveCountVariance" size="sm" dismissible={!isPending}>
      <Modal.Header title={labels.esign.title} />
      <Modal.Body>
        {target ? (
          <div data-testid="count-approve-modal" className="flex flex-col gap-4 text-sm">
            <p className="text-slate-600">{labels.esign.intro}</p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">{labels.esign.factsLocation}</dt>
              <dd className="font-mono text-slate-900">{target.locationCode || dash}</dd>
              <dt className="text-slate-500">{labels.esign.factsItem}</dt>
              <dd className="text-slate-900">{target.itemName || target.itemCode || dash}</dd>
              <dt className="text-slate-500">{labels.esign.factsSystem}</dt>
              <dd className="font-mono text-slate-900">{systemQty(target)} {uom}</dd>
              <dt className="text-slate-500">{labels.esign.factsCounted}</dt>
              <dd className="font-mono text-slate-900">{target.countedQty ?? dash} {uom}</dd>
              <dt className="text-slate-500">{labels.esign.factsVariance}</dt>
              <dd
                className={`font-mono font-semibold ${positive ? 'text-emerald-700' : variance < 0 ? 'text-red-700' : 'text-slate-500'}`}
              >
                {fmtVariance(variance)} {uom}
              </dd>
            </dl>

            {/* Make the stock effect unmistakable. */}
            <div
              data-testid="count-approve-effect"
              className={`rounded-md border px-3 py-2 text-xs ${
                positive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {positive
                ? labels.esign.positiveEffect
                    .replace('{qty}', String(Math.abs(variance)))
                    .replace('{uom}', uom)
                : labels.esign.negativeEffect
                    .replace('{qty}', String(Math.abs(variance)))
                    .replace('{uom}', uom)}
            </div>

            {/* E-sign block — mirrors the WO reverse/void modal. */}
            <div data-testid="count-approve-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.block}</div>
              <p className="mt-1 text-[11px] text-slate-500">{labels.esign.blockMeaning}</p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">
                  {labels.esign.password} <span aria-hidden className="text-red-600">*</span>
                </span>
                <input
                  type="password"
                  data-testid="count-approve-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={labels.esign.passwordPlaceholder}
                  autoComplete="current-password"
                  disabled={isPending}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
            </div>

            {errorMsg ? (
              <p role="alert" data-testid="count-approve-error" className="text-sm text-red-600">
                {errorMsg}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          data-testid="count-approve-cancel"
          onClick={close}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.esign.cancel}
        </button>
        <button
          type="button"
          data-testid="count-approve-submit"
          onClick={submit}
          disabled={!valid}
          aria-busy={isPending}
          title={!valid ? labels.esign.formIncomplete : undefined}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? labels.esign.submitting : labels.esign.submit}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
