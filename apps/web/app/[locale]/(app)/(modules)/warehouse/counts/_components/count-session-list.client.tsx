'use client';

/**
 * WAVE E10 — stock-count sessions list + "New count session" dialog (client island).
 *
 * Spec-driven (no JSX prototype exists under
 * prototypes/design/Monopilot Design System/warehouse/ for stock counts).
 * Built off the in-repo warehouse list+detail convention — the reserved-LP list
 * (reservations/_components/reservation-list.client.tsx): a rows-count line, a
 * shadcn <Table> with status <Badge>s, and a shadcn <Modal> + <Select> create
 * dialog (NO raw <select>). Mirrors that file's structure 1:1.
 *
 * Create flow: "New count session" opens a Modal with a warehouse <Select> + a
 * count-type <Select>; Create calls the reviewed createCountSession Server Action
 * (passed in, never authored). `forbidden` surfaces INLINE in the dialog and is
 * never trusted client-side; on success the dialog closes and the page refreshes
 * (router.refresh) so the new session appears. Create shows a pending state.
 *
 * All five UI states: loading (page Suspense skeleton), empty (table empty row),
 * error (caller banner / inline dialog error), permission-denied (caller panel /
 * inline dialog `forbidden`), optimistic (Create disabled + "Creating…").
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { COUNT_TYPES, type CountType } from '../_actions/count-types';
import type { CountSession, CreateCountSessionInput } from '../_actions/count-types';
import { planCountSessionCreateSite, type CountWarehouseOption } from '../_actions/count-types';
import type { CountClientResult } from './count-client-result';

/** Page-authored adapter: real createCountSession returns a session id (or throws). */
type CreateAction = (input: CreateCountSessionInput) => Promise<CountClientResult<{ id: string }>>;

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'info',
  in_review: 'warning',
  approved: 'info',
  applied: 'success',
  cancelled: 'muted',
};

/** Short, stable display label for a session (the backend has no human session number). */
function sessionLabel(id: string): string {
  return `CNT-${id.slice(0, 8).toUpperCase()}`;
}

export type CountSessionListLabels = {
  newSession: string;
  rowsLabel: string;
  empty: string;
  none: string;
  columns: {
    session: string;
    warehouse: string;
    type: string;
    status: string;
    lines: string;
    variances: string;
    created: string;
  };
  type: Record<CountType, string>;
  status: Record<string, string>;
  linesSummary: string;
  create: {
    title: string;
    intro: string;
    warehouseLabel: string;
    warehousePlaceholder: string;
    warehouseEmpty: string;
    typeLabel: string;
    typePlaceholder: string;
    type: Record<CountType, string>;
    cancel: string;
    create: string;
    creating: string;
    denied: string;
    error: string;
    /** F4 — warehouse site differs from the top-bar site (create will switch scope). */
    siteMismatch: string;
  };
};

export function CountSessionListClient({
  sessions,
  warehouses,
  labels,
  locale,
  createAction,
  activeSiteId,
  setSiteAction,
}: {
  sessions: CountSession[];
  warehouses: CountWarehouseOption[];
  labels: CountSessionListLabels;
  locale: string;
  createAction: CreateAction;
  /** Top-bar site scope (mp_site_id cookie); null = All sites. */
  activeSiteId: string | null;
  /** Same cookie write seam as the top-bar SiteSwitcher. */
  setSiteAction: (siteId: string | null) => Promise<{ ok: boolean }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [countType, setCountType] = useState<CountType | ''>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dash = labels.none;
  const valid = warehouseId !== '' && countType !== '';
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId) ?? null;
  const sitePlan = selectedWarehouse
    ? planCountSessionCreateSite(activeSiteId, selectedWarehouse.siteId)
    : null;
  const siteMismatchWarning =
    sitePlan?.action === 'switch_site' ? labels.create.siteMismatch : null;

  function openDialog() {
    setWarehouseId('');
    setCountType('');
    setErrorMsg(null);
    setOpen(true);
  }

  function closeDialog() {
    if (isPending) return;
    setOpen(false);
  }

  function confirmCreate() {
    if (!valid || !selectedWarehouse) return;
    // `valid` proves countType is a real CountType (alias narrowing); the cast
    // keeps the input type honest for the action call.
    const selectedType = countType as CountType;
    const plan = planCountSessionCreateSite(activeSiteId, selectedWarehouse.siteId);
    if (plan.action === 'blocked') {
      setErrorMsg(labels.create.error);
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      if (plan.action === 'switch_site') {
        const switched = await setSiteAction(plan.warehouseSiteId);
        if (!switched.ok) {
          setErrorMsg(labels.create.error);
          return;
        }
        router.refresh();
      }
      const res = await createAction({ warehouseId, countType: selectedType });
      if (res.ok) {
        setOpen(false);
        // Navigate straight into the new session (blind-count entry).
        router.push(`/${locale}/warehouse/counts/${res.data.id}`);
        router.refresh();
        return;
      }
      // forbidden / error surface INLINE — never trusted client-side.
      if (res.code === 'forbidden') setErrorMsg(labels.create.denied);
      else setErrorMsg(labels.create.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <span className="text-xs text-slate-500" data-testid="count-session-rows">
          {labels.rowsLabel.replace('{count}', String(sessions.length))}
        </span>
        <button
          type="button"
          data-testid="count-session-new"
          onClick={openDialog}
          className="ml-auto rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
        >
          {labels.newSession}
        </button>
      </div>

      <Card
        data-testid="count-session-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {sessions.length === 0 ? (
          <p data-testid="count-session-empty" className="px-4 py-10 text-center text-sm text-slate-500">
            {labels.empty}
          </p>
        ) : (
          <Table aria-label={labels.columns.session}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.session}</TableHead>
                <TableHead scope="col">{labels.columns.warehouse}</TableHead>
                <TableHead scope="col">{labels.columns.type}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col" className="text-right">{labels.columns.lines}</TableHead>
                <TableHead scope="col" className="text-right">{labels.columns.variances}</TableHead>
                <TableHead scope="col">{labels.columns.created}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id} data-testid={`count-session-row-${s.id}`}>
                  <TableCell className="font-mono text-sm font-semibold text-sky-700">
                    <Link
                      href={`/${locale}/warehouse/counts/${s.id}`}
                      data-testid={`count-session-link-${s.id}`}
                      className="hover:underline"
                    >
                      {sessionLabel(s.id)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-slate-900">{s.warehouseCode || dash}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {labels.type[s.countType as CountType] ?? s.countType}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[s.status] ?? 'muted'} data-testid={`count-session-status-${s.id}`}>
                      {labels.status[s.status] ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                    {labels.linesSummary
                      .replace('{counted}', String(s.countedLineCount))
                      .replace('{total}', String(s.lineCount))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-slate-600">
                    {s.varianceLineCount}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString(locale) : dash}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* New count session dialog. */}
      <Modal open={open} onOpenChange={(o) => (!o ? closeDialog() : undefined)} modalId="createCountSession" size="md">
        <Modal.Header title={labels.create.title} />
        <Modal.Body>
          <div data-testid="count-session-create-modal" className="flex flex-col gap-4 text-sm">
            <p className="text-slate-600">{labels.create.intro}</p>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.create.warehouseLabel} <span aria-hidden className="text-red-600">*</span>
              </span>
              {warehouses.length === 0 ? (
                <span data-testid="count-session-warehouse-empty" className="text-xs text-slate-500">
                  {labels.create.warehouseEmpty}
                </span>
              ) : (
                <Select
                  aria-label={labels.create.warehouseLabel}
                  value={warehouseId}
                  onValueChange={setWarehouseId}
                  disabled={isPending}
                  options={[
                    { value: '', label: labels.create.warehousePlaceholder },
                    ...warehouses.map((w) => ({ value: w.id, label: w.name || w.code })),
                  ]}
                />
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.create.typeLabel} <span aria-hidden className="text-red-600">*</span>
              </span>
              <Select
                aria-label={labels.create.typeLabel}
                value={countType}
                onValueChange={(v) => setCountType(v as CountType)}
                disabled={isPending}
                options={[
                  { value: '', label: labels.create.typePlaceholder },
                  ...COUNT_TYPES.map((c) => ({ value: c, label: labels.create.type[c] })),
                ]}
              />
            </label>

            {siteMismatchWarning ? (
              <div
                role="status"
                data-testid="count-session-site-mismatch"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                {siteMismatchWarning}
              </div>
            ) : null}

            {errorMsg ? (
              <div
                role="alert"
                data-testid="count-session-create-error"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {errorMsg}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="count-session-create-cancel"
            onClick={closeDialog}
            disabled={isPending}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.create.cancel}
          </button>
          <button
            type="button"
            data-testid="count-session-create-confirm"
            onClick={confirmCreate}
            disabled={!valid || isPending}
            aria-busy={isPending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? labels.create.creating : labels.create.create}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
