import React from 'react';

type MachineStatus = 'active' | 'offline' | 'maintenance';

type LocationRow = {
  id: string;
  warehouseId: string;
  path: string;
  name: string;
};

type MachineRow = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  locationId: string;
  locationPath: string;
  specs: { status?: MachineStatus | string | null };
  deactivated_at: string | null;
};

type MachineActionInput = { machineId: string };
type MachineActionResult = {
  ok: boolean;
  data?: { machineId: string; deactivated_at?: string | null };
};

type MachinesPageProps = {
  params?: Promise<{ locale: string }>;
  machines?: MachineRow[];
  locations?: LocationRow[];
  canUpdateInfra?: boolean;
  deactivateMachine?: (input: MachineActionInput) => Promise<MachineActionResult> | MachineActionResult;
  activateMachine?: (input: MachineActionInput) => Promise<MachineActionResult> | MachineActionResult;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

const h = React.createElement;

const labels = {
  title: 'Machines',
  subtitle: 'Manage equipment status, location, and infrastructure availability.',
  status: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusOffline: 'Offline',
  statusMaintenance: 'Maintenance',
  locationBreadcrumb: 'Location breadcrumb',
  columnName: 'Machine',
  columnCode: 'Code',
  columnStatus: 'Status',
  columnLocation: 'Location',
  bulkActivate: 'Bulk Activate',
  bulkDeactivate: 'Bulk Deactivate',
  deactivated: 'Deactivated',
  insufficientPermission:
    'Insufficient permissions: settings.infra.update is required to activate or deactivate machines.',
  loading: 'Loading machines…',
  empty: 'No machines are available for this organization.',
  error: 'Unable to load machines. Try again after the backend is available.',
  forbidden: 'You do not have permission to view machine infrastructure settings.',
  provenance: 'Data source: live loader props; status is read from machines.specs.status and locations are resolved from ltree paths.',
};

function pathToBreadcrumb(path: string, locations: LocationRow[]) {
  const segments = path.split('.').filter(Boolean);
  return segments.map((_, index) => {
    const cumulativePath = segments.slice(0, index + 1).join('.');
    return locations.find((location) => location.path === cumulativePath)?.name ?? segments[index].replace(/_/g, ' ');
  });
}

function normalizeStatus(machine: MachineRow) {
  if (machine.deactivated_at) return 'deactivated';
  return String(machine.specs?.status ?? 'offline').toLowerCase();
}

function statusLabel(status: string) {
  if (status === 'active') return labels.statusActive;
  if (status === 'maintenance') return labels.statusMaintenance;
  if (status === 'deactivated') return labels.deactivated;
  return labels.statusOffline;
}

function statusTone(status: string) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'maintenance') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'deactivated') return 'bg-slate-100 text-slate-700 ring-slate-200';
  return 'bg-rose-50 text-rose-700 ring-rose-200';
}

function filterMachineRows(value: string) {
  document.querySelectorAll<HTMLTableRowElement>('[data-machine-row="true"]').forEach((row) => {
    const visible = value === 'all' || row.dataset.status === value;
    row.hidden = !visible;
    if (visible) {
      row.setAttribute('data-testid', 'settings-machine-row');
    } else {
      row.removeAttribute('data-testid');
    }
  });
}

function escapeCssIdent(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/(["\\])/g, '\\$1');
}

async function runBulkAction(action: 'activate' | 'deactivate', callback?: MachinesPageProps['activateMachine'] | MachinesPageProps['deactivateMachine']) {
  if (!callback) return;
  const checked = Array.from(document.querySelectorAll<HTMLInputElement>('[data-machine-select="true"]:checked'));
  for (const checkbox of checked) {
    const machineId = checkbox.value;
    const result = await callback({ machineId });
    const row = document.querySelector<HTMLTableRowElement>(`[data-machine-id="${escapeCssIdent(machineId)}"]`);
    if (!row || !result.ok) continue;

    const status = action === 'deactivate' ? 'deactivated' : 'active';
    const statusText = statusLabel(status);
    row.dataset.status = status;
    row.querySelector<HTMLElement>('[data-machine-status]')?.replaceChildren(statusText);
    row.querySelector<HTMLElement>('[data-machine-status]')?.setAttribute('aria-label', statusText);
    row.querySelector<HTMLElement>('[data-machine-status]')?.setAttribute('class', `inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusTone(status)}`);

    const deactivatedAt = result.data?.deactivated_at ?? null;
    const deactivationNode = row.querySelector<HTMLElement>('[data-machine-deactivated-at]');
    if (deactivationNode) {
      deactivationNode.textContent = deactivatedAt ? `${labels.deactivated} ${deactivatedAt.slice(0, 10)}` : '';
    }
  }
  const filter = document.getElementById('machine-status-filter') as HTMLSelectElement | null;
  if (filter) filterMachineRows(filter.value);
}

function StateNotice({ state }: { state: NonNullable<MachinesPageProps['state']> }) {
  if (state === 'loading') return h('div', { role: 'status', 'aria-live': 'polite' }, labels.loading);
  if (state === 'empty') return h('div', { role: 'status' }, labels.empty);
  if (state === 'error') return h('div', { role: 'alert' }, labels.error);
  if (state === 'permission_denied') return h('div', { role: 'alert' }, labels.forbidden);
  return null;
}

function Badge({ status }: { status: string }) {
  const text = statusLabel(status);
  return h(
    'span',
    {
      'data-slot': 'badge',
      'data-machine-status': true,
      'aria-label': text,
      className: `inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusTone(status)}`,
    },
    text,
  );
}

function renderBreadcrumb(machine: MachineRow, locations: LocationRow[]) {
  const crumbs = pathToBreadcrumb(machine.locationPath, locations).slice(0, 4);
  return h(
    'nav',
    { 'aria-label': labels.locationBreadcrumb, className: 'text-xs text-slate-600' },
    h(
      'ol',
      { className: 'flex flex-wrap items-center gap-1' },
      ...crumbs.map((crumb, index) =>
        h(
          'li',
          { key: `${machine.id}-${crumb}`, className: 'inline-flex items-center gap-1' },
          h('span', { className: index === crumbs.length - 1 ? 'font-medium text-slate-900' : undefined }, crumb),
          index < crumbs.length - 1 ? h('span', { 'aria-hidden': 'true', className: 'text-slate-400' }, '/') : null,
        ),
      ),
    ),
  );
}

function renderTable(machines: MachineRow[], locations: LocationRow[]) {
  return h(
    'section',
    { className: 'rounded-xl border border-slate-200 bg-white shadow-sm' },
    h(
      'table',
      { 'aria-label': labels.title, className: 'w-full border-collapse text-left text-sm' },
      h(
        'thead',
        { className: 'bg-slate-50 text-xs uppercase tracking-wide text-slate-500' },
        h(
          'tr',
          null,
          h('th', { scope: 'col', className: 'px-4 py-3' }, h('span', { className: 'sr-only' }, 'Select')),
          h('th', { scope: 'col', className: 'px-4 py-3' }, labels.columnName),
          h('th', { scope: 'col', className: 'px-4 py-3' }, labels.columnCode),
          h('th', { scope: 'col', className: 'px-4 py-3' }, labels.columnStatus),
          h('th', { scope: 'col', className: 'px-4 py-3' }, labels.columnLocation),
          h('th', { scope: 'col', className: 'px-4 py-3' }, labels.deactivated),
        ),
      ),
      h(
        'tbody',
        { className: 'divide-y divide-slate-100' },
        ...machines.map((machine) => {
          const status = normalizeStatus(machine);
          return h(
            'tr',
            {
              key: machine.id,
              'data-testid': 'settings-machine-row',
              'data-machine-row': 'true',
              'data-machine-id': machine.id,
              'data-status': status,
              className: 'align-top hover:bg-slate-50',
            },
            h(
              'td',
              { className: 'px-4 py-3' },
              h('input', {
                type: 'checkbox',
                value: machine.id,
                'data-machine-select': 'true',
                'aria-label': `Select ${machine.name}`,
                className: 'h-4 w-4 rounded border-slate-300',
              }),
            ),
            h('td', { className: 'px-4 py-3 font-medium text-slate-950' }, machine.name),
            h('td', { className: 'px-4 py-3 font-mono text-xs text-slate-600' }, machine.code),
            h('td', { className: 'px-4 py-3' }, h(Badge, { status })),
            h('td', { className: 'px-4 py-3' }, renderBreadcrumb(machine, locations)),
            h('td', { className: 'px-4 py-3 text-xs text-slate-600', 'data-machine-deactivated-at': true }, machine.deactivated_at ? `${labels.deactivated} ${machine.deactivated_at.slice(0, 10)}` : ''),
          );
        }),
      ),
    ),
  );
}

function renderToolbar(canUpdateInfra: boolean, props: MachinesPageProps) {
  const disabledLabel = labels.insufficientPermission;
  return h(
    'section',
    { className: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' },
    h(
      'div',
      { className: 'flex flex-wrap items-end justify-between gap-3' },
      h(
        'label',
        { className: 'grid gap-1 text-sm font-medium text-slate-700', htmlFor: 'machine-status-filter' },
        labels.status,
        h(
          'select',
          {
            id: 'machine-status-filter',
            'aria-label': labels.status,
            className: 'min-w-60 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm',
            defaultValue: 'all',
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => filterMachineRows(event.currentTarget.value),
          },
          h('option', { value: 'all' }, labels.statusAll),
          h('option', { value: 'active' }, labels.statusActive),
          h('option', { value: 'maintenance' }, labels.statusMaintenance),
          h('option', { value: 'offline' }, labels.statusOffline),
        ),
      ),
      h(
        'div',
        { className: 'flex flex-wrap gap-2' },
        h(
          'button',
          {
            type: 'button',
            className: 'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
            disabled: !canUpdateInfra,
            'aria-label': canUpdateInfra ? labels.bulkActivate : `${labels.bulkActivate} — ${disabledLabel}`,
            onClick: () => runBulkAction('activate', props.activateMachine),
          },
          labels.bulkActivate,
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600',
            disabled: !canUpdateInfra,
            'aria-label': canUpdateInfra ? labels.bulkDeactivate : `${labels.bulkDeactivate} — ${disabledLabel}`,
            onClick: () => runBulkAction('deactivate', props.deactivateMachine),
          },
          labels.bulkDeactivate,
        ),
      ),
    ),
    h('p', { className: 'mt-3 text-xs text-slate-500' }, labels.provenance),
  );
}

export default function MachinesPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as MachinesPageProps;
  const machines = props.machines ?? [];
  const locations = props.locations ?? [];
  const state = props.state ?? (machines.length === 0 ? 'empty' : 'ready');
  const canUpdateInfra = props.canUpdateInfra ?? false;

  return h(
    'main',
    { 'data-testid': 'app-shell', className: 'min-h-screen bg-slate-50 text-slate-950' },
    h('aside', { 'data-testid': 'app-sidebar', 'aria-label': 'Settings navigation', className: 'border-b border-slate-200 bg-white px-6 py-3 text-sm text-slate-600' }, 'Settings / Infrastructure'),
    h(
      'header',
      { 'data-testid': 'app-topbar', className: 'border-b border-slate-200 bg-white px-6 py-4' },
      h('div', { className: 'text-xs font-semibold uppercase tracking-wide text-slate-500' }, 'SET-016'),
      h('h1', { className: 'text-2xl font-semibold' }, labels.title),
      h('p', { className: 'mt-1 text-sm text-slate-600' }, labels.subtitle),
    ),
    h(
      'section',
      { className: 'mx-auto max-w-6xl space-y-4 p-6', 'aria-label': 'Machine List workspace', 'data-screen': 'settings-machines' },
      renderToolbar(canUpdateInfra, props),
      state === 'ready'
        ? renderTable(machines, locations)
        : h('section', { className: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' }, h(StateNotice, { state })),
    ),
  );
}
