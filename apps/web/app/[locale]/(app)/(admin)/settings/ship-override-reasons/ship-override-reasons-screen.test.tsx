/**
 * @vitest-environment jsdom
 * RTL test — Shipping override reasons screen.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:720-799.
 * Asserts the screen renders the override-type card grid (`.sg-card-grid`), the
 * selected type's reason-code table, the RMA reason-codes table, and the
 * empty-states — all from real-data-shaped loader props (OverrideTypeRow /
 * ReasonCodeRow / RmaReasonCodeRow), no mocks. Also asserts it composes the
 * shared `.sg-*` primitive structure.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OverrideTypeRow, ReasonCodeRow, RmaReasonCodeRow } from './_actions/shipping-overrides';
import ShipOverrideReasonsScreen, {
  type ShipOverrideReasonsScreenLabels,
} from './ship-override-reasons-screen.client';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TYPE_FEFO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TYPE_EXPIRED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const labels: ShipOverrideReasonsScreenLabels = {
  title: 'Shipping override reasons',
  subtitle: 'Reason codes per override type.',
  exportCsv: 'Export CSV',
  addReason: '+ Add reason',
  reasonCodesSuffix: ' — reason codes',
  reasonCodesSubtitle: 'Edit to rename. Deactivate to hide from new overrides.',
  reasonColumns: {
    code: 'Code',
    label: 'Label',
    requiresNote: 'Requires note',
    status: 'Status',
  },
  rmaTitle: 'RMA reason codes',
  rmaSubtitle: 'Backing table: rma_reason_codes.',
  rmaColumns: {
    code: 'Code',
    labelEn: 'Label (EN)',
    labelPl: 'Label (PL)',
    status: 'Status',
  },
  statusActive: 'active',
  statusInactive: 'inactive',
  requiresNoteYes: 'Required',
  requiresNoteNo: 'Optional',
  codesCountSuffix: 'codes',
  emptyOverrideTypes: 'No override types are configured yet.',
  emptyReasonCodes: 'No reason codes for this override type yet.',
  emptyRmaCodes: 'No RMA reason codes are configured yet.',
  addRmaReason: '+ Add RMA reason',
  formSave: 'Save',
  formCancel: 'Cancel',
  formError: 'Reason code was not saved. Check the code is unique for this organization, then retry.',
};

// Real loader-shaped rows (the shape getOverrideTypes / getReasonCodes /
// getRmaReasonCodes return).
const overrideTypes: OverrideTypeRow[] = [
  {
    id: TYPE_FEFO,
    org_id: ORG_ID,
    code: 'fefo_deviation',
    label: 'FEFO deviation',
    description: 'Picked outside FEFO order.',
    display_order: 1,
    is_active: true,
    reason_count: 3,
  },
  {
    id: TYPE_EXPIRED,
    org_id: ORG_ID,
    code: 'expired_lp',
    label: 'Expired LP',
    description: null,
    display_order: 2,
    is_active: true,
    reason_count: 0,
  },
];

const reasonCodes: ReasonCodeRow[] = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    org_id: ORG_ID,
    override_type_id: TYPE_FEFO,
    override_type_code: 'fefo_deviation',
    code: 'NEAR_EXPIRY',
    label: 'Near expiry – customer accepted',
    requires_note: true,
    display_order: 1,
    is_active: true,
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    org_id: ORG_ID,
    override_type_id: TYPE_FEFO,
    override_type_code: 'fefo_deviation',
    code: 'STOCK_ROTATION',
    label: 'Stock rotation',
    requires_note: false,
    display_order: 2,
    is_active: false,
  },
];

const rmaReasonCodes: RmaReasonCodeRow[] = [
  {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    org_id: ORG_ID,
    code: 'DAMAGED',
    label_en: 'Damaged in transit',
    label_pl: 'Uszkodzony w transporcie',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    org_id: ORG_ID,
    code: 'WRONG_ITEM',
    label_en: 'Wrong item shipped',
    label_pl: null,
    display_order: 2,
    is_active: false,
  },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof ShipOverrideReasonsScreen>> = {}) {
  return render(
    <ShipOverrideReasonsScreen
      overrideTypes={overrideTypes}
      selectedOverrideTypeId={TYPE_FEFO}
      reasonCodes={reasonCodes}
      rmaReasonCodes={rmaReasonCodes}
      labels={labels}
      {...overrides}
    />,
  );
}

afterEach(() => cleanup());

describe('ShipOverrideReasonsScreen', () => {
  it('keeps the prototype-source anchor on the screen root', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main[data-prototype-source]');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('data-prototype-source')).toBe(
      'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:720-799',
    );
  });

  it('renders the page head with title, subtitle and CSV / add-reason actions', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.sg-head')).not.toBeNull();
    expect(container.querySelector('.sg-title')?.textContent).toBe('Shipping override reasons');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add reason' })).toBeInTheDocument();
  });

  it('composes the shared .sg-* section structure', () => {
    const { container } = renderScreen();
    const sections = container.querySelectorAll('.sg-section');
    // reason-code section + RMA section.
    expect(sections.length).toBe(2);
    expect(container.querySelectorAll('.sg-section-head').length).toBe(2);
    expect(container.querySelectorAll('.sg-section-body').length).toBe(2);
  });

  it('renders the override-type card grid (.sg-card-grid) from real-data props', () => {
    const { container } = renderScreen();
    const grid = screen.getByTestId('ship-override-types-grid');
    expect(grid).toHaveClass('sg-card-grid');

    const cards = within(grid).getAllByTestId('ship-override-type-card');
    expect(cards.length).toBe(overrideTypes.length);
    cards.forEach((card) => expect(card).toHaveClass('sg-card'));

    // Card titles + per-type reason counts.
    const fefoCard = within(grid).getByText('FEFO deviation').closest('.sg-card')!;
    expect(within(fefoCard).getByText('3 codes')).toBeInTheDocument();
    const expiredCard = within(grid).getByText('Expired LP').closest('.sg-card')!;
    expect(within(expiredCard).getByText('0 codes')).toBeInTheDocument();

    // The selected type is marked active.
    expect(fefoCard).toHaveClass('active');
    expect(fefoCard).toHaveAttribute('data-active', 'true');
    expect(expiredCard).not.toHaveClass('active');

    // Sanity: the card-grid lives on the screen root.
    expect(container.querySelector('.sg-card-grid')).toBe(grid);
  });

  it('renders the reason-code table for the selected override type', () => {
    renderScreen();
    const table = screen.getByTestId('ship-reason-codes-table');

    ['Code', 'Label', 'Requires note', 'Status'].forEach((header) => {
      expect(within(table).getByText(header)).toBeInTheDocument();
    });

    // Active row with requires-note=true.
    const nearExpiryRow = within(table).getByText('NEAR_EXPIRY').closest('tr')!;
    expect(within(nearExpiryRow).getByText('Near expiry – customer accepted')).toBeInTheDocument();
    expect(within(nearExpiryRow).getByText('Required')).toBeInTheDocument();
    expect(within(nearExpiryRow).getByText('active')).toBeInTheDocument();

    // Inactive row with requires-note=false.
    const rotationRow = within(table).getByText('STOCK_ROTATION').closest('tr')!;
    expect(within(rotationRow).getByText('Optional')).toBeInTheDocument();
    expect(within(rotationRow).getByText('inactive')).toBeInTheDocument();
  });

  it('renders the RMA reason-codes table from real-data props', () => {
    renderScreen();
    const table = screen.getByTestId('ship-rma-codes-table');

    ['Code', 'Label (EN)', 'Label (PL)', 'Status'].forEach((header) => {
      expect(within(table).getByText(header)).toBeInTheDocument();
    });

    const damagedRow = within(table).getByText('DAMAGED').closest('tr')!;
    expect(within(damagedRow).getByText('Damaged in transit')).toBeInTheDocument();
    expect(within(damagedRow).getByText('Uszkodzony w transporcie')).toBeInTheDocument();
    expect(within(damagedRow).getByText('active')).toBeInTheDocument();

    // Null PL label renders as an em-dash; inactive status badge.
    const wrongItemRow = within(table).getByText('WRONG_ITEM').closest('tr')!;
    expect(within(wrongItemRow).getByText('—')).toBeInTheDocument();
    expect(within(wrongItemRow).getByText('inactive')).toBeInTheDocument();
  });

  it('renders the override-types empty-state when none are configured', () => {
    renderScreen({ overrideTypes: [], selectedOverrideTypeId: null });
    expect(screen.getByTestId('ship-override-types-empty')).toHaveTextContent(
      'No override types are configured yet.',
    );
    expect(screen.queryByTestId('ship-override-types-grid')).not.toBeInTheDocument();
  });

  it('renders the reason-codes empty-state when the selected type has none', () => {
    renderScreen({ reasonCodes: [] });
    expect(screen.getByTestId('ship-reason-codes-empty')).toHaveTextContent(
      'No reason codes for this override type yet.',
    );
    expect(screen.queryByTestId('ship-reason-codes-table')).not.toBeInTheDocument();
  });

  it('renders the RMA empty-state when no RMA codes are configured', () => {
    renderScreen({ rmaReasonCodes: [] });
    expect(screen.getByTestId('ship-rma-codes-empty')).toHaveTextContent(
      'No RMA reason codes are configured yet.',
    );
    expect(screen.queryByTestId('ship-rma-codes-table')).not.toBeInTheDocument();
  });

  it('disables CSV / add-reason actions unless the user can edit', () => {
    renderScreen({ canEdit: false, onAddReason: vi.fn(), onAddRmaReason: vi.fn() });
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add reason' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add RMA reason' })).toBeDisabled();
    cleanup();
    renderScreen({ canEdit: true, onAddReason: vi.fn(), onAddRmaReason: vi.fn() });
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '+ Add reason' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '+ Add RMA reason' })).toBeEnabled();
  });

  // D2 — the add buttons used to be inert: page.tsx handed the screen no writer, so a
  // click produced 0 DOM changes, 0 requests, 0 rows. These assert the opposite.
  it('disables the add buttons when no writer is wired, instead of pretending', () => {
    renderScreen({ canEdit: true });
    expect(screen.getByRole('button', { name: '+ Add reason' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add RMA reason' })).toBeDisabled();
  });

  it('"Add RMA reason" submits to the writer and shows the persisted row', async () => {
    const user = userEvent.setup();
    const created: RmaReasonCodeRow = {
      id: '11111111-1111-4111-8111-111111111111',
      org_id: ORG_ID,
      code: 'LATE_DELIVERY',
      label_en: 'Late delivery',
      label_pl: null,
      display_order: 0,
      is_active: true,
    };
    const onAddRmaReason = vi.fn().mockResolvedValue({ ok: true, data: created });
    renderScreen({ canEdit: true, rmaReasonCodes: [], onAddRmaReason });

    expect(screen.getByTestId('ship-rma-codes-empty')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Add RMA reason' }));

    const form = screen.getByTestId('ship-rma-code-add-form');
    await user.type(within(form).getByLabelText('Code'), 'LATE_DELIVERY');
    await user.type(within(form).getByLabelText('Label (EN)'), 'Late delivery');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(onAddRmaReason).toHaveBeenCalledWith({ code: 'LATE_DELIVERY', label_en: 'Late delivery' });
    const table = await screen.findByTestId('ship-rma-codes-table');
    expect(within(table).getByText('LATE_DELIVERY')).toBeInTheDocument();
    expect(screen.queryByTestId('ship-rma-codes-empty')).not.toBeInTheDocument();
  });

  it('"Add reason" submits the selected override type to the writer', async () => {
    const user = userEvent.setup();
    const created: ReasonCodeRow = {
      id: '22222222-2222-4222-8222-222222222222',
      org_id: ORG_ID,
      override_type_id: TYPE_FEFO,
      override_type_code: 'fefo_deviation',
      code: 'QA_APPROVED',
      label: 'QA approved',
      requires_note: false,
      display_order: 0,
      is_active: true,
    };
    const onAddReason = vi.fn().mockResolvedValue({ ok: true, data: created });
    renderScreen({ canEdit: true, reasonCodes: [], onAddReason });

    await user.click(screen.getByRole('button', { name: '+ Add reason' }));
    const form = screen.getByTestId('ship-reason-code-add-form');
    await user.type(within(form).getByLabelText('Code'), 'QA_APPROVED');
    await user.type(within(form).getByLabelText('Label'), 'QA approved');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(onAddReason).toHaveBeenCalledWith({
      overrideTypeId: TYPE_FEFO,
      code: 'QA_APPROVED',
      label: 'QA approved',
    });
    const table = await screen.findByTestId('ship-reason-codes-table');
    expect(within(table).getByText('QA_APPROVED')).toBeInTheDocument();
  });

  it('surfaces a refused write instead of silently closing the form', async () => {
    const user = userEvent.setup();
    const onAddRmaReason = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderScreen({ canEdit: true, rmaReasonCodes: [], onAddRmaReason });

    await user.click(screen.getByRole('button', { name: '+ Add RMA reason' }));
    const form = screen.getByTestId('ship-rma-code-add-form');
    await user.type(within(form).getByLabelText('Code'), 'NOPE');
    await user.type(within(form).getByLabelText('Label (EN)'), 'Nope');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('Reason code was not saved.');
    expect(screen.getByTestId('ship-rma-codes-empty')).toBeInTheDocument();
  });
});
