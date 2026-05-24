'use client';

import React from 'react';

export const dynamic = 'force-dynamic';

type Warehouse = {
  id: string;
  code: string;
  name: string;
  deactivated_at: string | null;
  active_wo_count?: number;
};

type DeactivateWarehouseInput = {
  warehouseId: string;
  force?: boolean;
};

type DeactivateWarehouseResult =
  | { ok: true; data?: { warehouseId?: string; deactivated_at?: string; isActive?: boolean } }
  | {
      ok: false;
      code?: 'SOFT_WARNING_ACTIVE_WO' | string;
      error?: string;
      warning?: { code?: 'SOFT_WARNING_ACTIVE_WO' | 'ACTIVE_WO_REFERENCES' | string; activeWoCount?: number; activeWorkOrders?: number };
    };

type PageProps = {
  params?: Promise<{ locale: string }>;
  warehouses?: Warehouse[];
  canUpdateInfra?: boolean;
  deactivateWarehouse?: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
};

type StatusFilter = 'all' | 'active' | 'deactivated';
type SortKey = 'name' | 'code' | 'status';
type WarningState = { warehouseId: string; warehouseName: string; activeWoCount: number };

const h = React.createElement;

const labels = {
  title: 'Warehouses',
  subtitle: 'Manage warehouse master data, status, and infrastructure availability.',
  status: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusDeactivated: 'Deactivated',
  columnName: 'Warehouse',
  columnCode: 'Code',
  columnStatus: 'Status',
  columnSelect: 'Select',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  softWarningTitle: 'Active work orders reference this warehouse',
  softWarningCode: 'SOFT_WARNING_ACTIVE_WO',
  softWarningBody: 'Active work orders still reference this warehouse. Confirm to deactivate anyway.',
  cancel: 'Cancel',
  confirmDeactivate: 'Confirm deactivation',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to deactivate warehouses.',
  empty: 'No warehouses found for this organization.',
  error: 'Warehouse update failed. Try again or contact an administrator.',
};

const statusOptions = [
  { value: 'all', label: labels.statusAll },
  { value: 'active', label: labels.statusActive },
  { value: 'deactivated', label: labels.statusDeactivated },
] as const;

async function defaultDeactivateWarehouse(input: DeactivateWarehouseInput) {
  const { deactivateWarehouse } = await import('../../../../../../../actions/infra/warehouse.js');
  return deactivateWarehouse(input) as Promise<DeactivateWarehouseResult>;
}

export default function WarehousesPage(props: unknown) {
  const supplied = (props ?? {}) as Record<string, unknown>;
  const initialWarehouses = Array.isArray(supplied.warehouses) ? (supplied.warehouses as Warehouse[]) : [];
  const canApplyInfraUpdates = typeof supplied.canUpdateInfra === 'boolean' ? supplied.canUpdateInfra : false;
  const runDeactivateWarehouse =
    typeof supplied.deactivateWarehouse === 'function'
      ? (supplied.deactivateWarehouse as (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>)
      : defaultDeactivateWarehouse;
  return h(WarehouseListScreen, {
    initialWarehouses,
    canUpdateInfra: canApplyInfraUpdates,
    deactivateWarehouse: runDeactivateWarehouse,
  });
}

function WarehouseListScreen({
  initialWarehouses,
  canUpdateInfra,
  deactivateWarehouse,
}: {
  initialWarehouses: Warehouse[];
  canUpdateInfra: boolean;
  deactivateWarehouse: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
}) {
  const [rows, setRows] = React.useState<Warehouse[]>(() => [...initialWarehouses]);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<WarningState | null>(null);

  const visibleRows = React.useMemo(
    () =>
      rows
        .filter((row) => {
          if (statusFilter === 'active') return row.deactivated_at === null;
          if (statusFilter === 'deactivated') return row.deactivated_at !== null;
          return true;
        })
        .sort((a, b) => {
          if (sortKey === 'status') return statusLabel(a).localeCompare(statusLabel(b)) || a.name.localeCompare(b.name);
          return String(a[sortKey]).localeCompare(String(b[sortKey]));
        }),
    [rows, sortKey, statusFilter],
  );

  function toggleSelected(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function markDeactivated(warehouseId: string, deactivatedAt?: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === warehouseId
          ? { ...row, deactivated_at: deactivatedAt ?? row.deactivated_at ?? new Date().toISOString() }
          : row,
      ),
    );
  }

  async function bulkDeactivate() {
    if (!canUpdateInfra || selected.size === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      for (const warehouseId of selected) {
        const result = await deactivateWarehouse({ warehouseId, force: false });
        if (result.ok === false) {
          const failure = result;
          if (isSoftWarning(failure)) {
            const row = rows.find((item) => item.id === warehouseId);
            setWarning({
              warehouseId,
              warehouseName: row?.name ?? labels.columnName,
              activeWoCount: failure.warning?.activeWoCount ?? failure.warning?.activeWorkOrders ?? 0,
            });
            return;
          }
          setError(labels.error);
          return;
        }
        markDeactivated(result.data?.warehouseId ?? warehouseId, result.data?.deactivated_at);
      }
      setSelected(new Set());
    } finally {
      setPending(false);
    }
  }

  async function confirmDeactivation() {
    if (!warning) return;
    setPending(true);
    setError(null);
    try {
      const result = await deactivateWarehouse({ warehouseId: warning.warehouseId, force: true });
      if (result.ok) {
        markDeactivated(result.data?.warehouseId ?? warning.warehouseId, result.data?.deactivated_at);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(warning.warehouseId);
          return next;
        });
        setWarning(null);
      } else {
        setError(labels.error);
      }
    } finally {
      setPending(false);
    }
  }

  const disabledReason = canUpdateInfra ? undefined : labels.insufficientPermission;
  const buttonName = disabledReason ? `${labels.bulkDeactivate} — ${disabledReason}` : labels.bulkDeactivate;

  return h(
    'main',
    { 'data-testid': 'settings-warehouse-screen', 'data-screen': 'settings-warehouse-list', className: 'settings-screen settings-screen--warehouse' },
    h(
      'header',
      { 'data-region': 'page-head', className: 'settings-page-head' },
      h('div', null, h('p', { className: 'settings-eyebrow' }, 'SET-012 · Warehouse infrastructure'), h('h1', null, labels.title), h('p', { className: 'muted' }, labels.subtitle)),
      h(
        'div',
        { className: 'settings-actions', 'aria-label': 'Warehouse actions' },
        h(
          'button',
          {
            type: 'button',
            onClick: bulkDeactivate,
            disabled: !canUpdateInfra || selected.size === 0 || pending,
            'aria-label': buttonName,
            'data-slot': 'button',
            className: 'btn',
          },
          pending ? labels.bulkDeactivatePending : labels.bulkDeactivate,
        ),
      ),
    ),
    h(
      'section',
      { className: 'settings-section', 'aria-labelledby': 'warehouse-table-title' },
      h(
        'div',
        { className: 'settings-section__head' },
        h('div', null, h('h2', { id: 'warehouse-table-title' }, 'Warehouse master data'), h('p', { className: 'muted' }, 'Live warehouse rows with soft-delete status and guarded bulk deactivation.')),
        h(
          'div',
          { className: 'settings-toolbar', role: 'group', 'aria-label': 'Warehouse table controls' },
          h(
            'div',
            { className: 'settings-field' },
            h('label', { id: 'warehouse-status-label' }, labels.status),
            h(StatusSelect, { value: statusFilter, onChange: setStatusFilter }),
          ),
          h(
            'div',
            { className: 'settings-field' },
            h('label', { htmlFor: 'warehouse-sort' }, 'Sort'),
            h(
              'select',
              { id: 'warehouse-sort', value: sortKey, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setSortKey(event.target.value as SortKey) },
              h('option', { value: 'name' }, 'Warehouse'),
              h('option', { value: 'code' }, 'Code'),
              h('option', { value: 'status' }, 'Status'),
            ),
          ),
        ),
      ),
      error ? h('div', { role: 'alert', className: 'settings-error' }, error) : null,
      rows.length === 0 ? h('div', { className: 'settings-empty' }, labels.empty) : null,
      h(
        'table',
        { 'aria-label': 'Warehouses', 'data-slot': 'table', className: 'table' },
        h(
          'thead',
          { 'data-slot': 'table-header', className: 'table__header' },
          h(
            'tr',
            { 'data-slot': 'table-row', className: 'table__row' },
            h('th', { scope: 'col', 'data-slot': 'table-head', className: 'table__head' }, labels.columnSelect),
            h('th', { scope: 'col', 'data-slot': 'table-head', className: 'table__head' }, h('button', { type: 'button', onClick: () => setSortKey('name'), className: 'settings-sort-button' }, labels.columnName)),
            h('th', { scope: 'col', 'data-slot': 'table-head', className: 'table__head' }, h('button', { type: 'button', onClick: () => setSortKey('code'), className: 'settings-sort-button' }, labels.columnCode)),
            h('th', { scope: 'col', 'data-slot': 'table-head', className: 'table__head' }, h('button', { type: 'button', onClick: () => setSortKey('status'), className: 'settings-sort-button' }, labels.columnStatus)),
          ),
        ),
        h(
          'tbody',
          { 'data-slot': 'table-body', className: 'table__body' },
          visibleRows.map((warehouse) =>
            h(
              'tr',
              { key: warehouse.id, 'data-testid': 'settings-warehouse-row', 'data-slot': 'table-row', className: 'table__row' },
              h('td', { 'data-slot': 'table-cell', className: 'table__cell' }, h('input', { type: 'checkbox', checked: selected.has(warehouse.id), onChange: (event: React.ChangeEvent<HTMLInputElement>) => toggleSelected(warehouse.id, event.target.checked), disabled: warehouse.deactivated_at !== null || pending || !canUpdateInfra, 'aria-label': `Select ${warehouse.name}` })),
              h('td', { 'data-slot': 'table-cell', className: 'table__cell' }, warehouse.name),
              h('td', { 'data-slot': 'table-cell', className: 'table__cell mono' }, warehouse.code),
              h('td', { 'data-slot': 'table-cell', className: 'table__cell' }, h(Badge, { tone: warehouse.deactivated_at ? 'muted' : 'success' }, statusLabel(warehouse))),
            ),
          ),
        ),
      ),
    ),
    warning
      ? h(
          'div',
          { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'warehouse-soft-warning-title', className: 'settings-dialog' },
          h(
            'div',
            { className: 'settings-dialog__panel' },
            h('h2', { id: 'warehouse-soft-warning-title' }, labels.softWarningTitle),
            h(Badge, { tone: 'warning' }, labels.softWarningCode),
            h('p', null, labels.softWarningBody),
            h('p', { className: 'muted' }, `${warning.activeWoCount} active work orders reference ${warning.warehouseName}.`),
            h('div', { className: 'settings-dialog__actions' }, h('button', { type: 'button', 'data-slot': 'button', className: 'btn', onClick: () => setWarning(null), disabled: pending }, labels.cancel), h('button', { type: 'button', 'data-slot': 'button', className: 'btn', onClick: confirmDeactivation, disabled: pending }, labels.confirmDeactivate)),
          ),
        )
      : null,
  );
}

function StatusSelect({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  return h(
    'div',
    { 'data-slot': 'select', className: 'select' },
    h('button', { type: 'button', role: 'combobox', 'aria-labelledby': 'warehouse-status-label', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'data-slot': 'select-trigger', className: 'select__trigger' }, statusOptions.find((option) => option.value === value)?.label ?? labels.statusAll, h('span', { 'aria-hidden': 'true', 'data-slot': 'select-arrow' }, '⌄')),
    h(
      'div',
      { role: 'listbox', 'data-slot': 'select-content', className: 'select__content' },
      statusOptions.map((option) => h('div', { key: option.value, role: 'option', 'aria-selected': value === option.value, 'data-slot': 'select-item', tabIndex: 0, onClick: () => onChange(option.value), onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onChange(option.value); } }, className: 'select__item' }, option.label)),
    ),
  );
}

function Badge({ children, tone }: { children?: React.ReactNode; tone: 'muted' | 'success' | 'warning' }) {
  return h('span', { 'data-slot': 'badge', 'data-tone': tone, className: `badge badge--${tone}`, 'aria-label': String(children) }, children);
}

function statusLabel(warehouse: Warehouse) {
  return warehouse.deactivated_at ? labels.statusDeactivated : labels.statusActive;
}

function isSoftWarning(result: Extract<DeactivateWarehouseResult, { ok: false }>) {
  return (
    result.code === 'SOFT_WARNING_ACTIVE_WO' ||
    result.warning?.code === 'SOFT_WARNING_ACTIVE_WO' ||
    result.warning?.code === 'ACTIVE_WO_REFERENCES' ||
    result.error === 'active_work_orders_reference_warehouse'
  );
}
