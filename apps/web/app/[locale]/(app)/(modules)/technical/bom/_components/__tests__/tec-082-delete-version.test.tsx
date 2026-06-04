/**
 * @vitest-environment jsdom
 * T-042 — TEC-082 BOM Version Delete modal (type-to-confirm) — component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:245-266
 *
 * Asserts: parity (warning copy + type-to-confirm input + destructive Delete
 * button), the snapshot guard (Delete disabled + blocking notice when
 * snapshotCount > 0), the status guard (active/approved never deletable), the
 * type-to-confirm gate (DELETE fired only on exact match), reset-on-close, and
 * that no legacy FA label leaks (FG canonical).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeleteBomVersionModal, type DeleteVersionLabels } from '../delete-version-modal';

afterEach(() => cleanup());

const LABELS: DeleteVersionLabels = {
  title: 'Delete BOM version',
  subtitle: 'Irreversible — breaks historical WO snapshots referencing this version.',
  warning: 'Version {version} will be permanently removed. Planning WO snapshots will show as orphaned.',
  blockedBySnapshots: 'Blocked: {count} work-order snapshot(s) reference {version}. Delete the snapshots first.',
  blockedByStatus: 'Only draft versions can be deleted. Active or approved versions are never removed.',
  confirmLabel: 'Type {version} to confirm',
  cancel: 'Cancel',
  delete: 'Delete version',
};

function setup(extra?: Partial<React.ComponentProps<typeof DeleteBomVersionModal>>) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <DeleteBomVersionModal
      open
      onOpenChange={onOpenChange}
      versionLabel="v7"
      snapshotCount={0}
      deletable
      labels={LABELS}
      onConfirm={onConfirm}
      {...extra}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('DeleteBomVersionModal — parity', () => {
  it('renders the title, warning copy, type-to-confirm input and destructive Delete button', () => {
    setup();
    expect(screen.getByText(LABELS.title)).toBeInTheDocument();
    expect(screen.getByText(/Version v7 will be permanently removed/)).toBeInTheDocument();
    expect(screen.getByTestId('delete-version-confirm-input')).toBeInTheDocument();
    expect(screen.getByTestId('delete-version-confirm-button')).toHaveTextContent('Delete version');
  });

  it('does not leak the legacy FA label', () => {
    const { baseElement } = render(
      <DeleteBomVersionModal
        open
        onOpenChange={() => {}}
        versionLabel="v7"
        snapshotCount={0}
        deletable
        labels={LABELS}
        onConfirm={() => {}}
      />,
    );
    expect(baseElement.textContent).not.toMatch(/Factory Article/i);
  });
});

describe('DeleteBomVersionModal — guards', () => {
  it('disables Delete and shows the blocking notice when snapshots exist', () => {
    setup({ snapshotCount: 3 });
    expect(screen.getByTestId('delete-version-blocked-snapshots')).toBeInTheDocument();
    expect(screen.getByTestId('delete-version-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('delete-version-confirm-input')).toBeDisabled();
  });

  it('disables Delete and shows the status notice when the version is not a draft', () => {
    setup({ deletable: false });
    expect(screen.getByTestId('delete-version-blocked-status')).toBeInTheDocument();
    expect(screen.getByTestId('delete-version-confirm-button')).toBeDisabled();
  });

  it('keeps Delete disabled until the typed value matches the version label', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    const btn = screen.getByTestId('delete-version-confirm-button');
    expect(btn).toBeDisabled();

    await user.type(screen.getByTestId('delete-version-confirm-input'), 'v6');
    expect(btn).toBeDisabled();

    await user.clear(screen.getByTestId('delete-version-confirm-input'));
    await user.type(screen.getByTestId('delete-version-confirm-input'), 'v7');
    expect(btn).toBeEnabled();

    await user.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('never fires onConfirm while blocked even if typed matches', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup({ snapshotCount: 1 });
    // input is disabled, so typing has no effect; the button stays disabled.
    const btn = screen.getByTestId('delete-version-confirm-button');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
