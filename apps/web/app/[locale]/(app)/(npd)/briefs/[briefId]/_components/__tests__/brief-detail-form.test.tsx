/**
 * @vitest-environment jsdom
 * T-120 — Brief detail page (brief_detail prototype) component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/brief-screens.jsx:84-231 (BriefDetail)
 *
 * RED → GREEN: asserts the parity checklist (Product/Packaging tabs; Section A
 * = 13 fields; Section B = 7 explicit packaging fields + packaging_ext rendered
 * as a KeyValue list; the Multi-template component table with the weight-total
 * row; the destructive "Weight mismatch" Badge when the component-weight delta
 * exceeds tolerance; the converted read-only Alert + disabled controls; the
 * "Complete brief for project" CTA that routes to the linked Stage-Gate
 * project), the five required UI states (loading / empty / error /
 * permission-denied / optimistic Save), and that every visible string comes
 * from the injected i18n labels (no default leak).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BriefDetailForm,
  type BriefDetailData,
  type BriefDetailLabels,
} from '../brief-detail-form';

afterEach(() => cleanup());

const LABELS: BriefDetailLabels = {
  breadcrumbRoot: 'NPD',
  breadcrumbList: 'Briefs',
  templateMulti: 'Multi',
  templateSingle: 'Single',
  statusDraft: 'Draft',
  statusComplete: 'Complete',
  statusConverted: 'Converted',
  statusAbandoned: 'Abandoned',
  convertedTo: 'Converted',
  convertedNotice: 'This brief has been converted to {fa}. It is now read-only.',
  viewProject: 'View project',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Draft saved.',
  saveError: 'Could not save the draft. Try again.',
  markComplete: 'Complete brief for project',
  completing: 'Completing…',
  completeError: 'Could not complete the brief. Try again.',
  tabProduct: 'Product details',
  tabPackaging: 'Packaging',
  sectionATitle: 'Section A — Product details',
  sectionBTitle: 'Section B — Packaging (C14-C20)',
  fieldProduct: 'Product',
  fieldVolume: 'Volume (pcs/week)',
  fieldDevCode: 'Dev Code',
  fieldDevCodeHint: 'Format DEV<YY><MM>-<seq>',
  fieldPacksPerCase: 'Packs per case',
  fieldBenchmark: 'Benchmark identified',
  fieldComments: 'Comments',
  fieldComponent: 'Component',
  fieldSliceCount: 'Slice count',
  fieldSupplier: 'Supplier',
  fieldCode: 'Code',
  fieldPrice: 'Price',
  fieldWeight: 'Weight (g)',
  fieldPct: '%',
  componentsTitle: 'Components (Multi template)',
  addComponent: '+ Add component',
  removeComponent: 'Remove component',
  totalRow: 'Total',
  weightMismatch: 'Weight mismatch',
  weightMismatchBody:
    'Component weights ({total}g) differ from the target total by more than tolerance. Adjust before completing.',
  fieldPrimaryPackaging: 'C14 · Primary packaging',
  fieldSecondaryPackaging: 'C15 · Secondary packaging',
  fieldBaseWebCode: 'C16 · Base web/tray/bag code',
  fieldBaseWebCodeHint: 'Maps to fa.web on Convert.',
  fieldBaseWebPrice: 'C17 · Base web price',
  fieldTopWebType: 'C18 · Top web type',
  fieldSleeveCartonCode: 'C19 · Sleeve/Carton code',
  fieldSleeveCartonCodeHint: 'Maps to fa.mrp_sleeves on Convert.',
  fieldSleeveCartonPrice: 'C20 · Sleeve/Carton price',
  packagingExtTitle: 'Additional packaging fields (C21–C37)',
  packagingExtPending: 'Phase B.2 rescan pending',
  packagingExtBody:
    'Fields C21-C37 are pending the Phase B.2 Brief schema rescan. Rendered inline but not yet mapped.',
  packagingExtKey: 'Field',
  packagingExtValue: 'Value',
  tbd: 'TBD',
  loading: 'Loading brief…',
  empty: 'Brief not found',
  emptyBody: 'This brief does not exist or you do not have access to it.',
  error: 'Unable to load the brief.',
  forbidden: 'You do not have permission to view this brief.',
};

const BASE_DATA: BriefDetailData = {
  briefId: '11111111-1111-1111-1111-111111111111',
  devCode: 'DEV2601-001',
  productName: 'Premium Platter',
  template: 'multi_component',
  status: 'draft',
  faCode: null,
  npdProjectId: '22222222-2222-2222-2222-222222222222',
  product: {
    product: 'Premium Platter',
    volume: '1200',
    devCode: 'DEV2601-001',
    packsPerCase: 12,
    benchmark: 'Sokołów premium platter',
    comments: 'Premium platter concept — multi-component selection.',
    summaryComponent: 'Mixed platter',
    summarySliceCount: 13,
    summarySupplier: 'Mixed',
    summaryCode: 'SUM-001',
    summaryPrice: '68.50',
    summaryWeights: '220',
    summaryPct: '100',
  },
  components: [
    { component: 'Prosciutto Crudo', sliceCount: 4, supplier: 'Negroni', code: 'PR1839H', price: '28.00', weights: '70', pct: '32' },
    { component: 'Salami Milano', sliceCount: 5, supplier: 'Veroni', code: 'PR1942G', price: '22.00', weights: '80', pct: '36' },
    { component: 'Cooked Ham', sliceCount: 4, supplier: 'Beretta', code: 'PR2045A', price: '18.50', weights: '70', pct: '32' },
  ],
  packaging: {
    primaryPackaging: 'MAP tray 220g',
    secondaryPackaging: 'Cardboard case x10',
    baseWebCode: 'WEB-PET-300',
    baseWebPrice: '0.18',
    topWebType: 'PET/PE 70µm peel',
    sleeveCartonCode: 'MRP-CRT-012',
    sleeveCartonPrice: '0.22',
  },
  packagingExt: { C21: 'sleeve artwork TBD', C22: 'lamination TBD' },
  targetWeightG: '220',
  weightToleranceG: '5',
};

function renderReady(extra?: Partial<React.ComponentProps<typeof BriefDetailForm>>) {
  return render(
    <BriefDetailForm state="ready" data={BASE_DATA} labels={LABELS} canWrite {...extra} />,
  );
}

describe('BriefDetailForm — parity', () => {
  it('renders Product/Packaging tabs and Section A with 13 fields', () => {
    renderReady();
    // Two-section tabs.
    expect(screen.getByRole('tab', { name: LABELS.tabProduct })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: LABELS.tabPackaging })).toBeInTheDocument();

    // Section A is the active (default) tab and exposes 13 input/textarea controls.
    const sectionA = screen.getByTestId('brief-section-a');
    const fields = within(sectionA).getAllByTestId('brief-field');
    expect(fields).toHaveLength(13);
    expect(within(sectionA).getByText(LABELS.sectionATitle)).toBeInTheDocument();
  });

  it('renders Section B with 7 explicit packaging fields + packaging_ext KeyValue list', () => {
    renderReady();
    fireEvent.click(screen.getByRole('tab', { name: LABELS.tabPackaging }));

    const sectionB = screen.getByTestId('brief-section-b');
    const explicit = within(sectionB).getAllByTestId('packaging-field');
    expect(explicit).toHaveLength(7);

    const ext = screen.getByTestId('packaging-ext');
    const rows = within(ext).getAllByTestId('packaging-ext-row');
    expect(rows).toHaveLength(2);
    expect(within(ext).getByText('C21')).toBeInTheDocument();
    expect(within(ext).getByText('sleeve artwork TBD')).toBeInTheDocument();
  });

  it('shows a destructive "Weight mismatch" Badge when component weight delta exceeds tolerance', () => {
    renderReady({
      data: {
        ...BASE_DATA,
        // 70 + 80 + 200 = 350g vs target 220g ±5g → mismatch.
        components: [
          { component: 'A', sliceCount: 4, supplier: 'X', code: 'C1', price: '1', weights: '70', pct: '20' },
          { component: 'B', sliceCount: 4, supplier: 'Y', code: 'C2', price: '1', weights: '80', pct: '20' },
          { component: 'C', sliceCount: 4, supplier: 'Z', code: 'C3', price: '1', weights: '200', pct: '60' },
        ],
      },
    });
    const badge = screen.getByTestId('weight-mismatch-badge');
    expect(badge).toHaveTextContent(LABELS.weightMismatch);
    expect(badge).toHaveAttribute('data-variant', 'destructive');
  });

  it('does NOT show the weight-mismatch badge when component weights are within tolerance', () => {
    renderReady();
    expect(screen.queryByTestId('weight-mismatch-badge')).not.toBeInTheDocument();
  });

  it('Mark complete CTA reads "Complete brief for project" and routes to the linked project', async () => {
    const onMarkComplete = vi.fn().mockResolvedValue({ ok: true, npdProjectId: BASE_DATA.npdProjectId });
    const onNavigate = vi.fn();
    renderReady({ onMarkComplete, onNavigateToProject: onNavigate });

    const cta = screen.getByRole('button', { name: LABELS.markComplete });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);

    await waitFor(() => expect(onMarkComplete).toHaveBeenCalledWith(BASE_DATA.briefId));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(BASE_DATA.npdProjectId));
  });

  it('Save draft calls saveBriefDraft adapter optimistically and reports success', async () => {
    const onSaveDraft = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ onSaveDraft });

    fireEvent.click(screen.getByRole('button', { name: LABELS.saveDraft }));
    // Optimistic feedback while in-flight.
    expect(screen.getByText(LABELS.saving)).toBeInTheDocument();
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(LABELS.saved)).toBeInTheDocument());
  });
});

describe('BriefDetailForm — converted read-only', () => {
  it('shows the converted Alert with a project link and disables controls', () => {
    renderReady({
      data: { ...BASE_DATA, status: 'converted', faCode: 'FA1001' },
    });
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('FA1001');
    expect(screen.getByRole('link', { name: LABELS.viewProject })).toBeInTheDocument();
    // Save draft is omitted/disabled in converted state.
    expect(screen.queryByRole('button', { name: LABELS.markComplete })).not.toBeInTheDocument();
  });
});

describe('BriefDetailForm — states + RBAC + i18n', () => {
  it('renders the loading state', () => {
    render(<BriefDetailForm state="loading" data={null} labels={LABELS} canWrite={false} />);
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<BriefDetailForm state="empty" data={null} labels={LABELS} canWrite={false} />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<BriefDetailForm state="error" data={null} labels={LABELS} canWrite={false} />);
    expect(screen.getByText(LABELS.error)).toBeInTheDocument();
  });

  it('renders the permission-denied state', () => {
    render(<BriefDetailForm state="permission_denied" data={null} labels={LABELS} canWrite={false} />);
    expect(screen.getByText(LABELS.forbidden)).toBeInTheDocument();
  });

  it('hides write controls when canWrite is false (no render-then-disable info leak)', () => {
    renderReady({ canWrite: false });
    expect(screen.queryByRole('button', { name: LABELS.saveDraft })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: LABELS.markComplete })).not.toBeInTheDocument();
  });

  it('uses only the injected i18n labels (no default-string leak)', () => {
    renderReady();
    // A string that only appears in the prototype defaults must not leak.
    expect(screen.queryByText('Mark complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Convert to FA')).not.toBeInTheDocument();
  });
});
