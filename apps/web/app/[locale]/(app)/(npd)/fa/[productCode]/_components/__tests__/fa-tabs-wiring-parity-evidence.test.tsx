/**
 * @vitest-environment jsdom
 * T-105 (WIRING) / T-106 (PARITY) — parity evidence generator (RTL DOM artifacts).
 *
 * Renders the WIRED FaTabs container (real dept tab bodies mounted into their
 * slots) and writes DOM HTML snapshots + a structural parity report to
 * apps/web/e2e/artifacts/T-105/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:312-408
 *     (FADetail tab bar + TABS array + per-tab body switch)
 *
 * Captured states:
 *   - unlocked  : coreDone=true, prodDone=true → every dept tab selectable.
 *   - locked    : coreDone=false → Planning/Commercial/Technical/Procurement +
 *                 MRP carry the "Locked" badge and are disabled (prototype 314-319).
 *   - per-tab   : each dept body active (Core/Planning/Commercial/Production/
 *                 Technical/Procurement) + History (T-027 kept working).
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app
 * server with an authenticated, RBAC-granted Supabase session (Vercel preview),
 * which is not bootable inside this isolated worktree. Per UI-PROTOTYPE-PARITY-
 * POLICY.md these RTL DOM artifacts + the structural map below are the accepted
 * fallback evidence; the Playwright harness (e2e/npd-fa-detail-tabs.spec.ts) runs
 * unchanged against a preview. (Mirrors the sibling T-023/T-027 evidence harness.)
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let pathname = '/en/fa/FA0043';
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParams.toString()),
}));
vi.mock('../../../../../../(npd)/fa/actions/update-fa-cell', () => ({
  updateFaCell: vi.fn(async () => undefined),
}));

import { FaTabs, type FaTabsLabels } from '../fa-tabs';
import { FaCoreTab, type FaCoreColumn } from '../fa-core-tab';
import { FaPlanningTab, type FaPlanningColumn } from '../fa-planning-tab';
import { FaCommercialTab, type FaCommercialColumn } from '../commercial-tab';
import { FaProductionTab, type FaProductionColumn } from '../fa-production-tab';
import { FaTechnicalTab, type FaTechnicalColumn } from '../fa-technical-tab';
import { FaProcurementTab, type FaProcurementColumn } from '../fa-procurement-tab';

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../../../e2e/artifacts/T-105');
const PC = 'FA0043';

function commonLabels(extra: Record<string, unknown>) {
  return {
    fields: {
      product_name: 'Product Name', pack_size: 'Pack Size', primary_ingredient_pct: 'Primary Ingredient %',
      launch_date: 'Launch Date', line: 'Line', shelf_life: 'Shelf Life', price: 'Price',
    },
    loading: 'Loading…', empty: 'Empty', emptyBody: 'Empty body', error: 'Error', forbidden: 'Forbidden',
    ...extra,
  };
}

const coreColumns: FaCoreColumn[] = [
  { key: 'product_name', dataType: 'text', required: true, readOnly: false, displayOrder: 2 },
  { key: 'pack_size', dataType: 'dropdown', required: true, readOnly: false, dropdownSource: 'PackSizes', displayOrder: 3 },
];
const planningColumns: FaPlanningColumn[] = [
  { key: 'primary_ingredient_pct', dataType: 'number', required: true, readOnly: false, displayOrder: 9 },
];
const commercialColumns: FaCommercialColumn[] = [
  { key: 'launch_date', dataType: 'date', required: true, readOnly: false, displayOrder: 13 },
];
const productionColumns: FaProductionColumn[] = [
  { key: 'line', dataType: 'dropdown', required: true, readOnly: false, dropdownSource: 'Lines', displayOrder: 29 },
];
const technicalColumns: FaTechnicalColumn[] = [
  { key: 'shelf_life', dataType: 'text', required: true, readOnly: false, displayOrder: 40 },
];
const procurementColumns: FaProcurementColumn[] = [
  { key: 'price', dataType: 'number', required: true, readOnly: false, priceGated: true, displayOrder: 55 },
];

const tabLabels: FaTabsLabels = {
  tablistLabel: 'FA detail departments',
  tabs: {
    core: 'Core', planning: 'Planning', commercial: 'Commercial', production: 'Production',
    technical: 'Technical', mrp: 'MRP', procurement: 'Procurement', bom: 'BOM', history: 'History',
  },
  deferred: 'Tab content deferred',
  deferredBody: 'This department workspace is delivered in a later slice.',
  locked: 'Locked',
};

function panels() {
  return {
    core: (
      <FaCoreTab productCode={PC} columns={coreColumns} values={{ product_name: 'Smoked Almond Yoghurt', pack_size: '6x400g' }} dropdowns={{}}
        labels={commonLabels({ title: 'Core section', subtitle: '', closedBadge: '✓ Closed', openBadge: 'Open', autoHint: 'auto', requiredMissingTitle: 'Required', requiredMissingBody: 'fill', save: 'Save Core', saving: 'Saving…', saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…' })} />
    ),
    planning: (
      <FaPlanningTab productCode={PC} columns={planningColumns} values={{ primary_ingredient_pct: 80 }} dropdowns={{}}
        labels={commonLabels({ title: 'Planning', subtitle: '', closedBadge: 'Closed', openBadge: 'Open', bomNoteTitle: 'BOM', bomNoteBody: 'note', save: 'Save Planning', saving: 'Saving…', saveSuccess: 'Saved', saveError: 'Failed', closeSection: 'Close Planning', selectPlaceholder: 'Select…' })} />
    ),
    commercial: (
      <FaCommercialTab productCode={PC} columns={commercialColumns} values={{ launch_date: '2026-09-01' }} closedCommercial={null} briefId={null} earliest={null}
        labels={commonLabels({ title: 'Commercial', subtitle: '', closedBadge: 'Closed', openBadge: 'Open', v08Alert: 'v08 {earliest}', v08Violation: 'v08v {earliest}', requiredMissingTitle: 'Required', requiredMissingBody: 'fill', save: 'Save Commercial', saving: 'Saving…', saveSuccess: 'Saved', saveError: 'Failed', close: 'Close Commercial' })} />
    ),
    production: (
      <FaProductionTab productCode={PC} packSizeFilled columns={productionColumns} rows={[{ id: 'r1', componentIndex: 1, intermediateCode: 'PR-001', v06Status: 'pass', values: { line: 'L1' } }]} dropdowns={{}}
        labels={commonLabels({ title: 'Production detail', componentsCount: '{count} component(s)', subtitle: '', lockedTitle: 'Blocked', lockedBody: 'fill pack size', v06Pass: 'OK', v06Warn: 'Warn', aggregateTitle: 'Aggregate', autoHint: 'auto', singleComponent: 'Component', save: 'Save Production', saving: 'Saving…', saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…' })} />
    ),
    technical: (
      <FaTechnicalTab productCode={PC} columns={technicalColumns} values={{ shelf_life: '14 days' }} dropdowns={{}}
        labels={commonLabels({ title: 'Technical', subtitle: '', closedBadge: 'Closed', openBadge: 'Open', autoHint: 'auto', requiredMissingTitle: 'Required', requiredMissingBody: 'fill', save: 'Save Technical', saving: 'Saving…', saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…', allergenSlotTitle: 'Allergens', allergenSlotSubtitle: 'sub', allergenSlotLoading: 'loading' })} />
    ),
    procurement: (
      <FaProcurementTab productCode={PC} columns={procurementColumns} values={{ price: 1.5 }} dropdowns={{}} closedCore="Yes" closedProduction="Yes"
        labels={commonLabels({ title: 'Procurement', subtitle: '', closedBadge: 'Closed', openBadge: 'Open', priceBlockedTitle: 'Blocked', priceBlockedBody: 'close core', priceBlockedHint: 'locked', save: 'Save Procurement', saving: 'Saving…', saveSuccess: 'Saved', saveError: 'Failed', selectPlaceholder: 'Select…' })} />
    ),
    history: <div data-testid="fa-history-panel">History timeline</div>,
  };
}

function renderWired(tab: string, coreDone: boolean, prodDone: boolean) {
  pathname = '/en/fa/FA0043';
  searchParams = new URLSearchParams();
  searchParams.set('tab', tab);
  return render(
    <FaTabs productCode={PC} labels={tabLabels} panels={panels()} coreDone={coreDone} prodDone={prodDone} />,
  );
}

function writeArtifact(name: string, html: string) {
  writeFileSync(resolve(evidenceDir, name), `${html}\n`, 'utf-8');
}

describe('T-105/T-106 FA dept tabs wiring — parity evidence', () => {
  beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true });
  });

  it('writes the unlocked + locked tab-bar DOM artifacts', () => {
    const unlocked = renderWired('core', true, true);
    writeArtifact('tabbar-unlocked.html', unlocked.container.innerHTML);
    // all 8 dept tabs + read-only BOM present, none locked.
    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(9);
    expect(document.querySelectorAll('[data-locked="true"]')).toHaveLength(0);
    cleanup();

    const locked = renderWired('core', false, false);
    writeArtifact('tabbar-locked.html', locked.container.innerHTML);
    // Planning/Commercial/Technical/Procurement + MRP locked (5 gated tabs).
    expect(document.querySelectorAll('[data-locked="true"]')).toHaveLength(5);
  });

  it('writes per-tab body DOM artifacts (Core/Planning/Commercial/Production/Technical/Procurement/History)', () => {
    for (const [slug, testid] of [
      ['core', 'fa-core-tab'],
      ['planning', 'fa-planning-tab'],
      ['commercial', 'fa-commercial-tab'],
      ['production', 'fa-production-tab'],
      ['technical', 'fa-technical-tab'],
      ['procurement', 'fa-procurement-tab'],
      ['history', 'fa-history-panel'],
    ] as const) {
      cleanup();
      const { container } = renderWired(slug, true, true);
      expect(screen.getByTestId(testid)).toBeInTheDocument();
      writeArtifact(`tab-${slug}.html`, container.innerHTML);
    }
  });

  it('writes a structural parity report mapping the prototype TABS array', () => {
    const report = {
      task: 'T-105 (wiring) + T-106 (parity)',
      prototype: 'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:312-408',
      tabOrder: ['core', 'planning', 'commercial', 'production', 'technical', 'mrp', 'procurement', 'bom', 'history'],
      lockModel: {
        never: ['core', 'production', 'history'],
        coreGated: ['planning', 'commercial', 'technical', 'procurement'],
        coreAndProdGated: ['mrp'],
        prototypeLines: '314-319',
      },
      wiredBodies: {
        core: 'FaCoreTab (T-023, fa-screens.jsx:455-517)',
        planning: 'FaPlanningTab (T-104, fa-screens.jsx:537-557)',
        commercial: 'FaCommercialTab (T-103, fa-screens.jsx:559-586)',
        production: 'FaProductionTab (T-024, fa-screens.jsx:571-653)',
        technical: 'FaTechnicalTab (T-026)',
        procurement: 'FaProcurementTab (T-102, fa-screens.jsx:806-838)',
        history: 'FaHistoryTab (T-027, kept working)',
        mrp: 'deferred-empty placeholder (no merged MRP component in scope)',
        bom: 'FaBomTab (read-only SCR-03h, fa-screens.jsx:840-886, Lane 12)',
      },
      realData:
        'page.tsx reads Reference.DeptColumns + product (to_jsonb) + prod_detail via withOrgContext (RLS app.current_org_id()); columns are schema-driven, not hardcoded.',
      playwrightBlocker:
        'Live RBAC-authenticated Supabase server not bootable in worktree; e2e/npd-fa-detail-tabs.spec.ts skips without PLAYWRIGHT_BASE_URL. RTL DOM artifacts are the accepted fallback per UI-PROTOTYPE-PARITY-POLICY.md.',
    };
    writeArtifact('parity-report.json', JSON.stringify(report, null, 2));
    expect(report.tabOrder).toHaveLength(9);
  });
});
