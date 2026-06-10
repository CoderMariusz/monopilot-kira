/**
 * P2-PLANNING — Suppliers list + create + detail: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:29-152 (plan_supplier_list), :158-403 (plan_supplier_detail),
 *   :409-515 (supplier_form_modal).
 *
 * The async RSC pages read Supabase via withOrgContext (RLS-scoped) and are
 * exercised live. Here we test the client views + modal against Server Action
 * SEAMS, plus the page's label builders against the staged i18n tree:
 *   - list: KPI strip, status tabs + counts, search filtering, empty-state,
 *     "+ New supplier" opens the modal, ?new=1 auto-open;
 *   - create: the modal builds the exact createSupplier payload (incl. contact
 *     jsonb) and surfaces already_exists / forbidden errors;
 *   - detail: status badge + the three real transitions (active/inactive/blocked)
 *     behind a confirm guard, calling transitionSupplierStatus + forbidden RBAC
 *     surfaced inline (server-enforced, never client-trusted);
 *   - i18n: Planning.suppliers staged in en + pl with every consumed key.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import staging from '../../../../../../../../../_meta/i18n-staging/suppliers.json';

import { SupplierListView } from '../_components/supplier-list-view';
import { SupplierDetailView } from '../_components/supplier-detail-view';
import { buildListLabels, buildDetailLabels } from '../_components/supplier-labels';
import type { Supplier, CreateSupplierResult, TransitionSupplierResult } from '../_components/supplier-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const EN = (staging as Record<string, { Planning: { suppliers: Record<string, unknown> } }>).en.Planning.suppliers;
const PL = (staging as Record<string, { Planning: { suppliers: Record<string, unknown> } }>).pl.Planning.suppliers;
const listLabels = buildListLabels(EN as Record<string, unknown>);
const detailLabels = buildDetailLabels(EN as Record<string, unknown>);

function makeSupplier(over: Partial<Supplier>): Supplier {
  return {
    id: 'sup-1',
    code: 'SUP-0001',
    name: 'Acme Meats',
    contact: { email: 'orders@acme.test' },
    currency: 'EUR',
    leadTimeDays: 7,
    status: 'active',
    notes: null,
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...over,
  };
}

const SUPPLIERS: Supplier[] = [
  makeSupplier({ id: 'sup-1', code: 'SUP-0001', name: 'Acme Meats', status: 'active', leadTimeDays: 7, contact: { email: 'orders@acme.test' } }),
  makeSupplier({ id: 'sup-2', code: 'SUP-0002', name: 'Beta Foods', status: 'inactive', leadTimeDays: 14, contact: {} }),
  makeSupplier({ id: 'sup-3', code: 'SUP-0003', name: 'Gamma Spice', status: 'blocked', leadTimeDays: 21, contact: {} }),
];

function renderList(props: Partial<React.ComponentProps<typeof SupplierListView>> = {}) {
  const createSupplierAction =
    vi.fn<Parameters<React.ComponentProps<typeof SupplierListView>['createSupplierAction']>, Promise<CreateSupplierResult>>();
  const utils = render(
    <SupplierListView
      locale="en"
      suppliers={SUPPLIERS}
      labels={listLabels}
      createSupplierAction={createSupplierAction}
      {...props}
    />,
  );
  return { ...utils, createSupplierAction };
}

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SupplierListView — structure + filtering (parity: suppliers.jsx:73-152)', () => {
  it('renders the KPI strip, status tabs with live counts and a dense table', () => {
    renderList();
    expect(screen.getByTestId('supplier-kpi-strip')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-list-tab-all')).toHaveTextContent('3');
    expect(screen.getByTestId('supplier-list-tab-active')).toHaveTextContent('1');
    expect(screen.getByTestId('supplier-list-tab-inactive')).toHaveTextContent('1');
    expect(screen.getByTestId('supplier-list-tab-blocked')).toHaveTextContent('1');
    // Default tab is `active` (mirrors the prototype's default).
    expect(screen.getByTestId('supplier-row-sup-1')).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-row-sup-2')).toBeNull();
    // Row links to detail; contact cell shows the email from the jsonb.
    expect(screen.getByTestId('supplier-link-sup-1')).toHaveAttribute('href', '/en/planning/suppliers/sup-1');
    expect(within(screen.getByTestId('supplier-row-sup-1')).getByText('orders@acme.test')).toBeInTheDocument();
  });

  it('filters by status tab', () => {
    renderList();
    fireEvent.click(screen.getByTestId('supplier-list-tab-blocked'));
    expect(screen.getByTestId('supplier-row-sup-3')).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-row-sup-1')).toBeNull();
  });

  it('filters by search over code, name and contact email', () => {
    renderList();
    fireEvent.click(screen.getByTestId('supplier-list-tab-all'));
    fireEvent.change(screen.getByTestId('supplier-list-search'), { target: { value: 'Beta' } });
    expect(screen.getByTestId('supplier-row-sup-2')).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-row-sup-1')).toBeNull();
  });

  it('shows the empty-state when no rows match (parity: suppliers.jsx:93-99)', () => {
    renderList();
    fireEvent.change(screen.getByTestId('supplier-list-search'), { target: { value: 'zzz-nope' } });
    expect(screen.getByTestId('empty-state-root')).toHaveTextContent(listLabels.empty.title);
  });

  it('renders the empty-state when the org has no suppliers at all (empty live read)', () => {
    renderList({ suppliers: [] });
    expect(screen.getByTestId('empty-state-root')).toBeInTheDocument();
  });
});

describe('SupplierListView — create modal (parity: suppliers.jsx:69 + supplier_form_modal)', () => {
  it('auto-opens the create modal on the ?new=1 deep-link', () => {
    renderList({ autoOpenCreate: true });
    expect(screen.getByTestId('create-supplier-form')).toBeInTheDocument();
  });

  it('builds the createSupplier payload (incl. contact jsonb) and refreshes on success', async () => {
    const { createSupplierAction } = renderList();
    createSupplierAction.mockResolvedValue({ ok: true, data: makeSupplier({ id: 'new' }) });

    fireEvent.click(screen.getByTestId('supplier-list-create'));
    expect(screen.getByTestId('create-supplier-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('create-supplier-code'), { target: { value: 'SUP-0099' } });
    fireEvent.change(screen.getByTestId('create-supplier-name'), { target: { value: 'Delta Dairy' } });
    fireEvent.change(screen.getByTestId('create-supplier-email'), { target: { value: 'po@delta.test' } });
    fireEvent.click(screen.getByTestId('create-supplier-submit'));

    await waitFor(() =>
      expect(createSupplierAction).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SUP-0099',
          name: 'Delta Dairy',
          currency: 'EUR',
          leadTimeDays: 7,
          status: 'active',
          contact: { email: 'po@delta.test' },
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('blocks submit and shows a validation error when the name is too short', async () => {
    const { createSupplierAction } = renderList();
    fireEvent.click(screen.getByTestId('supplier-list-create'));
    fireEvent.change(screen.getByTestId('create-supplier-code'), { target: { value: 'SUP-1' } });
    fireEvent.change(screen.getByTestId('create-supplier-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('create-supplier-submit'));
    await waitFor(() => expect(screen.getByTestId('create-supplier-error')).toHaveTextContent(listLabels.create.errors.nameRequired));
    expect(createSupplierAction).not.toHaveBeenCalled();
  });

  it('surfaces an already_exists server error inline', async () => {
    const { createSupplierAction } = renderList();
    createSupplierAction.mockResolvedValue({ ok: false, error: 'already_exists' });

    fireEvent.click(screen.getByTestId('supplier-list-create'));
    fireEvent.change(screen.getByTestId('create-supplier-code'), { target: { value: 'SUP-0001' } });
    fireEvent.change(screen.getByTestId('create-supplier-name'), { target: { value: 'Acme Two' } });
    fireEvent.click(screen.getByTestId('create-supplier-submit'));

    await waitFor(() => expect(screen.getByTestId('create-supplier-error')).toHaveTextContent(listLabels.create.errors.already_exists));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('SupplierDetailView — status transitions + RBAC (parity: suppliers.jsx:196-201,249-267)', () => {
  function renderDetail(supplier: Supplier) {
    const transitionSupplierStatusAction =
      vi.fn<[string, 'active' | 'inactive' | 'blocked'], Promise<TransitionSupplierResult>>();
    const utils = render(
      <SupplierDetailView supplier={supplier} labels={detailLabels} transitionSupplierStatusAction={transitionSupplierStatusAction} />,
    );
    return { ...utils, transitionSupplierStatusAction };
  }

  it('renders the header + info card and only the non-current transitions', () => {
    renderDetail(makeSupplier({ status: 'active', contact: { email: 'a@b.test', country: 'GB' } }));
    expect(screen.getByTestId('supplier-detail-head')).toHaveTextContent('Acme Meats');
    expect(screen.getByTestId('supplier-info-card')).toHaveTextContent('a@b.test');
    expect(screen.getByTestId('supplier-info-card')).toHaveTextContent('GB');
    // Current = active → activate hidden, deactivate + block shown.
    expect(screen.queryByTestId('supplier-transition-active')).toBeNull();
    expect(screen.getByTestId('supplier-transition-inactive')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-transition-blocked')).toBeInTheDocument();
  });

  it('confirms then calls transitionSupplierStatus with the next status', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionSupplierStatusAction } = renderDetail(makeSupplier({ id: 'sup-1', status: 'active' }));
    transitionSupplierStatusAction.mockResolvedValue({ ok: true, data: makeSupplier({ status: 'inactive' }) });

    fireEvent.click(screen.getByTestId('supplier-transition-inactive'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(transitionSupplierStatusAction).toHaveBeenCalledWith('sup-1', 'inactive'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not call the action when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { transitionSupplierStatusAction } = renderDetail(makeSupplier({ status: 'active' }));
    fireEvent.click(screen.getByTestId('supplier-transition-blocked'));
    expect(transitionSupplierStatusAction).not.toHaveBeenCalled();
  });

  it('surfaces a forbidden RBAC result inline (server-enforced, not client-trusted)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { transitionSupplierStatusAction } = renderDetail(makeSupplier({ status: 'blocked' }));
    transitionSupplierStatusAction.mockResolvedValue({ ok: false, error: 'forbidden' });

    fireEvent.click(screen.getByTestId('supplier-transition-active'));
    await waitFor(() => expect(screen.getByTestId('supplier-detail-error')).toHaveTextContent(detailLabels.errors.forbidden));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('Planning.suppliers i18n coverage (en + pl real)', () => {
  const locales = { en: EN, pl: PL } as Record<string, Record<string, unknown>>;
  it('defines every consumed key in both real locales', () => {
    for (const [loc, m] of Object.entries(locales)) {
      const list = buildListLabels(m);
      const detail = buildDetailLabels(m);
      // Spot-check: no builder returned a dotted-path fallback (would mean a missing key).
      expect(list.title ?? '', `title missing in ${loc}`).not.toBe('title');
      expect(list.newSupplier, `actions.newSupplier missing in ${loc}`).not.toBe('actions.newSupplier');
      expect(list.empty.title, `list.empty.title missing in ${loc}`).not.toBe('list.empty.title');
      expect(list.rowsCount, `list.rowsCount missing in ${loc}`).toContain('{n}');
      expect(list.showing, `list.showing missing in ${loc}`).toContain('{total}');
      expect(list.create.errors.already_exists, `errors.already_exists missing in ${loc}`).not.toBe('errors.already_exists');
      expect(detail.transitions.confirmDeactivate, `confirmDeactivate missing in ${loc}`).toContain('{code}');
      expect(detail.errors.forbidden, `errors.forbidden missing in ${loc}`).not.toBe('errors.forbidden');
    }
  });
});
