'use client';

/**
 * T-046 — 03-technical Shelf Life Config (TEC-030) client island.
 *
 * Design-system parity (MON-design-system): dense `.table` with mono codes,
 * 5-tone `.badge-*` mode badges, and the locked `.modal-*` / `.ff*` chrome for
 * the override dialog. Translated from:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:587-633
 *     (ShelfLifeScreen — Product / Mode / Duration / Date code / Override table)
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:486-513
 *     (ShelfLifeOverrideModal — current/new days + audit reason ≥ 10 chars).
 *
 * The modal calls the real setShelfLifeOverride Server Action under withOrgContext
 * + RLS, then router.refresh()es so the list reflects the new value.
 *
 * Local Dialog primitive (not the Radix-backed @monopilot/ui Modal) for the same
 * dual-React reason documented in the Items master island: apps/web runs React 19
 * while @radix-ui/react-dialog ships a React 18 peer, which crashes in jsdom.
 * Production dialog semantics (role="dialog", aria-modal, focus on open, Escape +
 * backdrop close, labelled title) are preserved.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
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

// 5-tone semantic mapping: use_by (perishable / legally stricter) → bad(red),
// best_before (ambient / frozen) → ok(green).
const MODE_BADGE: Record<ShelfLifeMode, string> = {
  use_by: 'badge-red',
  best_before: 'badge-green',
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
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
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
        className="modal-box outline-none"
      >
        <div className="modal-head">
          <div>
            <div id={titleId} className="modal-title">
              {title}
            </div>
            {subtitle ? <div className="mono mt-1 text-xs text-[color:var(--muted)]">{subtitle}</div> : null}
          </div>
          <button type="button" aria-label="Close" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

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

  const modeOptions = SHELF_LIFE_MODES.map((value) => ({
    value,
    label: value === 'use_by' ? labels.modeUseBy : labels.modeBestBefore,
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
      <div role="note" className="alert alert-amber">
        {labels.warningOverride}
      </div>

      <div className="ff-inline">
        <div className="ff">
          <label htmlFor="currentShelfLife">{labels.fieldCurrent}</label>
          <input
            id="currentShelfLife"
            name="currentShelfLife"
            readOnly
            className="bg-[color:var(--gray-050)] mono"
            value={row.shelfLifeDays != null ? `${row.shelfLifeDays} ${labels.days}` : labels.notConfigured}
          />
        </div>
        <div className="ff">
          <label htmlFor="newShelfLifeDays">
            {labels.fieldNewDays}
            <span className="req">*</span>
          </label>
          <input
            id="newShelfLifeDays"
            name="newShelfLifeDays"
            type="number"
            min={1}
            required
            className="mono"
            value={days}
            onChange={(event) => setDays(event.currentTarget.value)}
          />
        </div>
      </div>

      <div className="ff-inline">
        <div className="ff">
          <label>{labels.fieldMode}</label>
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as ShelfLifeMode)}
            options={modeOptions}
            aria-label={labels.fieldMode}
          />
        </div>
        <div className="ff">
          <label>{labels.fieldDateCode}</label>
          <Select
            value={dateCodeFormat}
            onValueChange={setDateCodeFormat}
            options={DATE_CODE_OPTIONS}
            aria-label={labels.fieldDateCode}
          />
        </div>
      </div>

      <p className="ff-help">
        {labels.preview}:{' '}
        <span className="mono" data-testid="date-code-preview">
          {sample}
        </span>
      </p>

      <div className="ff">
        <label htmlFor="shelf-life-reason">
          {labels.fieldReason}
          <span className="req">*</span>
        </label>
        <textarea
          id="shelf-life-reason"
          name="reason"
          required
          minLength={10}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder={labels.reasonPlaceholder}
          aria-label={labels.fieldReason}
        />
        <span className="ff-help">{labels.reasonHelp}</span>
      </div>

      {error ? (
        <p role="alert" className="ff-error">
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
  if (!canEdit) return <span className="muted">{labels.dash}</span>;
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
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
  const exportLabel = 'Export CSV';
  const exportAriaLabel = 'Export shelf-life configuration to CSV';

  function onExportCsv() {
    downloadCsv(
      toCsv(
        [labels.colProduct, labels.colMode, labels.colDuration, labels.colDateCode],
        rows.map((row) => [
          `${row.name} (${row.itemCode})`,
          modeLabel(row.shelfLifeMode, labels),
          row.shelfLifeDays != null ? `${row.shelfLifeDays} ${labels.days}` : labels.dash,
          row.dateCodeFormat ?? labels.dash,
        ]),
      ),
      `technical-shelf-life-${isoDateStamp()}.csv`,
    );
  }

  return (
    <>
      <div className="flex justify-end border-b px-3 py-2">
        <Button type="button" className="btn-secondary btn-sm" aria-label={exportAriaLabel} onClick={onExportCsv}>
          {exportLabel}
        </Button>
      </div>
      <table aria-label="Shelf-life configuration">
        <thead>
          <tr>
            <th scope="col">{labels.colProduct}</th>
            <th scope="col" style={{ width: 130 }}>
              {labels.colMode}
            </th>
            <th scope="col" style={{ width: 120, textAlign: 'right' }}>
              {labels.colDuration}
            </th>
            <th scope="col" style={{ width: 140 }}>
              {labels.colDateCode}
            </th>
            <th scope="col" style={{ width: 110, textAlign: 'right' }}>
              {labels.colActions}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span style={{ fontWeight: 500 }}>{row.name}</span>
                <div className="mono text-xs" style={{ color: 'var(--muted)' }}>
                  {row.itemCode}
                </div>
              </td>
              <td>
                {row.shelfLifeMode ? (
                  <span className={`badge ${MODE_BADGE[row.shelfLifeMode]}`}>{modeLabel(row.shelfLifeMode, labels)}</span>
                ) : (
                  <span className="badge badge-gray">{labels.notConfigured}</span>
                )}
              </td>
              <td className="num mono" style={{ textAlign: 'right' }}>
                {row.shelfLifeDays != null ? `${row.shelfLifeDays} ${labels.days}` : labels.dash}
              </td>
              <td className="mono text-xs">{row.dateCodeFormat ?? labels.dash}</td>
              <td style={{ textAlign: 'right' }}>
                <ShelfLifeRowActions row={row} labels={labels} canEdit={canEdit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
