/**
 * T-029 — Summary primitive — RED-phase tests
 *
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/settings/modals.jsx:111-138
 *   (SchemaViewModal → <Summary rows={[...]} />)
 *
 * Summary.tsx does NOT yet exist — all tests must fail.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import Summary from '../Summary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Absolute path of tokens.css — used for file-content assertions. */
const TOKENS_CSS_PATH = path.resolve(__dirname, '../../tokens.css');

function readTokensCss(): string {
  return fs.readFileSync(TOKENS_CSS_PATH, 'utf8');
}

// ---------------------------------------------------------------------------
// AC1 — Structural & visual parity with modals.jsx:111-138
// ---------------------------------------------------------------------------

describe('AC1: structural/visual parity with schema_view_modal key/value block', () => {
  it('renders a <dl> element at the component root', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Column code', after: 'col_01' }]} />
    );
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
  });

  it('renders one <dt> and one <dd> per row', () => {
    const rows = [
      { label: 'Column code', after: 'col_01' },
      { label: 'Label', after: 'My label' },
      { label: 'Table', after: 'fact_sales' },
    ];
    const { container } = render(<Summary rows={rows} />);

    const dts = container.querySelectorAll('dt');
    const dds = container.querySelectorAll('dd');

    expect(dts.length).toBe(3);
    expect(dds.length).toBe(3);
  });

  it('renders <dt> elements in the same order as the rows prop', () => {
    const rows = [
      { label: 'A', after: '1' },
      { label: 'B', after: '2' },
    ];
    const { container } = render(<Summary rows={rows} />);

    const dts = Array.from(container.querySelectorAll('dt'));
    const labels = dts.map((dt) => dt.textContent?.trim());
    expect(labels).toEqual(['A', 'B']);
  });

  it('ORDER mutation: reversing rows prop reverses rendered <dt> order', () => {
    const rows = [
      { label: 'A', after: '1' },
      { label: 'B', after: '2' },
    ];
    const reversed = [...rows].reverse();
    const { container } = render(<Summary rows={reversed} />);

    const dts = Array.from(container.querySelectorAll('dt'));
    const labels = dts.map((dt) => dt.textContent?.trim());
    expect(labels).toEqual(['B', 'A']);
  });

  it('renders <dd> text content matching the after value for each row', () => {
    const rows = [
      { label: 'A', after: 'value-alpha' },
      { label: 'B', after: 'value-beta' },
    ];
    const { container } = render(<Summary rows={rows} />);

    const dds = Array.from(container.querySelectorAll('dd'));
    const values = dds.map((dd) => dd.textContent?.trim());
    expect(values).toEqual(['value-alpha', 'value-beta']);
  });

  it('NO inline styles: Summary root element has no inline style attribute', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Col', after: 'val' }]} />
    );
    // The outermost element must not carry inline style (colours/spacing come
    // from CSS classes referencing tokens.css custom properties).
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.length).toBe(0);
  });

  it('NO inline styles: individual rows have no inline style attribute', () => {
    const { container } = render(
      <Summary
        rows={[
          { label: 'X', after: 'foo' },
          { label: 'Y', after: 'bar' },
        ]}
      />
    );
    // Each row wrapper (direct child of <dl> or a <div> grouping <dt>+<dd>)
    // must not carry inline styles.
    const rows = container.querySelectorAll('[data-summary-row]');
    rows.forEach((row) => {
      expect((row as HTMLElement).style.length).toBe(0);
    });
    // Full-subtree check on rows without status (no VisuallyHidden spans rendered).
    expect(container.querySelectorAll('[style]').length).toBe(0);
  });

  it('NO inline styles: full subtree (including visually-hidden spans) carries no inline style', () => {
    // Render rows WITH status so VisuallyHidden spans are present in the DOM.
    // This assertion catches any inline style on <dt> > <span> and any future regressions.
    const { container } = render(
      <Summary
        rows={[
          { label: 'X', after: 'foo', status: 'changed' },
          { label: 'Y', after: 'bar', status: 'added' },
        ]}
      />
    );
    expect(container.querySelectorAll('[style]').length).toBe(0);
  });

  it('is read-only: contains no interactive controls', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Col', after: 'val' }]} />
    );
    const inputs = container.querySelectorAll('input, textarea, select, button, a');
    expect(inputs.length).toBe(0);
  });

  it('<dt> elements carry role="term" or rely on HTML default (dt is implicitly term)', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Col', after: 'val' }]} />
    );
    // Browsers expose <dt> as role="term" natively. We verify the element is
    // <dt> (not a generic div with an explicit role). This ensures we get the
    // HTML-default accessible role without an explicit attribute.
    const dt = container.querySelector('dt');
    expect(dt).not.toBeNull();
    // Explicit role override is fine but tag name must be dt
    expect(dt!.tagName.toLowerCase()).toBe('dt');
  });

  it('<dd> elements carry role="definition" or rely on HTML default', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Col', after: 'val' }]} />
    );
    const dd = container.querySelector('dd');
    expect(dd).not.toBeNull();
    expect(dd!.tagName.toLowerCase()).toBe('dd');
  });
});

// ---------------------------------------------------------------------------
// AC2 — status='changed' → coloured left-border via --color-warning + a11y
// ---------------------------------------------------------------------------

describe('AC2: status="changed" applies design token class and accessible name', () => {
  it('adds class summary-row--changed when status is "changed"', () => {
    const { container } = render(
      <Summary
        rows={[{ label: 'Tier', after: 'L2', status: 'changed' }]}
      />
    );
    const changedRow = container.querySelector('.summary-row--changed');
    expect(changedRow).not.toBeNull();
  });

  it('does NOT add class summary-row--changed when status is undefined', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Tier', after: 'L2' }]} />
    );
    const changedRow = container.querySelector('.summary-row--changed');
    expect(changedRow).toBeNull();
  });

  it('does NOT add class summary-row--changed when status is "unchanged"', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Tier', after: 'L2', status: 'unchanged' }]} />
    );
    const changedRow = container.querySelector('.summary-row--changed');
    expect(changedRow).toBeNull();
  });

  it('tokens.css contains --color-warning definition (implementer flag: must add it)', () => {
    const css = readTokensCss();
    // This assertion will fail until the implementer adds:
    //   --color-warning: #d97706;
    expect(css).toContain('--color-warning');
  });

  it('component CSS or tokens.css references var(--color-warning) for the changed variant', () => {
    // The class summary-row--changed must reference --color-warning for the
    // left-border colour. We verify via file content (no inline styles allowed).
    // Either tokens.css or a co-located CSS module must contain the reference.
    const tokensContent = readTokensCss();

    // Check tokens.css directly for var(--color-warning) usage in a left-border rule,
    // OR a CSS module file alongside Summary.tsx.
    const summaryModulePath = path.resolve(__dirname, '../Summary.module.css');
    const summaryModuleExists = fs.existsSync(summaryModulePath);

    if (summaryModuleExists) {
      const moduleContent = fs.readFileSync(summaryModulePath, 'utf8');
      const hasWarningRef =
        moduleContent.includes('var(--color-warning)') ||
        tokensContent.includes('var(--color-warning)');
      expect(hasWarningRef).toBe(true);
    } else {
      // If no CSS module yet, tokens.css itself must define the token
      // (implementer will add the left-border rule via CSS module)
      expect(tokensContent).toContain('--color-warning');
    }
  });

  it('status="changed" row has an accessible name that includes the substring "changed"', () => {
    render(
      <Summary
        rows={[{ label: 'Tier', after: 'L2', status: 'changed' }]}
      />
    );
    // The row (or its dt/dd) must expose the word "changed" to assistive
    // technology — via aria-label, visually-hidden text, or aria-describedby.
    // We search the full rendered text and ARIA labels.
    const changedIndicator = screen.queryByText(/changed/i);
    expect(changedIndicator).not.toBeNull();
  });

  it('status="added" row applies class summary-row--added', () => {
    const { container } = render(
      <Summary rows={[{ label: 'New col', after: 'new_val', status: 'added' }]} />
    );
    expect(container.querySelector('.summary-row--added')).not.toBeNull();
  });

  it('status="removed" row applies class summary-row--removed', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Old col', after: 'old_val', status: 'removed' }]} />
    );
    expect(container.querySelector('.summary-row--removed')).not.toBeNull();
  });

  it('status="unchanged" row applies class summary-row--unchanged', () => {
    const { container } = render(
      <Summary rows={[{ label: 'Col', after: 'val', status: 'unchanged' }]} />
    );
    expect(container.querySelector('.summary-row--unchanged')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC3 — empty rows array → EmptyState fallback without crashing
// ---------------------------------------------------------------------------

describe('AC3: empty rows array renders EmptyState fallback without crashing', () => {
  it('renders without throwing when rows is an empty array', () => {
    expect(() => {
      render(<Summary rows={[]} />);
    }).not.toThrow();
  });

  it('renders some empty-state indicator in the DOM when rows=[]', () => {
    const { container } = render(<Summary rows={[]} />);
    // Must render EITHER: [role="status"], text "No changes", or a non-empty
    // element that conveys emptiness to the user.
    const statusEl = container.querySelector('[role="status"]');
    const noChangesText = screen.queryByText(/no changes/i);
    const hasEmptyIndicator = statusEl !== null || noChangesText !== null;
    expect(hasEmptyIndicator).toBe(true);
  });

  it('does NOT render any <dt> or <dd> when rows=[]', () => {
    const { container } = render(<Summary rows={[]} />);
    expect(container.querySelectorAll('dt').length).toBe(0);
    expect(container.querySelectorAll('dd').length).toBe(0);
  });

  it('accepts an optional emptyState prop to customise the fallback', () => {
    const { container } = render(
      <Summary rows={[]} emptyState={<p data-testid="custom-empty">Nothing here</p>} />
    );
    expect(container.querySelector('[data-testid="custom-empty"]')).not.toBeNull();
  });
});
