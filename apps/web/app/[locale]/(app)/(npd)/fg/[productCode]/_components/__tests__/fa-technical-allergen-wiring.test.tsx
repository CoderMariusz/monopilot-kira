/**
 * @vitest-environment jsdom
 *
 * Module-close gap fix — allergen reachability in the canonical locale tree.
 *
 * Asserts the FaTechnicalTab now RENDERS an injected server-rendered allergen
 * cascade widget in its reserved slot (replacing the "Allergens loading…"
 * placeholder), so the BUILT T-040 allergen feature is reachable from the locale
 * FA-detail Technical tab. Also asserts the placeholder still renders when no slot
 * is injected (backward-compat — the existing fa-technical-tab.test.tsx contract).
 *
 * The widget body (cascade allergens + Refresh + override entry point + the five
 * UI states) is exercised against the SAME T-040 AllergenCascadeWidget that the
 * locale page/sub-route mount — reused, not rebuilt.
 *
 * Prototype parity source (1:1, unchanged from T-040):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428         (allergen_override_modal)
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FaTechnicalTab, type FaTechnicalTabLabels } from '../fa-technical-tab';
import {
  AllergenCascadeWidget,
  type AllergenCascadeData,
  type AllergenCascadeLabels,
} from '../../../../../../../(npd)/fa/[productCode]/_components/allergen-cascade-widget';

afterEach(() => cleanup());

const TECH_LABELS: FaTechnicalTabLabels = {
  title: 'tech.title',
  subtitle: 'tech.subtitle',
  closedBadge: 'tech.closed',
  openBadge: 'tech.open',
  autoHint: 'tech.auto',
  requiredMissingTitle: 'tech.reqTitle',
  requiredMissingBody: 'tech.reqBody',
  save: 'tech.save',
  saving: 'tech.saving',
  saveSuccess: 'tech.ok',
  saveError: 'tech.err',
  selectPlaceholder: 'tech.select',
  loading: 'tech.loading',
  empty: 'tech.empty',
  emptyBody: 'tech.emptyBody',
  error: 'tech.error',
  forbidden: 'tech.forbidden',
  allergenSlotTitle: 'tech.allergenSlotTitle',
  allergenSlotSubtitle: 'tech.allergenSlotSubtitle',
  allergenSlotLoading: 'tech.allergenSlotLoading',
  fields: {},
};

const ALLERGEN_LABELS: AllergenCascadeLabels = {
  title: 'a.title',
  subtitle: 'a.subtitle',
  refresh: 'a.refresh',
  refreshing: 'a.refreshing',
  override: 'a.override',
  overrideUnavailable: 'a.overrideUnavailable',
  sectionDerived: 'a.sectionDerived',
  sectionDerivedSource: 'a.sectionDerivedSource',
  sectionDeltas: 'a.sectionDeltas',
  sectionFinal: 'a.sectionFinal',
  contains: 'a.contains',
  mayContain: 'a.mayContain',
  deltaAdded: 'a.deltaAdded',
  deltaRemoved: 'a.deltaRemoved',
  noDeltas: 'a.noDeltas',
  manual: 'a.manual',
  present: 'a.present',
  absent: 'a.absent',
  eu14Title: 'a.eu14Title',
  derivationNote: 'a.derivationNote',
  loading: 'a.loading',
  empty: 'a.empty',
  emptyBody: 'a.emptyBody',
  error: 'a.error',
  forbidden: 'a.forbidden',
  auditWarning: 'a.auditWarning',
  fieldAllergen: 'a.fieldAllergen',
  fieldCurrent: 'a.fieldCurrent',
  fieldAction: 'a.fieldAction',
  actionAdd: 'a.actionAdd',
  actionRemove: 'a.actionRemove',
  fieldReason: 'a.fieldReason',
  reasonPlaceholder: 'a.reasonPlaceholder',
  reasonTooShort: 'a.reasonTooShort',
  cancel: 'a.cancel',
  save: 'a.save',
  statusContains: 'a.statusContains',
  statusAbsent: 'a.statusAbsent',
  sourceRm: 'a.sourceRm',
  sourceProcess: 'a.sourceProcess',
  sourceOverride: 'a.sourceOverride',
};

const DATA: AllergenCascadeData = {
  productCode: 'FG-001',
  derivedAllergens: ['gluten', 'milk'],
  publishedAllergens: ['gluten', 'soybeans'],
  mayContainAllergens: ['nuts'],
  conditionalProcessAllergens: ['nuts'],
};

function renderTab(allergenSlot?: React.ReactNode) {
  return render(
    <FaTechnicalTab
      productCode="FG-001"
      columns={[]}
      values={{}}
      dropdowns={{}}
      labels={TECH_LABELS}
      state="empty"
      allergenSlot={allergenSlot}
    />,
  );
}

describe('FaTechnicalTab allergen slot — reachability wiring', () => {
  it('renders the reserved placeholder when NO slot is injected (backward-compat)', () => {
    renderTab(undefined);
    expect(screen.getByTestId('fa-technical-allergen-slot')).toBeInTheDocument();
    expect(screen.getByText(TECH_LABELS.allergenSlotLoading)).toBeInTheDocument();
    // Real widget is absent when nothing is injected.
    expect(screen.queryByTestId('allergen-cascade-widget')).not.toBeInTheDocument();
  });

  it('renders the injected allergen widget (data state) in the slot — feature reachable', () => {
    renderTab(
      <AllergenCascadeWidget
        data={DATA}
        labels={ALLERGEN_LABELS}
        canWrite
        state="ready"
        refreshAction={vi.fn()}
      />,
    );
    // The placeholder is REPLACED by the real widget.
    expect(screen.queryByText(TECH_LABELS.allergenSlotLoading)).not.toBeInTheDocument();
    const widget = screen.getByTestId('allergen-cascade-widget');
    expect(widget).toBeInTheDocument();
    // Cascade allergens: declared (Contains) + may-contain are visible.
    expect(within(widget).getByText(ALLERGEN_LABELS.contains)).toBeInTheDocument();
    expect(within(widget).getByText(ALLERGEN_LABELS.mayContain)).toBeInTheDocument();
    expect(within(widget).getByTestId('allergen-final-contains-gluten')).toBeInTheDocument();
    expect(within(widget).getByTestId('allergen-may-contain-nuts')).toBeInTheDocument();
  });

  it('exposes Refresh and Override when canWrite and the override action is wired', () => {
    renderTab(
      <AllergenCascadeWidget
        data={DATA}
        labels={ALLERGEN_LABELS}
        canWrite
        state="ready"
        refreshAction={vi.fn()}
        setAllergenOverrideAction={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByRole('button', { name: ALLERGEN_LABELS.refresh })).toBeInTheDocument();
    expect(screen.getByTestId('allergen-override-trigger-gluten')).toBeInTheDocument();
  });

  it('shows override-unavailable (not a silent no-op) when canWrite but action is missing', () => {
    renderTab(
      <AllergenCascadeWidget
        data={DATA}
        labels={{ ...ALLERGEN_LABELS, overrideUnavailable: 'Override unavailable' }}
        canWrite
        state="ready"
        refreshAction={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('allergen-override-trigger-gluten')).not.toBeInTheDocument();
    expect(screen.getByTestId('allergen-override-unavailable-gluten')).toHaveTextContent('Override unavailable');
  });

  it('invokes the reused refresh action (debounced) from inside the slot', async () => {
    const refreshAction = vi.fn().mockResolvedValue(undefined);
    renderTab(
      <AllergenCascadeWidget
        data={DATA}
        labels={ALLERGEN_LABELS}
        canWrite
        state="ready"
        refreshAction={refreshAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: ALLERGEN_LABELS.refresh }));
    await waitFor(() => expect(refreshAction).toHaveBeenCalledTimes(1));
    expect(refreshAction).toHaveBeenCalledWith('FG-001');
  });

  it('opens the override modal from the slot (override entry point reachable)', () => {
    renderTab(
      <AllergenCascadeWidget
        data={DATA}
        labels={ALLERGEN_LABELS}
        canWrite
        state="ready"
        refreshAction={vi.fn()}
        setAllergenOverrideAction={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByTestId('allergen-override-trigger-gluten'));
    // The override modal surfaces its audit-trail alert + save control.
    expect(screen.getByTestId('override-audit-alert')).toBeInTheDocument();
    expect(screen.getByTestId('override-save')).toBeInTheDocument();
  });

  it('renders the loading state via the injected slot', () => {
    renderTab(
      <AllergenCascadeWidget data={null} labels={ALLERGEN_LABELS} canWrite state="loading" />,
    );
    expect(screen.getByText(ALLERGEN_LABELS.loading)).toBeInTheDocument();
  });

  it('renders the empty state via the injected slot', () => {
    renderTab(
      <AllergenCascadeWidget data={null} labels={ALLERGEN_LABELS} canWrite state="empty" />,
    );
    expect(screen.getByText(ALLERGEN_LABELS.empty)).toBeInTheDocument();
  });

  it('renders the permission-denied state and hides write controls via the injected slot', () => {
    renderTab(
      <AllergenCascadeWidget
        data={null}
        labels={ALLERGEN_LABELS}
        canWrite={false}
        state="permission_denied"
      />,
    );
    expect(screen.getByText(ALLERGEN_LABELS.forbidden)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ALLERGEN_LABELS.refresh }),
    ).not.toBeInTheDocument();
  });
});
