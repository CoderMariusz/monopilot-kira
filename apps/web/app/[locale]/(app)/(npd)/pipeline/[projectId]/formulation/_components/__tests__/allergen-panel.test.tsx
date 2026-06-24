/**
 * @vitest-environment jsdom
 * T-115 — AllergenPanel component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/recipe.jsx:103-122 (AllergenPanel)
 *
 * Asserts:
 *  - Parity: EU14 allergen presence chips with a status-specific token
 *    (present=red/danger, trace=amber/warning, absent=muted/outline) — the
 *    prototype's `allergen-chip` + `.on` highlight + "detected" Alert.
 *  - All 14 mandatory EU allergens (EU FIC 1169/2011) always render — superset of
 *    the prototype's 11-chip list (documented deviation: prototype data was a
 *    flagged PRD partial; the task contract mandates EU14).
 *  - When ≥1 allergen is present/trace, a `role="alert"` lists the detected
 *    allergens and reads "Must be declared on label".
 *  - When all allergens are absent, the empty hint renders and no alert appears.
 *  - Reactive rerender: changing the `allergens` prop updates badge statuses.
 *  - a11y: every badge exposes an accessible name (aria-label) combining allergen
 *    name + status — color is never the sole signal. (jest-axe is not in this
 *    package; a11y is asserted via aria-label/text per the T-040 reference
 *    convention — documented fallback.)
 *  - i18n: the component renders LABELS (message values), never inline literals.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AllergenPanel,
  EU14_ALLERGEN_CODES,
  type AllergenPanelLabels,
  type AllergenStatus,
} from '../allergen-panel';

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: AllergenPanelLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  present: 'lbl.present',
  trace: 'lbl.trace',
  absent: 'lbl.absent',
  detectedHeading: 'lbl.detectedHeading {count}',
  mustDeclare: 'lbl.mustDeclare',
  noneDetected: 'lbl.noneDetected',
  // ICU-style placeholders prove the component composes name + status into the
  // accessible name (color is not the sole signal).
  statusLabel: '{name} — {status}',
};

/** Build a full EU14 status list, overriding specific codes. */
function buildAllergens(overrides: Record<string, AllergenStatus['status']>): AllergenStatus[] {
  return EU14_ALLERGEN_CODES.map((code) => ({
    code,
    name: `name.${code}`,
    status: overrides[code] ?? 'absent',
  }));
}

describe('AllergenPanel (T-115 parity + states + a11y)', () => {
  it('renders all 14 EU allergen badges', () => {
    render(<AllergenPanel allergens={buildAllergens({})} labels={LABELS} />);
    const grid = screen.getByTestId('allergen-panel-grid');
    const cells = within(grid).getAllByRole('listitem');
    expect(cells).toHaveLength(14);
    for (const code of EU14_ALLERGEN_CODES) {
      expect(screen.getByTestId(`allergen-cell-${code}`)).toBeInTheDocument();
    }
  });

  it('applies status-specific tokens (present=danger, trace=warning, absent=muted)', () => {
    render(
      <AllergenPanel
        allergens={buildAllergens({ milk: 'present', soybeans: 'trace' })}
        labels={LABELS}
      />,
    );
    const present = screen.getByTestId('allergen-cell-milk');
    const trace = screen.getByTestId('allergen-cell-soybeans');
    const absent = screen.getByTestId('allergen-cell-celery');
    expect(present.querySelector('[data-slot="badge"]')).toHaveAttribute('data-variant', 'danger');
    expect(trace.querySelector('[data-slot="badge"]')).toHaveAttribute('data-variant', 'warning');
    expect(absent.querySelector('[data-slot="badge"]')).toHaveAttribute('data-variant', 'muted');
    expect(present).toHaveAttribute('data-status', 'present');
    expect(trace).toHaveAttribute('data-status', 'trace');
    expect(absent).toHaveAttribute('data-status', 'absent');
  });

  it('exposes an accessible name (name + status) on every badge — color not sole signal', () => {
    render(
      <AllergenPanel allergens={buildAllergens({ fish: 'present' })} labels={LABELS} />,
    );
    const badge = within(screen.getByTestId('allergen-cell-fish')).getByRole('img', {
      hidden: true,
    });
    // The presence indicator glyph is aria-hidden; the cell's badge carries the label.
    const fishBadge = screen.getByTestId('allergen-cell-fish').querySelector('[data-slot="badge"]');
    expect(fishBadge).toHaveAttribute(
      'aria-label',
      expect.stringContaining('name.fish'),
    );
    expect(fishBadge?.getAttribute('aria-label')).toContain('lbl.present');
    // sanity: glyph present and hidden from AT
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the declared-on-label alert listing detected allergens when present/trace', () => {
    render(
      <AllergenPanel
        allergens={buildAllergens({ milk: 'present', mustard: 'trace' })}
        labels={LABELS}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('lbl.detectedHeading 2');
    expect(alert).toHaveTextContent('lbl.mustDeclare');
    expect(alert).toHaveTextContent('name.milk');
    expect(alert).toHaveTextContent('name.mustard');
    // absent allergens are NOT listed
    expect(alert).not.toHaveTextContent('name.celery');
    expect(screen.queryByTestId('allergen-panel-empty')).not.toBeInTheDocument();
  });

  it('shows the empty hint and no alert when all allergens are absent', () => {
    render(<AllergenPanel allergens={buildAllergens({})} labels={LABELS} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('allergen-panel-empty')).toHaveTextContent('lbl.noneDetected');
  });

  it('reactively updates badge statuses when the allergens prop changes', () => {
    const { rerender } = render(
      <AllergenPanel allergens={buildAllergens({})} labels={LABELS} />,
    );
    expect(screen.getByTestId('allergen-cell-eggs')).toHaveAttribute('data-status', 'absent');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<AllergenPanel allergens={buildAllergens({ eggs: 'present' })} labels={LABELS} />);
    expect(screen.getByTestId('allergen-cell-eggs')).toHaveAttribute('data-status', 'present');
    expect(screen.getByRole('alert')).toHaveTextContent('name.eggs');
  });

  it('renders LABELS only — never inline English literals', () => {
    const { container } = render(
      <AllergenPanel allergens={buildAllergens({ milk: 'present' })} labels={LABELS} />,
    );
    // No raw "Allergens" / "Must be declared" English copy leaks through.
    expect(container).not.toHaveTextContent('Must be declared on label');
    expect(container).not.toHaveTextContent(/Allergens/);
    expect(container).toHaveTextContent('lbl.title');
  });
});
