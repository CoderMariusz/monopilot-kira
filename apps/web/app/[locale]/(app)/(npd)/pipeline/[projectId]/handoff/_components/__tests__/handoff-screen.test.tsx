/**
 * @vitest-environment jsdom
 * NPD HANDOFF stage — HandoffScreen component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)
 *
 * Asserts the parity checklist: the green "Ready to promote" success bar (and the
 * amber "blocked" bar when the checklist is incomplete), the "Handoff checklist"
 * (Checkbox primitive — NEVER a raw <input type="checkbox">), the two panels
 * "Destination BOM" (label/value) + "What happens on promote" (6-step ordered
 * list), and the footer "Export handoff packet" + "✓ Promote to production BOM"
 * (Promote DISABLED until the checklist is complete). Plus the five UI states
 * (loading / empty / ready / error / permission-denied), the optimistic toggle,
 * the promote callback, that all visible strings come from injected i18n labels
 * (no default leak), and that there is NO legacy banner.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The screen calls router.refresh() after a successful promote (kills the
// "nothing happens" symptom). Mock next/navigation so the client island renders
// under jsdom and we can assert refresh() fires exactly on success.
const refreshSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}));

import {
  HandoffScreen,
  buildHandoffPacket,
  handoffPacketFilename,
  type HandoffLabels,
  type HandoffScreenData,
} from '../handoff-screen';

afterEach(() => cleanup());

const LABELS: HandoffLabels = {
  title: 'L_TITLE',
  breadcrumb: 'L_CRUMB',
  releaseGatesTitle: 'L_GATES_TITLE',
  releaseGatesBody: 'L_GATES_BODY',
  gateMet: 'L_GATE_MET',
  gateUnmet: 'L_GATE_UNMET',
  gateRemediation: 'L_GATE_FIX',
  'gate.G4_REQUIRED': 'L_GATE_G4',
  'gate.FG_CANDIDATE_REQUIRED': 'L_GATE_FG',
  'gate.ACTIVE_SHARED_BOM_REQUIRED': 'L_GATE_BOM',
  'gate.FACTORY_SPEC_REQUIRED': 'L_GATE_SPEC',
  'gate.V18_OPEN_HIGH_RISK': 'L_GATE_RISK',
  promotedNextTitle: 'L_NEXT_TITLE',
  promotedNextBody: 'L_NEXT_BODY',
  advanceToLaunched: 'L_ADVANCE_LAUNCHED',
  viewBom: 'L_VIEW_BOM',
  viewProject: 'L_VIEW_PROJECT',
  readyTitle: 'L_READY_TITLE',
  readyBody: 'L_READY_BODY',
  blockedTitle: 'L_BLOCKED_TITLE',
  blockedBody: 'L_BLOCKED_BODY',
  promotedTitle: 'L_PROMOTED_TITLE',
  promotedBody: 'L_PROMOTED_BODY',
  checklistTitle: 'L_CHECKLIST_TITLE',
  destinationTitle: 'L_DEST_TITLE',
  whatHappensTitle: 'L_STEPS_TITLE',
  bomCode: 'L_BOM_CODE',
  productSku: 'L_SKU',
  effectiveFrom: 'L_EFF',
  productionLine: 'L_LINE',
  warehouse: 'L_WH',
  releaseStatus: 'L_REL_STATUS',
  step1: 'L_STEP1',
  step2: 'L_STEP2',
  step3: 'L_STEP3',
  step4: 'L_STEP4',
  step5: 'L_STEP5',
  step6: 'L_STEP6',
  exportPacket: 'L_EXPORT',
  promote: 'L_PROMOTE',
  promoting: 'L_PROMOTING',
  promoteError: 'L_PROMOTE_ERR',
  generateBom: 'L_GEN_BOM',
  generating: 'L_GENERATING',
  generateBomHint: 'L_GEN_HINT',
  generateNoRecipe: 'L_GEN_NO_RECIPE',
  generateError: 'L_GEN_ERR',
  promoteSuccessTitle: 'L_PROMOTE_OK_TITLE',
  promoteSuccessBody: 'Created FG {code}',
  promoteSuccessViewBom: 'L_PROMOTE_OK_VIEW_BOM',
  yieldPromptTitle: 'L_YIELD_TITLE',
  yieldPromptBody: 'L_YIELD_BODY',
  yieldLabel: 'L_YIELD_LABEL',
  yieldSave: 'L_YIELD_SAVE',
  yieldSkip: 'L_YIELD_SKIP',
  yieldSaving: 'L_YIELD_SAVING',
  yieldSaved: 'L_YIELD_SAVED',
  yieldError: 'L_YIELD_ERR',
  loading: 'L_LOADING',
  empty: 'L_EMPTY',
  emptyBody: 'L_EMPTY_BODY',
  error: 'L_ERROR',
  forbidden: 'L_FORBIDDEN',
  notSet: '—',
};

const HREFS = {
  factorySpecs: '/en/technical/factory-specs',
  bom: '/en/technical/bom',
  project: '/en/pipeline/07300000-0000-4000-8000-0000000000c1',
  gate: '/en/pipeline/07300000-0000-4000-8000-0000000000c1/gate',
};

const ALL_GATES_MET: HandoffScreenData['releaseGates'] = [
  { code: 'G4_REQUIRED', met: true },
  { code: 'FG_CANDIDATE_REQUIRED', met: true },
  { code: 'ACTIVE_SHARED_BOM_REQUIRED', met: true },
  { code: 'FACTORY_SPEC_REQUIRED', met: true },
  { code: 'V18_OPEN_HIGH_RISK', met: true },
];

function dataReady(
  allChecked: boolean,
  gates: HandoffScreenData['releaseGates'] = ALL_GATES_MET,
): HandoffScreenData {
  return {
    checklistId: 'cl-1',
    projectId: '07300000-0000-4000-8000-0000000000c1',
    bomVerificationStatus: 'pending',
    promoteToProductionDate: null,
    ready: allChecked,
    promoted: false,
    checklist: [
      { id: 'i1', label: 'Recipe locked', isChecked: true, displayOrder: 1 },
      { id: 'i2', label: 'Nutrition approved', isChecked: allChecked, displayOrder: 2 },
    ],
    releaseGates: gates,
    releaseGatesMet: gates.every((g) => g.met),
    destinationBom: {
      bomCode: 'BOM-238',
      productSku: 'SKU-2451',
      productName: 'Sliced Ham 200g',
      effectiveFrom: '2026-01-08',
      warehouseName: 'Main WH',
      releaseStatus: null,
      releaseBomHeaderId: null,
    },
  };
}

describe('HandoffScreen — parity structure', () => {
  it('renders checklist, both panels, 6 steps, and footer buttons (no legacy banner)', () => {
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} />);
    expect(screen.getByTestId('handoff-checklist-card')).toBeInTheDocument();
    expect(screen.getByTestId('handoff-destination-card')).toBeInTheDocument();
    expect(screen.getByTestId('handoff-steps-card')).toBeInTheDocument();
    expect(within(screen.getByTestId('handoff-steps')).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByTestId('handoff-export-btn')).toHaveTextContent('L_EXPORT');
    expect(screen.getByTestId('handoff-promote-btn')).toHaveTextContent('L_PROMOTE');
    // NO legacy banner.
    expect(screen.queryByText(/LEGACY/i)).not.toBeInTheDocument();
    // Checkbox primitive, never a raw checkbox input.
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('shows the green ready bar + enables Promote when the checklist is complete', () => {
    render(
      <HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={vi.fn()} />,
    );
    expect(screen.getByTestId('handoff-ready-bar')).toHaveTextContent('L_READY_TITLE');
    expect(screen.getByTestId('handoff-promote-btn')).not.toBeDisabled();
  });

  it('shows the amber blocked bar + disables Promote when an item is unchecked', () => {
    render(
      <HandoffScreen state="ready" data={dataReady(false)} labels={LABELS} onPromote={vi.fn()} />,
    );
    expect(screen.getByTestId('handoff-blocked-bar')).toHaveTextContent('L_BLOCKED_TITLE');
    expect(screen.getByTestId('handoff-promote-btn')).toBeDisabled();
  });
});

describe('HandoffScreen — release-gate panel (dead-end repair)', () => {
  it('renders a status row per release gate', () => {
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={vi.fn()} />);
    const panel = screen.getByTestId('handoff-release-gates');
    expect(panel).toBeInTheDocument();
    expect(within(panel).getAllByTestId('handoff-release-gate')).toHaveLength(5);
  });

  it('marks an unmet gate, shows its remediation link, and DISABLES Promote even when the checklist is complete', () => {
    const gates: HandoffScreenData['releaseGates'] = [
      { code: 'G4_REQUIRED', met: true },
      { code: 'FG_CANDIDATE_REQUIRED', met: true },
      { code: 'ACTIVE_SHARED_BOM_REQUIRED', met: true },
      { code: 'FACTORY_SPEC_REQUIRED', met: false },
      { code: 'V18_OPEN_HIGH_RISK', met: true },
    ];
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, gates)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
      />,
    );
    const unmet = screen.getByTestId('handoff-release-gate-FACTORY_SPEC_REQUIRED');
    expect(unmet).toHaveAttribute('data-met', 'false');
    // A remediation link is offered for the factory-spec gate.
    expect(within(unmet).getByRole('link')).toHaveAttribute('href', expect.stringContaining('factory-specs'));
    // Promote is blocked even though the checklist is complete — and the user SEES why.
    expect(screen.getByTestId('handoff-promote-btn')).toBeDisabled();
  });

  it('enables Promote only when the checklist AND every release gate are met', () => {
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={vi.fn()} />);
    expect(screen.getByTestId('handoff-promote-btn')).not.toBeDisabled();
  });
});

describe('HandoffScreen — Generate production BOM (deadlock break)', () => {
  const BOM_ID = '07300000-0000-4000-8000-0000000000b0';

  /** Gates where the ACTIVE_SHARED_BOM gate is NOT met (deadlock state). */
  const BOM_GATE_UNMET: HandoffScreenData['releaseGates'] = [
    { code: 'G4_REQUIRED', met: true },
    { code: 'FG_CANDIDATE_REQUIRED', met: true },
    { code: 'ACTIVE_SHARED_BOM_REQUIRED', met: false },
    { code: 'FACTORY_SPEC_REQUIRED', met: false },
    { code: 'V18_OPEN_HIGH_RISK', met: true },
  ];

  it('shows the Generate BOM button when the ACTIVE_SHARED_BOM gate is NOT met', () => {
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, BOM_GATE_UNMET)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );
    const btn = screen.getByTestId('handoff-generate-btn');
    expect(btn).toHaveTextContent('L_GEN_BOM');
    expect(screen.getByTestId('handoff-generate-hint')).toHaveTextContent('L_GEN_HINT');
  });

  it('HIDES the Generate BOM button when the ACTIVE_SHARED_BOM gate IS met', () => {
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, ALL_GATES_MET)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('handoff-generate-btn')).not.toBeInTheDocument();
  });

  it('calls onGenerate with the projectId and refreshes the route on ok', async () => {
    refreshSpy.mockClear();
    const onGenerate = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: false,
    });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, BOM_GATE_UNMET)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-generate-btn'));
    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith({
        projectId: '07300000-0000-4000-8000-0000000000c1',
      }),
    );
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
  });

  it('surfaces the yield prompt after generate when yieldPromptRequired is true', async () => {
    const onGenerate = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: true,
    });
    const onUpdateBomYield = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, BOM_GATE_UNMET)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={onGenerate}
        onUpdateBomYield={onUpdateBomYield}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-generate-btn'));
    const input = await screen.findByTestId('handoff-yield-input');
    fireEvent.change(input, { target: { value: '88' } });
    fireEvent.click(screen.getByTestId('handoff-yield-save-btn'));
    await waitFor(() =>
      expect(onUpdateBomYield).toHaveBeenCalledWith({ bomHeaderId: BOM_ID, yieldPct: 88 }),
    );
  });

  it('shows an inline role=alert with the no-recipe message on { ok:false, error:no_recipe } (never throws)', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: false, error: 'no_recipe' });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, BOM_GATE_UNMET)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-generate-btn'));
    const err = await screen.findByTestId('handoff-generate-error');
    expect(err).toHaveAttribute('role', 'alert');
    expect(err).toHaveTextContent('L_GEN_NO_RECIPE');
  });

  it('shows the generic generate error for other failures (e.g. persistence_failed)', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: false, error: 'persistence_failed' });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true, BOM_GATE_UNMET)}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-generate-btn'));
    const err = await screen.findByTestId('handoff-generate-error');
    expect(err).toHaveTextContent('L_GEN_ERR');
  });

  it('does not render the Generate button once promoted', () => {
    const data = { ...dataReady(true, BOM_GATE_UNMET), promoted: true };
    render(
      <HandoffScreen
        state="ready"
        data={data}
        labels={LABELS}
        hrefs={HREFS}
        onPromote={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('handoff-generate-btn')).not.toBeInTheDocument();
  });
});

describe('HandoffScreen — post-promote next step (dead-end repair)', () => {
  it('refreshes the route after a successful promote', async () => {
    refreshSpy.mockClear();
    const onPromote = vi.fn().mockResolvedValue({ ok: true });
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />);
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
  });

  it('renders the next-step CTA (advance to launched + view BOM) once promoted', () => {
    const data = { ...dataReady(true), promoted: true };
    render(
      <HandoffScreen state="ready" data={data} labels={LABELS} hrefs={HREFS} onPromote={vi.fn()} />,
    );
    const cta = screen.getByTestId('handoff-next-step');
    expect(cta).toBeInTheDocument();
    expect(within(cta).getByTestId('handoff-advance-launched-link')).toBeInTheDocument();
  });
});

describe('HandoffScreen — UI states', () => {
  it.each([
    ['loading', 'L_LOADING'],
    ['error', 'L_ERROR'],
    ['permission_denied', 'L_FORBIDDEN'],
  ] as const)('renders the %s state', (state, text) => {
    render(<HandoffScreen state={state} data={null} labels={LABELS} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<HandoffScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText('L_EMPTY')).toBeInTheDocument();
    expect(screen.getByText('L_EMPTY_BODY')).toBeInTheDocument();
  });
});

describe('HandoffScreen — interactions', () => {
  it('optimistically toggles a checklist item via the injected action', async () => {
    const onToggle = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(false)}
        labels={LABELS}
        onToggleChecklistItem={onToggle}
      />,
    );
    const second = screen.getByLabelText('Nutrition approved');
    fireEvent.click(second);
    await waitFor(() =>
      expect(onToggle).toHaveBeenCalledWith({ itemId: 'i2', isChecked: true }),
    );
  });

  it('invokes the promote callback when Promote is clicked (complete checklist)', async () => {
    const onPromote = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await waitFor(() =>
      expect(onPromote).toHaveBeenCalledWith({
        projectId: '07300000-0000-4000-8000-0000000000c1',
      }),
    );
  });

  it('surfaces a promote error when the action fails', async () => {
    const onPromote = vi.fn().mockResolvedValue({ ok: false, error: 'release_blocked' });
    render(
      <HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('handoff-promote-error')).toHaveTextContent('L_PROMOTE_ERR'),
    );
  });
});

describe('HandoffScreen — auto-built production BOM result + yield prompt', () => {
  const BOM_ID = '07300000-0000-4000-8000-0000000000b0';

  it('renders the success panel (production FG code + BOM link) after a successful promote', async () => {
    const onPromote = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: false,
      bomHref: '/en/technical/bom/FG-002',
    });
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />);
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    const panel = await screen.findByTestId('handoff-promote-success');
    expect(within(panel).getByTestId('handoff-promote-success-body')).toHaveTextContent('Created FG FG-002');
    expect(within(panel).getByTestId('handoff-promote-success-bom-link')).toHaveAttribute(
      'href',
      '/en/technical/bom/FG-002',
    );
    // No yield prompt when yieldPromptRequired is false.
    expect(screen.queryByTestId('handoff-yield-prompt')).not.toBeInTheDocument();
  });

  it('does NOT render the success panel when productionCode + bomHeaderId are null', async () => {
    const onPromote = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: null,
      bomHeaderId: null,
      yieldPromptRequired: false,
      bomHref: null,
    });
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />);
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await waitFor(() => expect(onPromote).toHaveBeenCalled());
    expect(screen.queryByTestId('handoff-promote-success')).not.toBeInTheDocument();
  });

  it('shows the yield prompt when yieldPromptRequired, saves via onUpdateBomYield, then shows "Yield saved"', async () => {
    const onPromote = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: true,
      bomHref: '/en/technical/bom/FG-002',
    });
    const onUpdateBomYield = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true)}
        labels={LABELS}
        onPromote={onPromote}
        onUpdateBomYield={onUpdateBomYield}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    const input = await screen.findByTestId('handoff-yield-input');
    fireEvent.change(input, { target: { value: '92.5' } });
    fireEvent.click(screen.getByTestId('handoff-yield-save-btn'));
    await waitFor(() =>
      expect(onUpdateBomYield).toHaveBeenCalledWith({ bomHeaderId: BOM_ID, yieldPct: 92.5 }),
    );
    expect(await screen.findByTestId('handoff-yield-saved')).toHaveTextContent('L_YIELD_SAVED');
    expect(screen.queryByTestId('handoff-yield-prompt')).not.toBeInTheDocument();
  });

  it('dismisses the yield prompt on Skip without calling onUpdateBomYield', async () => {
    const onPromote = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: true,
      bomHref: '/en/technical/bom/FG-002',
    });
    const onUpdateBomYield = vi.fn();
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true)}
        labels={LABELS}
        onPromote={onPromote}
        onUpdateBomYield={onUpdateBomYield}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await screen.findByTestId('handoff-yield-prompt');
    fireEvent.click(screen.getByTestId('handoff-yield-skip-btn'));
    await waitFor(() => expect(screen.queryByTestId('handoff-yield-prompt')).not.toBeInTheDocument());
    expect(onUpdateBomYield).not.toHaveBeenCalled();
    expect(screen.queryByTestId('handoff-yield-saved')).not.toBeInTheDocument();
  });

  it('surfaces an inline role=alert on yield-save failure (never throws)', async () => {
    const onPromote = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: true,
      bomHref: '/en/technical/bom/FG-002',
    });
    const onUpdateBomYield = vi.fn().mockResolvedValue({ ok: false, error: 'persistence_failed' });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true)}
        labels={LABELS}
        onPromote={onPromote}
        onUpdateBomYield={onUpdateBomYield}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    const input = await screen.findByTestId('handoff-yield-input');
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('handoff-yield-save-btn'));
    const err = await screen.findByTestId('handoff-yield-error');
    expect(err).toHaveAttribute('role', 'alert');
    expect(err).toHaveTextContent('L_YIELD_ERR');
    // Prompt stays so the user can correct + retry.
    expect(screen.getByTestId('handoff-yield-prompt')).toBeInTheDocument();
  });

  it('rejects an out-of-range yield client-side without calling onUpdateBomYield', async () => {
    const onPromote = vi.fn().mockResolvedValue({
      ok: true,
      productionCode: 'FG-002',
      bomHeaderId: BOM_ID,
      yieldPromptRequired: true,
      bomHref: '/en/technical/bom/FG-002',
    });
    const onUpdateBomYield = vi.fn();
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(true)}
        labels={LABELS}
        onPromote={onPromote}
        onUpdateBomYield={onUpdateBomYield}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    const input = await screen.findByTestId('handoff-yield-input');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('handoff-yield-save-btn'));
    expect(await screen.findByTestId('handoff-yield-error')).toBeInTheDocument();
    expect(onUpdateBomYield).not.toHaveBeenCalled();
  });
});

describe('HandoffScreen — Export handoff packet (LANE 14)', () => {
  it('builds a packet from the screen data (header + checklist + destination BOM)', () => {
    const packet = buildHandoffPacket(
      dataReady(true),
      dataReady(true).checklist,
      '2026-06-09T00:00:00.000Z',
    );
    expect(packet).toMatchObject({
      packet: 'npd.handoff',
      version: 1,
      generatedAt: '2026-06-09T00:00:00.000Z',
      project: { productSku: 'SKU-2451', productName: 'Sliced Ham 200g' },
      status: { ready: true, promoted: false },
      destinationBom: { bomCode: 'BOM-238', warehouseName: 'Main WH' },
    });
    expect((packet.checklist as unknown[]).length).toBe(2);
  });

  it('names the file handoff-<sku>-<date>.json', () => {
    expect(handoffPacketFilename(dataReady(true), '2026-06-09')).toBe('handoff-SKU-2451-2026-06-09.json');
  });

  it('downloads a JSON packet on click (mocked object URL + anchor click)', () => {
    const createObjectURL = vi.fn(() => 'blob:packet');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} />);
    fireEvent.click(screen.getByTestId('handoff-export-btn'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloads[0]).toMatch(/^handoff-SKU-2451-\d{4}-\d{2}-\d{2}\.json$/);
    vi.restoreAllMocks();
  });
});
