'use client';

import React from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Switch } from '@monopilot/ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import type { WipBaseUom, WipDefinitionDetail, WipStatus } from '../_lib/wip-definition-contract';
import { WIP_BASE_UOMS } from '../_lib/wip-definition-contract';
import type { WipLibraryLabels } from './wip-labels';

export type WipHeaderDraft = {
  name: string;
  description: string;
  baseUom: WipBaseUom;
  yieldPct: string;
  reusable: boolean;
  status: WipStatus;
  version: number;
  itemCode: string | null;
};

export function definitionToHeaderDraft(definition: WipDefinitionDetail): WipHeaderDraft {
  return {
    name: definition.name,
    description: definition.description ?? '',
    baseUom: definition.baseUom,
    yieldPct: definition.yieldPct,
    reusable: definition.reusable,
    status: definition.status,
    version: definition.version,
    itemCode: definition.itemCode ?? null,
  };
}

export function WipDefinitionHeader({
  draft,
  labels,
  canEdit,
  onChange,
}: {
  draft: WipHeaderDraft;
  labels: WipLibraryLabels;
  canEdit: boolean;
  onChange: (next: WipHeaderDraft) => void;
}) {
  const readOnly = !canEdit || draft.status === 'archived';

  return (
    <section className="card grid gap-4" data-testid="wip-definition-header">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor="wip-header-name" className="text-xs font-medium text-slate-700">
            {labels.headerName}
          </label>
          <Input
            id="wip-header-name"
            value={draft.name}
            disabled={readOnly}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="wip-header-uom" className="text-xs font-medium text-slate-700">
            {labels.headerBaseUom}
          </label>
          <Select
            value={draft.baseUom}
            disabled={readOnly}
            onValueChange={(value) => onChange({ ...draft, baseUom: value as WipBaseUom })}
            options={WIP_BASE_UOMS.map((u) => ({ value: u, label: u }))}
          >
            <SelectTrigger id="wip-header-uom" aria-label={labels.headerBaseUom}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WIP_BASE_UOMS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1 md:col-span-2">
          <label htmlFor="wip-header-description" className="text-xs font-medium text-slate-700">
            {labels.headerDescription}
          </label>
          <Input
            id="wip-header-description"
            value={draft.description}
            disabled={readOnly}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="wip-header-yield" className="text-xs font-medium text-slate-700">
            {labels.headerYieldPct}
          </label>
          <Input
            id="wip-header-yield"
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={draft.yieldPct}
            disabled={readOnly}
            onChange={(e) => onChange({ ...draft, yieldPct: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <span id="wip-header-reusable-label" className="text-xs font-medium text-slate-700">
            {labels.headerReusable}
          </span>
          <Switch
            checked={draft.reusable}
            disabled={readOnly}
            aria-labelledby="wip-header-reusable-label"
            data-testid="wip-header-reusable"
            onCheckedChange={(checked) => onChange({ ...draft, reusable: checked })}
          />
        </div>
        <div className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">{labels.headerStatus}</span>
          <span className={`badge ${draft.status === 'archived' ? 'badge-amber' : draft.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
            {draft.status}
          </span>
        </div>
        <div className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">{labels.headerVersion}</span>
          <span className="mono text-sm tabular-nums">v{draft.version}</span>
        </div>
        {draft.itemCode ? (
          <div className="grid gap-1">
            <span className="text-xs font-medium text-slate-700">{labels.headerItemCode}</span>
            <span className="mono text-sm">{draft.itemCode}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function WipArchiveConfirmDialog({
  open,
  labels,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  labels: WipLibraryLabels;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.detailArchiveConfirmTitle}
      data-testid="wip-archive-modal"
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
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">{labels.detailArchiveConfirmTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">{labels.detailArchiveConfirmBody}</p>
        {error ? (
          <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700" data-testid="wip-archive-error">
            {error}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" className="btn--ghost" disabled={busy} onClick={onCancel}>
            {labels.detailArchiveCancel}
          </Button>
          <Button type="button" className="btn--primary" disabled={busy} onClick={onConfirm}>
            {busy ? labels.detailArchiving : labels.detailArchiveConfirm}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
