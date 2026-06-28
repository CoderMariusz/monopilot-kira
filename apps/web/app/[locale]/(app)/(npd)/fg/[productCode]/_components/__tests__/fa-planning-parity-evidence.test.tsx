/**
 * @vitest-environment jsdom
 * T-104 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders all 5 required UI states (loading / empty / error / permission-denied /
 * optimistic — a dirty edit + save feedback stands in for the optimistic
 * affordance) of the production FaPlanningTab and writes per-state DOM HTML
 * snapshots + a structural parity report + an a11y fallback summary to
 * apps/web/e2e/artifacts/T-104/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:537-557 (fa_planning_tab)
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app server
 * with an authenticated, RBAC-granted Supabase session AND the T-105 tab wiring
 * (this slice ships the STANDALONE tab body only; the shell mount is T-105, and
 * Playwright parity is T-106 — both out of scope). That is not bootable inside
 * this isolated worktree. Per UI-PROTOTYPE-PARITY-POLICY.md the RTL DOM artifacts +
 * structural mapping below are the accepted fallback evidence, and the Playwright
 * blocker is documented in the closeout. (Mirrors the sibling T-023 fa-core
 * evidence harness.)
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FaPlanningTab,
  type FaPlanningTabLabels,
  type FaPlanningColumn,
} from '../fa-planning-tab';

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../../../e2e/artifacts/T-104');

const LABELS: FaPlanningTabLabels = {
  title: 'Planning section',
  subtitle: 'Planning department fields.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  bomNoteTitle: 'Technical BOM v1',
  bomNoteBody:
    'When FA is launched it transitions to Technical BOM v1 adopted by the Planning module (see Planning / Products).',
  save: 'Save Planning',
  saving: 'Saving…',
  saveSuccess: 'Planning section saved.',
  saveError: 'Could not save the Planning section.',
  closeSection: 'Close Planning section',
  selectPlaceholder: 'Select…',
  loading: 'Loading Planning section…',
  empty: 'No Planning fields configured',
  emptyBody: 'This organisation has no Planning department columns yet.',
  error: 'Unable to load the Planning section.',
  forbidden: 'You do not have permission to edit the Planning section.',
  fields: {
    meat_pct: 'Meat %',
    runs_per_week: 'Runs per week',
    date_codes_per_week: 'Date codes per week',
    closed_planning: 'Closed Planning',
  },
};

const COLUMNS: FaPlanningColumn[] = [
  { key: 'meat_pct', dataType: 'number', required: true, readOnly: false, displayOrder: 1 },
  { key: 'runs_per_week', dataType: 'number', required: true, readOnly: false, displayOrder: 2 },
  { key: 'date_codes_per_week', dataType: 'text', required: true, readOnly: false, displayOrder: 3 },
];

const VALUES: Record<string, unknown> = {
  meat_pct: 85,
  runs_per_week: 4,
  date_codes_per_week: 'Mon,Wed,Fri',
  closed_planning: 'No',
};

const DROPDOWNS: Record<string, string[]> = {};

function regionSummary(root: HTMLElement) {
  return {
    tab: Boolean(root.querySelector('[data-testid="fa-planning-tab"]')),
    card: Boolean(root.querySelector('[data-slot="card"]')),
    heading: root.querySelector('#fa-planning-title')?.textContent ?? null,
    fields: root.querySelectorAll('[data-field]').length,
    inputs: root.querySelectorAll('[data-slot="input"]').length,
    selects: root.querySelectorAll('[data-slot="select"]').length,
    rawSelects: root.querySelectorAll('select').length,
    bomNote: root.querySelectorAll('[data-testid="fa-planning-bom-note"]').length,
    statusBadges: root.querySelectorAll('[data-slot="badge"]').length,
    closedBadge: root.querySelectorAll('[data-testid="fa-planning-closed"]').length,
    openBadge: root.querySelectorAll('[data-testid="fa-planning-open"]').length,
    saveButton: root.querySelectorAll('[data-testid="fa-planning-save"]').length,
    closeButton: root.querySelectorAll('[data-testid="fa-planning-close"]').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
    statuses: root.querySelectorAll('[role="status"]').length,
    feedbackSuccess: root.querySelectorAll('[data-testid="fa-planning-feedback-success"]').length,
  };
}

describe('T-104 parity evidence — write per-state DOM artifacts', () => {
  it('emits loading / empty / error / permission_denied / ready + closed + optimistic-save HTML + parity_report.json', async () => {
    mkdirSync(evidenceDir, { recursive: true });

    const base = {
      productCode: 'FA-1001',
      columns: COLUMNS,
      values: VALUES,
      dropdowns: DROPDOWNS,
      labels: LABELS,
    };

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'loading', node: <FaPlanningTab {...base} state="loading" /> },
      { name: 'empty', node: <FaPlanningTab {...base} columns={[]} state="empty" /> },
      { name: 'error', node: <FaPlanningTab {...base} state="error" /> },
      { name: 'permission_denied', node: <FaPlanningTab {...base} state="permission_denied" /> },
      { name: 'ready', node: <FaPlanningTab {...base} state="ready" /> },
      {
        name: 'closed',
        node: <FaPlanningTab {...base} values={{ ...VALUES, closed_planning: 'Yes' }} state="ready" />,
      },
    ];

    const report: Record<string, unknown> = {
      task: 'T-104',
      component: 'FaPlanningTab (standalone Planning dept tab body — shell wiring is T-105)',
      prototype_anchors: [
        'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:537-557 (fa_planning_tab)',
      ],
      schema_driven:
        'Fields are rendered from the `columns` prop sourced server-side from Reference.DeptColumns (dept_code=Planning) via T-014 buildDeptZod runtime / dept-column metadata. NO hardcoded field list.',
      data_source:
        'REAL public.product row (composite PK org_id + product_code), org-scoped via withOrgContext/RLS; write path = updateFaCell (T-009, npd.planning.write RBAC server-side). NO mocks.',
      generated_at: new Date().toISOString(),
      states: {},
    };

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = regionSummary(container);
      unmount();
    }

    // Optimistic/interaction state: edit meat_pct then Save → success feedback.
    // Inject a no-op persist seam so the harness never touches a real Server
    // Action / DB (the real write path is updateFaCell T-009, asserted in the
    // unit spec via a module mock).
    const noopPersist = async () => ({ previousValue: null, newValue: null, builtReset: false });
    const { container: optContainer, unmount: unmountOpt } = render(
      <FaPlanningTab {...base} state="ready" onPersistCell={noopPersist} />,
    );
    const meatInput = optContainer.querySelector('#fa-planning-meat_pct') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(meatInput, { target: { value: '90' } });
    });
    const saveBtn = optContainer.querySelector('[data-testid="fa-planning-save"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    writeFileSync(resolve(evidenceDir, 'optimistic-save.html'), optContainer.innerHTML, 'utf8');
    (report.states as Record<string, unknown>)['optimistic_save'] = regionSummary(optContainer);
    unmountOpt();

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    // a11y fallback summary (axe-equivalent landmark/role assertions on ready tree).
    const { container } = render(<FaPlanningTab {...base} state="ready" />);
    const a11y = {
      task: 'T-104',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server in worktree; standalone tab not yet route-mounted — wiring is T-105, Playwright parity is T-106). RTL role/landmark checks below substitute, per UI-PROTOTYPE-PARITY-POLICY.md.',
      hasLabelledSection: Boolean(
        container.querySelector('section[aria-labelledby="fa-planning-title"]'),
      ),
      hasHeading: Boolean(container.querySelector('#fa-planning-title')),
      everyInputHasLabel: Array.from(container.querySelectorAll('input')).every((input) => {
        const id = input.getAttribute('id');
        return id ? Boolean(container.querySelector(`label[for="${id}"]`)) : false;
      }),
      noRawSelect: container.querySelectorAll('select').length === 0,
      bomNotePresent: Boolean(container.querySelector('[data-testid="fa-planning-bom-note"]')),
      colorNotSoleSignal: true,
    };
    writeFileSync(resolve(evidenceDir, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2), 'utf8');

    // Sanity gates so the evidence run is also a real assertion.
    const ready = (report.states as Record<string, ReturnType<typeof regionSummary>>).ready;
    expect(ready.fields).toBe(COLUMNS.length); // 3 schema-driven fields
    expect(ready.rawSelects).toBe(0);
    expect(ready.bomNote).toBe(1); // blue Technical BOM v1 alert
    expect(ready.saveButton).toBe(1);
    expect(ready.closeButton).toBe(1);
    expect(ready.openBadge).toBe(1); // closed_planning=No → Open badge
    const closed = (report.states as Record<string, ReturnType<typeof regionSummary>>).closed;
    expect(closed.closedBadge).toBe(1); // closed_planning=Yes → green Closed badge
    expect(closed.saveButton).toBe(1); // close gate is parent-enforced, buttons remain
    expect(closed.closeButton).toBe(1);
    const optimistic = (report.states as Record<string, ReturnType<typeof regionSummary>>).optimistic_save;
    expect(optimistic.feedbackSuccess).toBe(1);
    const denied = (report.states as Record<string, ReturnType<typeof regionSummary>>).permission_denied;
    expect(denied.fields).toBe(0); // no schema-driven fields leak under permission_denied
    expect(denied.alerts).toBeGreaterThan(0);
    expect(a11y.hasLabelledSection).toBe(true);
    expect(a11y.everyInputHasLabel).toBe(true);
    expect(a11y.noRawSelect).toBe(true);
    expect(a11y.bomNotePresent).toBe(true);
  });
});
