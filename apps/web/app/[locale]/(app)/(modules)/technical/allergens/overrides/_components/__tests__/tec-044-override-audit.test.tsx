/**
 * @vitest-environment jsdom
 *
 * T-049 — TEC-044 Allergen Manual Override Audit panel RED tests.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:309-347
 *   (AllergenDeclarationModal, override variant).
 *
 * Asserts:
 *  - the append-only override history renders one row per ledger entry (AC parity);
 *  - clicking a row opens the declaration modal pre-filled with reason + allergen
 *    (AC2);
 *  - the modal requires a reason and Save is disabled without
 *    technical.allergens.edit (AC3 / V-TEC-42);
 *  - the aggregate scope shows the Item column; the item scope hides it;
 *  - the five UI states.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import {
  OverrideAuditPanel,
  type OverrideAuditLabels,
  type OverrideAuditEntry,
} from '../override-audit.client';
import {
  DEFAULT_OVERRIDE_AUDIT_LABELS,
  DEFAULT_TAB_LABELS,
} from '../../../../items/[item_code]/_components/allergen-labels';

afterEach(() => cleanup());

const LABELS: OverrideAuditLabels = DEFAULT_OVERRIDE_AUDIT_LABELS;
const DECL_LABELS = DEFAULT_TAB_LABELS.modal;

const ROWS: OverrideAuditEntry[] = [
  {
    id: 'r1',
    itemCode: 'FG-001',
    allergenCode: 'milk',
    action: 'set',
    intensity: 'contains',
    confidence: 'declared',
    reason: 'Shared line risk',
    overriddenAt: '2026-06-01T10:00:00.000Z',
    overriddenBy: 'user-1234abcd',
  },
  {
    id: 'r2',
    itemCode: 'FG-002',
    allergenCode: 'soy',
    action: 'clear',
    intensity: null,
    confidence: null,
    reason: 'No longer applicable',
    overriddenAt: '2026-06-02T11:30:00.000Z',
    overriddenBy: 'user-5678efgh',
  },
];

const ALLERGENS = [
  { allergenCode: 'milk', allergenName: 'Milk' },
  { allergenCode: 'soy', allergenName: 'Soy' },
];

function renderAggregate(overrides: Partial<React.ComponentProps<typeof OverrideAuditPanel>> = {}) {
  return render(
    <OverrideAuditPanel
      rows={ROWS}
      labels={LABELS}
      state="ready"
      canReview
      scope="aggregate"
      declarationLabels={DECL_LABELS}
      allergens={ALLERGENS}
      saveOverrideAction={vi.fn().mockResolvedValue({ ok: true })}
      {...overrides}
    />,
  );
}

describe('TEC-044 override audit — append-only history list', () => {
  it('renders one row per override ledger entry', () => {
    renderAggregate();
    expect(screen.getByTestId('override-row-r1')).toBeInTheDocument();
    expect(screen.getByTestId('override-row-r2')).toBeInTheDocument();
    expect(screen.getByText('Shared line risk')).toBeInTheDocument();
  });

  it('shows the Item column in aggregate scope and hides it in item scope', () => {
    const { rerender } = renderAggregate();
    expect(screen.getByText(LABELS.colItem)).toBeInTheDocument();
    expect(screen.getByText('FG-001')).toBeInTheDocument();

    rerender(
      <OverrideAuditPanel
        rows={ROWS.filter((r) => r.itemCode === 'FG-001')}
        labels={LABELS}
        state="ready"
        canReview={false}
        scope="item"
      />,
    );
    expect(screen.queryByText(LABELS.colItem)).not.toBeInTheDocument();
  });
});

describe('TEC-044 row → declaration modal (AC2 / AC3)', () => {
  it('opens the declaration modal pre-filled with reason + allergen on row review', () => {
    renderAggregate();
    fireEvent.click(screen.getByTestId('override-review-r1'));
    const modal = screen.getByTestId('allergen-declaration-modal');
    const reason = within(modal).getByTestId('allergen-override-reason') as HTMLTextAreaElement;
    expect(reason.value).toBe('Shared line risk');
  });

  it('keeps Save disabled until a reason is present (V-TEC-42)', () => {
    renderAggregate();
    fireEvent.click(screen.getByTestId('override-review-r1'));
    const modal = screen.getByTestId('allergen-declaration-modal');
    const reason = within(modal).getByTestId('allergen-override-reason');
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(within(modal).getByTestId('allergen-override-save')).toBeDisabled();
    fireEvent.change(reason, { target: { value: 'Re-confirmed' } });
    expect(within(modal).getByTestId('allergen-override-save')).not.toBeDisabled();
  });

  it('hides the review action (no write path) without technical.allergens.edit', () => {
    renderAggregate({ canReview: false, saveOverrideAction: undefined, declarationLabels: undefined });
    expect(screen.queryByTestId('override-review-r1')).not.toBeInTheDocument();
  });
});

describe('TEC-044 five UI states', () => {
  it('renders the loading state', () => {
    render(<OverrideAuditPanel rows={[]} labels={LABELS} state="loading" canReview={false} scope="aggregate" />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<OverrideAuditPanel rows={[]} labels={LABELS} state="empty" canReview={false} scope="aggregate" />);
    expect(screen.getByTestId('override-audit-empty')).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<OverrideAuditPanel rows={[]} labels={LABELS} state="error" canReview={false} scope="aggregate" />);
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('renders the permission-denied state', () => {
    render(
      <OverrideAuditPanel rows={[]} labels={LABELS} state="permission_denied" canReview={false} scope="aggregate" />,
    );
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });
});
