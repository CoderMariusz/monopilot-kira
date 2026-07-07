/**
 * @vitest-environment jsdom
 * C7b — Customer item prices settings screen (settings/customer-prices).
 */
import React from 'react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CustomerPriceFormOptions,
  CustomerPriceMutationResult,
  CustomerPriceRow,
} from './_actions/customer-item-prices-types';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('./_actions/customer-item-prices-actions', () => ({
  listCustomerItemPrices: vi.fn(),
  loadCustomerPriceFormOptions: vi.fn(),
  createCustomerItemPrice: vi.fn(),
  updateCustomerItemPrice: vi.fn(),
  deactivateCustomerItemPrice: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (labelKey: string) => {
    const map: Record<string, string> = {
      eyebrow: 'Pricing',
      title: 'Customer prices',
      subtitle: 'Per-customer sell price overrides used by sales orders.',
      sectionTitle: 'Configured prices',
      provenance: 'Prices resolve ahead of item list price when creating sales order lines.',
      addPrice: 'New price',
      emptyCta: 'Add the first price',
      filterAllCustomers: 'All customers',
      filterCustomer: 'Customer',
      columnCustomer: 'Customer',
      columnItem: 'Item',
      columnUnitPrice: 'Unit price',
      columnCurrency: 'Currency',
      columnEffectiveFrom: 'Effective from',
      columnEffectiveTo: 'Effective to',
      columnStatus: 'Status',
      columnActions: 'Actions',
      editPrice: 'Edit',
      deactivatePrice: 'Deactivate',
      statusActive: 'Active',
      statusScheduled: 'Scheduled',
      statusExpired: 'Expired',
      dialogAddTitle: 'New customer price',
      dialogEditTitle: 'Edit customer price',
      fieldCustomer: 'Customer',
      fieldItem: 'Item',
      fieldUnitPrice: 'Unit price',
      fieldCurrency: 'Currency',
      fieldEffectiveFrom: 'Effective from',
      fieldEffectiveTo: 'Effective to',
      fieldEffectiveToHelp: 'Leave blank for open-ended.',
      save: 'Save price',
      savePending: 'Saving…',
      cancel: 'Cancel',
      createSuccess: 'Customer price added.',
      updateSuccess: 'Customer price updated.',
      deactivateSuccess: 'Customer price deactivated.',
      saveFailed: 'The price could not be saved.',
      invalidInput: 'Check customer, item, price, currency and dates.',
      conflictError: 'A price already exists for this customer, item and effective date.',
      insufficientPermission: 'settings.org.update permission is required to manage customer prices.',
      loading: 'Loading customer prices…',
      empty: 'No customer prices configured yet.',
      error: 'Customer prices could not be loaded.',
      forbidden: 'You do not have permission to view customer prices.',
      confirmDeactivate: 'Deactivate price for {item}?',
    };
    return map[labelKey] ?? labelKey;
  }),
}));

const PRICE_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const NEW_PRICE_ID = '44444444-4444-4444-8444-444444444444';

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type CustomerPricesPageProps = {
  params?: Promise<{ locale: string }>;
  prices?: CustomerPriceRow[];
  formOptions?: CustomerPriceFormOptions;
  canManage?: boolean;
  state?: PageState;
  createCustomerItemPrice?: (input: {
    customerId: string;
    itemId: string;
    unitPrice: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) => Promise<CustomerPriceMutationResult>;
  updateCustomerItemPrice?: (input: {
    id: string;
    customerId: string;
    itemId: string;
    unitPrice: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) => Promise<CustomerPriceMutationResult>;
  deactivateCustomerItemPrice?: (input: { id: string }) => Promise<CustomerPriceMutationResult>;
};

type CustomerPricesPage = (props: CustomerPricesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const formOptions: CustomerPriceFormOptions = {
  customers: [{ id: CUSTOMER_ID, code: 'CUST-01', name: 'Acme Retail' }],
  items: [{ id: ITEM_ID, code: 'FG-001', name: 'Sample FG' }],
};

const prices: CustomerPriceRow[] = [
  {
    id: PRICE_ID,
    customerId: CUSTOMER_ID,
    customerCode: 'CUST-01',
    customerName: 'Acme Retail',
    itemId: ITEM_ID,
    itemCode: 'FG-001',
    itemName: 'Sample FG',
    unitPrice: 9.99,
    currency: 'GBP',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  },
];

async function loadPage(): Promise<CustomerPricesPage> {
  const mod = await import('./page.tsx');
  expect(mod.default, 'customer-prices page must default-export a renderable component').toEqual(expect.any(Function));
  return mod.default as CustomerPricesPage;
}

async function renderPage(overrides: Partial<CustomerPricesPageProps> = {}) {
  const Page = await loadPage();
  const createCustomerItemPrice = vi.fn(async (): Promise<CustomerPriceMutationResult> => ({ ok: true, id: NEW_PRICE_ID }));
  const updateCustomerItemPrice = vi.fn(async (): Promise<CustomerPriceMutationResult> => ({ ok: true, id: PRICE_ID }));
  const deactivateCustomerItemPrice = vi.fn(async (): Promise<CustomerPriceMutationResult> => ({ ok: true, id: PRICE_ID }));
  const props: CustomerPricesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    prices,
    formOptions,
    canManage: true,
    state: 'ready',
    createCustomerItemPrice,
    updateCustomerItemPrice,
    deactivateCustomerItemPrice,
    ...overrides,
  };
  const node = await Page(props);
  return {
    props,
    createCustomerItemPrice,
    updateCustomerItemPrice,
    deactivateCustomerItemPrice,
    ...render(React.createElement(React.Fragment, null, node)),
  };
}

function expectNoRawUuids() {
  expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
}

describe('C7b customer-prices route contract', () => {
  it('implements the localized route under settings/customer-prices', () => {
    const canonical = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/customer-prices/page.tsx');
    expect(existsSync(canonical)).toBe(true);
  });

  it('registers a Customer prices entry in the settings navigation', async () => {
    const { SETTINGS_NAV_GROUPS } = await import('../../../../../../lib/navigation/settings-nav');
    const allItems = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
    const entry = allItems.find((i) => i.route === '/settings/customer-prices');
    expect(entry, 'a settings-nav item must point at /settings/customer-prices').toBeTruthy();
    expect(entry?.i18n_key).toBe('Navigation.settings.items.customer_prices');
  });
});

describe('C7b customer-prices screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders configured prices without raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-customer-prices-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /configured prices/i });
    expect(within(table).getByText('CUST-01')).toBeInTheDocument();
    expect(within(table).getByText('FG-001')).toBeInTheDocument();
    expect(within(table).getByText('9.99')).toBeInTheDocument();
    expect(within(table).getByText('GBP')).toBeInTheDocument();
    expectNoRawUuids();
  });

  it('creates a price through the injected createCustomerItemPrice action', async () => {
    const user = userEvent.setup();
    const { createCustomerItemPrice } = await renderPage({ prices: [], state: 'empty' });
    await user.click(screen.getByRole('button', { name: /^\+? ?new price$/i }));
    const dialog = screen.getByRole('dialog', { name: /new customer price/i });
    await user.type(within(dialog).getByLabelText(/unit price/i), '12.5');
    await user.click(within(dialog).getByRole('button', { name: /save price/i }));
    await waitFor(() => expect(createCustomerItemPrice).toHaveBeenCalledTimes(1));
    expect(createCustomerItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPrice: 12.5,
        currency: expect.any(String),
        effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('updates a price through the injected updateCustomerItemPrice action', async () => {
    const user = userEvent.setup();
    const { updateCustomerItemPrice } = await renderPage();
    const row = screen.getAllByTestId('settings-customer-price-row')[0];
    await user.click(within(row).getByRole('button', { name: /edit/i }));
    const dialog = screen.getByRole('dialog', { name: /edit customer price/i });
    const priceInput = within(dialog).getByLabelText(/unit price/i);
    await user.clear(priceInput);
    await user.type(priceInput, '11.25');
    await user.click(within(dialog).getByRole('button', { name: /save price/i }));
    await waitFor(() => expect(updateCustomerItemPrice).toHaveBeenCalledTimes(1));
    expect(updateCustomerItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({ id: PRICE_ID, unitPrice: 11.25 }),
    );
  });

  it('deactivates a price through the injected deactivateCustomerItemPrice action', async () => {
    const user = userEvent.setup();
    const { deactivateCustomerItemPrice } = await renderPage();
    const row = screen.getAllByTestId('settings-customer-price-row')[0];
    await user.click(within(row).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(deactivateCustomerItemPrice).toHaveBeenCalledWith({ id: PRICE_ID }));
  });

  it('renders permission-denied state and disables New price', async () => {
    await renderPage({ state: 'permission_denied', prices: [], canManage: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    expect(screen.getByRole('button', { name: /new price/i })).toBeDisabled();
  });
});
