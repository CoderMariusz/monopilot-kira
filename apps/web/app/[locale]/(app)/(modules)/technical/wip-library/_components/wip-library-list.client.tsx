'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import { saveWipDefinition } from '../_actions/wip-definition-actions';
import type { WipDefinitionListItem, WipStatus } from '../_lib/wip-definition-contract';
import { WIP_BASE_UOMS, type WipBaseUom } from '../_lib/wip-definition-contract';
import { countByStatusFilter, filterWipDefinitions, type WipListStatusFilter } from '../_lib/filter-wip-definitions';
import { toSaveBaseUom } from '../_lib/map-wip-api';
import type { WipLibraryLabels } from './wip-labels';

const STATUS_TONE: Record<WipStatus, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  archived: 'badge-amber',
};

function statusLabel(status: WipStatus, labels: WipLibraryLabels): string {
  if (status === 'draft') return labels.statusDraft;
  if (status === 'active') return labels.statusActive;
  return labels.statusArchived;
}

function CreateDefinitionModal({
  open,
  labels,
  locale,
  onClose,
}: {
  open: boolean;
  labels: WipLibraryLabels;
  locale: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [baseUom, setBaseUom] = React.useState<WipBaseUom>('kg');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setBaseUom('kg');
      setError(null);
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveWipDefinition({
        name: trimmed,
        baseUom: toSaveBaseUom(baseUom),
        yieldPct: 100,
        reusable: false,
        ingredients: [],
        processes: [],
      });
      if (!result.ok) {
        setError(labels.createError);
        return;
      }
      router.push(`/${locale}/technical/wip-library/${result.id}`);
      onClose();
    } catch {
      setError(labels.createError);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.createModalTitle}
      data-testid="wip-create-modal"
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
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-slate-900">{labels.createModalTitle}</h2>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor="wip-create-name" className="text-xs font-medium text-slate-700">
              {labels.createModalName}
            </label>
            <Input
              id="wip-create-name"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="wip-create-uom" className="text-xs font-medium text-slate-700">
              {labels.createModalBaseUom}
            </label>
            <Select
              value={baseUom}
              disabled={busy}
              onValueChange={(value) => setBaseUom(value as WipBaseUom)}
              options={WIP_BASE_UOMS.map((u) => ({ value: u, label: u }))}
            >
              <SelectTrigger id="wip-create-uom" aria-label={labels.createModalBaseUom}>
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
        </div>
        {error ? (
          <div role="alert" className="mt-3 text-xs text-red-600">
            {error}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" className="btn--ghost" disabled={busy} onClick={onClose}>
            {labels.createModalCancel}
          </Button>
          <Button type="button" className="btn--primary" disabled={busy || !name.trim()} onClick={() => void handleCreate()}>
            {busy ? labels.createModalSaving : labels.createModalSubmit}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function WipLibraryListClient({
  definitions,
  canCreate,
  canEdit,
  canDeactivate,
  labels,
  locale,
  autoOpenCreate,
}: {
  definitions: WipDefinitionListItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  labels: WipLibraryLabels;
  locale: string;
  autoOpenCreate?: boolean;
}) {
  const [statusFilter, setStatusFilter] = React.useState<WipListStatusFilter>('active');
  const [query, setQuery] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(Boolean(autoOpenCreate));

  const counts = React.useMemo(() => countByStatusFilter(definitions), [definitions]);
  const rows = React.useMemo(
    () => filterWipDefinitions(definitions, { statusFilter, query }),
    [definitions, statusFilter, query],
  );

  const pills: Array<[WipListStatusFilter, string, number]> = [
    ['active', labels.listFilterActive, counts.active],
    ['archived', labels.listFilterArchived, counts.archived],
  ];

  return (
    <div data-screen="wip-library-list" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="pills" role="tablist" aria-label={labels.listTitle}>
          {pills.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={statusFilter === key}
              data-testid={`wip-filter-${key}`}
              onClick={() => setStatusFilter(key)}
              className={`pill${statusFilter === key ? ' on' : ''}`}
            >
              {label} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="wip-library-search" className="sr-only">
            {labels.listSearchPlaceholder}
          </label>
          <input
            id="wip-library-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.listSearchPlaceholder}
            aria-label={labels.listSearchPlaceholder}
            className="form-input"
            style={{ width: 240 }}
            data-testid="wip-library-search"
          />
          {canCreate ? (
            <Button
              type="button"
              className="btn btn-primary"
              data-testid="wip-new-definition"
              onClick={() => setCreateOpen(true)}
            >
              {labels.listNewDefinition}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table aria-label={labels.listTitle}>
          <thead>
            <tr>
              <th scope="col">{labels.listColName}</th>
              <th scope="col">{labels.listColBaseUom}</th>
              <th scope="col">{labels.listColVersion}</th>
              <th scope="col">{labels.listColStatus}</th>
              <th scope="col">{labels.listColReusable}</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {labels.listColProcessCount}
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {labels.listColWhereUsed}
              </th>
              <th scope="col">{labels.listColActions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} data-testid="wip-library-row">
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/${locale}/technical/wip-library/${row.id}`} className="text-blue-700 hover:underline">
                      {row.name}
                    </Link>
                    {row.itemCode ? <div className="mono text-xs text-slate-500">{row.itemCode}</div> : null}
                  </td>
                  <td className="mono">{row.baseUom}</td>
                  <td className="mono tabular-nums">v{row.version}</td>
                  <td>
                    <span className={`badge ${STATUS_TONE[row.status]}`}>{statusLabel(row.status, labels)}</span>
                  </td>
                  <td>
                    <span className={`badge ${row.reusable ? 'badge-blue' : 'badge-gray'}`}>
                      {row.reusable ? labels.reusableYes : labels.reusableNo}
                    </span>
                  </td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                    {row.processCount}
                  </td>
                  <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                    {row.referencingProjects}
                  </td>
                  <td>
                    <Link
                      href={`/${locale}/technical/wip-library/${row.id}`}
                      className="btn btn--ghost btn--sm"
                      data-testid={`wip-open-${row.id}`}
                    >
                      {labels.listOpenDetail}
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
                  {labels.listNoMatches}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!canCreate && !canEdit && !canDeactivate ? (
        <div role="alert" className="alert alert-amber">
          {labels.listViewerOnly}
        </div>
      ) : null}

      {canCreate ? (
        <CreateDefinitionModal
          open={createOpen}
          labels={labels}
          locale={locale}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </div>
  );
}
