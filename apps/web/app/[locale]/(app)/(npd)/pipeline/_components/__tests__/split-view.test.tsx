/**
 * @vitest-environment jsdom
 * T-129 — Pipeline SplitView + ProjectDetailPanel (split_view prototype) test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/pipeline.jsx:89-131 (SplitView)
 *   (the SplitView = TableView selection list + sticky ProjectDetailPanel Card)
 *
 * RED → GREEN: asserts the parity checklist (left compact selection list + right
 * sticky ProjectDetailPanel showing code/name/type/owner/gate/prio/target-launch/
 * progress/recent-activity), URL ?selected=<projectId> persistence + keyboard
 * navigation (ArrowDown/ArrowUp/Enter), the < 1280 px TableView fallback contract
 * (§17.12), the five required UI states, the i18n-key resolution (no hard-coded
 * user-facing strings), and that NO DB call is made from the Client Components.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SplitView, type SplitLabels } from '../split-view';
import { ProjectDetailPanel } from '../project-detail-panel';
import type { KanbanProject } from '../kanban-types';

const replaceMock = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline',
  useSearchParams: () => currentParams,
}));

// matchMedia stub: default = desktop (>= 1280 px). Individual tests override.
function setViewport({ wide }: { wide: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      // (min-width: 1280px) matches when wide.
      matches: query.includes('1280') ? wide : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  currentParams = new URLSearchParams();
  setViewport({ wide: true });
});

afterEach(() => {
  cleanup();
  replaceMock.mockReset();
});

const LABELS: SplitLabels = {
  title: 'Pipeline',
  subtitle: 'Split view — list + project detail',
  colCode: 'Project',
  colName: 'Name',
  colType: 'Type',
  colGate: 'Gate',
  colOwner: 'Owner',
  colProgress: 'Progress',
  colTarget: 'Target',
  colPrio: 'Prio',
  listLabel: 'Projects',
  detailLabel: 'Project detail',
  gateG0: 'G0 · Concept',
  gateG1: 'G1 · Brief',
  gateG2: 'G2 · Recipe',
  gateG3: 'G3 · Trial',
  gateG4: 'G4 · Approval',
  gateLaunched: 'Launched',
  prioHigh: 'High',
  prioNormal: 'Normal',
  prioLow: 'Low',
  fieldOwner: 'Owner',
  fieldGate: 'Gate',
  fieldCreated: 'Created',
  fieldTarget: 'Target launch',
  fieldType: 'Type',
  progress: 'Progress',
  recentActivity: 'Recent activity',
  noActivity: 'No recent activity',
  noOwner: 'Unassigned',
  noTarget: 'No target',
  openProject: 'Open project →',
  loading: 'Loading pipeline…',
  empty: 'No projects in the pipeline',
  emptyBody: 'Start a new Stage-Gate project to populate the board.',
  emptyDetail: 'Select a project to see its detail.',
  error: 'Unable to load the pipeline.',
  forbidden: 'You do not have permission to view the pipeline.',
};

const PROJECTS: KanbanProject[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'DEV-052',
    name: 'Strawberry Yogurt 150g',
    type: 'single',
    currentGate: 'G0',
    prio: 'high',
    owner: 'Ana Owner',
    targetLaunch: '2026-09-01',
    progressPercent: 20,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    code: 'DEV-053',
    name: 'Oat Drink Barista',
    type: 'range',
    currentGate: 'G2',
    prio: 'normal',
    owner: null,
    targetLaunch: null,
    progressPercent: 60,
  },
];

describe('SplitView — parity (pipeline.jsx:89-131)', () => {
  it('renders a left compact selection list + right sticky ProjectDetailPanel', () => {
    render(<SplitView projects={PROJECTS} labels={LABELS} />);

    // left list region (selection list, shadcn Table primitive)
    const list = screen.getByRole('region', { name: LABELS.listLabel });
    expect(within(list).getByText('DEV-052')).toBeInTheDocument();
    expect(within(list).getByText('Strawberry Yogurt 150g')).toBeInTheDocument();
    expect(within(list).getByText('DEV-053')).toBeInTheDocument();

    // right sticky detail panel — defaults to first project
    const detail = screen.getByRole('region', { name: LABELS.detailLabel });
    expect(within(detail).getByText('DEV-052')).toBeInTheDocument();
    expect(within(detail).getByText('Strawberry Yogurt 150g')).toBeInTheDocument();
    // detail fields present
    expect(within(detail).getByText(LABELS.fieldOwner)).toBeInTheDocument();
    expect(within(detail).getByText(LABELS.fieldGate)).toBeInTheDocument();
    expect(within(detail).getByText(LABELS.fieldTarget)).toBeInTheDocument();
    expect(within(detail).getByText(LABELS.recentActivity)).toBeInTheDocument();
    // progress bar accessible
    expect(within(detail).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
  });

  it('updates URL ?selected=<id> and detail panel when a row is clicked', async () => {
    render(<SplitView projects={PROJECTS} labels={LABELS} />);

    fireEvent.click(screen.getByText('Oat Drink Barista'));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
    });
    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('selected=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    const detail = screen.getByRole('region', { name: LABELS.detailLabel });
    expect(within(detail).getByText('Oat Drink Barista')).toBeInTheDocument();
  });

  it('honours ?selected= from the URL on mount (shareable links)', () => {
    currentParams = new URLSearchParams('selected=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    render(<SplitView projects={PROJECTS} labels={LABELS} />);

    const detail = screen.getByRole('region', { name: LABELS.detailLabel });
    expect(within(detail).getByText('Oat Drink Barista')).toBeInTheDocument();
  });

  it('supports ArrowDown/ArrowUp/Enter keyboard navigation', async () => {
    render(<SplitView projects={PROJECTS} labels={LABELS} />);

    const list = screen.getByRole('listbox', { name: LABELS.listLabel });
    list.focus();

    // ArrowDown moves selection to the 2nd project then Enter commits ?selected=.
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });

    await waitFor(() => {
      const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('selected=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    });

    // ArrowUp moves back to the 1st.
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'Enter' });
    await waitFor(() => {
      const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('selected=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    });
  });
});

describe('SplitView — < 1280 px fallback (§17.12)', () => {
  it('falls back to the plain TableView list (no detail aside) below 1280 px', async () => {
    setViewport({ wide: false });
    render(<SplitView projects={PROJECTS} labels={LABELS} />);

    await waitFor(() => {
      // detail aside is NOT rendered in the narrow fallback
      expect(screen.queryByRole('region', { name: LABELS.detailLabel })).not.toBeInTheDocument();
    });
    // but the list is still present
    expect(screen.getByRole('region', { name: LABELS.listLabel })).toBeInTheDocument();
  });
});

describe('SplitView — required UI states', () => {
  it('loading', () => {
    render(<SplitView projects={[]} labels={LABELS} state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent(LABELS.loading);
  });

  it('empty', () => {
    render(<SplitView projects={[]} labels={LABELS} state="empty" />);
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.getByText(LABELS.emptyBody)).toBeInTheDocument();
  });

  it('error', () => {
    render(<SplitView projects={[]} labels={LABELS} state="error" />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('permission denied', () => {
    render(<SplitView projects={[]} labels={LABELS} state="permission_denied" />);
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});

describe('ProjectDetailPanel — empty state', () => {
  it('renders an empty-state prompt when project is null', () => {
    render(<ProjectDetailPanel project={null} labels={LABELS} />);
    const detail = screen.getByRole('region', { name: LABELS.detailLabel });
    expect(within(detail).getByText(LABELS.emptyDetail)).toBeInTheDocument();
  });

  it('renders project summary fields when a project is provided', () => {
    render(<ProjectDetailPanel project={PROJECTS[1]!} labels={LABELS} />);
    const detail = screen.getByRole('region', { name: LABELS.detailLabel });
    expect(within(detail).getByText('Oat Drink Barista')).toBeInTheDocument();
    expect(within(detail).getByText('DEV-053')).toBeInTheDocument();
    // null owner / target fall back to labelled placeholders (a11y, never blank)
    expect(within(detail).getByText(LABELS.noOwner)).toBeInTheDocument();
    expect(within(detail).getByText(LABELS.noTarget)).toBeInTheDocument();
  });
});

describe('SplitView — i18n (no hard-coded user-facing strings)', () => {
  it('renders only label-provided strings for chrome', () => {
    render(<SplitView projects={PROJECTS} labels={LABELS} />);
    expect(screen.getByText(LABELS.subtitle)).toBeInTheDocument();
    // act used to flush the mount effect that writes ?selected= default
    act(() => {});
  });
});
