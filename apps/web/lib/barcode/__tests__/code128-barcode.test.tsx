import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Code128Barcode } from '../code128-barcode';

describe('Code128Barcode', () => {
  it('renders an SVG barcode without error for a valid SSCC', () => {
    render(
      <Code128Barcode
        data-testid="sscc-barcode"
        value="050123450000000428"
        field="sscc"
        symbology="GS1-128"
      />,
    );

    const svg = screen.getByTestId('sscc-barcode');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(20);
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('(00)'));
  });

  it('renders a GTIN barcode for ean13 symbology', () => {
    render(
      <Code128Barcode
        data-testid="gtin-barcode"
        value="00614141123452"
        field="ean"
        symbology="ean13"
      />,
    );

    const svg = screen.getByTestId('gtin-barcode');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('(01)'));
  });
});
