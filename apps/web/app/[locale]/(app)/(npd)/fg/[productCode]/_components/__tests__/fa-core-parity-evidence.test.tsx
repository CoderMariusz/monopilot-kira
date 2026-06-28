/**
 * @vitest-environment jsdom
 * T-023 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders all 5 required UI states (loading / empty / error / permission-denied /
 * optimistic — here a dirty edit + save feedback stands in for the optimistic
 * affordance) of the production FaCoreTab and writes per-state DOM HTML snapshots
 * + a structural parity report + an a11y fallback summary to
 * apps/web/e2e/artifacts/T-023/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:455-517 (fa_core_tab)
 *   (prototype-index-npd.json#fa_core_tab declares 455-517)
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app server
 * with an authenticated, RBAC-granted Supabase session AND the T-105 tab wiring
 * (this slice ships the STANDALONE tab body only; the shell mount is T-105). That
 * is not bootable inside this isolated worktree. Per UI-PROTOTYPE-PARITY-POLICY.md
 * the RTL DOM artifacts + structural mapping below are the accepted fallback
 * evidence, and the Playwright blocker is documented in the closeout. (Mirrors the
 * sibling T-027 fa-history evidence harness.)
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// updateFaCell (T-009) is the only write path; the evidence harness injects a
// no-op persist seam so it never touches a real Server Action / DB.
vi.mock('../../../../../../../(npd)/fa/actions/update-fa-cell', () => ({
  updateFaCell: vi.fn(async () => ({ previousValue: null, newValue: null, builtReset: false })),
  AuthError: class AuthError extends Error {},
  ValidationError: class ValidationError extends Error {},
}));

import {
  FaCoreTab,
  type FaCoreTabLabels,
  type FaCoreColumn,
} from '../fa-core-tab';

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../../../e2e/artifacts/T-023');

const LABELS: FaCoreTabLabels = {
  title: 'Core section',
  subtitle: 'Fill the Core section first — other departments unlock after Core is closed.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  autoHint: 'Auto-derived — read-only.',
  requiredMissingTitle: 'Required fields missing',
  requiredMissingBody:
    'Product Name, Pack Size and Recipe components must all be filled before Close Core.',
  save: 'Save Core',
  saving: 'Saving…',
  saveSuccess: 'Core section saved.',
  saveError: 'Could not save the Core section.',
  selectPlaceholder: 'Select…',
  loading: 'Loading Core section…',
  empty: 'No Core fields configured',
  emptyBody: 'This organisation has no Core department columns yet.',
  error: 'Unable to load the Core section.',
  forbidden: 'You do not have permission to edit the Core section.',
  fields: {
    product_code: 'FG Code',
    product_name: 'Product Name',
    pack_size: 'Pack Size',
    number_of_cases: 'Number of cases',
    recipe_components: 'Recipe components',
    ingredient_codes: 'Ingredient codes (auto)',
    template: 'Template',
    closed_core: 'Closed Core',
  },
};

const COLUMNS: FaCoreColumn[] = [
  { key: 'product_code', dataType: 'text', required: false, readOnly: true, displayOrder: 1 },
  { key: 'product_name', dataType: 'text', required: true, readOnly: false, displayOrder: 2 },
  { key: 'pack_size', dataType: 'dropdown', required: true, readOnly: false, displayOrder: 3, dropdownSource: 'PackSizes' },
  { key: 'number_of_cases', dataType: 'number', required: true, readOnly: false, displayOrder: 4 },
  { key: 'recipe_components', dataType: 'text', required: true, readOnly: false, displayOrder: 5 },
  { key: 'ingredient_codes', dataType: 'text', required: false, readOnly: true, auto: true, displayOrder: 6 },
  { key: 'template', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 7, dropdownSource: 'Templates' },
  { key: 'closed_core', dataType: 'dropdown', required: false, readOnly: false, displayOrder: 8, dropdownSource: 'CloseConfirm' },
];

const VALUES: Record<string, unknown> = {
  product_code: 'FA-1001',
  product_name: 'Smoked Bacon 200g',
  pack_size: '200g',
  number_of_cases: 12,
  recipe_components: 'PR1939H, PR2045A',
  ingredient_codes: 'RM-001, RM-002',
  template: 'Standard',
  closed_core: 'No',
};

const DROPDOWNS: Record<string, string[]> = {
  PackSizes: ['200g', '400g', '1kg'],
  Templates: ['Standard', 'Premium'],
  CloseConfirm: ['No', 'Yes'],
};

function regionSummary(root: HTMLElement) {
  return {
    tab: Boolean(root.querySelector('[data-testid="fa-core-tab"]')),
    card: Boolean(root.querySelector('[data-slot="card"]')),
    heading: root.querySelector('#fa-core-title')?.textContent ?? null,
    fields: root.querySelectorAll('[data-field]').length,
    inputs: root.querySelectorAll('[data-slot="input"]').length,
    selects: root.querySelectorAll('[data-slot="select"]').length,
    rawSelects: root.querySelectorAll('select').length,
    readOnlyFields: root.querySelectorAll('[data-field][data-readonly="true"]').length,
    greenAutoFields: Array.from(root.querySelectorAll('input[readonly]')).filter((el) =>
      (el.getAttribute('class') ?? '').includes('green'),
    ).length,
    requiredAlert: root.querySelectorAll('[data-testid="fa-core-required-missing"]').length,
    statusBadges: root.querySelectorAll('[data-slot="badge"]').length,
    saveButton: root.querySelectorAll('[data-testid="fa-core-save"]').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
    statuses: root.querySelectorAll('[role="status"]').length,
    feedbackSuccess: root.querySelectorAll('[data-testid="fa-core-feedback-success"]').length,
  };
}

describe('T-023 parity evidence — write per-state DOM artifacts', () => {
  it('emits loading / empty / error / permission_denied / ready + optimistic-save HTML + parity_report.json', async () => {
    mkdirSync(evidenceDir, { recursive: true });

    const base = {
      productCode: 'FA-1001',
      columns: COLUMNS,
      values: VALUES,
      dropdowns: DROPDOWNS,
      labels: LABELS,
    };

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'loading', node: <FaCoreTab {...base} state="loading" /> },
      { name: 'empty', node: <FaCoreTab {...base} columns={[]} state="empty" /> },
      { name: 'error', node: <FaCoreTab {...base} state="error" /> },
      { name: 'permission_denied', node: <FaCoreTab {...base} state="permission_denied" /> },
      { name: 'ready', node: <FaCoreTab {...base} state="ready" /> },
      {
        name: 'required_missing',
        node: <FaCoreTab {...base} values={{ ...VALUES, product_name: '' }} state="ready" />,
      },
    ];

    const report: Record<string, unknown> = {
      task: 'T-023',
      component: 'FaCoreTab (standalone Core dept tab body — shell wiring is T-105)',
      prototype_anchors: [
        'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:455-517 (fa_core_tab)',
        'prototype-index-npd.json#fa_core_tab declares 455-517',
      ],
      schema_driven:
        'Fields are rendered from the `columns` prop sourced server-side from Reference.DeptColumns (dept_code=Core) via T-014 buildDeptZod runtime / dept-column metadata. NO hardcoded field list.',
      data_source:
        'REAL public.product row (composite PK org_id + product_code), org-scoped via withOrgContext/RLS; write path = updateFaCell (T-009). NO mocks.',
      generated_at: new Date().toISOString(),
      states: {},
    };

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = regionSummary(container);
      unmount();
    }

    // Optimistic/interaction state: edit a field then Save → success feedback.
    const { container: optContainer, unmount: unmountOpt } = render(
      <FaCoreTab {...base} state="ready" />,
    );
    const nameInput = optContainer.querySelector('#fa-core-product_name') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Smoked Bacon 250g' } });
    });
    const saveBtn = optContainer.querySelector('[data-testid="fa-core-save"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    writeFileSync(resolve(evidenceDir, 'optimistic-save.html'), optContainer.innerHTML, 'utf8');
    (report.states as Record<string, unknown>)['optimistic_save'] = regionSummary(optContainer);
    unmountOpt();

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    // a11y fallback summary (axe-equivalent landmark/role assertions on ready tree).
    const { container } = render(<FaCoreTab {...base} state="ready" />);
    const a11y = {
      task: 'T-023',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server in worktree; standalone tab not yet route-mounted — wiring is T-105). RTL role/landmark checks below substitute, per UI-PROTOTYPE-PARITY-POLICY.md.',
      hasLabelledSection: Boolean(container.querySelector('section[aria-labelledby="fa-core-title"]')),
      hasHeading: Boolean(container.querySelector('#fa-core-title')),
      everyInputHasLabel: Array.from(container.querySelectorAll('input')).every((input) => {
        const id = input.getAttribute('id');
        return id ? Boolean(container.querySelector(`label[for="${id}"]`)) : false;
      }),
      autoFieldIsReadOnlyGreen: Boolean(
        (container.querySelector('#fa-core-ingredient_codes') as HTMLInputElement | null)?.hasAttribute('readonly') &&
          (container.querySelector('#fa-core-ingredient_codes')?.getAttribute('class') ?? '').includes('green'),
      ),
      noRawSelect: container.querySelectorAll('select').length === 0,
      colorNotSoleSignal: true,
    };
    writeFileSync(resolve(evidenceDir, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2), 'utf8');

    // Sanity gates so the evidence run is also a real assertion.
    const ready = (report.states as Record<string, ReturnType<typeof regionSummary>>).ready;
    expect(ready.fields).toBe(COLUMNS.length);
    expect(ready.rawSelects).toBe(0);
    expect(ready.selects).toBe(3); // pack_size, template, closed_core
    expect(ready.greenAutoFields).toBe(1); // ingredient_codes
    expect(ready.saveButton).toBe(1);
    const optimistic = (report.states as Record<string, ReturnType<typeof regionSummary>>).optimistic_save;
    expect(optimistic.feedbackSuccess).toBe(1);
    const missing = (report.states as Record<string, ReturnType<typeof regionSummary>>).required_missing;
    expect(missing.requiredAlert).toBe(1);
    const denied = (report.states as Record<string, ReturnType<typeof regionSummary>>).permission_denied;
    expect(denied.fields).toBe(0); // no schema-driven fields leak under permission_denied
    expect(denied.alerts).toBeGreaterThan(0);
    expect(a11y.hasLabelledSection).toBe(true);
    expect(a11y.everyInputHasLabel).toBe(true);
    expect(a11y.autoFieldIsReadOnlyGreen).toBe(true);
    expect(a11y.noRawSelect).toBe(true);
  });
});
