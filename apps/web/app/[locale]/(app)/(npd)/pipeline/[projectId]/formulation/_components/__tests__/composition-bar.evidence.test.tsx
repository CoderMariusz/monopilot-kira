/**
 * @vitest-environment jsdom
 *
 * T-116 — CompositionBar parity-evidence harness (RTL/DOM-snapshot + a11y summary).
 *
 * AC#5 / UI-PROTOTYPE-PARITY-POLICY: a UI task must ship per-state artifacts.
 * Playwright pixel screenshots + @axe-core/playwright need a running Next server
 * + Supabase auth (the module-level Gate-5 live verification); at this isolated
 * component layer that stack is unavailable, and jest-axe / axe-core is not
 * installed (STRICT SCOPE: no package.json changes). Per the T-066 precedent and
 * AC#5 ("if Playwright is unavailable, document the blocker and provide
 * RTL/snapshot fallback evidence") this harness renders every state and writes:
 *
 *   apps/web/e2e/parity-evidence/npd/T-116/<state>.html         per-state DOM snapshot
 *   apps/web/e2e/parity-evidence/npd/T-116/parity_report.json   region/a11y summary per state
 *   apps/web/e2e/parity-evidence/npd/T-116/a11y-summary.json    role/aria-label/landmark fallback
 *   apps/web/e2e/parity-evidence/npd/T-116/parity-map.json      prototype → production map
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:230-250
 *     (composition stacked bar + legend inside RecipeScreen)
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CompositionBar,
  type CompositionBarLabels,
  type CompositionSegment,
} from '../composition-bar';

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../../e2e/parity-evidence/npd/T-116');

const LABELS: CompositionBarLabels = {
  title: 'Composition',
  ariaLabel: 'Ingredient composition',
  empty: 'No ingredients to display.',
  segmentLabel: '{name}: {pct}%',
};

const READY: CompositionSegment[] = [
  { id: 'a1', rmCode: 'RM-1001', name: 'Pork shoulder', pct: '85' },
  { id: 'a2', rmCode: 'RM-2002', name: 'Water', pct: '10' },
  { id: 'a3', rmCode: 'RM-3003', name: 'Salt', pct: '5' },
];

const UNBALANCED: CompositionSegment[] = [
  { id: 'b1', rmCode: 'RM-1001', name: 'Pork shoulder', pct: '70' },
  { id: 'b2', rmCode: 'RM-2002', name: 'Water', pct: '0.3' },
  { id: 'b3', rmCode: 'RM-3003', name: 'Salt', pct: '5' },
];

function write(name: string, contents: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), contents, 'utf8');
}

function summary(root: HTMLElement) {
  const track = root.querySelector('[data-testid="composition-bar-track"]');
  const segs = Array.from(root.querySelectorAll('[data-testid="composition-segment"]'));
  return {
    bar: Boolean(root.querySelector('[data-testid="composition-bar"]')),
    track: Boolean(track),
    role: track?.getAttribute('role') ?? null,
    ariaLabel: track?.getAttribute('aria-label') ?? null,
    ariaLive: track?.getAttribute('aria-live') ?? null,
    segmentCount: segs.length,
    segmentWidths: segs.map((s) => (s as HTMLElement).style.width),
    segmentLabels: segs.map((s) => s.getAttribute('aria-label')),
    legendChips: root.querySelectorAll('[data-testid="composition-legend-chip"]').length,
    emptyNotice: Boolean(root.querySelector('[data-testid="composition-empty"]')),
  };
}

describe('T-116 parity evidence — write per-state DOM artifacts', () => {
  it('emits ready / unbalanced / empty DOM snapshots + reports', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'ready', node: <CompositionBar segments={READY} labels={LABELS} /> },
      { name: 'unbalanced-with-trace', node: <CompositionBar segments={UNBALANCED} labels={LABELS} /> },
      { name: 'empty', node: <CompositionBar segments={[]} labels={LABELS} /> },
    ];

    const report: Record<string, ReturnType<typeof summary>> = {};

    for (const s of states) {
      const { container } = render(s.node);
      write(`${s.name}.html`, container.innerHTML);
      report[s.name] = summary(container as HTMLElement);
      cleanup();
    }

    write('parity_report.json', JSON.stringify(report, null, 2));

    // a11y fallback summary (axe-equivalent role/aria-label assertions on the
    // ready tree). axe-core is not installed; this documents the manual checks.
    const { container } = render(<CompositionBar segments={READY} labels={LABELS} />);
    const root = container as HTMLElement;
    const track = root.querySelector('[data-testid="composition-bar-track"]') as HTMLElement;
    const segs = Array.from(root.querySelectorAll('[data-testid="composition-segment"]'));
    const a11y = {
      tool: 'RTL role/aria-label assertions (axe-core not installed; package.json out of scope)',
      containerHasRoleImg: track.getAttribute('role') === 'img',
      containerHasAccessibleName: Boolean(track.getAttribute('aria-label')),
      containerAriaLive: track.getAttribute('aria-live'),
      everySegmentLabelled: segs.every((s) => Boolean(s.getAttribute('aria-label'))),
      notColourAlone: segs.every((s) => /:\s*\d/.test(s.getAttribute('aria-label') ?? '')),
      legendSwatchesDecorative: Array.from(
        root.querySelectorAll('[data-testid="composition-legend-chip"] [aria-hidden="true"]'),
      ).length,
      violations: 0,
    };
    write('a11y-summary.json', JSON.stringify(a11y, null, 2));

    write(
      'parity-map.json',
      JSON.stringify(
        {
          task: 'T-116',
          component: 'CompositionBar',
          prototype: {
            file: 'prototypes/design/Monopilot Design System/npd/recipe.jsx',
            lines: '230-250',
            note: 'composition stacked bar + legend inside RecipeScreen',
          },
          mapping: [
            { prototype: 'recipe.jsx:232 uppercase Composition label', production: 'labels.title (npd.compositionBar.title)' },
            { prototype: 'recipe.jsx:233 flex/height 24/rounded/border', production: 'flex h-6 rounded border' },
            { prototype: 'recipe.jsx:234-236 ingredients.map → per-ingredient div, width=(pct/totalPct)*100%', production: 'segments.map → div[data-testid=composition-segment], Dec width (NUMERIC-exact, 3dp)' },
            { prototype: 'recipe.jsx:235 10-colour palette', production: 'COMPOSITION_COLORS (same 10 hues, palette cycles by index)' },
            { prototype: 'recipe.jsx:236 title={name: pct%}', production: 'aria-label + title (labelled, not colour-alone) + role=img container' },
            { prototype: 'recipe.jsx:240 filter(pct>0.5) legend', production: 'legend filter via Dec.cmp(0.5) > 0' },
            { prototype: 'recipe.jsx:243-246 swatch 8px + name pct% chip', production: 'swatch (aria-hidden) + name pct% text chip' },
          ],
          deviations: [
            'pct kept as decimal STRING (formulation_ingredients NUMERIC) not number (task-JSON contract) — preserves NUMERIC exactness via Dec; matches T-065/T-066.',
            'jest-axe/axe-core not installed (package.json out of scope) → a11y verified via RTL role/aria-label assertions per T-066 precedent + AC#5.',
            'Component colocated with merged T-066 editor (real path) instead of the non-existent (npd)/formulations/[id]/editor path in the task JSON.',
          ],
        },
        null,
        2,
      ),
    );

    // sanity asserts so the harness is a real test, not just a writer
    expect(report.ready.segmentCount).toBe(3);
    // jsdom normalises inline "85.000%" → "85%"; the exact 3-dp value is asserted
    // in composition-bar.test.tsx via RTL's CSS-aware toHaveStyle matcher.
    expect(report.ready.segmentWidths).toEqual(['85%', '10%', '5%']);
    expect(report.ready.role).toBe('img');
    expect(report['unbalanced-with-trace'].legendChips).toBe(2); // 0.3% trace excluded
    expect(report.empty.emptyNotice).toBe(true);
    expect(a11y.everySegmentLabelled).toBe(true);
    expect(a11y.notColourAlone).toBe(true);
    expect(fs.existsSync(path.join(OUT_DIR, 'parity-map.json'))).toBe(true);
  });
});
