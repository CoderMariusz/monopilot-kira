/**
 * @vitest-environment jsdom
 *
 * ValidationStatusPanel — reusable V01-V08 validation table (presentational).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:421-452
 *   (V01..V08 rows: mono id + title + status glyph; glyph map lines 433-436:
 *    pass ✓ green / fail ✗ red / warn ⚠ amber-700 / info ⓘ blue).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ValidationStatusPanel, type ValidationRule } from '../validation-status-panel';

afterEach(() => cleanup());

const RULES: ValidationRule[] = [
  { id: 'V01', title: 'FA Code format', status: 'pass' },
  { id: 'V02', title: 'Product Name required', status: 'fail' },
  { id: 'V03', title: 'Pack Size in reference', status: 'warn' },
  { id: 'V04', title: 'D365 material codes', status: 'info' },
  { id: 'V05', title: 'Dept required fields', status: 'pass' },
  { id: 'V06', title: 'PR Code suffix', status: 'info' },
  { id: 'V07', title: 'Allergen declaration', status: 'pass' },
  { id: 'V08', title: 'Brief mapping', status: 'info' },
];

describe('ValidationStatusPanel — parity (fa-screens.jsx:421-452)', () => {
  it('renders the card title + all 8 rows with the prototype anchor', () => {
    render(<ValidationStatusPanel title="Validation status" rules={RULES} />);
    const panel = screen.getByTestId('fa-validation-status-panel');
    expect(panel).toHaveAttribute('data-prototype-anchor', 'npd/fa-screens.jsx:421-452');
    expect(within(panel).getByText('Validation status')).toBeInTheDocument();
    for (const r of RULES) {
      expect(screen.getByTestId(`fa-validation-${r.id}`)).toBeInTheDocument();
    }
  });

  it('renders the mono id + title per row', () => {
    render(<ValidationStatusPanel title="Validation status" rules={RULES} />);
    const v01 = screen.getByTestId('fa-validation-V01');
    expect(within(v01).getByText('V01')).toBeInTheDocument();
    expect(within(v01).getByText('FA Code format')).toBeInTheDocument();
  });

  it('renders the correct glyph per status (pass ✓ / fail ✗ / warn ⚠ / info ⓘ)', () => {
    render(<ValidationStatusPanel title="Validation status" rules={RULES} />);
    expect(within(screen.getByTestId('fa-validation-V01')).getByText('✓')).toBeInTheDocument();
    expect(within(screen.getByTestId('fa-validation-V02')).getByText('✗')).toBeInTheDocument();
    expect(within(screen.getByTestId('fa-validation-V03')).getByText('⚠')).toBeInTheDocument();
    expect(within(screen.getByTestId('fa-validation-V04')).getByText('ⓘ')).toBeInTheDocument();
  });

  it('exposes an accessible "{id}: {status}" label on the glyph (not color-only)', () => {
    render(
      <ValidationStatusPanel
        title="Validation status"
        rules={RULES}
        statusLabels={{ pass: 'Pass', fail: 'Fail', warn: 'Warning', info: 'Info' }}
      />,
    );
    expect(within(screen.getByTestId('fa-validation-V01')).getByLabelText('V01: Pass')).toBeInTheDocument();
    expect(within(screen.getByTestId('fa-validation-V02')).getByLabelText('V02: Fail')).toBeInTheDocument();
  });

  it('uses design-system tokens for glyph colors (no raw hex)', () => {
    const { container } = render(<ValidationStatusPanel title="Validation status" rules={RULES} />);
    const html = container.innerHTML;
    expect(html).toContain('var(--green)');
    expect(html).toContain('var(--red)');
    expect(html).toContain('var(--amber-700)');
    expect(html).toContain('var(--blue)');
    expect(html).not.toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
  });

  it('passes through a localized title (i18n)', () => {
    render(<ValidationStatusPanel title="Status walidacji" rules={RULES} />);
    expect(screen.getByText('Status walidacji')).toBeInTheDocument();
  });
});
