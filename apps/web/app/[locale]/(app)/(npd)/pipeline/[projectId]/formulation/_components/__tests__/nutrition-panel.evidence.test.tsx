/**
 * @vitest-environment jsdom
 * T-113 — NutritionPanel PARITY EVIDENCE capture.
 *
 * Writes per-state DOM snapshots to _meta/parity-evidence/T-113/<state>.html so the closeout has
 * structural-parity artifacts (the project convention; see _meta/parity-evidence/T-107/*).
 * Playwright route-level capture is owned by the wiring task T-117 / parity task T-118 (out of scope
 * here) — this is the RTL/DOM fallback documented in _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Prototype parity source: prototypes/design/Monopilot Design System/npd/recipe.jsx:26-65 (NutritionPanel).
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  NutritionPanel,
  type NutritionPanelLabels,
  type NutritionRow,
  type NutritionTargets,
} from '../nutrition-panel';

const OUT_DIR = resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/T-113');

const LABELS: NutritionPanelLabels = {
  title: 'Nutrition per 100g',
  liveNote: '· live',
  exportLabel: 'Export label',
  exportLabelComingSoon: 'Label export is not yet available',
  targetsNote: 'Targets: Protein ≥ {protein} · Salt ≤ {salt} · Fat ≤ {fat} per 100g',
  withinTarget: 'Within target',
  overTarget: 'Over target',
  overMax: 'Over max',
  energyLabel: 'Energy',
  fatLabel: 'Fat',
  saturatesLabel: 'Saturates',
  carbsLabel: 'Carbs',
  sugarsLabel: 'Sugars',
  proteinLabel: 'Protein',
  saltLabel: 'Salt',
  loading: 'Loading nutrition…',
  empty: 'No nutrition data yet',
  emptyBody: 'Nutrition is computed once ingredients have nutrition values.',
  error: 'Unable to load nutrition.',
  forbidden: 'You do not have permission to view nutrition.',
};

const TARGETS: NutritionTargets = {
  energy_kj: { target: '630', max: '750' },
  fat_g: { target: '8', max: '12' },
  saturates_g: { target: '3', max: '4' },
  carbs_g: { target: '2', max: '3' },
  sugars_g: { target: '1', max: '2' },
  protein_g: { target: '18', max: '25' },
  salt_g: { target: '2', max: '2.5' },
};

// Mixed traffic-light states: fat=amber (10>8≤12), salt=red (2.6>2.5), rest green.
function mixedRows(): NutritionRow[] {
  return [
    { nutrientCode: 'energy_kj', per100g: '510.00', unit: 'kJ' },
    { nutrientCode: 'fat_g', per100g: '10.00', unit: 'g' },
    { nutrientCode: 'saturates_g', per100g: '2.50', unit: 'g' },
    { nutrientCode: 'carbs_g', per100g: '1.80', unit: 'g' },
    { nutrientCode: 'sugars_g', per100g: '0.90', unit: 'g' },
    { nutrientCode: 'protein_g', per100g: '20.40', unit: 'g' },
    { nutrientCode: 'salt_g', per100g: '2.60', unit: 'g' },
  ];
}

function write(state: string, html: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${state}.html`), `<!-- T-113 NutritionPanel · state=${state} -->\n${html}\n`);
}

afterEach(() => cleanup());

describe('T-113 parity evidence — per-state DOM snapshots', () => {
  it('captures ready (7 rows, mixed traffic-light: green/amber/red)', () => {
    const { container } = render(
      <NutritionPanel nutrition={mixedRows()} targets={TARGETS} labels={LABELS} state="ready" />,
    );
    write('ready', container.innerHTML);
    expect(container.querySelector('[data-testid="nutrition-panel"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="nutrition-row"]')).toHaveLength(7);
  });

  it('captures loading', () => {
    const { container } = render(
      <NutritionPanel nutrition={[]} targets={TARGETS} labels={LABELS} state="loading" />,
    );
    write('loading', container.innerHTML);
    expect(container.querySelector('[data-testid="nutrition-panel-loading"]')).not.toBeNull();
  });

  it('captures empty', () => {
    const { container } = render(
      <NutritionPanel nutrition={[]} targets={TARGETS} labels={LABELS} state="ready" />,
    );
    write('empty', container.innerHTML);
    expect(container.querySelector('[data-testid="nutrition-panel-empty"]')).not.toBeNull();
  });

  it('captures error', () => {
    const { container } = render(
      <NutritionPanel nutrition={[]} targets={TARGETS} labels={LABELS} state="error" />,
    );
    write('error', container.innerHTML);
    expect(container.querySelector('[data-testid="nutrition-panel-error"]')).not.toBeNull();
  });

  it('captures permission-denied', () => {
    const { container } = render(
      <NutritionPanel nutrition={mixedRows()} targets={TARGETS} labels={LABELS} state="permission_denied" />,
    );
    write('permission-denied', container.innerHTML);
    expect(container.querySelector('[data-testid="nutrition-panel-forbidden"]')).not.toBeNull();
  });

  it('captures optimistic (reactive rerender on new nutrition prop)', () => {
    const { container, rerender } = render(
      <NutritionPanel nutrition={mixedRows()} targets={TARGETS} labels={LABELS} state="ready" />,
    );
    // Simulate the parent pushing a recomputed nutrition snapshot (fat drops to green).
    const next = mixedRows().map((r) => (r.nutrientCode === 'fat_g' ? { ...r, per100g: '6.00' } : r));
    rerender(<NutritionPanel nutrition={next} targets={TARGETS} labels={LABELS} state="ready" />);
    write('optimistic', container.innerHTML);
    const fatBar = container.querySelectorAll('[data-testid="nutrition-row"]')[1].querySelector('[role="progressbar"]');
    expect(fatBar?.getAttribute('data-status')).toBe('green');
  });
});
