/**
 * @vitest-environment jsdom
 *
 * T-047 — TEC-040 Allergen Profile Editor RED tests.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:309-347
 *   (AllergenDeclarationModal).
 *
 * Asserts:
 *  - cascade-preview lists each allergen under its SOURCE label (AC2);
 *  - auto-cascaded (source='cascaded') group carries the read-only tag (red-line:
 *    auto-derived read-only);
 *  - the declaration modal has the allergen / presence / confidence selectors +
 *    reason field + Save / Cancel matching the prototype field set (AC1);
 *  - Save is DISABLED without a reason (V-TEC-42) and disabled when the caller
 *    lacks technical.allergens.edit (AC3);
 *  - the five UI states (loading / empty / error / permission-denied / ready).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { AllergensTab, type AllergensTabLabels } from '../allergens-tab.client';
import { DEFAULT_TAB_LABELS } from '../allergen-labels';
import type { AllergenProfileEditorData } from '../../_actions/allergen-profile';

afterEach(() => cleanup());

const LABELS: AllergensTabLabels = DEFAULT_TAB_LABELS;

const DATA: AllergenProfileEditorData = {
  itemCode: 'FG-001',
  itemName: 'Test FG',
  references: [
    { allergenCode: 'gluten', allergenName: 'Gluten' },
    { allergenCode: 'milk', allergenName: 'Milk' },
    { allergenCode: 'soy', allergenName: 'Soy' },
  ],
  badges: [
    {
      allergenCode: 'gluten',
      allergenName: 'Gluten',
      source: 'cascaded',
      intensity: 'contains',
      confidence: 'declared',
      manualOverrideReason: null,
    },
    {
      allergenCode: 'milk',
      allergenName: 'Milk',
      source: 'manual_override',
      intensity: 'may_contain',
      confidence: 'assumed',
      manualOverrideReason: 'Shared line risk',
    },
  ],
  overrides: [],
  canEdit: true,
  state: 'ready',
};

function renderTab(overrides: Partial<React.ComponentProps<typeof AllergensTab>> = {}) {
  return render(
    <AllergensTab
      data={DATA}
      labels={LABELS}
      state="ready"
      canEdit
      saveOverrideAction={vi.fn().mockResolvedValue({ ok: true })}
      {...overrides}
    />,
  );
}

describe('TEC-040 AllergensTab — cascade preview + source grouping', () => {
  it('lists each allergen under its source label (AC2)', () => {
    renderTab();
    expect(screen.getByTestId('allergen-source-group-cascaded')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-source-group-manual_override')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-badge-gluten')).toBeInTheDocument();
    expect(screen.getByTestId('allergen-badge-milk')).toBeInTheDocument();
  });

  it('tags the auto-cascaded group as read-only (auto-derived read-only red-line)', () => {
    renderTab();
    expect(screen.getByTestId('allergen-readonly-cascaded')).toBeInTheDocument();
    // The manual_override group is NOT read-only.
    expect(screen.queryByTestId('allergen-readonly-manual_override')).not.toBeInTheDocument();
  });
});

describe('TEC-040 declaration modal — prototype field set parity (AC1)', () => {
  it('opens the modal with allergen + presence + confidence selectors, reason, Save/Cancel', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('allergen-declare-cta'));
    const modal = screen.getByTestId('allergen-declaration-modal');
    expect(within(modal).getByLabelText(LABELS.modal.fieldAllergen)).toBeInTheDocument();
    expect(within(modal).getByLabelText(LABELS.modal.fieldIntensity)).toBeInTheDocument();
    expect(within(modal).getByLabelText(LABELS.modal.fieldConfidence)).toBeInTheDocument();
    expect(within(modal).getByTestId('allergen-override-reason')).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: LABELS.modal.save })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: LABELS.modal.cancel })).toBeInTheDocument();
    // The auto-cascade info note (prototype blue banner) is present.
    expect(within(modal).getByTestId('allergen-auto-note')).toBeInTheDocument();
  });

  it('disables Save until a reason is supplied (V-TEC-42)', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    renderTab({ saveOverrideAction: save });
    // Open with a pre-filled override row (allergen pre-selected, reason cleared by test).
    fireEvent.click(screen.getByTestId('allergen-badge-milk'));
    const modal = screen.getByTestId('allergen-declaration-modal');
    const reason = within(modal).getByTestId('allergen-override-reason') as HTMLTextAreaElement;
    // Blank the reason → Save disabled.
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(within(modal).getByTestId('allergen-override-save')).toBeDisabled();
    // Supply a reason → Save enabled.
    fireEvent.change(reason, { target: { value: 'Updated declaration' } });
    expect(within(modal).getByTestId('allergen-override-save')).not.toBeDisabled();
  });

  it('calls the save action with the override payload when a reason is present', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    renderTab({ saveOverrideAction: save });
    fireEvent.click(screen.getByTestId('allergen-badge-milk'));
    const modal = screen.getByTestId('allergen-declaration-modal');
    fireEvent.change(within(modal).getByTestId('allergen-override-reason'), {
      target: { value: 'Confirmed shared line' },
    });
    fireEvent.click(within(modal).getByTestId('allergen-override-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'FG-001', allergenCode: 'milk', reason: 'Confirmed shared line' }),
    );
  });
});

describe('TEC-040 RBAC + five UI states (AC3)', () => {
  it('hides the declare CTA and disables badge editing without technical.allergens.edit', () => {
    renderTab({ canEdit: false });
    expect(screen.queryByTestId('allergen-declare-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('allergen-badge-gluten')).toBeDisabled();
  });

  it('renders the loading state', () => {
    render(<AllergensTab data={null} labels={LABELS} state="loading" canEdit />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(
      <AllergensTab
        data={{ ...DATA, badges: [] }}
        labels={LABELS}
        state="ready"
        canEdit
        saveOverrideAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('allergens-empty')).toBeInTheDocument();
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<AllergensTab data={null} labels={LABELS} state="error" canEdit />);
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('renders the permission-denied state', () => {
    render(<AllergensTab data={null} labels={LABELS} state="permission_denied" canEdit={false} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });
});
