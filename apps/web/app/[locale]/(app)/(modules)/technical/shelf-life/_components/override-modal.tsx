'use client';

/**
 * T-046 — 03-technical Shelf Life Config (TEC-030) client island.
 *
 * Renders the shelf-life rule table + the "Override shelf life" modal translated
 * from the prototype:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:587-633
 *     (ShelfLifeScreen — KPI grid + Product / Mode / Duration / Storage / preset /
 *      Notes table + per-row Override button)
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:486-513
 *     (ShelfLifeOverrideModal — current/new days + audit reason ≥ 10 chars).
 *
 * The modal calls the real setShelfLifeOverride Server Action under withOrgContext
 * + RLS, then router.refresh()es so the list reflects the new value.
 *
 * Local Dialog primitive (not the Radix-backed @monopilot/ui Modal) for the same
 * dual-React reason documented in the Items master island
 * (items/_components/items-manager.client.tsx): apps/web runs React 19 while
 * @radix-ui/react-dialog ships a React 18 peer, which crashes in jsdom. Production
 * dialog semantics (role="dialog", aria-modal, focus on open, Escape + backdrop
 * close, labelled title) are preserved.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { setShelfLifeOverride } from '../_actions/set-shelf-life-override';
import {
  DATE_CODE_FORMATS,
  previewDateCode,
  type ShelfLifeActionError,
  type ShelfLifeConfigRow,
  type ShelfLifeMode,
  SHELF_LIFE_MODES,
} from '../_actions/shared';

export type ShelfLifeLabels = {
  override: string;
  notConfigured: string;
  modeUseBy: string;
  modeBestBefore: string;
  days: string;
  dash: string;
  colProduct: string;
  colMode: string;
  colDuration: string;
  colDateCode: string;
  colNotes: string;
  colActions: string;
  modalTitle: string;
  warningOverride: string;
  fieldCurrent: string;
  fieldNewDays: string;
  fieldMode: string;
  fieldDateCode: string;
  fieldReason: string;
  reasonHelp: string;
  reasonPlaceholder: string;
  preview: string;
  cancel: string;
  apply: string;
  errInvalid: string;
  errForbidden: string;
  errNotFound: string;
  errGeneric: string;
};

const MODE_VARIANT: Record<ShelfLifeMode, BadgeVariant> = {
  use_by: 'danger',
  best_before: 'success',
};

function modeLabel(mode: ShelfLifeMode | null, labels: ShelfLifeLabels): string {
  if (mode === 'use_by') return labels.modeUseBy;
  if (mode === 'best_before') return labels.modeBestBefore;
  return labels.notConfigured;
}

function errorLabel(error: ShelfLifeActionError, labels: ShelfLifeLabels): string {
  switch (error) {
    case 'invalid_input':
      return labels.errInvalid;
    case 'forbidden':
      return labels.errForbidden;
    case 'not_found':
      return labels.errNotFound;
    default:
      return labels.errGeneric;
  }
}

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
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

const MODE_OPTIONS = SHELF_LIFE_MODES.map((value) => ({ value, labelKey: value }));
const DATE_CODE_OPTIONS = DATE_CODE_FORMATS.map((value) => ({ value, label: value }));

function OverrideModal({
  row,
  labels,
  open,
  onClose,
}: {
  row: ShelfLifeConfigRow;
  labels: ShelfLifeLabels;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [days, setDays] = React.useState<string>(row.shelfLifeDays != null ? String(row.shelfLifeDays) : '21');
  const [mode, setMode] = React.useState<ShelfLifeMode>(row.shelfLifeMode ?? 'use_by');
  const [dateCodeFormat, setDateCodeFormat] = React.useState<string>(row.dateCodeFormat ?? 'YYWW');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) {
      setDays(row.shelfLifeDays != null ? String(row.shelfLifeDays) : '21');
      setMode(row.shelfLifeMode ?? 'use_by');
      setDateCodeFormat(row.dateCodeFormat ?? 'YYWW');
      setReason('');
      setError(null);
    }
  }, [open, row]);

  const daysNum = Number(days);
  const valid = reason.trim().length >= 10 && Number.isFinite(daysNum) && daysNum > 0;
  const sample = previewDateCode(dateCodeFormat);

  function onApply() {
    setError(null);
    startTransition(async () => {
      const result = await setShelfLifeOverride({
        id: row.id,
        shelfLifeDays: daysNum,
        shelfLifeMode: mode,
        dateCodeFormat,
        reason: reason.trim(),
      });
      if (result.ok) {
        onClose();
        router.refresh();
      } else {
        setError(errorLabel(result.error, labels));
      }
    });
  }

  const modeOptions = MODE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.labelKey === 'use_by' ? labels.modeUseBy : labels.modeBestBefore,
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={labels.modalTitle}
      subtitle={`${row.itemCode} · ${row.name}`}
      footer={
        <>
          <Button type="button" className="btn-secondary" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button type="button" className="btn-primary" disabled={!valid || pending} onClick={onApply}>
            {labels.apply}
          </Button>
        </>
      }
    >
      <div
        role="note"
        className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        {labels.warningOverride}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          {labels.fieldCurrent}
          <Input
            name="currentShelfLife"
            readOnly
            className="bg-slate-50"
            value={row.shelfLifeDays != null ? `${row.shelfLifeDays} ${labels.days}` : labels.notConfigured}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {labels.fieldNewDays}
          <Input
            name="newShelfLifeDays"
            type="number"
            min={1}
            required
            value={days}
            onChange={(event) => setDays(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          {labels.fieldMode}
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as ShelfLifeMode)}
            options={modeOptions}
            aria-label={labels.fieldMode}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {labels.fieldDateCode}
          <Select
            value={dateCodeFormat}
            onValueChange={setDateCodeFormat}
            options={DATE_CODE_OPTIONS}
            aria-label={labels.fieldDateCode}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {labels.preview}: <span className="font-mono" data-testid="date-code-preview">{sample}</span>
      </p>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        {labels.fieldReason}
        <textarea
          name="reason"
          required
          minLength={10}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder={labels.reasonPlaceholder}
          aria-label={labels.fieldReason}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-muted-foreground">{labels.reasonHelp}</span>
      </label>
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

function ShelfLifeRowActions({
  row,
  labels,
  canEdit,
}: {
  row: ShelfLifeConfigRow;
  labels: ShelfLifeLabels;
  canEdit: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  if (!canEdit) return <span className="text-muted-foreground">{labels.dash}</span>;
  return (
    <>
      <button
        type="button"
        className="font-medium text-blue-600 underline-offset-4 hover:underline"
        data-modal-id="TEC-SHELFLIFE-OVERRIDE"
        onClick={() => setOpen(true)}
      >
        {labels.override}
      </button>
      <OverrideModal row={row} labels={labels} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ShelfLifeTable({
  rows,
  labels,
  canEdit,
}: {
  rows: ShelfLifeConfigRow[];
  labels: ShelfLifeLabels;
  canEdit: boolean;
}) {
  return (
    <Table aria-label="Shelf-life configuration">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{labels.colProduct}</TableHead>
          <TableHead scope="col">{labels.colMode}</TableHead>
          <TableHead scope="col" className="text-right">
            {labels.colDuration}
          </TableHead>
          <TableHead scope="col">{labels.colDateCode}</TableHead>
          <TableHead scope="col" className="text-right">
            {labels.colActions}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              {row.name}
              <div className="font-mono text-xs text-muted-foreground">{row.itemCode}</div>
            </TableCell>
            <TableCell>
              {row.shelfLifeMode ? (
                <Badge variant={MODE_VARIANT[row.shelfLifeMode]}>{modeLabel(row.shelfLifeMode, labels)}</Badge>
              ) : (
                <Badge variant="muted">{labels.notConfigured}</Badge>
              )}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {row.shelfLifeDays != null ? `${row.shelfLifeDays} ${labels.days}` : labels.dash}
            </TableCell>
            <TableCell className="font-mono text-xs">{row.dateCodeFormat ?? labels.dash}</TableCell>
            <TableCell className="text-right">
              <ShelfLifeRowActions row={row} labels={labels} canEdit={canEdit} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
