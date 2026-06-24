/**
 * Wave-shipping — Customers list + create modal: RTL parity + state + i18n + RBAC.
 *
 * Prototype: prototypes/design/Monopilot Design System/shipping/
 *   customer-screens.jsx:3-129 (ShCustomerList) + modals.jsx:36-66 (M-01 create).
 *
 * The async RSC page reads Supabase via withOrgContext (RLS-scoped) and is exercised
 * live. Here we test the client view + modal against the createCustomer Server Action
 * SEAM, plus the label builder against the REAL shared i18n tree (apps/web/i18n):
 *   - parity: KPI strip, status tabs + live counts, dense table (name/code/category/
 *     email/credit-limit/status), search filtering, "+ Create customer" opens the
 *     modal, ?new=1 auto-open;
 *   - create: the modal builds the exact createCustomer payload (code optional →
 *     omitted when blank so the action auto-numbers) and surfaces already_exists;
 *   - state (empty): empty-state on an org with no customers;
 *   - RBAC: a forbidden server result is surfaced inline (server-enforced, never
 *     client-trusted);
 *   - i18n: Shipping.customers resolves in BOTH real locales (en + pl).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../../../i18n/en.json';
import plMessages from '../../../../../../../i18n/pl.json';

import { CustomerListView } from '../_components/customer-list-view';
import { buildCustomerListLabels, type Translate } from '../_components/customer-labels';
import type { Customer, CreateCustomerResult } from '../_components/customer-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

type Tree = Record<string, unknown>;

/** Build a next-intl-style translator over the Shipping.customers subtree. */
function makeTranslate(messages: Tree): Translate {
  const root = ((messages.Shipping as Tree).customers ?? {}) as Tree;
  return (key: string) => {
    const value = key
      .split('.')
      .reduce<unknown>((acc, k) => (acc != null && typeof acc === 'object' ? (acc as Tree)[k] : undefined), root);
    if (typeof value !== 'string') throw new Error(`Missing i18n key: Shipping.customers.${key}`);
    return value;
  };
}

const tEN = makeTranslate(enMessages as unknown as Tree);
const labels = buildCustomerListLabels(tEN);

function makeCustomer(over: Partial<Customer>): Customer {
  return {
    id: 'cust-1',
    code: 'CUST-2026-00001',
    name: 'Lidl Polska',
    email: 'orders@lidl.test',
    phone: null,
    taxId: null,
    category: 'retail',
    creditLimitGbp: '250000.00',
    isActive: true,
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...over,
  };
}

const CUSTOMERS: Customer[] = [
  makeCustomer({ id: 'cust-1', code: 'CUST-2026-00001', name: 'Lidl Polska', isActive: true, email: 'orders@lidl.test', creditLimitGbp: '250000.00' }),
  makeCustomer({ id: 'cust-2', code: 'CUST-2026-00002', name: 'Tesco UK', isActive: false, email: null, creditLimitGbp: null, category: 'wholesale' }),
  makeCustomer({ id: 'cust-3', code: 'CUST-2026-00003', name: 'Makro Cash', isActive: true, email: 'po@makro.test', creditLimitGbp: '0', category: 'distributor' }),
];

function renderList(props: Partial<React.ComponentProps<typeof CustomerListView>> = {}) {
  const createCustomerAction = vi.fn((_input: unknown): Promise<CreateCustomerResult> => Promise.resolve({ ok: true, data: makeCustomer({ id: 'new' }) }));
  const utils = render(
    <CustomerListView
      locale="en"
      customers={CUSTOMERS}
      labels={labels}
      createCustomerAction={createCustomerAction as unknown as React.ComponentProps<typeof CustomerListView>['createCustomerAction']}
      {...props}
    />,
  );
  return { ...utils, createCustomerAction };
}

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('CustomerListView — structure + filtering (parity: customer-screens.jsx:44-121)', () => {
  it('renders the KPI strip, status tabs with live counts and a dense table', () => {
    renderList();
    expect(screen.getByTestId('customer-kpi-strip')).toBeInTheDocument();
    expect(screen.getByTestId('customer-list-tab-all')).toHaveTextContent('3');
    expect(screen.getByTestId('customer-list-tab-active')).toHaveTextContent('2');
    expect(screen.getByTestId('customer-list-tab-inactive')).toHaveTextContent('1');
    // Default tab is `active` (mirrors the prototype default) → inactive Tesco hidden.
    expect(screen.getByTestId('customer-row-cust-1')).toBeInTheDocument();
    expect(screen.queryByTestId('customer-row-cust-2')).toBeNull();
    // Row shows code + email + credit limit.
    const row = screen.getByTestId('customer-row-cust-1');
    expect(within(row).getByText('CUST-2026-00001')).toBeInTheDocument();
    expect(within(row).getByText('orders@lidl.test')).toBeInTheDocument();
    expect(within(row).getByText('£250,000')).toBeInTheDocument();
  });

  it('filters by status tab', () => {
    renderList();
    fireEvent.click(screen.getByTestId('customer-list-tab-inactive'));
    expect(screen.getByTestId('customer-row-cust-2')).toBeInTheDocument();
    expect(screen.queryByTestId('customer-row-cust-1')).toBeNull();
  });

  it('filters by search over code, name and email', () => {
    renderList();
    fireEvent.click(screen.getByTestId('customer-list-tab-all'));
    fireEvent.change(screen.getByTestId('customer-list-search'), { target: { value: 'makro' } });
    expect(screen.getByTestId('customer-row-cust-3')).toBeInTheDocument();
    expect(screen.queryByTestId('customer-row-cust-1')).toBeNull();
  });

  it('shows the empty-state when no rows match', () => {
    renderList();
    fireEvent.change(screen.getByTestId('customer-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent(labels.empty.title);
  });

  it('renders the empty-state when the org has no customers at all (empty live read)', () => {
    renderList({ customers: [] });
    expect(screen.getByTestId('empty-state-root')).toBeInTheDocument();
  });
});

describe('CustomerListView — create modal (parity: customer-screens.jsx:40 + M-01 modal)', () => {
  it('auto-opens the create modal on the ?new=1 deep-link', () => {
    renderList({ autoOpenCreate: true });
    expect(screen.getByTestId('create-customer-form')).toBeInTheDocument();
  });

  it('builds the createCustomer payload (code omitted when blank → action auto-numbers) and refreshes on success', async () => {
    const { createCustomerAction } = renderList();
    createCustomerAction.mockResolvedValue({ ok: true, data: makeCustomer({ id: 'new' }) });

    fireEvent.click(screen.getByTestId('customer-list-create'));
    expect(screen.getByTestId('create-customer-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('create-customer-name'), { target: { value: 'Biedronka' } });
    fireEvent.change(screen.getByTestId('create-customer-email'), { target: { value: 'orders@biedronka.test' } });
    fireEvent.click(screen.getByTestId('create-customer-submit'));

    await waitFor(() =>
      expect(createCustomerAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Biedronka',
          category: 'retail',
          email: 'orders@biedronka.test',
          isActive: true,
        }),
      ),
    );
    // Blank code is omitted (undefined) so the action auto-generates CUST-YYYY-NNNNN.
    const firstArg = createCustomerAction.mock.calls[0][0] as { code?: string };
    expect(firstArg.code).toBeUndefined();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('blocks submit and shows a validation error when the name is too short', async () => {
    const { createCustomerAction } = renderList();
    fireEvent.click(screen.getByTestId('customer-list-create'));
    fireEvent.change(screen.getByTestId('create-customer-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('create-customer-submit'));
    await waitFor(() => expect(screen.getByTestId('create-customer-error')).toHaveTextContent(labels.create.errors.nameRequired));
    expect(createCustomerAction).not.toHaveBeenCalled();
  });

  it('surfaces an already_exists server error inline', async () => {
    const { createCustomerAction } = renderList();
    createCustomerAction.mockResolvedValue({ ok: false, error: 'already_exists' });

    fireEvent.click(screen.getByTestId('customer-list-create'));
    fireEvent.change(screen.getByTestId('create-customer-code'), { target: { value: 'CUST-2026-00001' } });
    fireEvent.change(screen.getByTestId('create-customer-name'), { target: { value: 'Dup Co' } });
    fireEvent.click(screen.getByTestId('create-customer-submit'));

    await waitFor(() => expect(screen.getByTestId('create-customer-error')).toHaveTextContent(labels.create.errors.already_exists));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces a forbidden RBAC result inline (server-enforced, never client-trusted)', async () => {
    const { createCustomerAction } = renderList();
    createCustomerAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('customer-list-create'));
    fireEvent.change(screen.getByTestId('create-customer-name'), { target: { value: 'No Perm Co' } });
    fireEvent.click(screen.getByTestId('create-customer-submit'));

    await waitFor(() => expect(screen.getByTestId('create-customer-error')).toHaveTextContent(labels.create.errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('Shipping.customers i18n coverage (en + pl real)', () => {
  it('defines every consumed key in both real locales', () => {
    for (const [loc, m] of [
      ['en', enMessages],
      ['pl', plMessages],
    ] as const) {
      const t = makeTranslate(m as unknown as Tree);
      // buildCustomerListLabels throws on any missing key via makeTranslate.
      const l = buildCustomerListLabels(t);
      expect(l.newCustomer, `newCustomer missing in ${loc}`).toBeTruthy();
      expect(l.rowsCount, `rowsCount missing in ${loc}`).toContain('{n}');
      expect(l.showing, `showing missing in ${loc}`).toContain('{total}');
      expect(l.empty.title, `empty.title missing in ${loc}`).toBeTruthy();
      expect(l.create.codeHelp, `create.codeHelp missing in ${loc}`).toContain('CUST-');
      expect(l.create.errors.already_exists, `errors.already_exists missing in ${loc}`).toBeTruthy();
      expect(l.create.errors.forbidden, `errors.forbidden missing in ${loc}`).toBeTruthy();
    }
  });
});
