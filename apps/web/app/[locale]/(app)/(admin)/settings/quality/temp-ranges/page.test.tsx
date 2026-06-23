/**
 * @vitest-environment jsdom
 * WAVE E2B — Product temperature ranges settings screen (settings/quality/temp-ranges).
 *
 * Pins the four required UI states (loading / empty-with-CTA / error /
 * data + permission-denied), asserts the editor exposes an item picker + min/max
 * °C + a requires-check toggle and CALLS upsertProductTempRange, guards min > max,
 * and registers a settings-nav entry. No raw UUIDs leak into the rendered DOM.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../(modules)/quality/_actions/cold-chain-actions', () => ({
  listProductTempRanges: vi.fn(),
  upsertProductTempRange: vi.fn(),
  submitConditionCheck: vi.fn(),
}));

const RANGE_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const NEW_RANGE = '33333333-3333-4333-8333-333333333333';

vi.mock('../../../../../../(npd)/fa/actions/search-items', () => ({
  searchItems: vi.fn(async () => [
    { id: '22222222-2222-4222-8222-222222222222', itemCode: 'FG-CHILL-01', name: 'Chilled chicken fillet', itemType: 'fg', status: 'active', costPerKgEur: null, uomBase: 'kg' },
  ]),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

type TempRangeRow = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  minTempC: number;
  maxTempC: number;
  requiresCheck: boolean;
};
type UpsertInput = { itemId: string; minTempC: number; maxTempC: number; requiresCheck: boolean };
type UpsertResult = { ok: true; id: string } | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };
type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type TempRangesPageProps = {
  params?: Promise<{ locale: string }>;
  ranges?: TempRangeRow[];
  canManage?: boolean;
  state?: PageState;
  upsertTempRange?: (input: UpsertInput) => Promise<UpsertResult>;
};

type TempRangesPage = (props: TempRangesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const ranges: TempRangeRow[] = [
  { id: RANGE_ID, itemId: ITEM_A, itemCode: 'FG-CHILL-01', itemName: 'Chilled chicken fillet', minTempC: 0, maxTempC: 4, requiresCheck: true },
];

async function loadPage(): Promise<TempRangesPage> {
  const mod = await import('./page.tsx');
  expect(mod.default, 'temp-ranges page must default-export a renderable component').toEqual(expect.any(Function));
  return mod.default as TempRangesPage;
}

async function renderPage(overrides: Partial<TempRangesPageProps> = {}) {
  const Page = await loadPage();
  const upsertTempRange = vi.fn(async (_input: UpsertInput): Promise<UpsertResult> => ({ ok: true, id: NEW_RANGE }));
  const props: TempRangesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    ranges,
    canManage: true,
    state: 'ready',
    upsertTempRange,
    ...overrides,
  };
  const node = await Page(props);
  return { props, upsertTempRange, ...render(React.createElement(React.Fragment, null, node)) };
}

function expectNoRawUuids() {
  expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
}

describe('E2B temp-ranges route contract', () => {
  it('implements the localized AppShell route under app/[locale]/(app)/(admin)/settings/quality/temp-ranges', () => {
    const canonical = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/quality/temp-ranges/page.tsx');
    expect(existsSync(canonical)).toBe(true);
  });

  it('registers a Temperature ranges entry in the settings navigation', async () => {
    const { SETTINGS_NAV_GROUPS } = await import('../../../../../../../lib/navigation/settings-nav');
    const allItems = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
    const entry = allItems.find((i) => i.route === '/settings/quality/temp-ranges');
    expect(entry, 'a settings-nav item must point at /settings/quality/temp-ranges').toBeTruthy();
    expect(entry?.i18n_key).toBe('Navigation.settings.items.temp_ranges');
  });
});

describe('E2B temp-ranges screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the data state: range with product/min/max/requires-check, no raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-temp-ranges-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /temperature ranges/i });
    expect(within(table).getByText('Chilled chicken fillet')).toBeInTheDocument();
    expect(within(table).getByText('FG-CHILL-01')).toBeInTheDocument();
    expect(within(table).getByText(/0\.0 °C/)).toBeInTheDocument();
    expect(within(table).getByText(/4\.0 °C/)).toBeInTheDocument();
    expectNoRawUuids();
  });

  it('renders the loading state', async () => {
    await renderPage({ state: 'loading', ranges: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading temperature ranges/i);
  });

  it('renders the empty state with an Add-range CTA', async () => {
    await renderPage({ state: 'empty', ranges: [] });
    expect(screen.getByText(/no temperature ranges configured yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /(new range|add the first range)/i }).length).toBeGreaterThan(0);
  });

  it('renders the error state', async () => {
    await renderPage({ state: 'error', ranges: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/temperature ranges could not be loaded/i);
  });

  it('renders the permission-denied state and disables New range', async () => {
    await renderPage({ state: 'permission_denied', ranges: [], canManage: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    const add = screen.getByRole('button', { name: /new range/i });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleName(/quality\.coldchain\.manage/i);
  });

  it('editor exposes an item picker + min/max °C + a requires-check toggle', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /^\+? ?new range$/i }));
    const dialog = screen.getByRole('dialog', { name: /product temperature range/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByTestId('item-picker-trigger')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/min °C/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/max °C/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/requires a delivery-condition check/i)).toBeInTheDocument();
  });

  it('saves a range through the injected upsertProductTempRange action (item + min + max + requiresCheck)', async () => {
    const user = userEvent.setup();
    const { upsertTempRange } = await renderPage({ ranges: [], state: 'empty' });
    await user.click(screen.getAllByRole('button', { name: /(new range|add the first range)/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /product temperature range/i });
    // pick a real product via the item picker
    await user.click(within(dialog).getByTestId('item-picker-trigger'));
    const option = await screen.findByTestId('item-picker-option');
    await user.click(option);
    await user.type(within(dialog).getByLabelText(/min °C/i), '0');
    await user.type(within(dialog).getByLabelText(/max °C/i), '4');
    await user.click(within(dialog).getByRole('button', { name: /save range/i }));
    await waitFor(() => expect(upsertTempRange).toHaveBeenCalledTimes(1));
    expect(upsertTempRange).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: ITEM_A, minTempC: 0, maxTempC: 4, requiresCheck: true }),
    );
  });

  it('blocks min > max client-side without calling the action', async () => {
    const user = userEvent.setup();
    const { upsertTempRange } = await renderPage({ ranges: [], state: 'empty' });
    await user.click(screen.getAllByRole('button', { name: /(new range|add the first range)/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /product temperature range/i });
    await user.click(within(dialog).getByTestId('item-picker-trigger'));
    await user.click(await screen.findByTestId('item-picker-option'));
    await user.type(within(dialog).getByLabelText(/min °C/i), '10');
    await user.type(within(dialog).getByLabelText(/max °C/i), '4');
    await user.click(within(dialog).getByRole('button', { name: /save range/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/minimum temperature must not be greater/i);
    expect(upsertTempRange).not.toHaveBeenCalled();
  });

  it('surfaces a save error when upsertProductTempRange returns forbidden', async () => {
    const user = userEvent.setup();
    const upsert = vi.fn(async (): Promise<UpsertResult> => ({ ok: false, error: 'forbidden' }));
    await renderPage({ ranges: [], state: 'empty', upsertTempRange: upsert });
    await user.click(screen.getAllByRole('button', { name: /(new range|add the first range)/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /product temperature range/i });
    await user.click(within(dialog).getByTestId('item-picker-trigger'));
    await user.click(await screen.findByTestId('item-picker-option'));
    await user.type(within(dialog).getByLabelText(/min °C/i), '0');
    await user.type(within(dialog).getByLabelText(/max °C/i), '4');
    await user.click(within(dialog).getByRole('button', { name: /save range/i }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/could not be saved/i);
  });
});
