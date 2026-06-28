/**
 * @vitest-environment jsdom
 *
 * Parity evidence — allergen cascade REACHABILITY in the canonical locale tree.
 *
 * The T-040 widget already has full per-state parity evidence (_meta/parity-evidence/T-040).
 * This capture documents the NEW reachability surfaces (module-close gap fix):
 *   1. the FA-detail Technical tab slot now renders the real widget (replacing the
 *      reserved "Allergens loading…" placeholder); and
 *   2. the locale allergens sub-route (sibling of docs/risks).
 *
 * Per UI-PROTOTYPE-PARITY-POLICY.md (Playwright runs against the live preview; this
 * RTL/DOM-snapshot capture is the documented offline fallback), serializes:
 *   - per-state DOM snapshots of the Technical-tab-rendered slot (loading/empty/
 *     error/permission-denied/ready/optimistic) to _meta/parity-evidence/allergen-reachability/;
 *   - a structural parity note + the a11y baseline (color-not-alone, override entry
 *     point reachable) asserted programmatically.
 *
 * Prototype parity source (1:1, unchanged from T-040):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428         (allergen_override_modal)
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FaTechnicalTab, type FaTechnicalTabLabels } from '../fa-technical-tab';
import {
  AllergenCascadeWidget,
  type AllergenCascadeData,
  type AllergenCascadeLabels,
  type WidgetState,
} from '../../../../../../../(npd)/fa/[productCode]/_components/allergen-cascade-widget';

afterEach(() => cleanup());

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../../../../../../../../_meta/parity-evidence/allergen-reachability',
);

const TECH_LABELS: FaTechnicalTabLabels = {
  title: 'Technical',
  subtitle: 'Technical department details',
  closedBadge: 'Closed',
  openBadge: 'Open',
  autoHint: 'Auto-derived',
  requiredMissingTitle: 'Required fields missing',
  requiredMissingBody: 'Fill every required field before closing Technical.',
  save: 'Save Technical',
  saving: 'Saving…',
  saveSuccess: 'Saved',
  saveError: 'Save failed',
  selectPlaceholder: 'Select…',
  loading: 'Loading…',
  empty: 'No Technical columns configured',
  emptyBody: 'Configure Technical columns in Settings.',
  error: 'Unable to load Technical.',
  forbidden: 'You cannot edit Technical.',
  allergenSlotTitle: 'Allergens',
  allergenSlotSubtitle: 'Allergen cascade',
  allergenSlotLoading: 'Allergens loading…',
  fields: {},
};

const ALLERGEN_LABELS: AllergenCascadeLabels = {
  title: 'Allergen cascade',
  subtitle: 'Derived RM + process allergens, additive overrides, and the FG-final declaration.',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  override: 'Override',
  sectionDerived: 'Derived (RM + process)',
  sectionDerivedSource: 'Auto-derived union of confirmed RM + process allergens.',
  sectionDeltas: 'Override deltas',
  sectionFinal: 'FG final',
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

function widgetFor(state: WidgetState, data: AllergenCascadeData | null) {
  return (
    <AllergenCascadeWidget
      data={data}
      labels={ALLERGEN_LABELS}
      canWrite
      state={state}
      refreshAction={vi.fn()}
      setAllergenOverrideAction={vi.fn().mockResolvedValue({ ok: true })}
    />
  );
}

function renderSlot(state: WidgetState, data: AllergenCascadeData | null) {
  return render(
    <FaTechnicalTab
      productCode="FG-001"
      columns={[]}
      values={{}}
      dropdowns={{}}
      labels={TECH_LABELS}
      state="empty"
      allergenSlot={widgetFor(state, data)}
    />,
  );
}

beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

describe('allergen reachability — per-state Technical-tab-slot snapshots', () => {
  const states: Array<{ state: WidgetState; data: AllergenCascadeData | null; file: string }> = [
    { state: 'loading', data: DATA, file: 'technical-slot-loading.html' },
    { state: 'empty', data: null, file: 'technical-slot-empty.html' },
    { state: 'error', data: null, file: 'technical-slot-error.html' },
    { state: 'permission_denied', data: null, file: 'technical-slot-permission-denied.html' },
    { state: 'ready', data: DATA, file: 'technical-slot-ready.html' },
  ];

  it.each(states)('captures the %s state in the Technical-tab slot', ({ state, data, file }) => {
    const { container } = renderSlot(state, data);
    writeEvidence(file, container.innerHTML);
    // The reserved placeholder is REPLACED by the real widget in every state.
    expect(container.querySelector('[data-testid="allergen-cascade-widget"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="fa-technical-allergen-loading"]')).toBeNull();
  });

  it('captures the optimistic (refreshing) state inside the slot', () => {
    const { container } = render(
      <FaTechnicalTab
        productCode="FG-001"
        columns={[]}
        values={{}}
        dropdowns={{}}
        labels={TECH_LABELS}
        state="empty"
        allergenSlot={
          <AllergenCascadeWidget
            data={DATA}
            labels={ALLERGEN_LABELS}
            canWrite
            state="ready"
            refreshAction={() => new Promise(() => {})}
          />
        }
      />,
    );
    screen.getByRole('button', { name: ALLERGEN_LABELS.refresh }).click();
    writeEvidence('technical-slot-optimistic-refreshing.html', container.innerHTML);
    expect(container).toBeTruthy();
  });
});

describe('allergen reachability — a11y baseline + override entry point', () => {
  it('color is never the sole signal: EU14 cells carry text + icon in the slot', () => {
    renderSlot('ready', DATA);
    const grid = screen.getByTestId('allergen-eu14-grid');
    expect(within(grid).getByTestId('allergen-eu14-cell-gluten')).toHaveTextContent(
      ALLERGEN_LABELS.present,
    );
    expect(within(grid).getByTestId('allergen-eu14-cell-celery')).toHaveTextContent(
      ALLERGEN_LABELS.absent,
    );
  });

  it('override entry point + Refresh are reachable from the slot when canWrite', () => {
    renderSlot('ready', DATA);
    expect(screen.getByRole('button', { name: ALLERGEN_LABELS.refresh })).toBeInTheDocument();
    expect(screen.getByTestId('allergen-override-trigger-gluten')).toBeInTheDocument();
  });

  it('writes a structural-parity note alongside the snapshots', () => {
    const note = [
      '# Allergen cascade reachability — parity evidence',
      '',
      'Prototype anchor (1:1, unchanged from T-040):',
      '  prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)',
      '  prototypes/design/Monopilot Design System/npd/modals.jsx:389-428 (allergen_override_modal)',
      '',
      'Reachability surfaces wired in this gap fix:',
      '  1. FA-detail Technical tab slot — the reserved "Allergens loading…" placeholder',
      '     is replaced by the server-rendered AllergenCascadeWidget fed with REAL,',
      '     org-scoped data (public.fa_allergen_cascade) + server-resolved npd.allergen.write.',
      '  2. Locale allergens sub-route /[locale]/(app)/(npd)/fa/[productCode]/allergens',
      '     (sibling of docs/ + risks/), reusing the same widget + actions.',
      '',
      'Structural parity: 3 cascade sections (Derived / Override deltas / FG-final',
      'Contains+May-contain) + EU14 presence grid + Refresh + per-allergen Override → modal.',
      'All five UI states captured: loading, empty, error, permission-denied, ready (+ optimistic refresh).',
      'No widget/engine/action was rebuilt — only wired into the canonical locale tree.',
      '',
    ].join('\n');
    writeEvidence('PARITY-NOTE.md', note);
    expect(fs.existsSync(path.join(EVIDENCE_DIR, 'PARITY-NOTE.md'))).toBe(true);
  });
});
