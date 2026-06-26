/**
 * @vitest-environment jsdom
 *
 * FINAL-NIGHT gap 3 — the project-header "Advance stage →" affordance must be
 * suppressed once the project reaches the terminal Launched gate. Previously the
 * layout coerced a Launched gate to G4 for the modal, so a launched project still
 * offered an Advance button that opened a stale "advance to G4: Testing" modal.
 *
 * RED → GREEN asserts:
 *   - non-terminal project: the Advance button renders;
 *   - terminal (Launched) project: the Advance button is GONE (no render-then-
 *     disable) and a terminal indicator is shown instead.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectHeader, type ProjectHeaderLabels, type ProjectHeaderView } from '../project-header';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/proj-1',
  useSearchParams: () => new URLSearchParams(),
}));

// The AdvanceGateModalHost is exercised by its own test; here we only assert the
// header's Advance affordance, so stub the host to keep this test focused.
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

const VIEW: ProjectHeaderView = {
  id: 'proj-1',
  code: 'DEV-088',
  name: 'Mango Sorbet 250g',
  type: 'single',
  owner: 'Cy Owner',
  targetLaunch: '2026-05-01',
  gateLabel: 'Launched',
  gateTone: 'green',
  prioLabel: 'Normal',
  prioTone: 'amber',
  currentGate: 'Launched',
  productCode: null,
};

const FG_CANDIDATE = {
  labels: {} as never,
  suggestedCode: 'FG-DEV-088',
  canCreate: true,
  action: undefined,
};

const ADVANCE_MODAL = {
  labels: {} as never,
  project: { id: 'proj-1', code: 'DEV-088', name: 'Mango Sorbet 250g', currentGate: 'G4' } as never,
  gateInfo: {} as never,
  items: [] as never,
};

function renderHeader(isTerminal: boolean) {
  return render(
    <ProjectHeader
      project={VIEW}
      labels={LABELS}
      advanceModal={ADVANCE_MODAL}
      canAdvance
      isTerminal={isTerminal}
      advanceProjectGate={vi.fn(async () => ({ ok: true as const, data: { currentGate: 'Launched' as const } }))}
      fgCandidate={FG_CANDIDATE}
    />,
  );
}

describe('ProjectHeader — terminal Launched gate (gap 3)', () => {
  it('shows the Advance button for a non-terminal project', () => {
    renderHeader(false);
    expect(screen.getByTestId('project-header-advance')).toBeInTheDocument();
    expect(screen.queryByTestId('project-header-advance-terminal')).toBeNull();
  });

  it('hides the Advance affordance and shows a terminal indicator when Launched', () => {
    renderHeader(true);
    expect(screen.queryByTestId('project-header-advance')).toBeNull();
    expect(screen.getByTestId('project-header-advance-terminal')).toHaveTextContent(
      LABELS.advanceTerminalHint,
    );
  });
});
