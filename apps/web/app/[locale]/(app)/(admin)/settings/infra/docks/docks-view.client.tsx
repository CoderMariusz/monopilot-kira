'use client';

/**
 * WAVE E5 — Dock-door management client view (mig 317 dock_doors).
 *
 * Settings/infra master screen: list dock doors (code / name / direction /
 * warehouse / status) with an add/edit dialog (code, name, direction,
 * warehouse). Follows the locked settings/infra list+dialog conventions reused
 * from /settings/infra/lines and /planning/carriers.
 *
 * Prototype note: no yard/dock screen exists under prototypes/design/ —
 * presentation follows the module-wide card/table/badge/empty-state +
 * @monopilot/ui Modal/Button/Input/Select pattern (prototype_match=false,
 * spec-driven). Desktop settings context → @monopilot/ui Select.
 *
 * Contract note: upsertDockDoor THROWS on failure (forbidden / validation) and
 * returns the bare DockDoorRow on success — we try/catch and map Error.message
 * via classifyYardError, never surfacing a raw message.
 *
 * UI states: loading, permission-denied (amber note), error (red alert), empty,
 * table; dialog idle/pending/inline-error.
 */
import React from 'react';
import { useTranslations } from 'next-intl';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import {
  classifyYardError,
  type DockDoorDirection,
  type DockDoorRow,
  type UpsertDockDoorInput,
} from '../../../../(modules)/yard/_components/yard-shared';
import { buildDocksLabels } from '../../../../(modules)/yard/_components/yard-labels';
import type { DocksLabels } from '../../../../(modules)/yard/_components/yard-types';

export type WarehouseOption = {
  id: string;
  name: string;
};

export type DocksViewProps = {
  initialDocks: DockDoorRow[];
  warehouses: WarehouseOption[];
  canManage: boolean;
  /** Server Action seam (injected from the RSC page). THROWS on failure. */
  upsertDockDoorAction: (input: UpsertDockDoorInput) => Promise<DockDoorRow>;
  deleteDockDoorAction?: (dockDoorId: string) => Promise<void>;
  /** Server-resolved state so permission-denied / error never render-then-hide. */
  state: 'ready' | 'empty' | 'forbidden' | 'error';
};

type ModalState = { open: false } | { open: true; editing: DockDoorRow | null };

const DIRECTIONS: DockDoorDirection[] = ['inbound', 'outbound', 'both'];

function directionBadge(direction: DockDoorDirection): string {
  if (direction === 'inbound') return 'badge-blue';
  if (direction === 'outbound') return 'badge-gray';
  return 'badge-green';
}

export function DocksView({ initialDocks, warehouses, canManage, upsertDockDoorAction, deleteDockDoorAction, state }: DocksViewProps) {
  // Labels built client-side from the `Yard` next-intl namespace: they contain
  // function-valued members (directionLabel/directionOption) which the RSC
  // boundary cannot serialise, so they must NOT be passed as a prop.
  const t = useTranslations('Yard');
  const labels = React.useMemo(() => buildDocksLabels(t), [t]);
  const [docks, setDocks] = React.useState<DockDoorRow[]>(() => [...initialDocks]);
  const [modal, setModal] = React.useState<ModalState>({ open: false });
  const [deleteTarget, setDeleteTarget] = React.useState<DockDoorRow | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const warehouseName = (id: string | null): string | null =>
    id ? warehouses.find((w) => w.id === id)?.name ?? null : null;

  async function submitDelete() {
    if (!canManage || !deleteDockDoorAction || !deleteTarget || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteDockDoorAction(deleteTarget.id);
      setDocks((current) => current.filter((dock) => dock.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      const kind = classifyYardError(error);
      const map = labels.deleteErrors as Record<string, string>;
      setDeleteError(map[kind] ?? labels.deleteErrors.persistence_failed);
    } finally {
      setDeletePending(false);
    }
  }

  if (state === 'forbidden') {
    return (
      <div role="note" data-testid="docks-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {labels.denied}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="docks-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="docks-view">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          className="btn--primary"
          data-testid="docks-add"
          disabled={!canManage}
          aria-label={canManage ? labels.add : `${labels.add} — ${labels.modal.errors.forbidden}`}
          onClick={() => setModal({ open: true, editing: null })}
        >
          {labels.add}
        </Button>
      </div>

      {docks.length === 0 ? (
        <div className="card">
          <div className="px-4 py-8 text-center" data-testid="docks-empty">
            <div className="text-sm text-slate-500">{labels.empty}</div>
            <div className="mt-1 text-xs text-slate-400">{labels.emptyHint}</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="docks-table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-3 py-2">{labels.columns.code}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.name}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.direction}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.warehouse}</th>
                  <th scope="col" className="px-3 py-2">{labels.columns.status}</th>
                  <th scope="col" className="px-3 py-2 text-right">{labels.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docks.map((dock) => (
                  <tr key={dock.id} data-testid={`dock-row-${dock.code}`}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{dock.code}</td>
                    <td className="px-3 py-2 text-slate-800">{dock.name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`badge ${directionBadge(dock.direction)}`}>{labels.directionLabel(dock.direction)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{warehouseName(dock.warehouseId) ?? labels.noWarehouse}</td>
                    <td className="px-3 py-2">
                      {dock.isActive ? (
                        <span className="badge badge-green">{labels.active}</span>
                      ) : (
                        <span className="badge badge-gray">{labels.inactive}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn--secondary btn-sm"
                          data-testid={`dock-edit-${dock.code}`}
                          disabled={!canManage}
                          onClick={() => setModal({ open: true, editing: dock })}
                        >
                          {labels.edit}
                        </button>
                        {deleteDockDoorAction ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn-sm"
                            data-testid={`dock-delete-${dock.code}`}
                            disabled={!canManage || deletePending}
                            onClick={() => {
                              setDeleteTarget(dock);
                              setDeleteError(null);
                            }}
                          >
                            {labels.deleteDock}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal.open ? (
        <DockModal
          labels={labels}
          editing={modal.editing}
          warehouses={warehouses}
          upsertDockDoorAction={upsertDockDoorAction}
          onClose={() => setModal({ open: false })}
          onSaved={(row) => {
            setModal({ open: false });
            setDocks((current) => {
              const without = current.filter((d) => d.id !== row.id);
              return [...without, row].sort((l, r) => l.code.localeCompare(r.code));
            });
          }}
        />
      ) : null}

      {deleteTarget ? (
        <Modal open onOpenChange={(open) => (!open && !deletePending ? setDeleteTarget(null) : undefined)} size="md" modalId="settings_dock_door_delete">
          <div className="flex flex-col gap-4 p-1">
            <h2 className="text-lg font-semibold text-slate-950">{labels.deleteDockTitle}</h2>
            <p className="text-sm text-slate-700">{labels.deleteDockBody.replace('{name}', deleteTarget.name ?? deleteTarget.code)}</p>
            {deleteError ? <p role="alert" className="text-sm text-red-700">{deleteError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="dry-run" disabled={deletePending} onClick={() => setDeleteTarget(null)}>
                {labels.modal.cancel}
              </Button>
              <Button type="button" disabled={deletePending} onClick={() => void submitDelete()}>
                {deletePending ? labels.deleteDockPending : labels.confirmDelete}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function DockModal({
  labels,
  editing,
  warehouses,
  upsertDockDoorAction,
  onClose,
  onSaved,
}: {
  labels: DocksLabels;
  editing: DockDoorRow | null;
  warehouses: WarehouseOption[];
  upsertDockDoorAction: (input: UpsertDockDoorInput) => Promise<DockDoorRow>;
  onClose: () => void;
  onSaved: (row: DockDoorRow) => void;
}) {
  const m = labels.modal;
  const [code, setCode] = React.useState(editing?.code ?? '');
  const [name, setName] = React.useState(editing?.name ?? '');
  const [direction, setDirection] = React.useState<DockDoorDirection>(editing?.direction ?? 'inbound');
  const [warehouseId, setWarehouseId] = React.useState(editing?.warehouseId ?? 'none');
  const [isActive, setIsActive] = React.useState(editing?.isActive ?? true);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const warehouseOptions = [
    { value: 'none', label: m.noWarehouse },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!code.trim()) return setFormError(m.errors.codeRequired);

    setPending(true);
    try {
      const row = await upsertDockDoorAction({
        id: editing?.id,
        code: code.trim(),
        name: name.trim() || null,
        direction,
        warehouseId: warehouseId === 'none' ? null : warehouseId,
        isActive,
      });
      onSaved(row);
    } catch (err) {
      const kind = classifyYardError(err);
      const map = m.errors as Record<string, string>;
      setFormError(map[kind] ?? m.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => (!open ? onClose() : undefined)} size="md" modalId="settings_dock_door_upsert">
      <Modal.Header title={editing ? m.titleEdit : m.titleAdd} />
      <Modal.Body>
        <form id="dock-form" onSubmit={onSubmit} data-testid="dock-form" className="flex flex-col gap-4">
          {formError ? (
            <div role="alert" data-testid="dock-form-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.codeLabel}</span>
              <Input type="text" value={code} data-testid="dock-code" onChange={(e) => setCode(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.nameLabel}</span>
              <Input type="text" value={name ?? ''} data-testid="dock-name" onChange={(e) => setName(e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.directionLabel}</span>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as DockDoorDirection)}
                aria-label={m.directionLabel}
                options={DIRECTIONS.map((d) => ({ value: d, label: m.directionOption(d) }))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">{m.warehouseLabel}</span>
              <Select value={warehouseId ?? 'none'} onValueChange={setWarehouseId} aria-label={m.warehouseLabel} options={warehouseOptions} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={isActive} data-testid="dock-active" onChange={(e) => setIsActive(e.target.checked)} />
            {m.activeLabel}
          </label>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" className="btn--ghost" data-testid="dock-cancel" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button type="submit" form="dock-form" className="btn--primary" data-testid="dock-submit" disabled={pending} aria-busy={pending}>
          {pending ? m.submitting : m.submit}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
