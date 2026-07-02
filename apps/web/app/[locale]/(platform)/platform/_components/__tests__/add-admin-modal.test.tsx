/**
 * @vitest-environment jsdom
 *
 * Add-platform-admin modal — parity + behaviour + i18n + RBAC surface.
 *
 * Parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   .btn.btn-primary trigger (lines 37-39, 221), the --radius-lg / --shadow-modal
 *   modal card (colors_and_type.css 74/78), and .btn-primary / .btn-secondary
 *   modal actions (37-41). The email echo uses --font-mono.
 *
 * RBAC: the modal NEVER authorizes locally — it only invokes the passed server
 * action (server-resolved assertPlatformAdmin) and renders its typed result.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh }),
}));

import { AddAdminModal, type AddAdminLabels } from '../add-admin-modal';
import enMessages from '../../../../../../i18n/en.json';

const platformMessages = (enMessages as { platform: Record<string, string> }).platform;

const labels: AddAdminLabels = {
  trigger: platformMessages.addAdmin,
  title: platformMessages.addAdminTitle,
  subtitle: platformMessages.addAdminSubtitle,
  emailLabel: platformMessages.addAdminEmailLabel,
  emailPlaceholder: platformMessages.addAdminEmailPlaceholder,
  cancel: platformMessages.addAdminCancel,
  submit: platformMessages.addAdminSubmit,
  submitting: platformMessages.addAdminSubmitting,
  successAdded: platformMessages.addAdminSuccessAdded,
  successRevived: platformMessages.addAdminSuccessRevived,
  successAlready: platformMessages.addAdminSuccessAlready,
  successSelf: platformMessages.addAdminSuccessSelf,
  errorNotFound: platformMessages.addAdminErrorNotFound,
  errorInvalidEmail: platformMessages.addAdminErrorInvalidEmail,
  errorForbidden: platformMessages.addAdminErrorForbidden,
  errorUnknown: platformMessages.addAdminErrorUnknown,
};

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

describe('AddAdminModal — i18n contract', () => {
  it('defines every add-admin key across all four locales (no raw keys)', () => {
    const keys = [
      'addAdminTitle',
      'addAdminSubtitle',
      'addAdminEmailLabel',
      'addAdminSubmit',
      'addAdminSuccessAdded',
      'addAdminErrorNotFound',
      'addAdminErrorInvalidEmail',
    ];
    for (const locale of ['en', 'pl', 'ro', 'uk'] as const) {
      const filePath = path.resolve(process.cwd(), `i18n/${locale}.json`);
      const msgs = JSON.parse(readFileSync(filePath, 'utf8')) as { platform: Record<string, string> };
      for (const k of keys) {
        expect(typeof msgs.platform[k], `${locale}.platform.${k}`).toBe('string');
        expect(msgs.platform[k].length, `${locale}.platform.${k} non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('AddAdminModal — render + parity', () => {
  it('renders the trigger button and opens the modal dialog on click', () => {
    render(<AddAdminModal labels={labels} addPlatformAdminAction={vi.fn(async () => ({ ok: true, outcome: 'added', email: 'a@b.com' }))} />);

    const trigger = screen.getByTestId('platform-add-admin');
    expect(trigger).toHaveTextContent(platformMessages.addAdmin);
    expect(screen.queryByTestId('platform-add-admin-modal')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const modal = screen.getByTestId('platform-add-admin-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(within(modal).getByTestId('platform-add-admin-email')).toBeInTheDocument();
  });
});

describe('AddAdminModal — submit + result states', () => {
  it('calls addPlatformAdminAction(email) and shows the success message + refreshes', async () => {
    const action = vi.fn(async () => ({ ok: true, outcome: 'added' as const, email: 'kim@acme.com' }));
    render(<AddAdminModal labels={labels} addPlatformAdminAction={action} />);

    fireEvent.click(screen.getByTestId('platform-add-admin'));
    fireEvent.change(screen.getByTestId('platform-add-admin-email'), { target: { value: 'kim@acme.com' } });
    fireEvent.click(screen.getByTestId('platform-add-admin-submit'));

    await waitFor(() => expect(action).toHaveBeenCalledWith('kim@acme.com'));
    await waitFor(() =>
      expect(screen.getByTestId('platform-add-admin-success')).toHaveTextContent('kim@acme.com'),
    );
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });

  it('renders the not-found error state when the email has no user', async () => {
    const action = vi.fn(async () => ({ ok: false, error: 'not_found' as const }));
    render(<AddAdminModal labels={labels} addPlatformAdminAction={action} />);

    fireEvent.click(screen.getByTestId('platform-add-admin'));
    fireEvent.change(screen.getByTestId('platform-add-admin-email'), { target: { value: 'ghost@acme.com' } });
    fireEvent.click(screen.getByTestId('platform-add-admin-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('platform-add-admin-error')).toHaveTextContent(platformMessages.addAdminErrorNotFound),
    );
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('renders the invalid-email error state', async () => {
    const action = vi.fn(async () => ({ ok: false, error: 'invalid_email' as const }));
    render(<AddAdminModal labels={labels} addPlatformAdminAction={action} />);

    fireEvent.click(screen.getByTestId('platform-add-admin'));
    fireEvent.change(screen.getByTestId('platform-add-admin-email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('platform-add-admin-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('platform-add-admin-error')).toHaveTextContent(
        platformMessages.addAdminErrorInvalidEmail,
      ),
    );
  });

  it('renders a generic error when the server action throws (never trusts client state)', async () => {
    const action = vi.fn(async () => {
      throw new Error('boom');
    });
    render(<AddAdminModal labels={labels} addPlatformAdminAction={action} />);

    fireEvent.click(screen.getByTestId('platform-add-admin'));
    fireEvent.change(screen.getByTestId('platform-add-admin-email'), { target: { value: 'x@y.com' } });
    fireEvent.click(screen.getByTestId('platform-add-admin-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('platform-add-admin-error')).toHaveTextContent(platformMessages.addAdminErrorUnknown),
    );
  });

  it('closes on cancel', () => {
    render(<AddAdminModal labels={labels} addPlatformAdminAction={vi.fn(async () => ({ ok: true, outcome: 'added', email: 'a@b.com' }))} />);
    fireEvent.click(screen.getByTestId('platform-add-admin'));
    expect(screen.getByTestId('platform-add-admin-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('platform-add-admin-cancel'));
    expect(screen.queryByTestId('platform-add-admin-modal')).not.toBeInTheDocument();
  });
});
