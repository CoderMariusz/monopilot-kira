/**
 * RTL test for the Settings → Modal gallery (developer reference surface).
 *
 * Verifies the gallery renders one trigger per modal variant, that clicking a
 * trigger opens the corresponding REAL shared modal, and that closing works.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import ModalGalleryClient, { type ModalGalleryLabels } from './modal-gallery.client';

const labels: ModalGalleryLabels = {
  title: 'Modal gallery',
  subtitle: 'Developer reference for the shared modal system.',
  note: 'Click a trigger to open the modal.',
  openTrigger: 'Open modal',
  cancel: 'Cancel',
  close: 'Close',
};

const VARIANT_IDS = [
  'SM-01',
  'SM-02',
  'SM-03',
  'SM-04',
  'SM-05',
  'SM-06',
  'SM-07',
  'SM-08',
  'SM-09',
  'SM-10',
  'SM-11',
] as const;

const VARIANT_TITLES: Record<string, string> = {
  'SM-01': 'Dry-run — wo_state_guard',
  'SM-02': 'Edit flag — checkout_v2',
  'SM-03': 'Column — allergen_set',
  'SM-04': 'Edit template — po_to_supplier',
  'SM-05': 'Start L1→L2→L3 promotion',
  'SM-06': 'Invite team member',
  'SM-07': 'Assign role',
  'SM-08': 'Test D365 connection',
  'SM-09': 'Reset password?',
  'SM-10': 'Delete A99?',
  'SM-11': 'Edit row — A99',
};

function getDialog() {
  return document.querySelector('[data-testid="modal-header"]')?.closest('[role="dialog"]') ?? null;
}

describe('Modal gallery', () => {
  it('renders the PageHead, prototype source marker, and a trigger per variant', () => {
    render(<ModalGalleryClient labels={labels} />);

    expect(screen.getByText('Modal gallery')).toBeInTheDocument();
    expect(screen.getByTestId('settings-modal-gallery')).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/modals.jsx',
    );

    for (const id of VARIANT_IDS) {
      expect(screen.getByTestId(`gallery-trigger-${id}`)).toBeInTheDocument();
    }
    // No modal is open before any trigger is clicked.
    expect(getDialog()).toBeNull();
  });

  it('opens the matching modal when each trigger is clicked, then closes it', async () => {
    const user = userEvent.setup();
    render(<ModalGalleryClient labels={labels} />);

    for (const id of VARIANT_IDS) {
      // Open
      await user.click(screen.getByTestId(`gallery-trigger-${id}`));
      const dialog = getDialog();
      expect(dialog).not.toBeNull();
      const header = within(dialog as HTMLElement).getByTestId('modal-header');
      expect(within(header).getByRole('heading', { name: VARIANT_TITLES[id] })).toBeInTheDocument();

      // Close via the footer Cancel/Close button rendered inside the dialog.
      const footer = within(dialog as HTMLElement).getByTestId('modal-footer');
      const closeButton =
        within(footer).queryByRole('button', { name: 'Cancel' }) ??
        within(footer).getByRole('button', { name: 'Close' });
      await user.click(closeButton);

      // Dialog is gone after closing.
      expect(getDialog()).toBeNull();
    }
  });

  it('opens the destructive password-reset confirm with a disabled action until acknowledged', async () => {
    const user = userEvent.setup();
    render(<ModalGalleryClient labels={labels} />);

    await user.click(screen.getByTestId('gallery-trigger-SM-09'));
    const dialog = getDialog() as HTMLElement;
    expect(within(dialog).getByText('Reset password?')).toBeInTheDocument();

    const sendButton = within(dialog).getByRole('button', { name: 'Send reset link' });
    expect(sendButton).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox'));
    expect(sendButton).toBeEnabled();
  });
});
