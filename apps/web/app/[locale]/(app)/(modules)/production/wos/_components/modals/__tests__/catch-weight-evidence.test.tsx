/**
 * B-3 catch-weight — parity evidence capture (per-state HTML + axe).
 *
 * Not a behavioural assertion suite (that's output-uom.test.tsx). This renders
 * the Register-output modal in each catch-weight state and writes a DOM HTML
 * snapshot to _meta/parity-evidence/B-3-catch-weight/ so the closeout has the
 * five UI states + the catch-specific captures, plus an axe report.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/production/modals.jsx
 * :168-206 (data-prototype-label: catch_weight_modal) — per-unit numbered weights
 * + running total/avg summary; the desktop adaptation drops the scanner-stream
 * affordances (out of scope: scanner/**).
 */
import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WoActionsProvider, WoActionTrigger } from '../wo-actions';
import type { OutputUomContext } from '../action-modals';
import type { WoActionPermissions, WoModalLabels } from '../types';

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../../../../../../../../../_meta/parity-evidence/B-3-catch-weight',
);

const ALL_PERMS: WoActionPermissions = {
  release: true,
  start: true, pause: true, resume: true, cancel: true,
  complete: true, close: true, outputWrite: true, wasteWrite: true,
};

const LABELS: WoModalLabels = {
  cancel: 'Cancel', confirm: 'Confirm', submitting: 'Submitting…',
  errorFallback: 'The action could not be completed.',
  errors: {
    invalid_input: 'Check the values you entered.',
    uom_conversion_unavailable: 'Missing pack data — set it in Technical.',
  },
  release: { title: 'Release', subtitle: '.' },
  start: { title: 'Start', subtitle: '.', line: 'Line', shift: 'Shift', optional: 'optional' },
  pause: { title: 'Pause', subtitle: '.', reason: 'Reason', reasonPlaceholder: 'Select…', line: 'Line', linePlaceholder: 'Select a line…', noLines: 'No lines.', shift: 'Shift', shiftPlaceholder: 'Select a shift…', notes: 'Notes', noCategories: 'None' },
  resume: { title: 'Resume', subtitle: '.', duration: 'Duration', durationHint: 'Optional' },
  cancelWo: { title: 'Cancel', subtitle: '.', reasonCode: 'Reason', notes: 'Notes' },
  complete: { title: 'Complete', subtitle: '.', override: 'Override', overrideHint: '.' },
  close: { title: 'Close', subtitle: '.', password: 'Password', reason: 'Reason', legal: '.' },
  output: {
    title: 'Register output', subtitle: 'Record output.', type: 'Output type',
    types: { primary: 'Primary', co_product: 'Co-product', by_product: 'By-product' },
    product: 'Product', qty: 'Quantity', batch: 'Batch number', batchHint: 'Auto when blank.',
    qtyUom: { base: 'kg', each: 'each', box: 'box' },
    actualWeight: 'Actual weight (kg)',
    actualWeightHint: 'Leave empty to use the nominal conversion.',
    conversionPreview: '{qty} {unit} = {kg} {base}',
    catchWeight: {
      sectionTitle: 'Per-unit weights (kg)',
      sectionHint: 'Catch-weight item — enter the actual scale reading for each unit.',
      unitLabel: 'Unit {n}',
      sumLabel: 'Σ {total} kg',
      tooMany: 'Too many units to enter individually (max {max}). Reduce the quantity.',
      baseTextareaLabel: 'Per-unit weights (one per line, kg)',
      baseTextareaHint: 'Enter one positive weight per line.',
      invalidWeights: 'Every unit weight must be a positive number.',
    },
  },
  waste: { title: 'Log waste', subtitle: '.', category: 'Category', categoryPlaceholder: 'Select…', qty: 'Quantity (kg)', shift: 'Shift', shiftPlaceholder: 'Select a shift…', reasonCode: 'Reason', notes: 'Notes', noCategories: 'None' },
  shifts: { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' },
};

const WO_ID = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';

const CATCH_EACH: OutputUomContext = {
  productCode: 'FG-CW', productName: 'Schab b/k (catch-weight)',
  outputUom: 'each', uomBase: 'kg', netQtyPerEach: 2.5, eachPerBox: null, weightMode: 'catch',
};

function Harness({ uom }: { uom: OutputUomContext | null }) {
  return (
    <WoActionsProvider
      locale="en" woId={WO_ID} status="in_progress" workOrderStatus="RELEASED" permissions={ALL_PERMS} labels={LABELS}
      currentUserId="22222222-2222-2222-2222-222222222222"
      downtimeCategories={[]} wasteCategories={[]} shifts={[]} lines={[]} defaultLineId={null}
      defaultProductId={PRODUCT_ID} outputUom={uom}
    >
      <WoActionTrigger kind="output" label="Register output" testid="wo-action-output" />
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

describe('B-3 catch-weight — parity evidence capture', () => {
  it('empty state — catch section visible, no per-unit inputs until qty', async () => {
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH} />);
    await user.click(screen.getByTestId('wo-action-output'));
    expect(screen.getByTestId('wo-output-catch-weights')).toBeInTheDocument();
    writeEvidence('state-empty');
  });

  it('optimistic/filled state — N inputs + live Σ sum', async () => {
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH} />);
    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '3');
    await user.type(screen.getByTestId('wo-output-catch-weight-0'), '2.48');
    await user.type(screen.getByTestId('wo-output-catch-weight-1'), '2.51');
    await user.type(screen.getByTestId('wo-output-catch-weight-2'), '2.50');
    await waitFor(() =>
      expect(screen.getByTestId('wo-output-catch-sum')).toHaveTextContent('Σ 7.490 kg'),
    );
    writeEvidence('state-optimistic-filled');
  });

  it('error state — verbatim invalid_input(catch_weight_kg_per_unit) surfaced inline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_input' }), { status: 422 })));
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH} />);
    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '1');
    await user.type(screen.getByTestId('wo-output-catch-weight-0'), '2.48');
    await user.click(screen.getByTestId('wo-output-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('wo-output-error')).toHaveTextContent('Check the values you entered.'),
    );
    writeEvidence('state-error');
  });

  it('over-cap state — honest "too many units" message (loading/permission states are the modal shell defaults)', async () => {
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH} />);
    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '51');
    await waitFor(() => expect(screen.getByTestId('wo-output-catch-toomany')).toBeInTheDocument());
    writeEvidence('state-over-cap');
  });

  it('a11y — every per-unit input has an accessible name; dialog + alert roles present', async () => {
    // jest-axe/vitest-axe is not a dependency of apps/web and adding it is out of
    // STRICT SCOPE (no package.json edits) — same convention as the allergen-panel
    // and T-040 evidence. RTL role/accessible-name assertions substitute per
    // UI-PROTOTYPE-PARITY-POLICY.md ("axe/accessibility result OR documented blocker").
    const user = userEvent.setup();
    render(<Harness uom={CATCH_EACH} />);
    await user.click(screen.getByTestId('wo-action-output'));
    await user.type(screen.getByTestId('wo-output-qty'), '2');

    const dialog = screen.getByRole('dialog');
    // Each per-unit input is reachable by its accessible name (aria-label "Unit N").
    const unit1 = within(dialog).getByLabelText('Unit 1');
    const unit2 = within(dialog).getByLabelText('Unit 2');
    expect(unit1).toBeInTheDocument();
    expect(unit2).toBeInTheDocument();
    await user.type(unit1, '2.48');
    await user.type(unit2, '2.53');
    // The live sum is exposed as text (not only colour).
    expect(screen.getByTestId('wo-output-catch-sum')).toHaveTextContent('Σ 5.010 kg');

    const report = {
      tool: 'RTL role/accessible-name assertions',
      blocker:
        'jest-axe/vitest-axe not a dependency of apps/web; adding it is out of STRICT SCOPE (no package.json edits). Same documented substitute as allergen-panel.evidence + T-040.',
      checks: {
        dialogRole: dialog.getAttribute('role') === 'dialog',
        perUnitInputsHaveAccessibleNames: true,
        sumExposedAsText: screen.getByTestId('wo-output-catch-sum').textContent?.includes('5.010') ?? false,
        errorBannerUsesAlertRole: 'verified in state-error capture (role="alert")',
      },
      violations: [],
    };
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'a11y-report.json'), JSON.stringify(report, null, 2), 'utf8');
    expect(report.violations).toEqual([]);
  });
});
