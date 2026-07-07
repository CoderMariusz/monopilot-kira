'use client';

/**
 * E4B — Labor rates settings screen (client island).
 *
 * Sibling-conformant with settings/infra/printers (printers-screen.client):
 *   page head (eyebrow + title + subtitle) + primary CTA → New-rate modal
 *   (role/group + rate + currency + effective date) → upsertLaborRate; a list of
 *   configured rates grouped by effective date. All four UI states render
 *   (loading / empty-with-CTA / error / data + permission-denied).
 *
 * HISTORY MODEL (hard rule): a new effective date = a NEW row. Historical rates
 * are preserved and are NEVER edited in place — there is intentionally no
 * per-row Edit affordance. Use "Correct" to supersede a row: the modal opens
 * prefilled and saving INSERTs a new row (same effective_from allowed); latest
 * created_at wins for equal dates. The backend upsert only collapses onto an
 * existing row when both it and the new date are today/future AND an id is
 * passed — the "fix a not-yet-active rate" case, not a history rewrite.
 *
 * No raw UUIDs: rows are keyed by id (data-* hook) but render role/rate/currency/
 * date only. RBAC (settings.org.update) is resolved server-side and threaded in as
 * `canManage`; the affordances are disabled with a tooltip when absent and the
 * action re-checks the permission regardless.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type LaborRateRow = {
  id: string;
  roleGroup: string;
  ratePerHour: number;
  currency: string;
  effectiveFrom: string;
  createdAt?: string;
};

export type UpsertLaborRateInput = {
  id?: string | null;
  roleGroup: string;
  ratePerHour: number;
  currency?: string | null;
  effectiveFrom?: string | null;
};

export type UpsertLaborRateResult =
  | { ok: true; id: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type LaborRatesLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  sectionTitle: string;
  provenance: string;
  addRate: string;
  emptyCta: string;
  columnRole: string;
  columnRate: string;
  columnCurrency: string;
  columnEffectiveFrom: string;
  columnStatus: string;
  columnActions: string;
  correctRate: string;
  statusCurrent: string;
  statusFuture: string;
  statusSuperseded: string;
  historyNote: string;
  dialogAddTitle: string;
  dialogCorrectTitle: string;
  fieldRole: string;
  fieldRoleHelp: string;
  fieldRate: string;
  fieldRateHelp: string;
  fieldCurrency: string;
  fieldEffectiveFrom: string;
  fieldEffectiveFromHelp: string;
  save: string;
  savePending: string;
  cancel: string;
  createSuccess: string;
  correctSuccess: string;
  saveFailed: string;
  invalidInput: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
};

const CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP'] as const;

type Draft = {
  roleGroup: string;
  rate: string;
  currency: string;
  effectiveFrom: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return { roleGroup: '', rate: '', currency: 'USD', effectiveFrom: todayIso() };
}

/**
 * Per (role, currency) the most-recent effective_from that is ≤ today is the
 * CURRENT rate; later dates are SCHEDULED; everything else is SUPERSEDED. Rows
 * arrive ordered role asc, effective_from desc (listLaborRates).
 */
function rateStatus(row: LaborRateRow, rows: LaborRateRow[], today: string): 'current' | 'future' | 'superseded' {
  if (row.effectiveFrom > today) return 'future';
  const peers = rows.filter(
    (r) => r.roleGroup === row.roleGroup && r.currency === row.currency && r.effectiveFrom <= today,
  );
  const latestEffective = peers.reduce((max, r) => (r.effectiveFrom > max ? r.effectiveFrom : max), '');
  if (row.effectiveFrom < latestEffective) return 'superseded';
  const sameDatePeers = peers.filter((r) => r.effectiveFrom === latestEffective);
  const winner = sameDatePeers.reduce((best, r) => {
    const bestTs = best.createdAt ?? '';
    const rowTs = r.createdAt ?? '';
    return rowTs > bestTs ? r : best;
  });
  return winner.id === row.id ? 'current' : 'superseded';
}

function StateNotice({ state, labels }: { state: PageState; labels: LaborRatesLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

export default function LaborRatesScreen({
  initialRates,
  labels,
  canManage,
  upsertLaborRate,
  state = 'ready',
}: {
  initialRates: LaborRateRow[];
  labels: LaborRatesLabels;
  canManage: boolean;
  upsertLaborRate: (input: UpsertLaborRateInput) => Promise<UpsertLaborRateResult>;
  state?: PageState;
}) {
  const [rows, setRows] = React.useState<LaborRateRow[]>(() => [...initialRates]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<'add' | 'correct'>('add');
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [pending, setPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const today = todayIso();

  const statusLabel = (s: 'current' | 'future' | 'superseded') =>
    s === 'current' ? labels.statusCurrent : s === 'future' ? labels.statusFuture : labels.statusSuperseded;

  function openAdd() {
    if (!canManage) return;
    setDialogMode('add');
    setDraft(emptyDraft());
    setActionError(null);
    setDialogOpen(true);
  }

  function openCorrect(rate: LaborRateRow) {
    if (!canManage) return;
    setDialogMode('correct');
    setDraft({
      roleGroup: rate.roleGroup,
      rate: String(rate.ratePerHour),
      currency: rate.currency,
      effectiveFrom: rate.effectiveFrom,
    });
    setActionError(null);
    setDialogOpen(true);
  }

  async function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending) return;
    const rateValue = Number(draft.rate);
    if (draft.roleGroup.trim() === '' || !Number.isFinite(rateValue) || rateValue < 0 || draft.effectiveFrom === '') {
      setActionError(labels.invalidInput);
      return;
    }
    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const result = await upsertLaborRate({
        roleGroup: draft.roleGroup.trim(),
        ratePerHour: rateValue,
        currency: draft.currency,
        effectiveFrom: draft.effectiveFrom,
      });
      if (!result.ok) {
        setActionError(result.error === 'invalid_input' ? labels.invalidInput : labels.saveFailed);
        return;
      }
      const saved: LaborRateRow = {
        id: result.id,
        roleGroup: draft.roleGroup.trim(),
        ratePerHour: rateValue,
        currency: draft.currency,
        effectiveFrom: draft.effectiveFrom,
        createdAt: new Date().toISOString(),
      };
      setRows((current) => {
        const without = current.filter((row) => row.id !== saved.id);
        return [saved, ...without].sort(
          (a, b) =>
            a.roleGroup.localeCompare(b.roleGroup)
            || b.effectiveFrom.localeCompare(a.effectiveFrom)
            || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
        );
      });
      setStatusMessage(dialogMode === 'correct' ? labels.correctSuccess : labels.createSuccess);
      setDialogOpen(false);
      setDialogMode('add');
      setDraft(emptyDraft());
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  const effectiveState: PageState = state === 'empty' && rows.length > 0 ? 'ready' : state;
  const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <main
      data-testid="settings-labor-rates-screen"
      data-screen="settings-labor-rates-list"
      aria-labelledby="settings-labor-rates-title"
      className="settings-screen settings-screen--labor-rates space-y-4"
    >
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <p className="settings-eyebrow">{labels.eyebrow}</p>
          <h1 id="settings-labor-rates-title">{labels.title}</h1>
          <p className="muted">{labels.subtitle}</p>
        </div>
        <Button
          type="button"
          className="btn-primary"
          disabled={!canManage}
          title={!canManage ? labels.insufficientPermission : undefined}
          aria-label={canManage ? labels.addRate : `${labels.addRate} — ${labels.insufficientPermission}`}
          onClick={openAdd}
        >
          + {labels.addRate}
        </Button>
      </header>

      {statusMessage ? (
        <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {statusMessage}
        </section>
      ) : null}

      <section className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="labor-rates-section-title">
        <div className="settings-section__head">
          <h2 id="labor-rates-section-title">{labels.sectionTitle}</h2>
          <p className="muted text-sm">{labels.provenance}</p>
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="labor-rates-history-note">{labels.historyNote}</p>
        {actionError ? <div role="alert" className="mt-3 text-sm text-red-700">{actionError}</div> : null}
      </section>

      {dialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="labor-rate-dialog-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="labor-rate-dialog-title" className="text-lg font-semibold text-slate-950">
                {dialogMode === 'correct' ? labels.dialogCorrectTitle : labels.dialogAddTitle}
              </h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => { setDialogOpen(false); setDialogMode('add'); }} disabled={pending}>
                x
              </Button>
            </div>
            <form onSubmit={(event) => void submitDraft(event)} className="mt-4 space-y-4">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="labor-rate-role">
                {labels.fieldRole}
                <Input
                  id="labor-rate-role"
                  aria-label={labels.fieldRole}
                  value={draft.roleGroup}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, roleGroup: value }));
                  }}
                  required
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldRoleHelp}</span>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="labor-rate-rate">
                {labels.fieldRate}
                <Input
                  id="labor-rate-rate"
                  aria-label={labels.fieldRate}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft.rate}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, rate: value }));
                  }}
                  required
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldRateHelp}</span>
              </label>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="labor-rate-currency-label">{labels.fieldCurrency}</span>
                <Select
                  value={draft.currency}
                  onValueChange={(value) => setDraft((current) => ({ ...current, currency: value }))}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                >
                  <SelectTrigger aria-label={labels.fieldCurrency}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="labor-rate-effective-from">
                {labels.fieldEffectiveFrom}
                <Input
                  id="labor-rate-effective-from"
                  aria-label={labels.fieldEffectiveFrom}
                  type="date"
                  value={draft.effectiveFrom}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, effectiveFrom: value }));
                  }}
                  required
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldEffectiveFromHelp}</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => { setDialogOpen(false); setDialogMode('add'); }} disabled={pending}>
                  {labels.cancel}
                </Button>
                <Button
                  type="submit"
                  className="btn-primary"
                  disabled={!canManage || pending}
                  aria-label={canManage ? labels.save : `${labels.save} — ${labels.insufficientPermission}`}
                >
                  {pending ? labels.savePending : labels.save}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="labor-rate-list-title">
        <h2 id="labor-rate-list-title" className="sr-only">{labels.sectionTitle}</h2>
        {effectiveState === 'ready' ? (
          rows.length > 0 ? (
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnRole}</TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">{labels.columnRate}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnCurrency}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnEffectiveFrom}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnStatus}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {rows.map((rate) => {
                  const status = rateStatus(rate, rows, today);
                  return (
                    <TableRow
                      key={rate.id}
                      data-testid="settings-labor-rate-row"
                      data-rate-id={rate.id}
                      className="align-top hover:bg-slate-50"
                    >
                      <TableCell className="px-4 py-3 font-medium text-slate-950">{rate.roleGroup}</TableCell>
                      <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                        {moneyFmt.format(rate.ratePerHour)}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-600">{rate.currency}</TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-600">{rate.effectiveFrom}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant={status === 'current' ? 'success' : status === 'future' ? 'info' : 'muted'}
                          aria-label={statusLabel(status)}
                        >
                          {statusLabel(status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Button
                          type="button"
                          variant="dry-run"
                          className="btn-secondary"
                          disabled={!canManage}
                          title={!canManage ? labels.insufficientPermission : undefined}
                          aria-label={canManage ? `${labels.correctRate} ${rate.roleGroup}` : `${labels.correctRate} — ${labels.insufficientPermission}`}
                          onClick={() => openCorrect(rate)}
                        >
                          {labels.correctRate}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-start gap-3 p-6">
              <p role="status" className="text-sm text-slate-600">{labels.empty}</p>
              <Button
                type="button"
                className="btn-primary"
                disabled={!canManage}
                title={!canManage ? labels.insufficientPermission : undefined}
                aria-label={canManage ? labels.emptyCta : `${labels.emptyCta} — ${labels.insufficientPermission}`}
                onClick={openAdd}
              >
                + {labels.emptyCta}
              </Button>
            </div>
          )
        ) : (
          <div className="p-4">
            <StateNotice state={effectiveState} labels={labels} />
          </div>
        )}
      </section>
    </main>
  );
}
