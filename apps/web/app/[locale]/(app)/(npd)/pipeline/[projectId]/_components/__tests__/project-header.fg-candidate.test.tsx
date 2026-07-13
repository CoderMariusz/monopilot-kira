/**
 * @vitest-environment jsdom
 *
 * FG-candidate header affordance — dead-end fix ("Finished Good not found").
 *
 * Asserts the conditional rendering contract resolved server-side:
 *   - gate G2/G3 + no product_code  → "Create / Link FG" button (opens the modal)
 *   - product_code already linked    → "Open FG" link to /{locale}/fa/{code}
 *   - any other gate, no product_code → neither affordance (the FG candidate only
 *     exists at G2/G3)
 *   - RBAC: when no action is injected (server did not grant npd.gate.advance) the
 *     button still opens the modal, but the modal's submit is disabled (covered in
 *     fg-candidate-modal.test.tsx).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectHeader,
  type ProjectHeaderLabels,
  type ProjectHeaderView,
  type ProjectGate,
} from '../project-header';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/pipeline/proj-1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../../../../(npd)/_modals/advance-gate-modal-host', () => ({
  ADVANCE_GATE_MODAL_PARAM: 'advanceGate',
  AdvanceGateModalHost: () => null,
}));

// The modal has its own dedicated test; stub it so this test stays focused on the
// header affordance + which control renders.
vi.mock('../fg-candidate-modal', () => ({
  FgCandidateModal: () => <div data-testid="fg-candidate-modal-stub" />,
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
  duplicating: 'Duplicating…',
  duplicateError: 'dup err',
  advanceStage: 'Advance stage →',
  advanceDisabledHint: 'no permission',
  advanceTerminalHint: 'lbl.terminal',
  deleteProject: 'Delete',
  deleting: 'Deleting…',
  deleteConfirm: 'sure?',
  deleteError: 'err',
  deleteHasDependents: 'deps',
  gateChecklist: 'Gate checklist',
  createFg: 'lbl.createFg',
  openFg: 'lbl.openFg',
};

const ADVANCE_MODAL = {
  labels: {} as never,
  project: { id: 'proj-1', code: 'DEV-088', name: 'P', currentGate: 'G3' } as never,
  gateInfo: {} as never,
  items: [] as never,
};

const FG_CANDIDATE = {
  labels: {} as never,
  suggestedCode: 'FG-DEV-088',
  canCreate: true,
  action: vi.fn(),
};

function makeView(overrides: Partial<ProjectHeaderView>): ProjectHeaderView {
  return {
    id: 'proj-1',
    code: 'DEV-088',
    name: 'Mango Sorbet 250g',
    type: 'single',
    owner: 'Cy Owner',
    targetLaunch: '2026-05-01',
    gateLabel: 'Development',
    gateTone: 'amber',
    prioLabel: 'Normal',
    prioTone: 'amber',
    currentGate: 'G3',
    productCode: null,
    ...overrides,
  };
}

function renderHeader(view: ProjectHeaderView) {
  return render(
    <ProjectHeader
      project={view}
      labels={LABELS}
      advanceModal={ADVANCE_MODAL}
      canAdvance
      advanceProjectGate={vi.fn(async () => ({ ok: true as const, data: { currentGate: 'G3' as const } }))}
      fgCandidate={FG_CANDIDATE}
    />,
  );
}

describe('ProjectHeader — FG-candidate affordance (dead-end fix)', () => {
  it.each(['G2', 'G3'] as ProjectGate[])(
    'shows "Create / Link FG" at gate %s when no FG is linked yet',
    (gate) => {
      renderHeader(makeView({ currentGate: gate, productCode: null }));
      expect(screen.getByTestId('project-header-create-fg')).toHaveTextContent(LABELS.createFg);
      expect(screen.queryByTestId('project-header-open-fg')).toBeNull();
    },
  );

  it('shows an "Open FG" link to the pipeline project once a product_code is linked', () => {
    // C7b: the /fg detail was folded into the pipeline; the "Open FG" link now
    // points at /[locale]/pipeline/[projectId] (project.id), not the removed /fg route.
    renderHeader(makeView({ currentGate: 'G3', productCode: 'FG-DEV-088' }));
    const link = screen.getByTestId('project-header-open-fg');
    expect(link).toHaveTextContent(LABELS.openFg);
    expect(link).toHaveAttribute('href', '/en/pipeline/proj-1');
    expect(screen.queryByTestId('project-header-create-fg')).toBeNull();
  });

  it('renders NEITHER affordance on a non-G2/G3 gate with no FG (e.g. G0)', () => {
    renderHeader(makeView({ currentGate: 'G0', productCode: null }));
    expect(screen.queryByTestId('project-header-create-fg')).toBeNull();
    expect(screen.queryByTestId('project-header-open-fg')).toBeNull();
  });
});
