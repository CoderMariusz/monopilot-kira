/**
 * @vitest-environment jsdom
 *
 * Dashboard "+ Create FG" wiring (RED → GREEN).
 *
 * Root cause this guards against: the NPD dashboard rendered a "+ Create FA"
 * button gated on canCreate, but the button had no working onClick (the Server
 * Component page could not pass a client callback across the RSC boundary) and
 * FaCreateModal was never mounted — clicking did nothing. The fix mirrors the
 * working FA-LIST pattern (fa-list-table.tsx): local open state + inline
 * FaCreateModal + injected createFaAction (a real Server Action, serializable
 * across the RSC boundary) + injected labels.
 *
 * These tests deliberately do NOT pre-navigate and do NOT rely on the router
 * push being observed by a second component — a click must synchronously open
 * the dialog in the SAME tree (hard-load safety).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:32-174 (NpdDashboard)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:9-43 (FACreateModal)
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/npd',
  // Fresh load: empty params; this value is STATIC — it never changes in
  // response to pushMock, exactly like the real hard-load failure mode.
  useSearchParams: () => new URLSearchParams(),
}));

import {
  DashboardScreen,
  type DashboardScreenLabels,
  type DashboardScreenProps,
} from '../dashboard-screen';
import type { FaCreateLabels } from '../../../fa/_components/fa-create-modal';

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

const LABELS: DashboardScreenLabels = new Proxy(
  { createFa: '+ Create FG' } as Partial<DashboardScreenLabels>,
  {
    get: (target, prop: string) =>
      prop in target ? (target as Record<string, string>)[prop] : `lbl.${prop}`,
  },
) as DashboardScreenLabels;

const MODAL_LABELS: FaCreateLabels = {
  title: 'lbl.modalTitle',
  subtitle: 'lbl.modalSubtitle',
  fieldProductCode: 'lbl.fieldProductCode',
  fieldProductCodeHint: 'lbl.fieldProductCodeHint',
  fieldProductName: 'lbl.fieldProductName',
  fieldProductNameHint: 'lbl.fieldProductNameHint',
  rangeHint: 'lbl.rangeHint',
  cancel: 'lbl.cancel',
  create: 'lbl.create',
  creating: 'lbl.creating',
  errorV01: 'lbl.errorV01',
  errorV02: 'lbl.errorV02',
  errorDuplicate: 'lbl.errorDuplicate',
  errorGeneric: 'lbl.errorGeneric',
};

const BASE: DashboardScreenProps = {
  state: 'ready',
  labels: LABELS,
  canCreate: true,
  canRefresh: false,
  summary: { totalActive: 1, fullyComplete: 0, inProgress: 1, totalBuilt: 0 },
  perDept: [{ dept: 'core', done: 1, pending: 0, blocked: 0 }],
  alerts: [],
};

function makeAction() {
  return vi.fn(async () => ({ productCode: 'FA5609' }));
}

function renderScreen(overrides: Partial<DashboardScreenProps> = {}) {
  const props: DashboardScreenProps = {
    ...BASE,
    createModalLabels: MODAL_LABELS,
    createFaAction: makeAction(),
    ...overrides,
  };
  return render(<DashboardScreen {...props} />);
}

describe('Dashboard "+ Create FG" — opens the modal + wires the action', () => {
  it('uses the FG-canonical label', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: /create fg/i })).toBeInTheDocument();
  });

  it('clicking the button opens the dialog in the SAME render (no router round-trip)', async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: LABELS.createFa }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('a valid submit calls createFa and navigates to /{locale}/fa/{code} on success', async () => {
    const user = userEvent.setup();
    const createFaAction = makeAction();
    renderScreen({ createFaAction });

    await user.click(screen.getByRole('button', { name: LABELS.createFa }));
    const code = await screen.findByLabelText(new RegExp(MODAL_LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(
      screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductName)),
      'Pulled Chicken Shawarma',
    );
    await user.click(screen.getByRole('button', { name: MODAL_LABELS.create }));

    await waitFor(() =>
      expect(createFaAction).toHaveBeenCalledWith({
        productCode: 'FA5609',
        productName: 'Pulled Chicken Shawarma',
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fa/FA5609'));
  });

  it('RBAC: when canCreate is false the button is absent AND no dialog can be opened', () => {
    renderScreen({ canCreate: false });
    expect(screen.queryByRole('button', { name: LABELS.createFa })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
