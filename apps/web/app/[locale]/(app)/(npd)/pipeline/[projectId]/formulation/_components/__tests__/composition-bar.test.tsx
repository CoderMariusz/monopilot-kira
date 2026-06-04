/**
 * @vitest-environment jsdom
 *
 * T-116 — CompositionBar (RED → GREEN).
 *
 * Standalone slice extracted from the inline composition strip of RecipeScreen.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:230-250
 *     (composition stacked bar + legend inside RecipeScreen)
 *
 * a11y note: AC#3 asks for a jest-axe (0 violations) assertion, but neither
 * `jest-axe` nor `axe-core` is installed in this workspace and adding a dep is
 * out of scope for this task (STRICT SCOPE: never touch package.json). Per the
 * T-066 precedent and AC#5 ("if Playwright is unavailable … provide RTL/snapshot
 * fallback evidence"), a11y is asserted here with real RTL role/aria-label
 * attribute checks (segments labelled, not colour-alone; role='img' container;
 * aria-live region). See deviation log in the component header.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CompositionBar,
  type CompositionBarLabels,
  type CompositionSegment,
} from '../composition-bar';

afterEach(() => cleanup());

const LABELS: CompositionBarLabels = {
  title: 'Composition',
  ariaLabel: 'Ingredient composition',
  empty: 'No ingredients to display.',
  segmentLabel: '{name}: {pct}%',
};

const SEGMENTS: CompositionSegment[] = [
  { id: 'a1', rmCode: 'RM-1001', name: 'Pork shoulder', pct: '85' },
  { id: 'a2', rmCode: 'RM-2002', name: 'Water', pct: '10' },
  { id: 'a3', rmCode: 'RM-3003', name: 'Salt', pct: '5' },
];

function renderBar(segments: CompositionSegment[] = SEGMENTS) {
  return render(<CompositionBar segments={segments} labels={LABELS} />);
}

describe('T-116 CompositionBar — parity + states + a11y', () => {
  // AC#1 — segment widths match pct/totalPct ratios
  it('renders one bar segment per ingredient with width = pct/totalPct %', () => {
    renderBar();
    const bar = screen.getByTestId('composition-bar-track');
    const segments = within(bar).getAllByTestId('composition-segment');
    expect(segments).toHaveLength(3);
    // total = 100 → widths are exactly the pct values.
    expect(segments[0]).toHaveStyle({ width: '85.000%' });
    expect(segments[1]).toHaveStyle({ width: '10.000%' });
    expect(segments[2]).toHaveStyle({ width: '5.000%' });
  });

  // AC#1 — exact ratio when total != 100 (NUMERIC-exact, no float drift)
  it('divides by totalPct (not 100) and stays float-drift-free', () => {
    render(
      <CompositionBar
        labels={LABELS}
        segments={[
          { id: 'x', rmCode: 'RM-X', name: 'A', pct: '0.1' },
          { id: 'y', rmCode: 'RM-Y', name: 'B', pct: '0.2' },
        ]}
      />,
    );
    const bar = screen.getByTestId('composition-bar-track');
    const segments = within(bar).getAllByTestId('composition-segment');
    // total = 0.3 → 0.1/0.3 = 33.333%, 0.2/0.3 = 66.667% (half-up, no 0.1+0.2 drift)
    expect(segments[0]).toHaveStyle({ width: '33.333%' });
    expect(segments[1]).toHaveStyle({ width: '66.667%' });
  });

  // AC#1 — palette cycles through the 10-colour palette
  it('cycles colours through the 10-colour palette by index', () => {
    const eleven: CompositionSegment[] = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      rmCode: `RM-${i}`,
      name: `Ing ${i}`,
      pct: '9.0909090909',
    }));
    render(<CompositionBar segments={eleven} labels={LABELS} />);
    const segs = within(screen.getByTestId('composition-bar-track')).getAllByTestId('composition-segment');
    // index 10 wraps back to index 0's palette class.
    expect(segs[10].className).toBe(segs[0].className);
    expect(segs[10].className).not.toBe(segs[1].className);
  });

  // AC#1 — explicit categoryColor overrides the palette fallback
  it('uses categoryColor as inline background when provided', () => {
    render(
      <CompositionBar
        labels={LABELS}
        segments={[{ id: 'c', rmCode: 'RM-C', name: 'Custom', pct: '100', categoryColor: '#123456' }]}
      />,
    );
    const seg = within(screen.getByTestId('composition-bar-track')).getByTestId('composition-segment');
    expect(seg).toHaveStyle({ backgroundColor: '#123456' });
  });

  // AC#3 — each segment has aria-label '{name}: {pct}%'; container role='img'
  it('labels each segment and exposes role=img on the container (not colour-alone)', () => {
    renderBar();
    const container = screen.getByRole('img', { name: 'Ingredient composition' });
    expect(container).toBeInTheDocument();
    expect(screen.getByLabelText('Pork shoulder: 85%')).toBeInTheDocument();
    expect(screen.getByLabelText('Water: 10%')).toBeInTheDocument();
    expect(screen.getByLabelText('Salt: 5%')).toBeInTheDocument();
  });

  // AC#3 — aria-live polite region on the bar so updates are announced
  it('marks the track as an aria-live polite region', () => {
    renderBar();
    expect(screen.getByTestId('composition-bar-track')).toHaveAttribute('aria-live', 'polite');
  });

  // AC#4 — legend shows only segments with pct > 0.5, with swatch + 'name pct%'
  it('renders a legend chip (swatch + name pct%) only for segments with pct > 0.5', () => {
    render(
      <CompositionBar
        labels={LABELS}
        segments={[
          { id: 'big', rmCode: 'RM-1', name: 'Major', pct: '94.6' },
          { id: 'mid', rmCode: 'RM-2', name: 'Minor', pct: '5' },
          { id: 'trace', rmCode: 'RM-3', name: 'Trace', pct: '0.4' },
          { id: 'edge', rmCode: 'RM-4', name: 'Edge', pct: '0.5' },
        ]}
      />,
    );
    const legend = screen.getByTestId('composition-legend');
    const chips = within(legend).getAllByTestId('composition-legend-chip');
    expect(chips).toHaveLength(2); // Major + Minor; Trace (0.4) and Edge (0.5) excluded
    expect(within(legend).getByText('Major 94.6%')).toBeInTheDocument();
    expect(within(legend).getByText('Minor 5%')).toBeInTheDocument();
    expect(within(legend).queryByText(/Trace/)).not.toBeInTheDocument();
    expect(within(legend).queryByText(/Edge/)).not.toBeInTheDocument();
    // swatch is decorative (aria-hidden) — label lives on the segment/text
    const swatch = chips[0].querySelector('[aria-hidden="true"]');
    expect(swatch).toBeInTheDocument();
  });

  // AC#4 — legend swatch colour matches its segment colour (shared index/source)
  it('matches legend swatch colour to the corresponding bar segment colour', () => {
    renderBar();
    const segs = within(screen.getByTestId('composition-bar-track')).getAllByTestId('composition-segment');
    const chips = within(screen.getByTestId('composition-legend')).getAllByTestId('composition-legend-chip');
    const swatch0 = chips[0].querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(swatch0.className).toContain(segs[0].className.split(' ').find((c) => c.startsWith('bg-')) ?? '');
  });

  // AC#2 — reactive rerender updates widths + legend
  it('updates segment widths and legend when the segments prop changes', () => {
    const { rerender } = renderBar();
    let segs = within(screen.getByTestId('composition-bar-track')).getAllByTestId('composition-segment');
    expect(segs[0]).toHaveStyle({ width: '85.000%' });

    rerender(
      <CompositionBar
        labels={LABELS}
        segments={[
          { id: 'a1', rmCode: 'RM-1001', name: 'Pork shoulder', pct: '50' },
          { id: 'a2', rmCode: 'RM-2002', name: 'Water', pct: '50' },
        ]}
      />,
    );
    segs = within(screen.getByTestId('composition-bar-track')).getAllByTestId('composition-segment');
    expect(segs).toHaveLength(2);
    expect(segs[0]).toHaveStyle({ width: '50.000%' });
    expect(screen.getByText('Pork shoulder 50%')).toBeInTheDocument();
    expect(screen.queryByText('Salt 5%')).not.toBeInTheDocument();
  });

  // empty state
  it('renders an empty notice when there are no segments', () => {
    render(<CompositionBar segments={[]} labels={LABELS} />);
    expect(screen.getByText('No ingredients to display.')).toBeInTheDocument();
    expect(screen.queryByTestId('composition-bar-track')).not.toBeInTheDocument();
  });

  // empty state — all-zero pct (total 0) is treated as empty (no divide-by-zero)
  it('treats an all-zero composition as empty (no divide-by-zero)', () => {
    render(
      <CompositionBar
        labels={LABELS}
        segments={[
          { id: 'z1', rmCode: 'RM-1', name: 'A', pct: '0' },
          { id: 'z2', rmCode: 'RM-2', name: 'B', pct: '0' },
        ]}
      />,
    );
    expect(screen.getByText('No ingredients to display.')).toBeInTheDocument();
    expect(screen.queryByTestId('composition-bar-track')).not.toBeInTheDocument();
  });

  // robustness — ignores non-decimal pct strings (mid-typing) without throwing
  it('ignores non-decimal pct values without throwing', () => {
    expect(() =>
      render(
        <CompositionBar
          labels={LABELS}
          segments={[
            { id: 'g', rmCode: 'RM-1', name: 'Good', pct: '100' },
            { id: 'b', rmCode: 'RM-2', name: 'Bad', pct: 'abc' },
          ]}
        />,
      ),
    ).not.toThrow();
    const segs = within(screen.getByTestId('composition-bar-track')).getAllByTestId('composition-segment');
    // only the valid decimal row renders a segment
    expect(segs).toHaveLength(1);
    expect(segs[0]).toHaveStyle({ width: '100.000%' });
  });

  // title label rendered
  it('renders the localized section title', () => {
    renderBar();
    expect(screen.getByText('Composition')).toBeInTheDocument();
  });
});
