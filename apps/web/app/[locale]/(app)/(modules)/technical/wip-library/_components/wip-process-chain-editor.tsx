'use client';

import React from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { getProcessDefault } from '../../../../(admin)/settings/process-defaults/_actions/process-defaults-actions';
import type { OperationOption, WipProcessRow } from '../_lib/wip-definition-contract';
import type { WipLibraryLabels } from './wip-labels';

const THROUGHPUT_UOMS = ['kg', 'pack', 'each', 'l'] as const;

function OperationPicker({
  labels,
  options,
  disabled,
  onSelect,
}: {
  labels: WipLibraryLabels;
  options: OperationOption[];
  disabled: boolean;
  onSelect: (op: OperationOption) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? options : options.filter((o) => o.operationName.toLowerCase().includes(q));
  }, [options, query]);

  const reposition = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(420, Math.max(280, r.width, window.innerWidth - 24));
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setRect({ top: r.bottom + 4, left, width });
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setRect(null);
      setActiveIndex(0);
      return undefined;
    }
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  React.useEffect(() => {
    if (open && rect) inputRef.current?.focus();
  }, [open, rect]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(op: OperationOption) {
    onSelect(op);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = filtered[activeIndex];
      if (op) choose(op);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const listId = React.useId();

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        type="button"
        className="btn--secondary"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="wip-add-process"
        onClick={() => setOpen((v) => !v)}
      >
        {labels.processAdd}
      </Button>

      {open && rect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={labels.processPickerLabel}
              style={{
                position: 'fixed',
                top: rect.top,
                left: rect.left,
                width: rect.width,
                zIndex: 1000,
                pointerEvents: 'auto',
              }}
              className="rounded-md border border-slate-200 bg-white p-2 shadow-xl"
            >
              <Input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={labels.processPickerLabel}
                value={query}
                placeholder={labels.processPickerPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
              <ul id={listId} role="listbox" className="mt-1 max-h-56 overflow-auto">
                {filtered.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-slate-500">{labels.processPickerEmpty}</li>
                ) : (
                  filtered.map((op, idx) => (
                    <li
                      key={op.id}
                      role="option"
                      aria-selected={idx === activeIndex}
                      className={[
                        'cursor-pointer rounded px-2 py-1.5 text-sm',
                        idx === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50',
                      ].join(' ')}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => choose(op)}
                    >
                      {op.operationName}
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-1 flex justify-end">
                <Button type="button" className="btn--ghost" onClick={() => setOpen(false)}>
                  {labels.processPickerCancel}
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ProcessEditDialog({
  process,
  labels,
  disabled,
  onClose,
  onSubmit,
}: {
  process: WipProcessRow;
  labels: WipLibraryLabels;
  disabled: boolean;
  onClose: () => void;
  onSubmit: (next: WipProcessRow) => void;
}) {
  const [draft, setDraft] = React.useState(process);

  React.useEffect(() => setDraft(process), [process]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${labels.processEdit} ${process.processName}`}
      data-testid="wip-process-editor"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.45)',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          {labels.processEdit} — <span className="font-mono">{process.processName}</span>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-700">{labels.processDuration}</label>
            <Input
              type="number"
              min={0}
              step="0.0001"
              value={String(draft.durationHours)}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, durationHours: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-700">{labels.processAdditionalCost}</label>
            <Input
              type="number"
              min={0}
              step="0.0001"
              value={String(draft.additionalCost)}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, additionalCost: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-700">{labels.processThroughput}</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={String(draft.throughputPerHour ?? 0)}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, throughputPerHour: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-700">{labels.processThroughputUom}</label>
            <Select
              value={(draft.throughputUom as (typeof THROUGHPUT_UOMS)[number]) ?? 'kg'}
              disabled={disabled}
              onValueChange={(value) => setDraft({ ...draft, throughputUom: value })}
              options={THROUGHPUT_UOMS.map((u) => ({ value: u, label: u }))}
            >
              <SelectTrigger aria-label={labels.processThroughputUom}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THROUGHPUT_UOMS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-700">{labels.processSetupCost}</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={String(draft.setupCost)}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, setupCost: Number(e.target.value) || 0 })}
            />
          </div>
        </div>

        {draft.roles.length > 0 ? (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold text-slate-700">{labels.processRolesHeader}</h4>
            <div className="space-y-2">
              {draft.roles.map((role, index) => (
                <div key={`${role.roleGroup}-${index}`} className="grid grid-cols-3 gap-2">
                  <Input value={role.roleGroup} disabled aria-label={labels.processRoleGroup} />
                  <Input
                    type="number"
                    min={1}
                    value={String(role.headcount)}
                    disabled={disabled}
                    aria-label={labels.processHeadcount}
                    onChange={(e) => {
                      const roles = draft.roles.map((r, i) =>
                        i === index ? { ...r, headcount: Number(e.target.value) || 1 } : r,
                      );
                      setDraft({ ...draft, roles });
                    }}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={role.ratePerHour === null ? '' : String(role.ratePerHour)}
                    disabled={disabled}
                    aria-label={labels.processRatePerHour}
                    onChange={(e) => {
                      const roles = draft.roles.map((r, i) =>
                        i === index
                          ? { ...r, ratePerHour: e.target.value === '' ? null : Number(e.target.value) }
                          : r,
                      );
                      setDraft({ ...draft, roles });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" className="btn--ghost" onClick={onClose}>
            {labels.processCancel}
          </Button>
          <Button type="button" disabled={disabled} onClick={() => onSubmit(draft)}>
            {labels.processSave}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function WipProcessChainEditor({
  processes,
  operations,
  labels,
  canEdit,
  onChange,
}: {
  processes: WipProcessRow[];
  operations: OperationOption[];
  labels: WipLibraryLabels;
  canEdit: boolean;
  onChange: (next: WipProcessRow[]) => void;
}) {
  const readOnly = !canEdit;
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  async function handlePick(op: OperationOption) {
    const def = await getProcessDefault(op.id);
    const payload = def.ok ? def.data : null;
    const processName = payload?.operationName ?? op.operationName;
    const roles =
      payload?.roles.map((r: { roleGroup: string; defaultHeadcount: number }) => ({
        roleGroup: r.roleGroup,
        headcount: r.defaultHeadcount,
        ratePerHour: null,
      })) ?? [];
    onChange([
      ...processes,
      {
        processName,
        displayOrder: processes.length,
        durationHours: payload?.defaultDurationHours ?? 0,
        additionalCost: payload?.standardCost ?? 0,
        throughputPerHour: 0,
        throughputUom: 'kg',
        setupCost: 0,
        roles,
      },
    ]);
  }

  function removeProcess(index: number) {
    onChange(
      processes
        .filter((_, i) => i !== index)
        .map((row, displayOrder) => ({ ...row, displayOrder })),
    );
  }

  function updateProcess(index: number, next: WipProcessRow) {
    onChange(processes.map((row, i) => (i === index ? next : row)));
    setEditingIndex(null);
  }

  const editing = editingIndex === null ? null : processes[editingIndex] ?? null;

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50/60 p-3" data-testid="wip-process-chain">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{labels.processTitle}</h2>
          <p className="text-[11px] text-slate-500">{labels.processSubtitle}</p>
        </div>
        {readOnly ? null : (
          <OperationPicker labels={labels} options={operations} disabled={false} onSelect={(op) => void handlePick(op)} />
        )}
      </div>

      {processes.length === 0 ? (
        <div className="flex flex-col items-center gap-0.5 py-4 text-center">
          <p className="text-xs font-medium text-slate-600">{labels.processEmpty}</p>
          <p className="text-[11px] text-slate-400">{labels.processEmptyBody}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {processes.map((proc, index) => (
            <li key={`${proc.processName}-${index}`} className="rounded-md border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{proc.processName}</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-slate-600">
                  <span>
                    {labels.processDuration}: {proc.durationHours}
                  </span>
                  <span>
                    {labels.processAdditionalCost}: {proc.additionalCost}
                  </span>
                  {readOnly ? null : (
                    <>
                      <Button type="button" className="btn--ghost" onClick={() => setEditingIndex(index)}>
                        {labels.processEdit}
                      </Button>
                      <Button type="button" className="btn--ghost" onClick={() => removeProcess(index)}>
                        {labels.processRemove}
                      </Button>
                    </>
                  )}
                </span>
              </div>
              {proc.roles.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500">{labels.processRolesHeader}:</span>
                  {proc.roles.map((role) => (
                    <span key={role.roleGroup} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {role.roleGroup} ×{role.headcount}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editing && editingIndex !== null ? (
        <ProcessEditDialog
          process={editing}
          labels={labels}
          disabled={readOnly}
          onClose={() => setEditingIndex(null)}
          onSubmit={(next) => updateProcess(editingIndex, next)}
        />
      ) : null}
    </section>
  );
}
