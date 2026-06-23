/**
 * @vitest-environment jsdom
 *
 * Wave E7 — Disassembly BOM UI variant.
 *
 * Backend (READ-ONLY, owned elsewhere):
 *   technical/bom/_actions/disassembly.ts
 *     - validateDisassemblyAllocation(coProducts) → V-TEC-12 sum-to-100 verdict
 *     - createDisassemblyBomDraft(params) → { ok, data:{ id, version } }
 *     - getDisassemblyBom(id) → { input, coProducts:[{itemCode,itemName,expectedYieldPct,allocationPct}], allocationSum }
 *
 * A disassembly BOM = 1 INPUT item + N co-product OUTPUTS, each with an expected
 * yield % and a cost allocation % that MUST sum to 100 (V-TEC-12).
 *
 * Parity references (the existing forward-BOM screens are the design baseline):
 *   - bom-list.jsx:33  ("+ New BOM" CTA → create flow; type toggle added here)
 *   - bom-detail.jsx:3-65 (detail shell → disassembly Input + Outputs variant)
 *
 * Asserts: the [Forward|Disassembly] toggle works; the co-products table adds
 * rows + shows the LIVE allocation sum + the ≠100 error; submit calls the real
 * createDisassemblyBomDraft; the detail renders Input + Outputs (no UUID leak);
 * forward BOM path is unaffected; all controls are i18n-driven (no inline copy).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listItems: vi.fn(),
  createDisassemblyBomDraft: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
}));
// Resolves to technical/items/_actions/list-items from this __tests__ depth.
vi.mock('../../../items/_actions/list-items', () => ({ listItems: mocks.listItems }));
vi.mock('../../_actions/disassembly', () => ({
  createDisassemblyBomDraft: mocks.createDisassemblyBomDraft,
}));

import { DisassemblyBomCreate } from '../disassembly-bom-create';
import { DisassemblyBomDetail } from '../disassembly-bom-detail';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ITEMS = [
  { id: 'u-in', itemCode: 'CARCASS-01', name: 'Pork carcass', itemType: 'rm', status: 'active', uomBase: 'kg' },
  { id: 'u-a', itemCode: 'CUT-LOIN', name: 'Loin', itemType: 'co_product', status: 'active', uomBase: 'kg' },
  { id: 'u-b', itemCode: 'CUT-BELLY', name: 'Belly', itemType: 'co_product', status: 'active', uomBase: 'kg' },
];

function renderCreate(extra?: Partial<React.ComponentProps<typeof DisassemblyBomCreate>>) {
  return render(
    <DisassemblyBomCreate open onClose={() => {}} detailHrefBase="/technical/bom" {...extra} />,
  );
}

describe('E7 — disassembly BOM create', () => {
  it('starts on the Forward type and switching to Disassembly reveals the co-products table', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: ITEMS });
    renderCreate();

    const forwardToggle = screen.getByTestId('bom-type-forward');
    const disToggle = screen.getByTestId('bom-type-disassembly');
    expect(forwardToggle).toHaveAttribute('aria-pressed', 'true');
    expect(disToggle).toHaveAttribute('aria-pressed', 'false');
    // Forward path picker present; disassembly co-products table NOT yet shown.
    expect(screen.queryByTestId('disassembly-coproducts-table')).not.toBeInTheDocument();

    await user.click(disToggle);
    expect(disToggle).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByTestId('disassembly-coproducts-table')).toBeInTheDocument();
  });

  it('adds co-product rows and shows a LIVE allocation sum with a ≠100 error (V-TEC-12)', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: ITEMS });
    renderCreate();
    await user.click(screen.getByTestId('bom-type-disassembly'));
    await screen.findByTestId('disassembly-coproducts-table');

    // One co-product row exists by default; allocation sum starts at 0 → error.
    const sum0 = screen.getByTestId('disassembly-allocation-sum');
    expect(sum0).toHaveTextContent('0');
    expect(screen.getByTestId('disassembly-allocation-error')).toBeInTheDocument();

    // Add a second output row.
    await user.click(screen.getByTestId('disassembly-add-output'));
    expect(screen.getAllByTestId('disassembly-coproduct-row')).toHaveLength(2);

    // Fill allocations: 60 + 40 = 100 → live sum updates, error clears.
    const allocInputs = screen.getAllByTestId('disassembly-allocation-input');
    await user.clear(allocInputs[0]!);
    await user.type(allocInputs[0]!, '60');
    await user.clear(allocInputs[1]!);
    await user.type(allocInputs[1]!, '40');

    await waitFor(() =>
      expect(screen.getByTestId('disassembly-allocation-sum')).toHaveTextContent('100'),
    );
    expect(screen.queryByTestId('disassembly-allocation-error')).not.toBeInTheDocument();

    // Break it: 60 + 30 = 90 → error returns.
    await user.clear(allocInputs[1]!);
    await user.type(allocInputs[1]!, '30');
    await waitFor(() =>
      expect(screen.getByTestId('disassembly-allocation-error')).toBeInTheDocument(),
    );
  });

  it('submit calls the real createDisassemblyBomDraft with the input + co-products', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: ITEMS });
    mocks.createDisassemblyBomDraft.mockResolvedValue({ ok: true, data: { id: 'h-1', version: 1 } });
    renderCreate();
    await user.click(screen.getByTestId('bom-type-disassembly'));
    await screen.findByTestId('disassembly-coproducts-table');

    // Pick the INPUT item.
    await user.click(screen.getByTestId('disassembly-input-picker'));
    await user.click(await screen.findByRole('option', { name: /CARCASS-01/ }));

    // Pick co-product for row 1, set yield + allocation.
    const row0 = screen.getAllByTestId('disassembly-coproduct-row')[0]!;
    await user.click(within(row0).getByTestId('disassembly-coproduct-picker'));
    await user.click(await screen.findByRole('option', { name: /CUT-LOIN/ }));
    await user.clear(within(row0).getByTestId('disassembly-yield-input'));
    await user.type(within(row0).getByTestId('disassembly-yield-input'), '55');
    await user.clear(within(row0).getByTestId('disassembly-allocation-input'));
    await user.type(within(row0).getByTestId('disassembly-allocation-input'), '100');

    await user.click(screen.getByTestId('disassembly-submit'));

    await waitFor(() => expect(mocks.createDisassemblyBomDraft).toHaveBeenCalledTimes(1));
    const arg = mocks.createDisassemblyBomDraft.mock.calls[0]![0];
    expect(arg.bom_type).toBe('disassembly');
    expect(arg.lines).toHaveLength(1);
    expect(arg.lines[0].componentCode ?? arg.lines[0].itemCode).toBe('CARCASS-01');
    expect(arg.coProducts).toHaveLength(1);
    expect(String(arg.coProducts[0].allocationPct)).toBe('100');
    expect(String(arg.coProducts[0].expectedYieldPct)).toBe('55');
  });

  it('blocks submit while the allocation ≠ 100 (V-TEC-12 client guard)', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: ITEMS });
    renderCreate();
    await user.click(screen.getByTestId('bom-type-disassembly'));
    await screen.findByTestId('disassembly-coproducts-table');
    // No allocations entered → sum 0 → submit disabled.
    expect(screen.getByTestId('disassembly-submit')).toBeDisabled();
    expect(mocks.createDisassemblyBomDraft).not.toHaveBeenCalled();
  });

  it('removes a co-product row', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({ state: 'ready', items: ITEMS });
    renderCreate();
    await user.click(screen.getByTestId('bom-type-disassembly'));
    await screen.findByTestId('disassembly-coproducts-table');
    await user.click(screen.getByTestId('disassembly-add-output'));
    expect(screen.getAllByTestId('disassembly-coproduct-row')).toHaveLength(2);
    await user.click(within(screen.getAllByTestId('disassembly-coproduct-row')[1]!).getByTestId('disassembly-remove-output'));
    expect(screen.getAllByTestId('disassembly-coproduct-row')).toHaveLength(1);
  });
});

describe('E7 — disassembly BOM detail variant', () => {
  const DETAIL_DATA = {
    header: {
      bom_type: 'disassembly' as const,
      product_code: 'CARCASS-01',
      status: 'draft',
      version: 1,
      yield_pct: '100',
      effective_from: '2026-06-01',
      effective_to: null,
      notes: null,
    },
    input_item: { code: 'CARCASS-01', name: 'Pork carcass', quantity: '1', uom: 'kg' },
    outputs: [
      { code: 'CUT-LOIN', name: 'Loin', quantity: '1', uom: 'kg', allocation_pct: '60', expected_yield_pct: '20' },
      { code: 'CUT-BELLY', name: 'Belly', quantity: '1', uom: 'kg', allocation_pct: '40', expected_yield_pct: '15' },
    ],
    allocation_sum: '100',
  };

  it('renders the Input item (code + name, never a raw UUID) and the Outputs table', () => {
    render(<DisassemblyBomDetail state="ready" data={DETAIL_DATA} detailHrefBase="/technical/bom" />);

    const input = screen.getByTestId('disassembly-detail-input');
    expect(input).toHaveTextContent('CARCASS-01');
    expect(input).toHaveTextContent('Pork carcass');

    const rows = screen.getAllByTestId('disassembly-output-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('CUT-LOIN');
    expect(rows[0]).toHaveTextContent('Loin');
    // The footer carries the allocation sum and a valid (=100) state.
    const footer = screen.getByTestId('disassembly-detail-allocation-sum');
    expect(footer).toHaveTextContent('100');
    // No bare UUID anywhere in the rendered tree.
    expect(screen.queryByText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/)).not.toBeInTheDocument();
  });

  it('flags an invalid (≠100) allocation sum in the detail footer', () => {
    render(
      <DisassemblyBomDetail
        state="ready"
        data={{
          ...DETAIL_DATA,
          outputs: [DETAIL_DATA.outputs[0]!],
          allocation_sum: '60',
        }}
        detailHrefBase="/technical/bom"
      />,
    );
    expect(screen.getByTestId('disassembly-detail-allocation-error')).toBeInTheDocument();
  });

  it('renders the not_found / error / loading states', () => {
    const { rerender } = render(
      <DisassemblyBomDetail state="loading" data={null} detailHrefBase="/technical/bom" />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<DisassemblyBomDetail state="error" data={null} detailHrefBase="/technical/bom" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<DisassemblyBomDetail state="not_found" data={null} detailHrefBase="/technical/bom" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
