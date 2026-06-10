/**
 * Analytics/Waste chart primitives RTL — the shared Sparkline (mirrors the cost-history
 * SVG pattern; other-screens.jsx:436-449) + ParetoBars (other-screens.jsx:150-162,
 * new-screens.jsx:74-87). Asserts fixture data renders without a chart library and that
 * empty data degrades gracefully (no throw, baseline render).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline, type SparklinePoint } from '../_components/sparkline';
import { ParetoBars, type ParetoBar } from '../_components/pareto-bars';

describe('Sparkline (parity: cost-history SVG pattern)', () => {
  it('renders an inline SVG with one dot per data point', () => {
    const points: SparklinePoint[] = [
      { value: 70 },
      { value: 78 },
      { value: 85 },
    ];
    const { container } = render(<Sparkline points={points} ariaLabel="OEE trend" />);
    const svg = screen.getByTestId('production-sparkline');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'OEE trend');
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    // No external chart library — a plain SVG with line segments + dots.
    expect(container.querySelectorAll('line')).toHaveLength(2);
  });

  it('EMPTY data: renders the SVG without throwing (no points)', () => {
    const { container } = render(<Sparkline points={[]} ariaLabel="OEE trend" />);
    expect(screen.getByTestId('production-sparkline')).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });
});

describe('ParetoBars (parity: pareto-bar rows)', () => {
  it('renders one bar per row with its value + count labels', () => {
    const bars: ParetoBar[] = [
      { key: 'a', label: 'Breakdown', value: 312, valueLabel: '312 min', countLabel: '4 ev', tone: 'plant' },
      { key: 'b', label: 'Changeover', value: 120, valueLabel: '120 min', countLabel: '2 ev', tone: 'process' },
    ];
    render(<ParetoBars bars={bars} testid="pareto" />);
    const root = screen.getByTestId('pareto');
    expect(within(root).getByText('Breakdown')).toBeInTheDocument();
    expect(within(root).getByText('312 min')).toBeInTheDocument();
    expect(within(root).getByText('4 ev')).toBeInTheDocument();
  });
});
