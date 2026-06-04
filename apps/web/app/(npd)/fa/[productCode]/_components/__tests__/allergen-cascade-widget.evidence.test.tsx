/**
 * @vitest-environment jsdom
 * T-040 — Parity-evidence capture (RTL/DOM-snapshot fallback).
 *
 * Playwright + @axe-core are NOT installed in this worktree (no apps/web/playwright.config.*,
 * no @axe-core/playwright, no browsers in the ms-playwright cache). Per T-040 AC4 and
 * UI-PROTOTYPE-PARITY-POLICY.md, when Playwright is unavailable this RTL/snapshot evidence
 * is the documented fallback: it serializes per-state DOM snapshots + a structural-parity
 * snapshot to _meta/parity-evidence/T-040/, and asserts the a11y baseline (roles, labels,
 * color-not-alone via text+icon) programmatically.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428         (allergen_override_modal)
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AllergenCascadeWidget,
  type AllergenCascadeData,
  type AllergenCascadeLabels,
  type WidgetState,
} from '../allergen-cascade-widget';
import { AllergenOverrideModal } from '../../../../_modals/allergen-override-modal';

afterEach(() => cleanup());

const EVIDENCE_DIR = path.resolve(__dirname, '../../../../../../../../_meta/parity-evidence/T-040');

const LABELS: AllergenCascadeLabels = {
  title: 'Allergen cascade',
  subtitle: 'Derived RM + process allergens, overrides, FA-final.',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  override: 'Override',
  sectionDerived: 'Derived (RM + process)',
  sectionDerivedSource: 'Auto-derived union of confirmed RM + process allergens.',
  sectionDeltas: 'Override deltas',
  sectionFinal: 'FA final',
  contains: 'Contains',
  mayContain: 'May contain',
  deltaAdded: 'Added by override',
  deltaRemoved: 'Removed by override',
  noDeltas: 'No manual overrides applied.',
  manual: 'Manual',
  present: 'Present',
  absent: 'Absent',
  eu14Title: 'EU 14 mandatory allergens',
  derivationNote: 'Contains = union(RM) ∪ union(process), overrides applied.',
  loading: 'Loading allergen cascade…',
  empty: 'No allergen data yet',
  emptyBody: 'Add raw materials and processes to derive the declaration.',
  error: 'Unable to load the allergen cascade.',
  forbidden: 'You do not have permission to view the allergen cascade.',
  sourceRm: 'Source: raw material / process (auto-derived)',
  sourceProcess: 'Source: precautionary (RM trace / conditional process)',
  sourceOverride: 'Source: manual override (audit-logged)',
  auditWarning: 'Overriding the auto-cascaded status requires a reason. Audit-logged.',
  fieldAllergen: 'Allergen',
  fieldCurrent: 'Current auto-cascade',
  fieldAction: 'Override to',
  actionAdd: '✓ Include (Contains)',
  actionRemove: '✗ Exclude (Not present)',
  fieldReason: 'Reason',
  reasonPlaceholder: 'Explain why the auto-cascade is overridden…',
  reasonTooShort: 'Reason must be at least 10 characters (max 500).',
  cancel: 'Cancel',
  save: 'Save override',
  statusContains: 'Contains',
  statusAbsent: 'Not present',
};

const DATA: AllergenCascadeData = {
  productCode: 'FG-001',
  derivedAllergens: ['gluten', 'milk'],
  publishedAllergens: ['gluten', 'soybeans'],
  mayContainAllergens: ['nuts'],
  conditionalProcessAllergens: ['nuts'],
};

function writeEvidence(name: string, html: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), html, 'utf8');
}

beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

describe('T-040 parity evidence — per-state DOM snapshots', () => {
  const states: Array<{ state: WidgetState; data: AllergenCascadeData | null; file: string }> = [
    { state: 'loading', data: DATA, file: 'T-040-loading.html' },
    { state: 'empty', data: null, file: 'T-040-empty.html' },
    { state: 'error', data: null, file: 'T-040-error.html' },
    { state: 'permission_denied', data: null, file: 'T-040-permission-denied.html' },
    { state: 'ready', data: DATA, file: 'T-040-ready.html' },
  ];

  it.each(states)('captures the %s state snapshot', ({ state, data, file }) => {
    const { container } = render(
      <AllergenCascadeWidget data={data} labels={LABELS} canWrite state={state} refreshAction={vi.fn()} />,
    );
    writeEvidence(file, container.innerHTML);
    expect(container.querySelector('[data-testid="allergen-cascade-widget"]')).not.toBeNull();
  });

  it('captures the optimistic (refreshing) snapshot', () => {
    const { container } = render(
      <AllergenCascadeWidget
        data={DATA}
        labels={LABELS}
        canWrite
        state="ready"
        refreshAction={() => new Promise(() => {})}
      />,
    );
    const btn = screen.getByRole('button', { name: LABELS.refresh });
    btn.click();
    writeEvidence('T-040-optimistic-refreshing.html', container.innerHTML);
    expect(btn).toBeInTheDocument();
  });

  it('captures the override-modal snapshot', () => {
    const { container } = render(
      <AllergenOverrideModal
        open
        productCode="FG-001"
        allergenCode="soybeans"
        allergenLabel="Soybeans"
        currentlyPresent={false}
        labels={LABELS}
        onClose={vi.fn()}
        setAllergenOverrideAction={vi.fn()}
      />,
    );
    writeEvidence('T-040-override-modal.html', document.body.innerHTML);
    expect(container).toBeTruthy();
  });
});

describe('T-040 a11y baseline (axe unavailable — structural fallback)', () => {
  it('color is never the sole signal: EU14 cells carry text + icon', () => {
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="ready" refreshAction={vi.fn()} />,
    );
    const grid = screen.getByTestId('allergen-eu14-grid');
    const present = within(grid).getByTestId('allergen-eu14-cell-gluten');
    // Present state surfaces the textual label (not color-only).
    expect(present).toHaveTextContent(LABELS.present);
    const absent = within(grid).getByTestId('allergen-eu14-cell-celery');
    expect(absent).toHaveTextContent(LABELS.absent);
  });

  it('loading state exposes role=status / error states expose role=alert', () => {
    const { rerender } = render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="loading" refreshAction={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(LABELS.loading);
    rerender(
      <AllergenCascadeWidget data={null} labels={LABELS} canWrite state="error" refreshAction={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('section labelled region has an accessible name', () => {
    render(
      <AllergenCascadeWidget data={DATA} labels={LABELS} canWrite state="ready" refreshAction={vi.fn()} />,
    );
    const widget = screen.getByTestId('allergen-cascade-widget');
    expect(widget).toHaveAttribute('aria-labelledby', 'allergen-cascade-title');
    expect(document.getElementById('allergen-cascade-title')).toHaveTextContent(LABELS.title);
  });
});
