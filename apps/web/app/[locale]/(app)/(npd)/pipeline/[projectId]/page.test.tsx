/**
 * @vitest-environment jsdom
 *
 * NPD project-detail INDEX page (RSC) — body that sits under the persistent header
 * + 8-stage rail owned by layout.tsx. Asserts the 7-dept strip + the 5 UI states +
 * i18n + RBAC. The header + operational rail moved to the layout (see layout.test).
 *
 * Prototype parity source: the 7-dept strip reuses fa-screens.jsx:365-385. The
 * legacy G0-G4 StageRail + ProjectHeader that used to live here were REMOVED (the
 * "too many tabs instead of a header" complaint).
 *
 * The production page reads via getProject + withOrgContext (RLS). We mock those
 * transport boundaries and drive the render through the `loaded` injection seam.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── next-intl/server: serve INLINE project-detail messages (no fixture JSON). ──
const INLINE_MESSAGES: Record<string, Record<string, unknown>> = {
  'npd.projectDetail': {
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
    empty: 'Project not found',
    emptyBody: 'No project matches this id in your organisation.',
    forbidden: 'You do not have permission to view this project.',
    error: 'Unable to load this project.',
  },
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: { locale?: string; namespace?: string }) => {
    const ns = INLINE_MESSAGES[req?.namespace ?? ''] ?? {};
    return (key: string) => {
      const value = key.split('.').reduce((acc: unknown, part: string) => {
        return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns as unknown);
      return typeof value === 'string' ? value : key;
    };
  }),
}));

// ── Transport boundaries imported at module load (not exercised via `loaded`). ──
vi.mock('../../../../../(npd)/pipeline/_actions/get-project', () => ({
  getProject: vi.fn(),
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

function readyLoaded(overrides: Partial<Record<string, unknown>> = {}): LoadedArg {
  return { state: 'ready', linkedFg: null, ...overrides } as unknown as LoadedArg;
}

async function renderPage(loaded: LoadedArg) {
  const ui = await ProjectDetailPage({
    params: Promise.resolve({ locale: 'en', projectId: 'p1' }),
    loaded,
  });
  return render(ui as React.ReactElement);
}

afterEach(cleanup);

describe('NPD project-detail INDEX page', () => {
  it('renders the reused 7-dept strip; pre-G3 (no linked FG) shows the pending caption', async () => {
    await renderPage(readyLoaded({ linkedFg: null }));

    expect(screen.getByTestId('fa-dept-status-strip')).toBeInTheDocument();
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

  it('no longer renders the legacy G0-G4 StageRail or the ProjectHeader (moved to layout)', async () => {
    await renderPage(readyLoaded());
    expect(screen.queryByTestId('project-stage-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-header')).not.toBeInTheDocument();
  });

  it('UI state — not-found (bad projectId) renders the empty panel', async () => {
    await renderPage({ state: 'empty', linkedFg: null } as unknown as LoadedArg);
    expect(screen.getByTestId('project-detail-empty')).toHaveTextContent('Project not found');
  });

  it('RBAC: permission denied renders the forbidden panel', async () => {
    await renderPage({ state: 'permission_denied', linkedFg: null } as unknown as LoadedArg);
    expect(screen.getByTestId('project-detail-forbidden')).toHaveTextContent(
      'You do not have permission to view this project.',
    );
  });

  it('UI state — error renders the error panel', async () => {
    await renderPage({ state: 'error', linkedFg: null } as unknown as LoadedArg);
    expect(screen.getByTestId('project-detail-error')).toHaveTextContent('Unable to load this project.');
  });
});
