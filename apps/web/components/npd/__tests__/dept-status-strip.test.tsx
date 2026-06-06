/**
 * @vitest-environment jsdom
 *
 * DeptStatusStrip — reusable 7-dept gate-progress strip (presentational).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:365-385
 *   (7 dept circles, glyph per status, connector line between adjacent circles).
 *
 * The component is presentational only: it takes a plain, server-derived items
 * array. These tests assert the parity-critical render contract (glyphs, count,
 * a11y title, token-not-hex coloring) + an i18n-pass-through (inline labels).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DeptStatusStrip, type DeptStatusItem } from '../dept-status-strip';

afterEach(() => cleanup());

const ITEMS: DeptStatusItem[] = [
  { dept: 'core', label: 'Core', status: 'done', index: 1 },
  { dept: 'planning', label: 'Planning', status: 'inprog', index: 2 },
  { dept: 'commercial', label: 'Commercial', status: 'blocked', index: 3 },
  { dept: 'production', label: 'Production', status: 'pending', index: 4 },
  { dept: 'technical', label: 'Technical', status: 'pending', index: 5 },
  { dept: 'mrp', label: 'MRP', status: 'pending', index: 6 },
  { dept: 'procurement', label: 'Procurement', status: 'pending', index: 7 },
];

describe('DeptStatusStrip — parity (fa-screens.jsx:365-385)', () => {
  it('renders one circle per department (7) carrying the prototype anchor', () => {
    render(<DeptStatusStrip items={ITEMS} ariaLabel="Department gate progress" />);
    const strip = screen.getByTestId('fa-dept-status-strip');
    expect(strip).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:365-385');
    for (const item of ITEMS) {
      expect(screen.getByTestId(`fa-dept-status-${item.dept}`)).toBeInTheDocument();
    }
  });

  it('renders the correct glyph per status (done ✓ / inprog ◐ / blocked ⊘ / pending=index)', () => {
    render(<DeptStatusStrip items={ITEMS} />);
    expect(within(screen.getByTestId('fa-dept-status-core')).getByText('✓')).toBeInTheDocument();
    expect(within(screen.getByTestId('fa-dept-status-planning')).getByText('◐')).toBeInTheDocument();
    expect(within(screen.getByTestId('fa-dept-status-commercial')).getByText('⊘')).toBeInTheDocument();
    // pending circle shows its 1-based index
    expect(within(screen.getByTestId('fa-dept-status-production')).getByText('4')).toBeInTheDocument();
  });

  it('exposes an accessible "{dept}: {status}" label on every circle (not color-only)', () => {
    render(
      <DeptStatusStrip
        items={ITEMS}
        statusLabels={{ done: 'Done', inprog: 'In progress', blocked: 'Blocked', pending: 'Pending' }}
      />,
    );
    expect(screen.getByTestId('fa-dept-status-core')).toHaveAttribute('aria-label', 'Core: Done');
    expect(screen.getByTestId('fa-dept-status-commercial')).toHaveAttribute(
      'aria-label',
      'Commercial: Blocked',
    );
  });

  it('uses design-system tokens for status colors (no raw hex)', () => {
    const { container } = render(<DeptStatusStrip items={ITEMS} />);
    const html = container.innerHTML;
    expect(html).toContain('var(--green)');
    expect(html).toContain('var(--amber)');
    expect(html).toContain('var(--red)');
    expect(html).toContain('var(--gray-100)');
    expect(html).toContain('var(--border)');
    // no raw hex color literals leaked into the strip
    expect(html).not.toMatch(/background:\s*#[0-9a-fA-F]{3,6}/);
  });

  it('renders n-1 connectors for n circles', () => {
    const { container } = render(<DeptStatusStrip items={ITEMS} />);
    const connectors = container.querySelectorAll('[aria-hidden="true"][style*="height: 2px"]');
    expect(connectors.length).toBe(ITEMS.length - 1);
  });

  it('passes through localized labels (i18n)', () => {
    const pl: DeptStatusItem[] = [
      { dept: 'core', label: 'Rdzeń', status: 'done', index: 1 },
      { dept: 'planning', label: 'Planowanie', status: 'pending', index: 2 },
    ];
    render(<DeptStatusStrip items={pl} />);
    expect(screen.getByText('Rdzeń')).toBeInTheDocument();
    expect(screen.getByText('Planowanie')).toBeInTheDocument();
  });
});
