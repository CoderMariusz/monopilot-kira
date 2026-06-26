/**
 * @vitest-environment jsdom
 *
 * G0–G1 merge made EXPLICIT on the gate badge (owner confusion: "Brief · G0 then
 * jumps to G2, no G1 visible").
 *
 * The 2026-06-06 pivot collapses G1 "Feasibility" into the Brief stage — it is
 * never its own stepper step and never a forward advance target (see
 * gate-helpers.ts advanceTransitionForStage). The badge must therefore SPELL OUT
 * the merge instead of silently hiding G1, so the gap between G0 and G2 reads as
 * intentional. The layout (RSC) composes the label + tooltip; this test asserts the
 * header's rendering contract:
 *   - the gate badge shows whatever already-localized label the layout passes
 *     (e.g. "Brief · G0–G1 Idea / Feasibility");
 *   - when a gateLabelHint is supplied (G0 only) it is rendered as the badge's
 *     native title tooltip;
 *   - when no hint is supplied (any later gate) the badge carries no title.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectHeader, type ProjectHeaderLabels, type ProjectHeaderView } from '../project-header';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/pipeline/proj-1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../../../../(npd)/_modals/advance-gate-modal-host', () => ({
  ADVANCE_GATE_MODAL_PARAM: 'advanceGate',
  AdvanceGateModalHost: () => null,
}));

afterEach(cleanup);

const LABELS: ProjectHeaderLabels = {
  breadcrumbNpd: 'NPD',
  breadcrumbPipeline: 'Pipeline',
  ownerLabel: 'Owner',
  targetLabel: 'Target',
  noOwner: 'Unassigned',
  noTarget: 'Not set',
  watch: 'Watch',
  watchDisabledHint: 'no watch',
  duplicate: 'Duplicate',
  duplicateDisabledHint: 'no dup',
  advanceStage: 'Advance stage →',
  advanceDisabledHint: 'no permission',
  advanceTerminalHint: 'lbl.terminal',
  duplicating: 'Duplicating…',
  duplicateError: 'dup err',
  deleteProject: 'Delete',
  deleting: 'Deleting…',
  deleteConfirm: 'sure?',
  deleteError: 'err',
  deleteHasDependents: 'deps',
  gateChecklist: 'Gate checklist',
  createFg: 'Create / Link FG',
  openFg: 'Open FG',
};

const FG_CANDIDATE = {
  labels: {} as never,
  suggestedCode: 'FG-DEV-088',
  canCreate: true,
  action: undefined,
};

const ADVANCE_MODAL = {
  labels: {} as never,
  project: { id: 'proj-1', code: 'DEV-088', name: 'Mango Sorbet 250g', currentGate: 'G0' } as never,
  gateInfo: {} as never,
  items: [] as never,
};

function makeView(over: Partial<ProjectHeaderView>): ProjectHeaderView {
  return {
    id: 'proj-1',
    code: 'DEV-088',
    name: 'Mango Sorbet 250g',
    type: 'single',
    owner: 'Cy Owner',
    targetLaunch: '2026-05-01',
    gateLabel: 'Brief · G0–G1 Idea / Feasibility',
    gateLabelHint: 'G1 Feasibility is part of the Brief stage — it is covered here, not skipped.',
    gateTone: 'gray',
    prioLabel: 'Normal',
    prioTone: 'amber',
    currentGate: 'G0',
    productCode: null,
    ...over,
  };
}

function renderHeader(view: ProjectHeaderView) {
  return render(
    <ProjectHeader
      project={view}
      labels={LABELS}
      advanceModal={ADVANCE_MODAL}
      canAdvance
      advanceProjectGate={vi.fn(async () => ({ ok: true as const, data: { currentGate: 'G2' as const } }))}
      fgCandidate={FG_CANDIDATE}
    />,
  );
}

describe('ProjectHeader — explicit G0–G1 merge on the gate badge', () => {
  it('renders the merged G0–G1 label so the missing standalone G1 step reads as intentional', () => {
    renderHeader(makeView({}));
    const badge = screen.getByTestId('project-header-gate');
    // G1 must be visible in the badge label, not silently hidden.
    expect(badge).toHaveTextContent('G0–G1');
    expect(badge).toHaveTextContent(/Feasibility/);
  });

  it('exposes the merge explanation as the badge tooltip (title) at the initial gate', () => {
    renderHeader(makeView({}));
    const badge = screen.getByTestId('project-header-gate');
    expect(badge).toHaveAttribute('title', expect.stringContaining('Brief stage') as unknown as string);
  });

  it('carries no tooltip on later gates (hint omitted)', () => {
    renderHeader(
      makeView({
        gateLabel: 'Recipe · G2 Business Case',
        gateLabelHint: null,
        gateTone: 'blue',
        currentGate: 'G2',
      }),
    );
    const badge = screen.getByTestId('project-header-gate');
    expect(badge).not.toHaveAttribute('title');
  });
});
