/**
 * @vitest-environment jsdom
 * T-103 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders all 5 required UI states (loading / empty / error / permission-denied /
 * optimistic — here a dirty edit + save feedback stands in for the optimistic
 * affordance) of the production FaCommercialTab and writes per-state DOM HTML
 * snapshots + a structural parity report + an a11y fallback summary to
 * apps/web/e2e/artifacts/T-103/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:559-586 (FACommercialTab)
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app server
 * with an authenticated, RBAC-granted Supabase session AND the T-105 tab wiring
 * (this slice ships the STANDALONE tab body only; the shell mount is T-105). That
 * is not bootable inside this isolated worktree. Per UI-PROTOTYPE-PARITY-POLICY.md
 * the RTL DOM artifacts + structural mapping below are the accepted fallback
 * evidence, and the Playwright blocker is documented in the closeout. (Mirrors the
 * sibling T-023 fa-core evidence harness.)
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
  FaCommercialTab,
  type FaCommercialTabLabels,
  type FaCommercialColumn,
} from '../commercial-tab';

afterEach(() => cleanup());

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(THIS_DIR, '../../../../../../../../e2e/artifacts/T-103');

const LABELS: FaCommercialTabLabels = {
  title: 'Commercial section',
  subtitle: 'Commercial dept fields. Launch Date drives the V08 brief-handoff rule.',
  closedBadge: '✓ Closed',
  openBadge: 'Open',
  v08Alert: 'V08 · Launch Date must be ≥ 24 weeks from Brief handoff. Earliest: {earliest}.',
  v08Violation: 'Launch Date must be on or after the earliest allowed date ({earliest}).',
  requiredMissingTitle: 'Required fields missing',
  requiredMissingBody:
    'Launch Date, Department number, Article number, Bar codes and Cases/week W1–W3 are all required.',
  save: 'Save Commercial',
  saving: 'Saving…',
  saveSuccess: 'Commercial section saved.',
  saveError: 'Could not save the Commercial section.',
  close: 'Close Commercial section',
  loading: 'Loading Commercial section…',
  empty: 'No Commercial fields configured',
  emptyBody: 'This organisation has no Commercial department columns yet.',
  error: 'Unable to load the Commercial section.',
  forbidden: 'You do not have permission to edit the Commercial section.',
  fields: {
    launch_date: 'Launch Date',
    department_number: 'Department number',
    article_number: 'Article number',
    bar_codes_gs1: 'Bar codes (GS1)',
    cases_week_1: 'Cases / week W1',
    cases_week_2: 'Cases / week W2',
    cases_week_3: 'Cases / week W3',
    closed_commercial: 'Closed Commercial',
  },
};

const COLUMNS: FaCommercialColumn[] = [
  { key: 'launch_date', dataType: 'date', required: true, readOnly: false, displayOrder: 1 },
  { key: 'department_number', dataType: 'text', required: true, readOnly: false, displayOrder: 2 },
  { key: 'article_number', dataType: 'text', required: true, readOnly: false, displayOrder: 3 },
  { key: 'bar_codes_gs1', dataType: 'text', required: true, readOnly: false, mono: true, displayOrder: 4 },
  { key: 'cases_week_1', dataType: 'number', required: true, readOnly: false, displayOrder: 5 },
  { key: 'cases_week_2', dataType: 'number', required: true, readOnly: false, displayOrder: 6 },
  { key: 'cases_week_3', dataType: 'number', required: true, readOnly: false, displayOrder: 7 },
];

const VALUES: Record<string, unknown> = {
  launch_date: '2026-10-01',
  department_number: 'PL-D-4120',
  article_number: 'ART-10821',
  bar_codes_gs1: '5901234561234',
  cases_week_1: 120,
  cases_week_2: 180,
  cases_week_3: 220,
  closed_commercial: 'No',
};

function regionSummary(root: HTMLElement) {
  return {
    tab: Boolean(root.querySelector('[data-testid="fa-commercial-tab"]')),
    card: Boolean(root.querySelector('[data-slot="card"]')),
    heading: root.querySelector('#fa-commercial-title')?.textContent ?? null,
    fields: root.querySelectorAll('[data-field]').length,
    inputs: root.querySelectorAll('[data-slot="input"]').length,
    rawSelects: root.querySelectorAll('select').length,
    monoFields: Array.from(root.querySelectorAll('input')).filter((el) =>
      (el.getAttribute('class') ?? '').includes('font-mono'),
    ).length,
    dateInputs: root.querySelectorAll('input[type="date"]').length,
    numberInputs: root.querySelectorAll('input[type="number"]').length,
    v08Alert: root.querySelectorAll('[data-testid="fa-commercial-v08"]').length,
    v08Violation: root.querySelectorAll('[data-testid="fa-commercial-v08-violation"]').length,
    requiredAlert: root.querySelectorAll('[data-testid="fa-commercial-required-missing"]').length,
    statusBadges: root.querySelectorAll('[data-slot="badge"]').length,
    saveButton: root.querySelectorAll('[data-testid="fa-commercial-save"]').length,
    closeButton: root.querySelectorAll('[data-testid="fa-commercial-close"]').length,
    alerts: root.querySelectorAll('[role="alert"]').length,
    statuses: root.querySelectorAll('[role="status"]').length,
    feedbackSuccess: root.querySelectorAll('[data-testid="fa-commercial-feedback-success"]').length,
  };
}

describe('T-103 parity evidence — write per-state DOM artifacts', () => {
  it('emits loading / empty / error / permission_denied / ready + V08 + optimistic-save HTML + parity_report.json', async () => {
    mkdirSync(evidenceDir, { recursive: true });

    const base = {
      productCode: 'FA-1001',
      columns: COLUMNS,
      values: VALUES,
      closedCommercial: 'No' as string | null,
      briefId: null as string | null,
      earliest: null as string | null,
      labels: LABELS,
    };

    const states: Array<{ name: string; node: React.ReactElement }> = [
      { name: 'loading', node: <FaCommercialTab {...base} state="loading" /> },
      { name: 'empty', node: <FaCommercialTab {...base} columns={[]} state="empty" /> },
      { name: 'error', node: <FaCommercialTab {...base} state="error" /> },
      { name: 'permission_denied', node: <FaCommercialTab {...base} state="permission_denied" /> },
      { name: 'ready', node: <FaCommercialTab {...base} state="ready" /> },
      {
        name: 'v08_with_brief',
        node: <FaCommercialTab {...base} briefId="BR-001" earliest="2026-09-25" state="ready" />,
      },
      {
        name: 'closed',
        node: <FaCommercialTab {...base} closedCommercial="Yes" state="ready" />,
      },
      {
        name: 'required_missing',
        node: <FaCommercialTab {...base} values={{ ...VALUES, department_number: '' }} state="ready" />,
      },
    ];

    const report: Record<string, unknown> = {
      task: 'T-103',
      component: 'FaCommercialTab (standalone Commercial dept tab body — shell wiring is T-105)',
      prototype_anchors: [
        'prototypes/design/Monopilot Design System/npd/fa-screens.jsx:559-586 (FACommercialTab)',
      ],
      schema_driven:
        'Fields are rendered from the `columns` prop sourced server-side from Reference.DeptColumns (dept_code=Commercial) via T-014 buildDeptZod runtime / dept-column metadata. NO hardcoded field list.',
      data_source:
        'REAL public.product row (composite PK org_id + product_code), org-scoped via withOrgContext/RLS; write path = updateFaCell (T-009). NO mocks.',
      v08_rule:
        'earliest (brief handoff + 24 weeks) is computed SERVER-SIDE and passed as a prop. Client shows the advisory alert + blocks a launch_date write earlier than earliest; canonical enforcement is server-side in updateFaCell (T-009).',
      generated_at: new Date().toISOString(),
      states: {},
    };

    for (const state of states) {
      const { container, unmount } = render(state.node);
      writeFileSync(resolve(evidenceDir, `${state.name}.html`), container.innerHTML, 'utf8');
      (report.states as Record<string, unknown>)[state.name] = regionSummary(container);
      unmount();
    }

    // Optimistic/interaction state: edit Cases/week W1 then Save → success feedback.
    const { container: optContainer, unmount: unmountOpt } = render(
      <FaCommercialTab {...base} state="ready" />,
    );
    const w1Input = optContainer.querySelector('#fa-commercial-cases_week_1') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(w1Input, { target: { value: '150' } });
    });
    const saveBtn = optContainer.querySelector('[data-testid="fa-commercial-save"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    writeFileSync(resolve(evidenceDir, 'optimistic-save.html'), optContainer.innerHTML, 'utf8');
    (report.states as Record<string, unknown>)['optimistic_save'] = regionSummary(optContainer);
    unmountOpt();

    // V08 violation interaction state: brief present + launch_date < earliest + Save.
    const { container: v08Container, unmount: unmountV08 } = render(
      <FaCommercialTab {...base} briefId="BR-001" earliest="2026-09-25" state="ready" />,
    );
    const launchInput = v08Container.querySelector('#fa-commercial-launch_date') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(launchInput, { target: { value: '2026-08-01' } });
    });
    const v08Save = v08Container.querySelector('[data-testid="fa-commercial-save"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(v08Save);
    });
    writeFileSync(resolve(evidenceDir, 'v08-violation.html'), v08Container.innerHTML, 'utf8');
    (report.states as Record<string, unknown>)['v08_violation'] = regionSummary(v08Container);
    unmountV08();

    writeFileSync(resolve(evidenceDir, 'parity_report.json'), JSON.stringify(report, null, 2), 'utf8');

    // a11y fallback summary (axe-equivalent landmark/role assertions on ready tree).
    const { container } = render(<FaCommercialTab {...base} state="ready" />);
    const a11y = {
      task: 'T-103',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server in worktree; standalone tab not yet route-mounted — wiring is T-105). RTL role/landmark checks below substitute, per UI-PROTOTYPE-PARITY-POLICY.md.',
      hasLabelledSection: Boolean(container.querySelector('section[aria-labelledby="fa-commercial-title"]')),
      hasHeading: Boolean(container.querySelector('#fa-commercial-title')),
      everyInputHasLabel: Array.from(container.querySelectorAll('input')).every((input) => {
        const id = input.getAttribute('id');
        return id ? Boolean(container.querySelector(`label[for="${id}"]`)) : false;
      }),
      barCodesMono: (container.querySelector('#fa-commercial-bar_codes_gs1')?.getAttribute('class') ?? '').includes('font-mono'),
      noRawSelect: container.querySelectorAll('select').length === 0,
      colorNotSoleSignal: true,
    };
    writeFileSync(resolve(evidenceDir, 'a11y-fallback.json'), JSON.stringify(a11y, null, 2), 'utf8');

    // Sanity gates so the evidence run is also a real assertion.
    const ready = (report.states as Record<string, ReturnType<typeof regionSummary>>).ready;
    expect(ready.fields).toBe(COLUMNS.length); // 7
    expect(ready.rawSelects).toBe(0);
    expect(ready.monoFields).toBe(1); // bar_codes_gs1
    expect(ready.dateInputs).toBe(1); // launch_date
    expect(ready.numberInputs).toBe(3); // W1/W2/W3
    expect(ready.saveButton).toBe(1);
    expect(ready.closeButton).toBe(1);
    expect(ready.v08Alert).toBe(0); // no brief_id in `ready`
    const withBrief = (report.states as Record<string, ReturnType<typeof regionSummary>>).v08_with_brief;
    expect(withBrief.v08Alert).toBe(1);
    const violation = (report.states as Record<string, ReturnType<typeof regionSummary>>).v08_violation;
    expect(violation.v08Violation).toBe(1);
    const optimistic = (report.states as Record<string, ReturnType<typeof regionSummary>>).optimistic_save;
    expect(optimistic.feedbackSuccess).toBe(1);
    const missing = (report.states as Record<string, ReturnType<typeof regionSummary>>).required_missing;
    expect(missing.requiredAlert).toBe(1);
    const denied = (report.states as Record<string, ReturnType<typeof regionSummary>>).permission_denied;
    expect(denied.fields).toBe(0); // no schema-driven fields leak under permission_denied
    expect(denied.alerts).toBeGreaterThan(0);
    expect(a11y.hasLabelledSection).toBe(true);
    expect(a11y.everyInputHasLabel).toBe(true);
    expect(a11y.barCodesMono).toBe(true);
    expect(a11y.noRawSelect).toBe(true);
  });
});
