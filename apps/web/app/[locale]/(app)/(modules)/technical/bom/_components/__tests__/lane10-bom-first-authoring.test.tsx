/**
 * @vitest-environment jsdom
 * LANE-10 — BOM FIRST-AUTHORING state RTL.
 *
 * Bug: `/technical/bom/[itemCode]` 404'd whenever the FG existed but had NO
 * bom_headers row, so the New-BOM picker (which routes an active FG to exactly
 * that URL) dead-ended — authoring the FIRST BOM was impossible.
 *
 * Parity anchors:
 *   - bom-detail.jsx:3-65 (shell: breadcrumb + item header)
 *   - design-system `.empty-state` + `.btn-primary` (authoring CTA)
 *   - modals.jsx:192-243 (ComponentAddModal reused for the v1-draft create)
 *
 * Asserts:
 *   - the authoring shell renders for an FG-with-no-BOM (header + empty-state);
 *   - the create CTA is HIDDEN without server-granted permission (RBAC);
 *   - submitting the reused ComponentAddModal calls the real `createBomDraft`
 *     with the item code + exactly ONE line (V1 draft).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBomDraft: vi.fn(),
  listItems: vi.fn(),
  validateBomComponent: vi.fn(),
  listManufacturingOperations: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock('../../_actions/create-draft', () => ({ createBomDraft: mocks.createBomDraft }));
vi.mock('../../../items/_actions/list-items', () => ({ listItems: mocks.listItems }));
vi.mock('../../../../../../../../actions/technical/boms/validate-component', () => ({
  validateBomComponent: mocks.validateBomComponent,
}));
vi.mock('../../../../../../../../actions/reference/manufacturing-ops/list', () => ({
  listManufacturingOperations: mocks.listManufacturingOperations,
}));

import { BomFirstAuthoring, type BomFirstAuthoringLabels } from '../bom-first-authoring';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LABELS: BomFirstAuthoringLabels = {
  breadcrumbRoot: 'BOMs & recipes',
  emptyTitle: 'No BOM yet',
  emptyBody: 'No BOM yet for {code} — add the first component to create the v1 draft.',
  addFirstComponent: '+ Add first component',
  draftBadge: 'Not started',
};

function renderAuthoring(extra?: Partial<React.ComponentProps<typeof BomFirstAuthoring>>) {
  return render(
    <BomFirstAuthoring
      productId="FG-NEW-1"
      productName="Kielbasa nowa 450g"
      detailHrefBase="/technical/bom"
      canCreate
      labels={LABELS}
      {...extra}
    />,
  );
}

describe('BomFirstAuthoring — renders the authoring shell for an FG without a BOM', () => {
  it('shows the item header (breadcrumb + name) and the empty-state copy', () => {
    const { container } = renderAuthoring();
    // Shell parity: breadcrumb root + the FG code in the breadcrumb.
    expect(container.querySelector('.breadcrumb')).not.toBeNull();
    expect(screen.getByText(LABELS.breadcrumbRoot)).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Kielbasa nowa 450g');
    // Design-system empty-state with the interpolated code.
    const empty = screen.getByTestId('bom-first-authoring-empty');
    expect(empty).toHaveClass('empty-state');
    expect(within(empty).getByText(/No BOM yet for FG-NEW-1/)).toBeInTheDocument();
  });

  it('falls back to the FG code as the heading when no product name', () => {
    renderAuthoring({ productName: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('FG-NEW-1');
  });

  it('does NOT leak the legacy FA label (FG is canonical)', () => {
    const { container } = renderAuthoring();
    expect(container.textContent).not.toMatch(/Factory Article/i);
  });
});

describe('BomFirstAuthoring — RBAC', () => {
  it('renders the primary create CTA when create is granted', () => {
    renderAuthoring();
    const cta = screen.getByTestId('bom-add-first-component-cta');
    expect(cta).toHaveClass('btn-primary');
    expect(cta).toHaveTextContent('+ Add first component');
  });

  it('HIDES the create CTA when the server denied create (no client trust)', () => {
    renderAuthoring({ canCreate: false });
    expect(screen.queryByTestId('bom-add-first-component-cta')).not.toBeInTheDocument();
    // The read context (empty-state) still renders.
    expect(screen.getByTestId('bom-first-authoring-empty')).toBeInTheDocument();
  });
});

describe('BomFirstAuthoring — first-draft create flow', () => {
  it('submitting the reused modal calls createBomDraft with the item code + 1 line', async () => {
    const user = userEvent.setup();
    mocks.listItems.mockResolvedValue({
      state: 'ready',
      items: [
        { id: 'item-rm-1', itemCode: 'RM-1001', name: 'Pork shoulder', itemType: 'rm', status: 'active', uomBase: 'kg' },
      ],
    });
    mocks.listManufacturingOperations.mockResolvedValue({ ok: true, data: [{ operation_name: 'Mince' }] });
    mocks.validateBomComponent.mockResolvedValue({ ok: true });
    mocks.createBomDraft.mockResolvedValue({ ok: true, data: { id: 'h-new', version: 1, warnings: [] } });

    renderAuthoring();

    // Open the reused ComponentAddModal.
    await user.click(screen.getByTestId('bom-add-first-component-cta'));
    const dialog = await screen.findByRole('dialog');

    // Pick the real material (the modal loaded the item master).
    await user.click(await within(dialog).findByRole('option', { name: /RM-1001/ }));
    await waitFor(() => expect(mocks.validateBomComponent).toHaveBeenCalledWith({ itemId: 'item-rm-1' }));

    // Choose the required manufacturing operation (@monopilot/ui Select → combobox).
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mince' }));

    // Submit → createBomDraft with the FG code and exactly one line.
    const submit = within(dialog).getByRole('button', { name: 'Add component' });
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => expect(mocks.createBomDraft).toHaveBeenCalledTimes(1));
    const arg = mocks.createBomDraft.mock.calls[0][0];
    expect(arg.productId).toBe('FG-NEW-1');
    expect(arg.lines).toHaveLength(1);
    expect(arg.lines[0]).toMatchObject({ itemId: 'item-rm-1', componentCode: 'RM-1001' });
  });
});
