/**
 * @vitest-environment jsdom
 *
 * LANE N1.5-G (C2) — NutritionScreen "Compute NutriScore" wiring.
 *
 * Behaviour contract:
 *   - the read-only empty state gains a primary "Compute NutriScore" CTA that is
 *     ONLY rendered when the user can write (computeAction injected) AND a
 *     formulation version exists — gating resolved server-side, mirrored here;
 *   - a "Recompute" affordance appears in the header when data already exists;
 *   - clicking either calls computeAction({ projectId, formulationVersionId }) and,
 *     on success, refreshes (the persisted nutri_score_results then re-render);
 *   - errors are surfaced inline (role="alert"), preferring the action's own
 *     message (e.g. ingredient nutrition data missing).
 *
 * i18n: every visible string comes from the injected labels.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NutritionScreen,
  type NutritionLabels,
  type NutritionScreenData,
} from '../nutrition-screen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

afterEach(() => cleanup());

const PROJECT_ID = 'c5cf521b-59f0-400f-8953-789cee335f1b';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

const LABELS: NutritionLabels = {
  title: 'Nutrition declaration (per 100g)',
  subtitle: 'Computed per-100g + per-portion values',
  exportCsv: 'Export CSV',
  generateLabel: 'Generate label PDF',
  generateLabelDisabledHint: 'Label PDF export is not yet available (deferred)',
  colNutrient: 'Nutrient',
  colPer100g: 'Per 100g',
  colPerPortion: 'Per portion',
  colStatus: 'Status',
  statusOk: 'OK',
  statusWarn: 'At limit',
  allergenTitle: 'Allergen declaration',
  allergenColAllergen: 'Allergen',
  allergenColSource: 'Source ingredient',
  allergenColPresence: 'Presence',
  presenceContains: 'Contains',
  presenceMayContain: 'May contain',
  presenceFreeFrom: 'Free from',
  presenceUnknown: 'Unknown',
  allergenEmpty: 'No allergens declared',
  nutriScoreTitle: 'Nutri-Score',
  nutriScoreGradeLabel: 'Nutri-Score grade {grade}',
  loading: 'Loading nutrition data…',
  empty: 'No nutrition data yet',
  emptyBody: 'Nutrition values are computed once the formulation is complete.',
  error: 'Unable to load nutrition data.',
  forbidden: 'You do not have permission to view nutrition data.',
  computeNutriScore: 'Compute NutriScore',
  recomputeNutriScore: 'Recompute NutriScore',
  computing: 'Computing…',
  computeError: 'Could not compute the NutriScore. Try again.',
  computeErrorNotFound: 'No formulation is available to compute from yet.',
};

const READY_DATA: NutritionScreenData = {
  productCode: 'PRD-1',
  rows: [
    { nutrientCode: 'energy_kj', label: 'Energy', unit: 'kJ', per100g: '1500', perPortion: '300', status: 'ok' },
  ],
  grade: 'B',
  allergens: [],
};

describe('C2 — Compute NutriScore (empty state)', () => {
  it('renders the Compute CTA in the empty state when write-gated and a version exists', () => {
    render(
      <NutritionScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
        computeAction={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByTestId('nutrition-compute')).toHaveTextContent(LABELS.computeNutriScore);
  });

  it('does NOT render the Compute CTA when no action is injected (read-only / no write permission)', () => {
    render(
      <NutritionScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
      />,
    );
    expect(screen.queryByTestId('nutrition-compute')).not.toBeInTheDocument();
  });

  it('does NOT render the Compute CTA when there is no formulation version to compute from', () => {
    render(
      <NutritionScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={null}
        computeAction={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.queryByTestId('nutrition-compute')).not.toBeInTheDocument();
  });

  it('calls computeAction with { projectId, formulationVersionId } and refreshes on success', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const onRefresh = vi.fn();
    render(
      <NutritionScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
        computeAction={compute}
        onRefresh={onRefresh}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('nutrition-compute'));
    });
    expect(compute).toHaveBeenCalledWith({ projectId: PROJECT_ID, formulationVersionId: VERSION_ID });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('surfaces the action message inline on error and does NOT refresh', async () => {
    const compute = vi.fn().mockResolvedValue({
      ok: false,
      error: 'not_found',
      message: 'ingredient nutrition data missing',
    });
    const onRefresh = vi.fn();
    render(
      <NutritionScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
        computeAction={compute}
        onRefresh={onRefresh}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('nutrition-compute'));
    });
    await waitFor(() => expect(screen.getByTestId('nutrition-compute-error')).toBeInTheDocument());
    expect(screen.getByTestId('nutrition-compute-error')).toHaveTextContent('ingredient nutrition data missing');
    expect(screen.getByTestId('nutrition-compute-error')).toHaveAttribute('role', 'alert');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('falls back to a localized code message when the action returns no message', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: false, error: 'not_found' });
    render(
      <NutritionScreen
        state="empty"
        data={null}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
        computeAction={compute}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('nutrition-compute'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('nutrition-compute-error')).toHaveTextContent(LABELS.computeErrorNotFound),
    );
  });
});

describe('C2 — Recompute affordance (ready state)', () => {
  it('shows a Recompute button in the header that calls the action when data already exists', async () => {
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const onRefresh = vi.fn();
    render(
      <NutritionScreen
        state="ready"
        data={READY_DATA}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
        computeAction={compute}
        onRefresh={onRefresh}
      />,
    );
    const btn = screen.getByTestId('nutrition-recompute');
    expect(btn).toHaveTextContent(LABELS.recomputeNutriScore);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(compute).toHaveBeenCalledWith({ projectId: PROJECT_ID, formulationVersionId: VERSION_ID });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('does not render the recompute affordance without a write-gated action', () => {
    render(
      <NutritionScreen
        state="ready"
        data={READY_DATA}
        labels={LABELS}
        projectId={PROJECT_ID}
        formulationVersionId={VERSION_ID}
      />,
    );
    expect(screen.queryByTestId('nutrition-recompute')).not.toBeInTheDocument();
  });
});
