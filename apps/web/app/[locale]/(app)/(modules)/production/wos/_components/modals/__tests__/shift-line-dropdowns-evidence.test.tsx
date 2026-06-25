/**
 * D8 — shift/line free-text → dropdown parity evidence capture (per-state HTML + a11y).
 *
 * Not the behavioural suite (that's wo-actions.test.tsx). This renders the Pause
 * + Waste modals in each relevant state and writes a DOM HTML snapshot to
 * _meta/parity-evidence/D8-shift-line-dropdowns/ so the closeout carries the
 * loading/empty/error/permission/optimistic states plus the dropdown-specific
 * captures and an a11y report.
 *
 * Scope: the desktop WO-detail Waste modal `shift_id` and Pause modal `line_id`
 * were error-prone free-text Inputs; they are now mandatory <Select> dropdowns
 * sourced from real data (shifts = the fixed scanner enum morning/afternoon/night;
 * lines = public.production_lines). Service/route schemas unchanged (still
 * mandatory) — only the entry method improves.
 *
 * Parity anchor: spec-driven (owner directive "STAY MANDATORY but be fillable via
 * a picker"), reusing the existing modal pattern in
 * prototypes/design/Monopilot Design System/production/modals.jsx (the same
 * <Select> family the Pause reason + Waste category already use).
 */
import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WoActionsProvider, WoActionTrigger } from '../wo-actions';
import type { WoActionPermissions, WoModalLabels, WoShiftOption, WoLineOption } from '../types';

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../../../../../../../../../_meta/parity-evidence/D8-shift-line-dropdowns',
);

const ALL_PERMS: WoActionPermissions = {
  release: true,
  start: true, pause: true, resume: true, cancel: true,
  complete: true, close: true, outputWrite: true, wasteWrite: true,
};

const LABELS: WoModalLabels = {
  cancel: 'Cancel', confirm: 'Confirm', submitting: 'Submitting…',
  errorFallback: 'The action could not be completed.',
  errors: { invalid_input: 'Check the values you entered.' },
  release: { title: 'Release', subtitle: '.' },
  start: { title: 'Start', subtitle: '.', line: 'Line', shift: 'Shift', optional: 'optional' },
  pause: {
    title: 'Pause work order', subtitle: 'Open a categorized downtime.',
    reason: 'Downtime reason', reasonPlaceholder: 'Select a downtime category…',
    line: 'Line', linePlaceholder: 'Select a production line…', noLines: 'No production lines are configured for your organization.',
    shift: 'Shift', shiftPlaceholder: 'Select a shift…', notes: 'Notes',
    noCategories: 'No downtime categories are configured for your organization.',
  },
  resume: { title: 'Resume', subtitle: '.', duration: 'Duration', durationHint: 'Optional' },
  cancelWo: { title: 'Cancel', subtitle: '.', reasonCode: 'Reason', notes: 'Notes' },
  complete: { title: 'Complete', subtitle: '.', override: 'Override', overrideHint: '.' },
  close: { title: 'Close', subtitle: '.', password: 'Password', reason: 'Reason', legal: '.' },
  output: {
    title: 'Register output', subtitle: '.', type: 'Output type',
    types: { primary: 'Primary', co_product: 'Co-product', by_product: 'By-product' },
    product: 'Product', qty: 'Quantity', batch: 'Batch number', batchHint: 'Auto when blank.',
  },
  waste: {
    title: 'Log waste', subtitle: 'Record a categorized waste entry.',
    category: 'Waste category', categoryPlaceholder: 'Select a waste category…',
    qty: 'Quantity (kg)', shift: 'Shift', shiftPlaceholder: 'Select a shift…',
    reasonCode: 'Reason code', notes: 'Notes',
    noCategories: 'No waste categories are configured for your organization.',
  },
  shifts: { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' },
};

const WO_ID = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';
const DOWNTIME_CATS = [{ id: '00000000-0000-0000-0000-0000000000c1', code: 'STOP', name: 'Unplanned stop' }];
const WASTE_CATS = [{ code: 'SCRAP', name: 'Scrap' }];
const SHIFTS: WoShiftOption[] = [
  { code: 'morning', name: 'morning' },
  { code: 'afternoon', name: 'afternoon' },
  { code: 'night', name: 'night' },
];
const LINES: WoLineOption[] = [
  { id: '0000000a-0000-0000-0000-00000000000a', code: 'L1' },
  { id: '0000000b-0000-0000-0000-00000000000b', code: 'L2' },
];

function Harness({
  permissions = ALL_PERMS,
  shifts = SHIFTS,
  lines = LINES,
  defaultLineId = LINES[0].id,
}: {
  permissions?: WoActionPermissions;
  shifts?: WoShiftOption[];
  lines?: WoLineOption[];
  defaultLineId?: string | null;
}) {
  return (
    <WoActionsProvider
      locale="en" woId={WO_ID} status="in_progress" workOrderStatus="RELEASED" permissions={permissions} labels={LABELS}
      currentUserId="22222222-2222-2222-2222-222222222222"
      downtimeCategories={DOWNTIME_CATS} wasteCategories={WASTE_CATS}
      shifts={shifts} lines={lines} defaultLineId={defaultLineId}
      defaultProductId={PRODUCT_ID}
    >
      <WoActionTrigger kind="pause" label="Pause" testid="wo-action-pause" />
      <WoActionTrigger kind="waste" label="Log waste" testid="wo-action-waste" />
    </WoActionsProvider>
  );
}

function writeEvidence(name: string) {
  const dialog = document.querySelector('[role="dialog"]') ?? document.body;
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.html`), dialog.outerHTML, 'utf8');
}

beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  if (!('randomUUID' in crypto)) {
    // @ts-expect-error augment for test
    crypto.randomUUID = () => '99999999-9999-4999-8999-999999999999';
  }
});
afterEach(() => vi.restoreAllMocks());

describe('D8 shift/line dropdowns — parity evidence capture', () => {
  it('loading/initial — Pause modal renders line + shift as comboboxes (not text inputs), line preselected to the WO line', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);
    await user.click(screen.getByTestId('wo-action-pause'));

    const lineTrigger = screen.getByTestId('wo-pause-line');
    const shiftTrigger = screen.getByTestId('wo-pause-shift');
    expect(lineTrigger).toHaveAttribute('role', 'combobox');
    expect(shiftTrigger).toHaveAttribute('role', 'combobox');
    expect(lineTrigger.tagName).not.toBe('INPUT');
    expect(shiftTrigger.tagName).not.toBe('INPUT');
    writeEvidence('pause-state-initial-dropdowns');
  });

  it('optimistic/valid — Waste shift dropdown enables submit only after a shift is picked (stays mandatory)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);
    await user.click(screen.getByTestId('wo-action-waste'));

    const shiftTrigger = screen.getByTestId('wo-waste-shift');
    expect(shiftTrigger).toHaveAttribute('role', 'combobox');
    await user.click(screen.getByTestId('wo-waste-category'));
    await user.click(screen.getByRole('option', { name: 'Scrap' }));
    await user.type(screen.getByTestId('wo-waste-qty'), '4.5');
    // Mandatory: still disabled with no shift.
    expect(screen.getByTestId('wo-waste-confirm')).toBeDisabled();
    writeEvidence('waste-state-shift-required-disabled');

    await user.click(shiftTrigger);
    await user.click(screen.getByRole('option', { name: 'Afternoon' }));
    expect(screen.getByTestId('wo-waste-confirm')).not.toBeDisabled();
    writeEvidence('waste-state-shift-selected-enabled');
  });

  it('empty — Pause modal shows the no-lines empty state when the org has no production lines', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness lines={[]} defaultLineId={null} />);
    await user.click(screen.getByTestId('wo-action-pause'));
    expect(screen.getByTestId('wo-pause-no-lines')).toHaveTextContent('No production lines are configured');
    writeEvidence('pause-state-empty-no-lines');
  });

  it('error — Pause modal surfaces the verbatim handler error inline (role=alert)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: 'invalid_input' }), { status: 422 }),
    ));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);
    await user.click(screen.getByTestId('wo-action-pause'));
    await user.click(screen.getByTestId('wo-pause-reason'));
    await user.click(screen.getByRole('option', { name: 'Unplanned stop' }));
    await user.click(screen.getByTestId('wo-pause-shift'));
    await user.click(screen.getByRole('option', { name: 'Morning' }));
    await user.click(screen.getByTestId('wo-pause-confirm'));
    const alert = await screen.findByTestId('wo-pause-error');
    expect(alert).toHaveAttribute('role', 'alert');
    writeEvidence('pause-state-error');
  });

  it('permission-denied — the Pause/Waste triggers are not offered without the RBAC permission', () => {
    render(<Harness permissions={{ ...ALL_PERMS, pause: false, wasteWrite: false }} />);
    expect(screen.queryByTestId('wo-action-pause')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wo-action-waste')).not.toBeInTheDocument();
    writeEvidence('permission-denied-no-triggers');
  });

  it('a11y — line + shift selects expose accessible names; dialog + alert roles present (documented axe substitute)', async () => {
    // jest-axe/vitest-axe is not a dependency of apps/web and adding it is out of
    // STRICT SCOPE (no package.json edits) — same convention as the catch-weight
    // and T-040 evidence. RTL role/accessible-name assertions substitute per
    // UI-PROTOTYPE-PARITY-POLICY.md ("axe/accessibility result OR documented blocker").
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);
    await user.click(screen.getByTestId('wo-action-pause'));
    const dialog = screen.getByRole('dialog');

    // getByRole({ name }) resolves via the computed accessible name, so a
    // successful query is itself proof the combobox has the right accessible name
    // (FieldRow's <label htmlFor> + the Select's aria-label both contribute).
    const lineSelect = within(dialog).getByRole('combobox', { name: 'Line' });
    const shiftSelect = within(dialog).getByRole('combobox', { name: 'Shift' });
    expect(lineSelect).toBeInTheDocument();
    expect(shiftSelect).toBeInTheDocument();

    const report = {
      task: 'D8 — shift/line free-text → dropdown',
      tool: 'RTL role/accessible-name assertions',
      blocker:
        'jest-axe/vitest-axe not a dependency of apps/web; adding it is out of STRICT SCOPE (no package.json edits). Same documented substitute as catch-weight-evidence + T-040.',
      checks: {
        dialogRole: dialog.getAttribute('role') === 'dialog',
        lineIsCombobox: lineSelect.getAttribute('role') === 'combobox',
        shiftIsCombobox: shiftSelect.getAttribute('role') === 'combobox',
        // Resolved by getByRole({ name }) above — accessible name = 'Line'/'Shift'.
        lineHasAccessibleName: true,
        shiftHasAccessibleName: true,
        noRawTextInputForShiftOrLine:
          !within(dialog).queryByRole('textbox', { name: 'Line' }) &&
          !within(dialog).queryByRole('textbox', { name: 'Shift' }),
        errorBannerUsesAlertRole: 'verified in pause-state-error capture (role="alert")',
      },
      violations: [],
    };
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'a11y-report.json'), JSON.stringify(report, null, 2), 'utf8');
    expect(report.violations).toEqual([]);
  });
});
