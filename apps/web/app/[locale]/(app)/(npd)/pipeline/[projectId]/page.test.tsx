/**
 * @vitest-environment jsdom
 *
 * NPD project-detail page (RSC) — parity + states + i18n + RBAC.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-43
 *   (StageRail 4-20 + ProjectHeader 22-43) + the reused 7-dept strip
 *   (fa-screens.jsx:365-385).
 *
 * The production page reads via getProject (T-057) + withOrgContext (RLS). We mock
 * those transport boundaries and drive the render through the `loaded` injection
 * seam so the suite asserts parity structure + the 5 UI states + label resolution
 * + RBAC + the pre-G3 pending caption — without a live pg pool.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── next/navigation: capture push for the advance-open assertion. ──
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/pipeline/p1',
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// ── next-intl: inline echo (AdvanceGateModalHost children call useTranslations). ──
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ── next-intl/server: serve INLINE project-detail messages (no fixture JSON). ──
const INLINE_MESSAGES: Record<string, Record<string, unknown>> = {
  'npd.projectDetail': {
    header: {
      breadcrumbNpd: 'NPD',
      breadcrumbPipeline: 'Pipeline',
      ownerLabel: 'Owner',
      targetLabel: 'Target launch',
      noOwner: 'Unassigned',
      noTarget: 'Not set',
      watch: 'Watch',
      watchDisabledHint: 'Watching projects is not available yet.',
      duplicate: 'Duplicate',
      duplicateDisabledHint: 'Duplicating projects is not available yet.',
      advanceStage: 'Advance stage →',
      advanceDisabledHint: 'You do not have permission to advance this gate.',
    },
    prio: { high: 'High priority', normal: 'Normal priority', low: 'Low priority' },
    gate: {
      G0: 'Idea',
      G1: 'Feasibility',
      G2: 'Business Case',
      G3: 'Development',
      G4: 'Testing',
      Launched: 'Launched',
    },
    stageRailAriaLabel: 'Stage-Gate progress',
    deptStrip: {
      ariaLabel: 'Department gate progress',
      labels: {
        core: 'Core',
        planning: 'Planning',
        commercial: 'Commercial',
        production: 'Production',
        technical: 'Technical',
        mrp: 'MRP',
        procurement: 'Procurement',
      },
      statusLabels: { done: 'Done', inprog: 'In progress', blocked: 'Blocked', pending: 'Pending' },
      pendingCaption: 'Departments populate once the FG is created at Gate 3.',
    },
    quickLinks: {
      title: 'Workspaces',
      gate: 'Stage-Gate',
      formulation: 'Formulation',
      costing: 'Costing',
      nutrition: 'Nutrition',
      approval: 'Approval',
    },
    empty: 'Project not found',
    emptyBody: 'No project matches this id in your organisation.',
    forbidden: 'You do not have permission to view this project.',
    error: 'Unable to load this project.',
  },
  'npd.advanceGateModal': {
    title: 'Advance gate',
    gateTransition: 'Gate transition',
    currentTag: 'Current',
    targetTag: 'Target',
    approvalRequired: 'This transition requires gate approval.',
    checklistSummary: '{gate} checklist — {label}',
    done: 'Done',
    blocking: 'Blocking',
    optional: 'Optional',
    requiredComplete: '{done} of {total} required items complete',
    blockersTitle: '{count} blocker(s) must be resolved first',
    readyAlert: 'All required items complete — ready to advance.',
    notesLabel: 'Advance notes',
    notesPlaceholder: 'Add a note…',
    notesHint: 'A short note is recorded.',
    cancel: 'Cancel',
    advance: 'Advance to {gate}: {nextLabel}',
    advancing: 'Advancing…',
    successTitle: 'Gate advanced to {gate}: {nextLabel}',
    successBody: 'The project has moved to the next gate.',
    loading: 'Loading gate summary…',
    empty: 'No checklist items to summarise.',
    error: 'Could not advance the gate. Try again.',
    forbidden: 'You do not have permission to advance this gate.',
  },
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: { locale?: string; namespace?: string }) => {
    const namespace = req?.namespace ?? '';
    const ns = INLINE_MESSAGES[namespace] ?? {};
    return (key: string) => {
      const value = key.split('.').reduce((acc: unknown, part: string) => {
        return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns as unknown);
      return typeof value === 'string' ? value : key;
    };
  }),
}));

// ── @monopilot/ui/Modal: render body/footer inline when open (jsdom-friendly). ──
vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open }: { children: React.ReactNode; open: boolean }) {
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { __esModule: true, default: Modal };
});

// ── Transport boundaries the page imports at module load (not exercised via `loaded`). ──
vi.mock('../../../../../(npd)/pipeline/_actions/get-project', () => ({
  getProject: vi.fn(),
}));
vi.mock('../../../../../(npd)/pipeline/_actions/advance-project-gate', () => ({
  advanceProjectGate: vi.fn(async () => ({ ok: true, data: {} })),
}));
vi.mock('../../../../../(npd)/pipeline/_actions/_lib/gate-helpers', () => ({
  GATE_ADVANCE_PERMISSION: 'npd.gate.advance',
}));
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

import ProjectDetailPage from './page';

type LoadedArg = Parameters<typeof ProjectDetailPage>[0] extends infer P
  ? P extends { loaded?: infer L }
    ? L
    : never
  : never;

const BASE_PROJECT = {
  id: 'p1',
  code: 'DEV-123',
  name: 'Sliced Ham 200g',
  type: 'Meat · Cold cut',
  currentGate: 'G1' as const,
  currentStage: 'recipe',
  prio: 'high' as const,
  owner: 'K. Nowak',
  targetLaunch: '2026-09-01',
  notes: null,
  createdAt: '2025-11-14',
  progressPercent: 40,
  closeoutStatus: null,
};

function readyLoaded(overrides: Partial<Record<string, unknown>> = {}): LoadedArg {
  return {
    state: 'ready',
    project: BASE_PROJECT,
    checklistByGate: {
      G0: [],
      G1: [
        { id: 'c1', gateCode: 'G1', categoryCode: 'technical', itemText: 'Feasibility note', required: true, completedAt: '2025-12-01', completedByUser: 'u1', evidenceFile: null },
      ],
      G2: [],
      G3: [],
      G4: [],
    },
    linkedFg: null,
    canAdvance: true,
    ...overrides,
  } as unknown as LoadedArg;
}

async function renderPage(loaded: LoadedArg) {
  const ui = await ProjectDetailPage({
    params: Promise.resolve({ locale: 'en', projectId: 'p1' }),
    loaded,
  });
  return render(ui as React.ReactElement);
}

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

describe('NPD project-detail page (project.jsx:4-43)', () => {
  it('renders the ProjectHeader: code, name, gate badge, priority badge, owner, target', async () => {
    await renderPage(readyLoaded());

    const header = screen.getByTestId('project-header');
    expect(header).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sliced Ham 200g' })).toBeInTheDocument();
    expect(screen.getByTestId('project-header-gate')).toHaveTextContent('Feasibility');
    expect(screen.getByTestId('project-header-prio')).toHaveTextContent('High priority');
    const meta = screen.getByTestId('project-header-meta');
    expect(meta).toHaveTextContent('DEV-123');
    expect(meta).toHaveTextContent('K. Nowak');
    expect(meta).toHaveTextContent('2026-09-01');
  });

  it('renders the StageRail with the G0..Launched dots and marks the current gate active', async () => {
    await renderPage(readyLoaded());

    const rail = screen.getByTestId('project-stage-rail');
    expect(rail).toBeInTheDocument();
    const current = screen.getByTestId('project-stage-G1');
    expect(current).toHaveAttribute('data-status', 'active');
    expect(current).toHaveAttribute('aria-current', 'step');
    // G0 before current → done.
    expect(screen.getByTestId('project-stage-G0')).toHaveAttribute('data-status', 'done');
    // G4 after current → future.
    expect(screen.getByTestId('project-stage-G4')).toHaveAttribute('data-status', 'future');
  });

  it('renders the reused 7-dept strip; pre-G3 (no linked FG) shows the pending caption', async () => {
    await renderPage(readyLoaded({ linkedFg: null }));

    expect(screen.getByTestId('fa-dept-status-strip')).toBeInTheDocument();
    // All 7 depts pending when no FG is linked.
    for (const dept of ['core', 'planning', 'commercial', 'production', 'technical', 'mrp', 'procurement']) {
      expect(screen.getByTestId(`fa-dept-status-${dept}`)).toHaveAttribute('data-status', 'pending');
    }
    expect(screen.getByTestId('project-detail-dept-pending-caption')).toHaveTextContent(
      'Departments populate once the FG is created at Gate 3.',
    );
  });

  it('renders server-derived dept statuses from the linked FG and hides the pending caption (G3+)', async () => {
    await renderPage(
      readyLoaded({
        project: { ...BASE_PROJECT, currentGate: 'G3' },
        linkedFg: {
          productCode: 'FA0043',
          deptStatuses: {
            core: 'done',
            planning: 'inprog',
            commercial: 'pending',
            production: 'blocked',
            technical: 'pending',
            mrp: 'pending',
            procurement: 'pending',
          },
        },
      }),
    );

    expect(screen.getByTestId('fa-dept-status-core')).toHaveAttribute('data-status', 'done');
    expect(screen.getByTestId('fa-dept-status-planning')).toHaveAttribute('data-status', 'inprog');
    expect(screen.getByTestId('fa-dept-status-production')).toHaveAttribute('data-status', 'blocked');
    expect(screen.queryByTestId('project-detail-dept-pending-caption')).not.toBeInTheDocument();
  });

  it('advance button opens the existing AdvanceGateModal flow (?modal=advanceGate)', async () => {
    const user = userEvent.setup();
    await renderPage(readyLoaded());

    const advance = screen.getByTestId('project-header-advance');
    expect(advance).toBeEnabled();
    await user.click(advance);
    expect(pushMock).toHaveBeenCalledWith('/en/pipeline/p1?modal=advanceGate');
  });

  it('RBAC: without advance permission the advance button is disabled (never client-trusted)', async () => {
    await renderPage(readyLoaded({ canAdvance: false }));
    expect(screen.getByTestId('project-header-advance')).toBeDisabled();
  });

  it('Watch/Duplicate are disabled (no backend yet — rendered per prototype, not faked)', async () => {
    await renderPage(readyLoaded());
    expect(screen.getByTestId('project-header-watch')).toBeDisabled();
    expect(screen.getByTestId('project-header-duplicate')).toBeDisabled();
  });

  it('renders quick links to all five existing child routes', async () => {
    await renderPage(readyLoaded());
    expect(screen.getByTestId('project-detail-link-gate')).toHaveAttribute('href', '/pipeline/p1/gate');
    expect(screen.getByTestId('project-detail-link-formulation')).toHaveAttribute('href', '/pipeline/p1/formulation');
    expect(screen.getByTestId('project-detail-link-costing')).toHaveAttribute('href', '/pipeline/p1/costing');
    expect(screen.getByTestId('project-detail-link-nutrition')).toHaveAttribute('href', '/pipeline/p1/nutrition');
    expect(screen.getByTestId('project-detail-link-approval')).toHaveAttribute('href', '/pipeline/p1/approval');
  });

  it('UI state — not-found (bad projectId) renders the empty panel', async () => {
    await renderPage({ state: 'empty', project: null, checklistByGate: null, linkedFg: null, canAdvance: false } as unknown as LoadedArg);
    expect(screen.getByTestId('project-detail-empty')).toHaveTextContent('Project not found');
  });

  it('UI state — permission denied renders the forbidden panel', async () => {
    await renderPage({ state: 'permission_denied', project: null, checklistByGate: null, linkedFg: null, canAdvance: false } as unknown as LoadedArg);
    expect(screen.getByTestId('project-detail-forbidden')).toHaveTextContent(
      'You do not have permission to view this project.',
    );
  });

  it('UI state — error renders the error panel', async () => {
    await renderPage({ state: 'error', project: null, checklistByGate: null, linkedFg: null, canAdvance: false } as unknown as LoadedArg);
    expect(screen.getByTestId('project-detail-error')).toHaveTextContent('Unable to load this project.');
  });
});
