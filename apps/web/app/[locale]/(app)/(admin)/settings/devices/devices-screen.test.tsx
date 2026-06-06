/**
 * @vitest-environment jsdom
 * SET — Scanner devices settings screen
 *
 * Prototype parity for
 * prototypes/design/Monopilot Design System/settings/ops-screens.jsx:4-95
 * (DevicesScreen): 4 KPI cards, paired-devices table, Device-defaults section,
 * Pair-device modal. Renders against the _actions/devices.ts loader contract and
 * proves the empty-data empty-state, the populated render, the `.sg-*`
 * structure, and the read-only/error states.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));

import DevicesScreen, {
  DEFAULT_DEVICES_LABELS,
  type DevicesScreenProps,
} from './devices-screen.client';
import type { DeviceDefaultsRow, DeviceRow } from './_actions/devices';

const sampleDevices: DeviceRow[] = [
  {
    id: 'dev-online',
    name: 'Line 1 scanner',
    model: 'Zebra TC52',
    site_id: 'Site A',
    line_id: 'Line 1',
    battery_level: 82,
    last_seen_at: '2026-06-06T08:30:00.000Z',
    status: 'online',
    org_id: 'org-apex',
  },
  {
    id: 'dev-low',
    name: 'Packing tablet',
    model: 'Samsung Tab Active',
    site_id: 'Site A',
    line_id: null,
    battery_level: 14,
    last_seen_at: '2026-06-06T07:15:00.000Z',
    status: 'low_battery',
    org_id: 'org-apex',
  },
  {
    id: 'dev-off',
    name: 'Dock scanner',
    model: 'Honeywell CT40',
    site_id: null,
    line_id: null,
    battery_level: 0,
    last_seen_at: null,
    status: 'offline',
    org_id: 'org-apex',
  },
];

const sampleDefaults: DeviceDefaultsRow = {
  auto_lock_minutes: 10,
  login_per_shift: true,
  offline_mode: false,
  org_id: 'org-apex',
};

function renderScreen(overrides: Partial<DevicesScreenProps> = {}) {
  const props: DevicesScreenProps = {
    state: 'ready',
    devices: sampleDevices,
    defaults: sampleDefaults,
    canEdit: true,
    labels: DEFAULT_DEVICES_LABELS,
    pairDevice: vi.fn().mockResolvedValue({ ok: true, data: sampleDevices[0] }),
    updateDeviceDefaults: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...sampleDefaults, auto_lock_minutes: 30 } }),
    ...overrides,
  };
  return { props, ...render(<DevicesScreen {...props} />) };
}

describe('settings devices Server Component boundary', () => {
  it('keeps page.tsx server-rendered and delegates interactivity to the client leaf', () => {
    const dir = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/devices');
    const pageSource = readFileSync(join(dir, 'page.tsx'), 'utf8');
    const clientSource = readFileSync(join(dir, 'devices-screen.client.tsx'), 'utf8');

    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).toContain('readDevicesSettingsData');
    expect(pageSource).toContain("from './devices-screen.client'");
    expect(clientSource).toMatch(/^['"]use client['"]/m);
    expect(clientSource).toContain(
      'data-prototype-source',
    );
    expect(clientSource).toContain('ops-screens.jsx:4-95');
  });
});

describe('settings devices screen prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the 4 KPI cards with counts derived from device status', () => {
    const { container } = renderScreen();

    const kpis = container.querySelector('[data-testid="devices-kpis"]');
    expect(kpis).not.toBeNull();
    const cards = within(kpis as HTMLElement).getAllByText(
      /total devices|online now|low battery|offline/i,
    );
    expect(cards).toHaveLength(4);

    // Total=3, Online=1, Low battery=1, Offline=1 from sampleDevices.
    const values = Array.from((kpis as HTMLElement).querySelectorAll('.kpi-value')).map(
      (el) => el.textContent,
    );
    expect(values).toEqual(['3', '1', '1', '1']);

    // Tone classes (green/amber/red) per prototype card accents.
    expect((kpis as HTMLElement).querySelector('.kpi.green')).not.toBeNull();
    expect((kpis as HTMLElement).querySelector('.kpi.amber')).not.toBeNull();
    expect((kpis as HTMLElement).querySelector('.kpi.red')).not.toBeNull();
  });

  it('renders the paired-devices table with id, name, model, site/line, battery, last-seen, status badge', () => {
    const { container } = renderScreen();

    const table = container.querySelector('table');
    expect(table).not.toBeNull();

    const headers = Array.from(table!.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toEqual([
      'Device ID',
      'Name',
      'Model',
      'Site / Line',
      'Battery',
      'Last seen',
      'Status',
    ]);

    const rows = table!.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);

    // Monospaced device id + battery percentage rendered.
    expect(within(rows[0] as HTMLElement).getByText('dev-online')).toHaveClass('mono');
    expect((rows[0] as HTMLElement).textContent).toContain('82%');
    expect((rows[0] as HTMLElement).textContent).toContain('Site A');
    expect((rows[0] as HTMLElement).textContent).toContain('Line 1');

    // Status badges use the .badge-* tones (online/low_battery/offline).
    expect(within(rows[0] as HTMLElement).getByText('Online')).toHaveClass('badge', 'badge-green');
    expect(within(rows[1] as HTMLElement).getByText('Low battery')).toHaveClass('badge', 'badge-amber');
    expect(within(rows[2] as HTMLElement).getByText('Offline')).toHaveClass('badge', 'badge-red');

    // Unassigned site + never-seen fallbacks.
    expect(within(rows[2] as HTMLElement).getByText('Unassigned')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Never')).toBeInTheDocument();
  });

  it('renders the Device-defaults section as .sg-* structure with the auto-lock select and two toggles', () => {
    const { container } = renderScreen();

    // PageHead + section shells emit the .sg-* design-system structure.
    expect(container.querySelector('.sg-head .sg-title')?.textContent).toMatch(/scanner devices/i);
    const defaults = screen.getByRole('region', { name: /device defaults/i });
    expect(defaults).toHaveClass('sg-section');
    expect(defaults.querySelectorAll('.sg-row').length).toBeGreaterThanOrEqual(3);

    // Auto-lock dropdown is the shared shadcn SelectField (never a native <select>).
    expect(defaults.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    expect(defaults.querySelectorAll('select')).toHaveLength(0);
    expect(within(defaults).getByRole('combobox', { name: /force auto-lock/i })).toHaveValue('10');

    // Two .sg-toggle sliders for login-per-shift + offline-mode.
    expect(defaults.querySelectorAll('.sg-toggle').length).toBe(2);
    expect(within(defaults).getByLabelText(/require login per shift/i)).toBeChecked();
    expect(within(defaults).getByLabelText(/offline mode/i)).not.toBeChecked();

    // Section save/cancel live in the grey .sg-section-foot.
    const foot = defaults.querySelector('.sg-section-foot');
    expect(foot).not.toBeNull();
    expect(within(foot as HTMLElement).getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('renders cleanly with EMPTY data: empty-state instead of the table, zeroed KPIs', () => {
    const { container } = renderScreen({
      devices: [],
      defaults: { auto_lock_minutes: 5, login_per_shift: true, offline_mode: true, org_id: '' },
    });

    // No table; an empty-state placeholder is shown inside the Paired-devices section.
    expect(container.querySelector('table')).toBeNull();
    const empty = container.querySelector('[data-testid="devices-empty"]');
    expect(empty).not.toBeNull();
    expect(empty).toHaveClass('empty-state');
    expect(empty?.textContent).toMatch(/no devices paired yet/i);

    // KPI cards still render, all zeroed.
    const values = Array.from(container.querySelectorAll('.kpi-value')).map((el) => el.textContent);
    expect(values).toEqual(['0', '0', '0', '0']);

    // Defaults section still renders.
    expect(screen.getByRole('region', { name: /device defaults/i })).toBeInTheDocument();
  });

  it('opens the Pair-device modal and submits via the loader action', async () => {
    const user = userEvent.setup();
    const pairDevice = vi.fn().mockResolvedValue({ ok: true, data: sampleDevices[0] });
    renderScreen({ pairDevice });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /\+ pair device/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/pair new device/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/device name/i), 'New scanner');
    await user.type(within(dialog).getByLabelText(/^model$/i), 'Zebra TC52');
    await user.click(within(dialog).getByRole('button', { name: /^pair device$/i }));

    expect(pairDevice).toHaveBeenCalledWith({ name: 'New scanner', model: 'Zebra TC52' });
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('saves device defaults through the loader action and refreshes', async () => {
    const user = userEvent.setup();
    const updateDeviceDefaults = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...sampleDefaults, auto_lock_minutes: 30 } });
    renderScreen({ updateDeviceDefaults });

    // Toggle offline mode on to make the defaults dirty, then save.
    await user.click(screen.getByLabelText(/offline mode/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateDeviceDefaults).toHaveBeenCalledWith(
      expect.objectContaining({ offline_mode: true, login_per_shift: true, auto_lock_minutes: 10 }),
    );
    expect(await screen.findByText(/device defaults saved/i)).toBeInTheDocument();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('renders a read-only notice and hides write affordances without settings.org.update', () => {
    renderScreen({ canEdit: false });

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ pair device/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('renders the error state loudly when the loader fails', () => {
    renderScreen({ state: 'error' });

    expect(screen.getByRole('alert')).toHaveTextContent(/scanner devices could not be loaded/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
