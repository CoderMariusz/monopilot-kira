/**
 * @vitest-environment jsdom
 * T-040 — AllergenCascadeWidget component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *
 * Asserts:
 *  - Parity: the 3 cascade sections (RM/process-derived, override deltas, FA-final
 *    Contains + May-contain) — same Badge structure + source tooltip + Refresh button.
 *  - EU14 presence grid: all 14 mandatory allergens surface a present/absent state
 *    using TEXT + ICON (color is never the sole signal — a11y).
 *  - Override delta badges (added / removed) computed from derived vs published.
 *  - Manual-override marker on FA-final Contains badges (border-amber parity).
 *  - The five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: the component renders LABELS (message values), never inline English literals.
 *  - RBAC: the per-allergen Override control + Refresh are omitted when canWrite=false
 *    (server-resolved gate; never render-then-disable).
 *  - Refresh button invokes the (debounced) refresh action exactly once per click burst.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AllergenCascadeWidget,
  type AllergenCascadeData,
  type AllergenCascadeLabels,
} from '../allergen-cascade-widget';

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: AllergenCascadeLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  refresh: 'lbl.refresh',
  override: 'lbl.override',
  sectionDerived: 'lbl.sectionDerived',
  sectionDerivedSource: 'lbl.sectionDerivedSource',
  sectionDeltas: 'lbl.sectionDeltas',
  sectionFinal: 'lbl.sectionFinal',
  contains: 'lbl.contains',
  mayContain: 'lbl.mayContain',
  deltaAdded: 'lbl.deltaAdded',
  deltaRemoved: 'lbl.deltaRemoved',
  noDeltas: 'lbl.noDeltas',
  manual: 'lbl.manual',
  present: 'lbl.present',
  absent: 'lbl.absent',
  eu14Title: 'lbl.eu14Title',
  derivationNote: 'lbl.derivationNote',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
  refreshing: 'lbl.refreshing',
  sourceRm: 'lbl.sourceRm',
  sourceProcess: 'lbl.sourceProcess',
  sourceOverride: 'lbl.sourceOverride',
};

const DATA: AllergenCascadeData = {
  productCode: 'FG-001',
  derivedAllergens: ['gluten', 'milk'],
  publishedAllergens: ['gluten', 'soybeans'], // milk removed, soybeans added (overrides)
  mayContainAllergens: ['nuts'],
  conditionalProcessAllergens: ['nuts'],
};

describe('AllergenCascadeWidget — parity + states', () => {
  it('renders the 3 cascade sections + Refresh button + source tooltip (parity AC1)', () => {
    render(
      <AllergenCascadeWidget
        data={DATA}
        labels={LABELS}
        canWrite
        state="ready"
        refreshAction={vi.fn()}
      />,
    );

    // 3 sections.
    expect(screen.getByText(LABELS.sectionDerived)).toBeInTheDocument();
    expect(screen.getByText(LABELS.sectionDeltas)).toBeInTheDocument();
    // sectionFinal title is concatenated with the product code → substring match.
    const finalSection = screen.getByTestId('allergen-section-final');
    expect(finalSection).toHaveTextContent(LABELS.sectionFinal);
    expect(screen.getByText(LABELS.contains)).toBeInTheDocument();
    expect(screen.getByText(LABELS.mayContain)).toBeInTheDocument();

    // Refresh button present.
    expect(screen.getByRole('button', { name: LABELS.refresh })).toBeInTheDocument();

    // Source tooltip: each derived badge exposes its source via accessible text/title
    // (risk red-line: do not omit tooltip with allergen source).
    const derivedSection = screen.getByTestId('allergen-section-derived');
    const sourceCarriers = within(derivedSection).getAllByTestId(/allergen-source-/);
    expect(sourceCarriers.length).toBeGreaterThan(0);
    sourceCarriers.forEach((node) => {
      expect(node).toHaveAttribute('title');
      expect(node.getAttribute('title')?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it('renders the EU14 presence grid with text + icon (a11y: not color-alone)', () => {
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="ready" refreshAction={vi.fn()} />,
    );
    const grid = screen.getByTestId('allergen-eu14-grid');
    const cells = within(grid).getAllByTestId(/allergen-eu14-cell-/);
    // All 14 mandatory EU allergens are always shown (present + absent).
    expect(cells).toHaveLength(14);

    // gluten present in published → present state with present text label.
    const gluten = within(grid).getByTestId('allergen-eu14-cell-gluten');
    expect(gluten).toHaveAttribute('data-present', 'true');
    expect(within(gluten).getByText(LABELS.present)).toBeInTheDocument();

    // celery not present → absent state with absent text label.
    const celery = within(grid).getByTestId('allergen-eu14-cell-celery');
    expect(celery).toHaveAttribute('data-present', 'false');
    expect(within(celery).getByText(LABELS.absent)).toBeInTheDocument();
  });

  it('computes override delta badges (added / removed) from derived vs published', () => {
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="ready" refreshAction={vi.fn()} />,
    );
    const deltas = screen.getByTestId('allergen-section-deltas');
    // Section labels both visible.
    expect(within(deltas).getByText(LABELS.deltaAdded)).toBeInTheDocument();
    expect(within(deltas).getByText(LABELS.deltaRemoved)).toBeInTheDocument();
    // soybeans was added by override (in published, not in derived).
    expect(within(deltas).getByTestId('allergen-delta-added-soybeans')).toBeInTheDocument();
    // milk was removed by override (in derived, not in published).
    expect(within(deltas).getByTestId('allergen-delta-removed-milk')).toBeInTheDocument();
  });

  it('marks override-driven Contains badges as Manual (amber parity)', () => {
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="ready" refreshAction={vi.fn()} />,
    );
    const final = screen.getByTestId('allergen-section-final');
    // soybeans is published but not derived → manual override marker.
    const soy = within(final).getByTestId('allergen-final-contains-soybeans');
    expect(soy).toHaveAttribute('data-manual', 'true');
    // The Manual marker text is concatenated into the badge; assert via substring.
    expect(soy).toHaveTextContent(LABELS.manual);
    expect(soy).toHaveAttribute('aria-label', expect.stringContaining(LABELS.manual));
    // gluten is derived → not manual.
    const gluten = within(final).getByTestId('allergen-final-contains-gluten');
    expect(gluten).toHaveAttribute('data-manual', 'false');
  });

  it('omits Override + Refresh controls when canWrite=false (RBAC gate)', () => {
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite={false} state="ready" refreshAction={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: LABELS.refresh })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(LABELS.override) })).not.toBeInTheDocument();
  });

  it('renders all five required UI states', () => {
    const { rerender } = render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="loading" refreshAction={vi.fn()} />,
    );
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();

    rerender(
      <AllergenCascadeWidget data={null} labels={LABELS} canWrite state="empty" refreshAction={vi.fn()} />,
    );
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();

    rerender(
      <AllergenCascadeWidget data={null} labels={LABELS} canWrite state="error" refreshAction={vi.fn()} />,
    );
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();

    rerender(
      <AllergenCascadeWidget data={null} labels={LABELS} canWrite state="permission_denied" refreshAction={vi.fn()} />,
    );
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });

  it('invokes the refresh action when Refresh is clicked (debounced — once per burst)', async () => {
    const refreshAction = vi.fn().mockResolvedValue(undefined);
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="ready" refreshAction={refreshAction} />,
    );
    const btn = screen.getByRole('button', { name: LABELS.refresh });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(refreshAction).toHaveBeenCalledTimes(1));
    expect(refreshAction).toHaveBeenCalledWith('FG-001');
  });
});
