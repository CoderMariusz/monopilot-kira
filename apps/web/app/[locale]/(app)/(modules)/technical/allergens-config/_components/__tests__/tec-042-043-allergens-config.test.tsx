/**
 * @vitest-environment jsdom
 *
 * T-048 — TEC-042 Manufacturing-op allergen additions + TEC-043 Contamination
 * Risk Matrix RED tests.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:111-159
 *   (allergen_matrix_screen) — sticky-header line × allergen grid + color legend.
 *
 * Asserts:
 *  - the grid renders a line row × allergen column header set + risk legend (AC1);
 *  - the coverage-gap banner shows the count + a 'View gaps' link (AC2) and is
 *    NOT silently dropped (red-line);
 *  - inline edit is read-only without technical.allergens.edit (AC3);
 *  - editing a cell calls the save action;
 *  - the five UI states.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { AllergensConfig, type AllergensConfigLabels } from '../allergens-config.client';
import { DEFAULT_CONFIG_LABELS } from '../config-labels';
import type { AllergensConfigData } from '../../_actions/load-config';

afterEach(() => cleanup());

const LABELS: AllergensConfigLabels = DEFAULT_CONFIG_LABELS;

const DATA: AllergensConfigData = {
  allergens: [
    { allergenCode: 'gluten', allergenName: 'Gluten' },
    { allergenCode: 'milk', allergenName: 'Milk' },
  ],
  lines: [
    { id: '11111111-1111-1111-1111-111111111111', code: 'L1', name: 'Line 1' },
    { id: '22222222-2222-2222-2222-222222222222', code: 'L2', name: 'Line 2' },
  ],
  operations: [{ operationName: 'Baking' }],
  risks: [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      lineId: '11111111-1111-1111-1111-111111111111',
      allergenCode: 'gluten',
      riskLevel: 'high',
      mitigation: null,
    },
  ],
  mfgOpAdditions: [{ manufacturingOperationName: 'Baking', allergenCode: 'gluten', reason: 'Flour dust' }],
  // 2 lines × 2 allergens = 4 cells, 1 filled → 3 gaps.
  coverageGapCount: 3,
  canEdit: true,
  state: 'ready',
};

function renderConfig(overrides: Partial<React.ComponentProps<typeof AllergensConfig>> = {}) {
  return render(
    <AllergensConfig
      data={DATA}
      labels={LABELS}
      state="ready"
      canEdit
      saveRiskAction={vi.fn().mockResolvedValue({ ok: true })}
      removeRiskAction={vi.fn().mockResolvedValue({ ok: true })}
      {...overrides}
    />,
  );
}

describe('TEC-043 contamination matrix — grid parity (AC1)', () => {
  it('renders a line row × allergen column header set + legend', () => {
    renderConfig();
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
    // allergen column headers
    expect(screen.getAllByText('Gluten').length).toBeGreaterThan(0);
    expect(screen.getByTestId('risk-legend')).toBeInTheDocument();
    // a filled cell exists for (Line 1, gluten)
    expect(
      screen.getByTestId('risk-cell-11111111-1111-1111-1111-111111111111-gluten'),
    ).toBeInTheDocument();
  });

  it('renders the contamination matrix as a grid (no raw <select> — shadcn Select)', () => {
    const { container } = renderConfig();
    // No raw HTML <select> anywhere (red-line).
    expect(container.querySelector('select')).toBeNull();
    // Editable cells expose a shadcn combobox trigger.
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });
});

describe('TEC-043 coverage gaps (AC2) — never silently dropped', () => {
  it('shows the gap banner with the count + View gaps link', () => {
    renderConfig();
    const banner = screen.getByTestId('coverage-gap-banner');
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText(/3/)).toBeInTheDocument();
    expect(screen.getByTestId('coverage-gap-link')).toBeInTheDocument();
  });

  it('hides the banner only when there are zero gaps', () => {
    render(
      <AllergensConfig
        data={{ ...DATA, coverageGapCount: 0 }}
        labels={LABELS}
        state="ready"
        canEdit
        saveRiskAction={vi.fn()}
        removeRiskAction={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('coverage-gap-banner')).not.toBeInTheDocument();
  });
});

describe('TEC-042 process additions tab', () => {
  it('lists manufacturing-op allergen additions', () => {
    renderConfig();
    fireEvent.click(screen.getByTestId('tab-ops'));
    expect(screen.getByTestId('ops-panel')).toBeInTheDocument();
    expect(
      screen.getByTestId('mfgop-row-Baking-gluten'),
    ).toBeInTheDocument();
  });
});

describe('TEC-042/043 RBAC + five UI states (AC3)', () => {
  it('renders read-only (no combobox edit) without technical.allergens.edit', () => {
    renderConfig({ canEdit: false });
    expect(screen.getByTestId('allergens-config-readonly')).toBeInTheDocument();
    // No editable comboboxes when read-only.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('calls the save action when a risk cell is changed', () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    renderConfig({ saveRiskAction: save });
    // Open the (Line 2, gluten) cell combobox and select "high".
    const cell = screen.getByTestId('risk-cell-22222222-2222-2222-2222-222222222222-gluten');
    fireEvent.click(within(cell).getByRole('combobox'));
    fireEvent.click(within(cell).getByText(LABELS.riskLevel.high));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        lineId: '22222222-2222-2222-2222-222222222222',
        allergenCode: 'gluten',
        riskLevel: 'high',
      }),
    );
  });

  it('renders the loading state', () => {
    render(<AllergensConfig data={null} labels={LABELS} state="loading" canEdit />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(
      <AllergensConfig
        data={{ ...DATA, lines: [], operations: [], mfgOpAdditions: [], coverageGapCount: 0 }}
        labels={LABELS}
        state="ready"
        canEdit
        saveRiskAction={vi.fn()}
        removeRiskAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId('allergens-config-empty')).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<AllergensConfig data={null} labels={LABELS} state="error" canEdit />);
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('renders the permission-denied state', () => {
    render(<AllergensConfig data={null} labels={LABELS} state="permission_denied" canEdit={false} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });
});
