/**
 * @vitest-environment jsdom
 * E4B — Labor rates settings screen (settings/labor-rates).
 *
 * Pins the four required UI states (loading / empty-with-CTA / error /
 * data + permission-denied), asserts the New-rate modal exposes role/group +
 * rate + currency + effective date and CALLS upsertLaborRate, and that the
 * history model is surfaced (no in-place edit of a historical rate). No raw
 * UUIDs leak into the rendered DOM.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../(modules)/production/_actions/labor-actions', () => ({
  listLaborRates: vi.fn(),
  upsertLaborRate: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const RATE_CURRENT = '11111111-1111-4111-8111-111111111111';
const RATE_OLD = '22222222-2222-4222-8222-222222222222';
const NEW_RATE = '33333333-3333-4333-8333-333333333333';

type LaborRateRow = {
  id: string;
  roleGroup: string;
  ratePerHour: number;
  currency: string;
  effectiveFrom: string;
};
type UpsertInput = {
  id?: string | null;
  roleGroup: string;
  ratePerHour: number;
  currency?: string | null;
  effectiveFrom?: string | null;
};
type UpsertResult = { ok: true; id: string } | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };
type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type LaborRatesPageProps = {
  params?: Promise<{ locale: string }>;
  rates?: LaborRateRow[];
  canManage?: boolean;
  state?: PageState;
  upsertLaborRate?: (input: UpsertInput) => Promise<UpsertResult>;
};

type LaborRatesPage = (props: LaborRatesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const rates: LaborRateRow[] = [
  { id: RATE_CURRENT, roleGroup: 'operator', ratePerHour: 22.5, currency: 'USD', effectiveFrom: '2026-01-01' },
  { id: RATE_OLD, roleGroup: 'operator', ratePerHour: 20, currency: 'USD', effectiveFrom: '2025-01-01' },
];

async function loadPage(): Promise<LaborRatesPage> {
  const mod = await import('./page.tsx');
  expect(mod.default, 'labor-rates page must default-export a renderable component').toEqual(expect.any(Function));
  return mod.default as LaborRatesPage;
}

async function renderPage(overrides: Partial<LaborRatesPageProps> = {}) {
  const Page = await loadPage();
  const upsertLaborRate = vi.fn(async (input: UpsertInput): Promise<UpsertResult> => ({
    ok: true,
    id: input.id && input.id !== '' ? input.id : NEW_RATE,
  }));
  const props: LaborRatesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    rates,
    canManage: true,
    state: 'ready',
    upsertLaborRate,
    ...overrides,
  };
  const node = await Page(props);
  return { props, upsertLaborRate, ...render(React.createElement(React.Fragment, null, node)) };
}

function expectNoRawUuids() {
  expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
}

describe('E4B labor-rates route contract', () => {
  it('implements the localized AppShell route under app/[locale]/(app)/(admin)/settings/labor-rates', () => {
    const canonical = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/labor-rates/page.tsx');
    expect(existsSync(canonical)).toBe(true);
  });

  it('registers a Labor rates entry in the settings navigation', async () => {
    const { SETTINGS_NAV_GROUPS } = await import('../../../../../../lib/navigation/settings-nav');
    const allItems = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
    const entry = allItems.find((i) => i.route === '/settings/labor-rates');
    expect(entry, 'a settings-nav item must point at /settings/labor-rates').toBeTruthy();
    expect(entry?.i18n_key).toBe('Navigation.settings.items.labor_rates');
  });
});

describe('E4B labor-rates screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the data state: list of rates with role/rate/currency/date + status, no raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-labor-rates-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /labor rates/i });
    expect(within(table).getAllByText('operator').length).toBeGreaterThan(0);
    expect(within(table).getByText('22.50')).toBeInTheDocument();
    expect(within(table).getAllByText('USD').length).toBeGreaterThan(0);
    expect(within(table).getByText('2026-01-01')).toBeInTheDocument();
    // history is preserved: BOTH the current and the superseded rows are shown
    expect(within(table).getByText('2025-01-01')).toBeInTheDocument();
    expectNoRawUuids();
  });

  it('makes the history model explicit (no in-place edit of historical rates)', async () => {
    await renderPage();
    expect(screen.getByTestId('labor-rates-history-note')).toBeInTheDocument();
    // there is intentionally NO per-row edit affordance
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
  });

  it('renders the loading state', async () => {
    await renderPage({ state: 'loading', rates: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading labor rates/i);
  });

  it('renders the empty state with an Add-rate CTA', async () => {
    await renderPage({ state: 'empty', rates: [] });
    expect(screen.getByText(/no labor rates configured yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /(new rate|add the first rate)/i }).length).toBeGreaterThan(0);
  });

  it('renders the error state', async () => {
    await renderPage({ state: 'error', rates: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/labor rates could not be loaded/i);
  });

  it('renders the permission-denied state and disables New rate', async () => {
    await renderPage({ state: 'permission_denied', rates: [], canManage: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    const add = screen.getByRole('button', { name: /new rate/i });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleName(/settings\.org\.update/i);
  });

  it('New-rate modal exposes role/group + rate + currency + effective date', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /^\+? ?new rate$/i }));
    const dialog = screen.getByRole('dialog', { name: /new labor rate/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText(/role \/ group/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/rate per hour/i)).toBeInTheDocument();
    // currency is a shadcn Select (combobox) — assert by role + accessible name
    expect(within(dialog).getByRole('combobox', { name: /currency/i })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/effective from/i)).toBeInTheDocument();
  });

  it('creates a rate through the injected upsertLaborRate action (role/rate/currency/date)', async () => {
    const user = userEvent.setup();
    const { upsertLaborRate } = await renderPage({ rates: [], state: 'empty' });
    await user.click(screen.getAllByRole('button', { name: /(new rate|add the first rate)/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /new labor rate/i });
    await user.type(within(dialog).getByLabelText(/role \/ group/i), 'packer');
    await user.type(within(dialog).getByLabelText(/rate per hour/i), '18.75');
    await user.click(within(dialog).getByRole('button', { name: /add rate/i }));
    await waitFor(() => expect(upsertLaborRate).toHaveBeenCalledTimes(1));
    expect(upsertLaborRate).toHaveBeenCalledWith(
      expect.objectContaining({
        roleGroup: 'packer',
        ratePerHour: 18.75,
        currency: expect.any(String),
        effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('surfaces a save error when upsertLaborRate returns forbidden', async () => {
    const user = userEvent.setup();
    const upsert = vi.fn(async (): Promise<UpsertResult> => ({ ok: false, error: 'forbidden' }));
    await renderPage({ rates: [], state: 'empty', upsertLaborRate: upsert });
    await user.click(screen.getAllByRole('button', { name: /(new rate|add the first rate)/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /new labor rate/i });
    await user.type(within(dialog).getByLabelText(/role \/ group/i), 'packer');
    await user.type(within(dialog).getByLabelText(/rate per hour/i), '18.75');
    await user.click(within(dialog).getByRole('button', { name: /add rate/i }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
  });
});
