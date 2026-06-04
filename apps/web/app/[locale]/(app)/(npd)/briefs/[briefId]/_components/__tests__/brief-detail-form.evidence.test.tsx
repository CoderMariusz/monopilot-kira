/**
 * @vitest-environment jsdom
 * T-120 — BriefDetailForm parity evidence harness (RTL/DOM-snapshot fallback).
 *
 * Browser Playwright capture needs a running Next server + Supabase auth + a
 * seeded brief/brief_lines row (the module-level Gate-5 live-deploy
 * verification). At the component-task layer that stack is unavailable, and
 * Playwright parity is explicitly the sibling task T-122's scope (T-120
 * out_of_scope). So — per UI-PROTOTYPE-PARITY-POLICY ("Playwright artifacts
 * where applicable" + documented blocker) — this harness renders every required
 * UI state plus the parity-critical interaction variants (weight-mismatch
 * badge, converted read-only) and writes the resulting DOM to
 * apps/web/e2e/parity-evidence/npd/T-120/<state>.html.
 *
 * These artifacts are the parity-diff source (prototype brief-screens.jsx:84-231
 * → production DOM) and the per-state evidence (loading / empty / error /
 * permission-denied / populated + weight-mismatch + converted).
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BriefDetailForm,
  type BriefDetailData,
  type BriefDetailLabels,
  type PageState,
} from '../brief-detail-form';

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../../e2e/parity-evidence/npd/T-120');

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

const DATA: BriefDetailData = {
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

function write(state: string, html: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${state}.html`), html, 'utf8');
}

describe('BriefDetailForm — parity evidence capture', () => {
  const cases: Array<{ name: string; state: PageState; data: BriefDetailData | null; canWrite: boolean }> = [
    { name: 'loading', state: 'loading', data: null, canWrite: false },
    { name: 'empty', state: 'empty', data: null, canWrite: false },
    { name: 'populated', state: 'ready', data: DATA, canWrite: true },
    { name: 'error', state: 'error', data: null, canWrite: false },
    { name: 'permission_denied', state: 'permission_denied', data: null, canWrite: false },
  ];

  it.each(cases)('captures DOM for state=$name', ({ name, state, data, canWrite }) => {
    const { container } = render(
      <BriefDetailForm state={state} data={data} labels={LABELS} canWrite={canWrite} />,
    );
    write(name, container.innerHTML);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('captures DOM for the weight-mismatch interaction variant', () => {
    const mismatch: BriefDetailData = {
      ...DATA,
      components: [
        { component: 'A', sliceCount: 4, supplier: 'X', code: 'C1', price: '1', weights: '70', pct: '20' },
        { component: 'B', sliceCount: 4, supplier: 'Y', code: 'C2', price: '1', weights: '80', pct: '20' },
        { component: 'C', sliceCount: 4, supplier: 'Z', code: 'C3', price: '1', weights: '200', pct: '60' },
      ],
    };
    const { container } = render(
      <BriefDetailForm state="ready" data={mismatch} labels={LABELS} canWrite />,
    );
    write('weight-mismatch', container.innerHTML);
    expect(container.innerHTML).toContain('weight-mismatch-badge');
  });

  it('captures DOM for the converted read-only variant', () => {
    const converted: BriefDetailData = { ...DATA, status: 'converted', faCode: 'FA1001' };
    const { container } = render(
      <BriefDetailForm state="ready" data={converted} labels={LABELS} canWrite={false} />,
    );
    write('converted', container.innerHTML);
    expect(container.innerHTML).toContain('FA1001');
  });
});
