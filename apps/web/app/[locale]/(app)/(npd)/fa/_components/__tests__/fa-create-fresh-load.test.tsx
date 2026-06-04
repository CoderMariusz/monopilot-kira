/**
 * @vitest-environment jsdom
 * NF — "+ Create FG" must open the modal on a FRESH HARD LOAD (RED → GREEN).
 *
 * Root cause this guards against: the old wiring split the trigger and the modal
 * into two independently-hydrated client islands coupled only through
 * `router.push(?modal=faCreate)` + `useSearchParams` reactivity. On a fresh hard
 * load (NOT an SPA nav), the button was dead for real users — clicking did
 * nothing because the open mechanism depended on a router round-trip reaching a
 * separate island. The robust fix collapses button + modal into ONE island whose
 * open state is local `useState`, so the button works the instant FaListTable
 * hydrates (and if it does not hydrate, nothing renders at all).
 *
 * These tests deliberately do NOT pre-navigate and do NOT rely on the router
 * push being observed by a second component. A click must synchronously open the
 * dialog in the SAME tree.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:177-297 (FAList)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:9-43 (FACreateModal)
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// next/navigation is stubbed to a FRESH page state: no `?modal=` in the URL and a
// push spy that is NEVER fed back into the component (mirrors a hard load where a
// second island would never re-render). The modal MUST open without this loop.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/fa',
  // Fresh load: empty params; crucially this value is STATIC — it never changes
  // in response to pushMock, exactly like the real hard-load failure mode.
  useSearchParams: () => new URLSearchParams(),
}));

import { FaListTable, type FaListLabels, type FaListRow } from '../fa-list-table';
import type { FaCreateLabels } from '../fa-create-modal';

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

const LIST_LABELS: FaListLabels = new Proxy({ createFa: 'lbl.createFa' } as Partial<FaListLabels>, {
  get: (target, prop: string) => (prop in target ? (target as Record<string, string>)[prop] : `lbl.${prop}`),
}) as FaListLabels;

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

const ROWS: FaListRow[] = [];

describe('NF — "+ Create FG" opens the modal on a FRESH hard load (no prior nav)', () => {
  it('clicking the button opens the dialog in the SAME render, without a router round-trip', async () => {
    const user = userEvent.setup();
    const createFaAction = vi.fn(async () => ({ productCode: 'FA5609' }));

    render(
      <FaListTable
        rows={ROWS}
        labels={LIST_LABELS}
        canCreate
        state="empty"
        createModalLabels={MODAL_LABELS}
        createFaAction={createFaAction}
      />,
    );

    // Fresh paint: dialog is closed.
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: LIST_LABELS.createFa }));

    // The dialog opens immediately from local state — even though the stubbed
    // useSearchParams never changes (the hard-load failure mode).
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('mounts the dialog OPEN on initial paint when the URL already carries ?modal=faCreate (deep link / SSR)', async () => {
    // Re-stub useSearchParams to carry the deep-link param for this case only.
    vi.resetModules();
    vi.doMock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
      usePathname: () => '/en/fa',
      useSearchParams: () => new URLSearchParams('modal=faCreate'),
    }));
    const { FaListTable: FreshTable } = await import('../fa-list-table');
    const createFaAction = vi.fn(async () => ({ productCode: 'FA5609' }));

    render(
      <FreshTable
        rows={ROWS}
        labels={LIST_LABELS}
        canCreate
        state="empty"
        createModalLabels={MODAL_LABELS}
        createFaAction={createFaAction}
      />,
    );

    // The dialog is present on the very first paint (no click required).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    vi.doUnmock('next/navigation');
  });

  it('a valid submit calls createFa and navigates to /{locale}/fa/{code} on success', async () => {
    const user = userEvent.setup();
    const createFaAction = vi.fn(async () => ({ productCode: 'FA5609' }));

    render(
      <FaListTable
        rows={ROWS}
        labels={LIST_LABELS}
        canCreate
        state="empty"
        createModalLabels={MODAL_LABELS}
        createFaAction={createFaAction}
      />,
    );

    await user.click(screen.getByRole('button', { name: LIST_LABELS.createFa }));
    const code = await screen.findByLabelText(new RegExp(MODAL_LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductName)), 'Pulled Chicken Shawarma');
    await user.click(screen.getByRole('button', { name: MODAL_LABELS.create }));

    await waitFor(() =>
      expect(createFaAction).toHaveBeenCalledWith({ productCode: 'FA5609', productName: 'Pulled Chicken Shawarma' }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fa/FA5609'));
  });

  it('RBAC: when canCreate is false the button is absent AND no dialog can be opened', () => {
    const createFaAction = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(
      <FaListTable
        rows={ROWS}
        labels={LIST_LABELS}
        canCreate={false}
        state="empty"
        createModalLabels={MODAL_LABELS}
        createFaAction={createFaAction}
      />,
    );
    expect(screen.queryByRole('button', { name: LIST_LABELS.createFa })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
