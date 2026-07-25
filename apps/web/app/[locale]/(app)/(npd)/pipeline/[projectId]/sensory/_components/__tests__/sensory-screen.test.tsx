/**
 * @vitest-environment jsdom
 * Fala-3 — SensoryScreen (sensory_screen prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:259-350 (SensoryScreen)
 *
 * RED → GREEN: asserts the parity checklist (header + "N panelists · blind
 * tasting · date" subtitle + Export scores; the LEFT radar SVG; the RIGHT
 * attribute table ATTRIBUTE / SCORE /10 bar+number / vs benchmark ±, with low
 * scores rendered amber/red; the highlighted Overall "✓ Above benchmark" summary
 * row; the Panelist comments list), the five required UI states (loading / empty
 * / ready / error / permission-denied), READ-ONLY (no write affordance / no
 * mutation), and that visible strings come from the injected i18n labels (no
 * default leak). Renders from REAL-SHAPED props (decimal STRING scores).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SensoryScreen,
  benchmarkVerdict,
  buildSensoryCsv,
  type SensoryLabels,
  type SensoryScreenData,
} from '../sensory-screen';

afterEach(() => cleanup());

const LABELS: SensoryLabels = {
  title: 'Sensory panel',
  subtitle: '{count} panelists · blind tasting · {date}',
  exportScores: 'Export scores',
  colAttribute: 'Attribute',
  colScore: 'Score /10',
  colVsBenchmark: 'vs benchmark',
  overall: 'Overall',
  aboveBenchmark: '✓ Above benchmark ({delta})',
  belowBenchmark: 'Below benchmark ({delta})',
  onBenchmark: 'On benchmark ({delta})',
  commentsTitle: 'Panelist comments',
  loading: 'Loading sensory panel…',
  empty: 'No sensory panel recorded for this product yet',
  emptyBody: 'Sensory evaluation is owned by Technical and will appear here once a panel is recorded.',
  error: 'Unable to load the sensory panel.',
  forbidden: 'You do not have permission to view the sensory panel.',
};

// Real-shaped props: every score/benchmark is a decimal STRING (NUMERIC), never
// a JS float — mirrors what getSensoryPanel emits (::text casts).
const DATA: SensoryScreenData = {
  panelId: 'panel-1',
  productCode: 'FA1001',
  productName: 'Sliced Ham 200g',
  panelDate: '2025-12-11',
  panelistCount: 8,
  benchmarkProductCode: 'BENCH-HAM',
  overallScore: '7.60',
  status: 'pass',
  attributes: [
    { attributeName: 'Aroma', scoreOutOf10: '8.10', vsBenchmark: '0.90', displayOrder: 1 },
    { attributeName: 'Flavour', scoreOutOf10: '7.80', vsBenchmark: '0.60', displayOrder: 2 },
    { attributeName: 'Texture', scoreOutOf10: '6.40', vsBenchmark: '-0.80', displayOrder: 3 },
    { attributeName: 'Saltiness', scoreOutOf10: '5.20', vsBenchmark: '-2.00', displayOrder: 4 },
  ],
  comments: [
    { panelistCode: 'P-03', comment: 'Clean ham flavor, slightly salty but well-balanced.', displayOrder: 1 },
    { panelistCode: 'P-05', comment: 'Texture is firmer than the current market benchmark — positive.', displayOrder: 2 },
  ],
};

function renderReady(extra?: Partial<React.ComponentProps<typeof SensoryScreen>>) {
  return render(<SensoryScreen state="ready" data={DATA} labels={LABELS} {...extra} />);
}

describe('SensoryScreen — parity', () => {
  it('renders the header title, product, panelist/date subtitle and Export scores', () => {
    renderReady();
    expect(screen.getByText('Sensory panel — Sliced Ham 200g')).toBeInTheDocument();
    expect(screen.getByTestId('sensory-subtitle')).toHaveTextContent(
      '8 panelists · blind tasting · 2025-12-11',
    );
    expect(screen.getByTestId('sensory-export')).toHaveTextContent(LABELS.exportScores);
  });

  it('renders the LEFT radar SVG with one scored polygon', () => {
    renderReady();
    expect(screen.getByTestId('sensory-radar')).toBeInTheDocument();
    expect(screen.getByTestId('sensory-radar-polygon')).toBeInTheDocument();
  });

  it('renders the attribute table with score bars and vs-benchmark deltas', () => {
    renderReady();
    const table = screen.getByTestId('sensory-attr-table');
    const rows = within(table).getAllByTestId('sensory-attr-row');
    expect(rows).toHaveLength(4);
    const names = rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual(['Aroma', 'Flavour', 'Texture', 'Saltiness']);

    // Each row has a score bar.
    expect(within(table).getAllByTestId('sensory-score-bar')).toHaveLength(4);
  });

  it('colours low scores amber and very-low scores red (good=green)', () => {
    renderReady();
    const rows = screen.getAllByTestId('sensory-attr-row');
    // Aroma 8.10 -> good; Flavour 7.80 -> good; Texture 6.40 -> low; Saltiness 5.20 -> bad
    expect(rows[0]).toHaveAttribute('data-tone', 'good');
    expect(rows[1]).toHaveAttribute('data-tone', 'good');
    expect(rows[2]).toHaveAttribute('data-tone', 'low');
    expect(rows[3]).toHaveAttribute('data-tone', 'bad');
    expect(within(rows[2]!).getByTestId('sensory-score-bar')).toHaveAttribute('data-tone', 'low');
  });

  it('shows the highlighted Overall summary row with "✓ Above benchmark"', () => {
    renderReady({
      data: {
        ...DATA,
        attributes: DATA.attributes.map((a) => ({ ...a, vsBenchmark: '0.10' })),
      },
    });
    const overall = screen.getByTestId('sensory-overall-row');
    expect(within(overall).getByText(LABELS.overall)).toBeInTheDocument();
    expect(within(overall).getByText('7.6 / 10')).toBeInTheDocument();
    expect(screen.getByTestId('sensory-above-benchmark')).toHaveTextContent('✓ Above benchmark (+0.10)');
  });

  it('renders the Panelist comments list with bold codes and quotes', () => {
    renderReady();
    expect(screen.getByText(LABELS.commentsTitle)).toBeInTheDocument();
    const comments = screen.getAllByTestId('sensory-comment');
    expect(comments).toHaveLength(2);
    expect(comments[0]).toHaveTextContent('P-03:');
    expect(comments[0]).toHaveTextContent('Clean ham flavor, slightly salty but well-balanced.');
  });

  it('is READ-ONLY: renders no form inputs, sliders, or submit controls', () => {
    const { container } = renderReady();
    // Export is the only button, and it is not a write affordance.
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('[type="range"]')).toHaveLength(0);
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);
  });

  it('renders no benchmark verdict at all when there is no benchmark product', () => {
    renderReady({
      data: {
        ...DATA,
        benchmarkProductCode: null,
        attributes: DATA.attributes.map((a) => ({ ...a, vsBenchmark: null })),
      },
    });
    expect(screen.queryByTestId('sensory-above-benchmark')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sensory-below-benchmark')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sensory-on-benchmark')).not.toBeInTheDocument();
  });

  it('renders no benchmark verdict when a benchmark product exists but all deltas are unset', () => {
    renderReady({
      data: {
        ...DATA,
        benchmarkProductCode: 'BENCH-HAM',
        attributes: DATA.attributes.map((a) => ({ ...a, vsBenchmark: null })),
      },
    });
    expect(screen.queryByTestId('sensory-above-benchmark')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sensory-below-benchmark')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sensory-on-benchmark')).not.toBeInTheDocument();
  });
});

/**
 * PF-R04-13 — the aggregate benchmark verdict.
 *
 * Production panel: attribute scores 8, 7, 9, 6, 7, 7 (overall 7.33) against
 * benchmark deltas +1, 0, +2, −1, 0, +1 (mean +0.5, i.e. ABOVE benchmark). The
 * screen read "Below benchmark (7.3)": one negative attribute inverted the whole
 * verdict, and the parenthetical was the product's OWN score, which the sentence
 * never claimed to be showing.
 */
const PROD_PANEL: SensoryScreenData = {
  ...DATA,
  overallScore: '7.33',
  benchmarkProductCode: 'BENCH-HAM',
  attributes: [
    { attributeName: 'Aroma', scoreOutOf10: '8.00', vsBenchmark: '1.00', displayOrder: 1 },
    { attributeName: 'Flavour', scoreOutOf10: '7.00', vsBenchmark: '0.00', displayOrder: 2 },
    { attributeName: 'Texture', scoreOutOf10: '9.00', vsBenchmark: '2.00', displayOrder: 3 },
    { attributeName: 'Saltiness', scoreOutOf10: '6.00', vsBenchmark: '-1.00', displayOrder: 4 },
    { attributeName: 'Colour', scoreOutOf10: '7.00', vsBenchmark: '0.00', displayOrder: 5 },
    { attributeName: 'Aftertaste', scoreOutOf10: '7.00', vsBenchmark: '1.00', displayOrder: 6 },
  ],
};

describe('SensoryScreen — benchmark verdict semantics (PF-R04-13)', () => {
  it('reads ABOVE benchmark for deltas +1,0,+2,-1,0,+1 (one negative must not invert the aggregate)', () => {
    render(<SensoryScreen state="ready" data={PROD_PANEL} labels={LABELS} />);
    expect(screen.getByTestId('sensory-above-benchmark')).toBeInTheDocument();
    expect(screen.queryByTestId('sensory-below-benchmark')).not.toBeInTheDocument();
  });

  it('interpolates the aggregate DELTA, never the overall score', () => {
    render(<SensoryScreen state="ready" data={PROD_PANEL} labels={LABELS} />);
    const badge = screen.getByTestId('sensory-above-benchmark');
    expect(badge).toHaveTextContent('✓ Above benchmark (+0.50)');
    // 7.3 is the product's own score — it must not appear in a benchmark claim.
    expect(badge.textContent).not.toContain('7.3');
  });

  it('reads ON benchmark when every attribute is exactly level with the benchmark', () => {
    render(
      <SensoryScreen
        state="ready"
        data={{ ...PROD_PANEL, attributes: PROD_PANEL.attributes.map((a) => ({ ...a, vsBenchmark: '0.00' })) }}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId('sensory-on-benchmark')).toHaveTextContent('On benchmark (0.00)');
    expect(screen.queryByTestId('sensory-above-benchmark')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sensory-below-benchmark')).not.toBeInTheDocument();
  });

  it('reads BELOW benchmark with the signed aggregate delta when the mean is negative', () => {
    render(
      <SensoryScreen
        state="ready"
        data={{
          ...PROD_PANEL,
          attributes: PROD_PANEL.attributes.map((a) => ({ ...a, vsBenchmark: '-0.25' })),
        }}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId('sensory-below-benchmark')).toHaveTextContent('Below benchmark (-0.25)');
  });

  it('surfaces an individually below-benchmark attribute per-row while the aggregate stays above', () => {
    render(<SensoryScreen state="ready" data={PROD_PANEL} labels={LABELS} />);
    const cells = screen.getAllByTestId('sensory-vs-benchmark');
    expect(cells.map((c) => c.getAttribute('data-delta'))).toEqual([
      'above',
      'on',
      'above',
      'below',
      'on',
      'above',
    ]);
    expect(screen.getByTestId('sensory-above-benchmark')).toBeInTheDocument();
  });

  it('benchmarkVerdict is exact decimal-string math with honest no-benchmark handling', () => {
    expect(benchmarkVerdict(PROD_PANEL)).toEqual({ direction: 'above', delta: '+0.50' });
    // No benchmark product → there is no above/below claim to make.
    expect(benchmarkVerdict({ ...PROD_PANEL, benchmarkProductCode: null })).toBeNull();
    // Benchmark product, but nothing was scored against it.
    expect(
      benchmarkVerdict({
        benchmarkProductCode: 'BENCH-HAM',
        attributes: PROD_PANEL.attributes.map((a) => ({ ...a, vsBenchmark: null })),
      }),
    ).toBeNull();
    // Attributes without a delta are excluded from the mean, not counted as 0.
    expect(
      benchmarkVerdict({
        benchmarkProductCode: 'BENCH-HAM',
        attributes: [
          { attributeName: 'A', scoreOutOf10: '8.00', vsBenchmark: '0.30', displayOrder: 1 },
          { attributeName: 'B', scoreOutOf10: '8.00', vsBenchmark: null, displayOrder: 2 },
        ],
      }),
    ).toEqual({ direction: 'above', delta: '+0.30' });
    // -0.10 / +0.10 cancel exactly → level, never "below".
    expect(
      benchmarkVerdict({
        benchmarkProductCode: 'BENCH-HAM',
        attributes: [
          { attributeName: 'A', scoreOutOf10: '8.00', vsBenchmark: '-0.10', displayOrder: 1 },
          { attributeName: 'B', scoreOutOf10: '8.00', vsBenchmark: '0.10', displayOrder: 2 },
        ],
      }),
    ).toEqual({ direction: 'on', delta: '0.00' });
  });
});

describe('SensoryScreen — UI states', () => {
  it('loading shows the loading copy', () => {
    render(<SensoryScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty shows the "No sensory panel recorded for this product yet" copy', () => {
    render(<SensoryScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByTestId('sensory-empty')).toBeInTheDocument();
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('error shows the error copy', () => {
    render(<SensoryScreen state="error" data={null} labels={LABELS} />);
    expect(screen.getByTestId('sensory-error')).toBeInTheDocument();
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('permission_denied hides the panel and shows the forbidden copy', () => {
    render(<SensoryScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByTestId('sensory-forbidden')).toBeInTheDocument();
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
    expect(screen.queryByTestId('sensory-attr-table')).not.toBeInTheDocument();
  });

  it('visible strings come from injected i18n labels (no default leak)', () => {
    const custom: SensoryLabels = { ...LABELS, title: 'PANEL_SENSORYCZNY', commentsTitle: 'KOMENTARZE' };
    render(<SensoryScreen state="ready" data={DATA} labels={custom} />);
    expect(screen.getByText('PANEL_SENSORYCZNY — Sliced Ham 200g')).toBeInTheDocument();
    expect(screen.getByText('KOMENTARZE')).toBeInTheDocument();
  });
});

describe('SensoryScreen — Export scores (LANE 14)', () => {
  it('builds a CSV with verbatim NUMERIC strings + an Overall row', () => {
    expect(buildSensoryCsv(DATA, LABELS)).toBe(
      [
        'Attribute,Score /10,vs benchmark',
        'Aroma,8.10,0.90',
        'Flavour,7.80,0.60',
        'Texture,6.40,-0.80',
        'Saltiness,5.20,-2.00',
        'Overall,7.60,',
      ].join('\r\n'),
    );
  });

  it('enables Export with data and downloads sensory-<code>.csv on click', () => {
    const createObjectURL = vi.fn(() => 'blob:scores');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    renderReady();
    const btn = screen.getByTestId('sensory-export');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['sensory-FA1001.csv']);
    vi.restoreAllMocks();
  });
});
