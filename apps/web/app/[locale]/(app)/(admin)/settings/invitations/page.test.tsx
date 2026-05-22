/**
 * @vitest-environment jsdom
 * T-119 / SET-010 — localized Pending Invitations screen
 *
 * RED phase: behavior-first RTL tests for /en/settings/invitations from
 * prototypes/design/02-SETTINGS-UX.md:404-417 plus access table/modal patterns.
 * Missing production modules render as an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type InvitationStatus = 'pending' | 'expired' | 'accepted';

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: InvitationStatus;
  inviteToken: string;
};

type InvitationsPageProps = {
  invitations: PendingInvitation[];
  permissions: string[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  errorMessage?: string;
  inviteUser?: ReturnType<typeof vi.fn>;
  resendInvitation?: ReturnType<typeof vi.fn>;
  revokeInvitation?: ReturnType<typeof vi.fn>;
};

type InvitationsPage = (props: InvitationsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const VIEW_PERMISSION = 'settings.users.view';
const INVITE_PERMISSION = 'settings.users.invite';
const ROLE_ASSIGN_PERMISSION = 'settings.roles.assign';

const invitations: PendingInvitation[] = [
  {
    id: 'invite-pending',
    email: 'pending.qa@example.test',
    role: 'QA Manager',
    invitedBy: 'Ada Admin',
    invitedAt: '2026-05-18 10:00',
    expiresAt: '2026-05-25 10:00',
    status: 'pending',
    inviteToken: 'token-pending',
  },
  {
    id: 'invite-expired',
    email: 'expired.planner@example.test',
    role: 'Planner',
    invitedBy: 'Ada Admin',
    invitedAt: '2026-05-01 09:30',
    expiresAt: '2026-05-08 09:30',
    status: 'expired',
    inviteToken: 'token-expired',
  },
  {
    id: 'invite-accepted',
    email: 'accepted.wh@example.test',
    role: 'Warehouse Lead',
    invitedBy: 'Ada Admin',
    invitedAt: '2026-05-10 11:15',
    expiresAt: '2026-05-17 11:15',
    status: 'accepted',
    inviteToken: 'token-accepted',
  },
];

async function loadInvitationsPage(): Promise<InvitationsPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-010 localized invitations page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as InvitationsPage;
  } catch {
    return function MissingLocalizedInvitationsPage() {
      return React.createElement('main', { 'data-testid': 'missing-localized-invitations-page' });
    };
  }
}

async function renderInvitationsPage(overrides: Partial<InvitationsPageProps> = {}) {
  const Page = await loadInvitationsPage();
  const props: InvitationsPageProps = {
    invitations,
    permissions: [VIEW_PERMISSION, INVITE_PERMISSION, ROLE_ASSIGN_PERMISSION],
    state: 'ready',
    inviteUser: vi.fn().mockResolvedValue({ ok: true, invitationId: 'invite-new', auditEventId: 'audit-invite-1' }),
    resendInvitation: vi.fn().mockResolvedValue({ ok: true, expiresAt: '2026-05-26 10:00', auditEventId: 'audit-resend-1' }),
    revokeInvitation: vi.fn().mockResolvedValue({ ok: true, status: 'revoked', auditEventId: 'audit-revoke-1' }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<InvitationsPageProps>, props)) };
}

function invitationsTable() {
  return screen.getByRole('table', { name: /pending invitations/i });
}

function rowForEmail(email: string) {
  const row = within(invitationsTable())
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(email));
  expect(row, `expected a table row for ${email}`).toBeTruthy();
  return row as HTMLElement;
}

function expectNoWriteControls() {
  expect(screen.queryByRole('button', { name: /^invite user$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^resend$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^revoke$/i })).not.toBeInTheDocument();
}

describe('SET-010 localized Pending Invitations table and lifecycle actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the required columns, status badges, Invite trigger, and Pending/Expired/Accepted action rules', async () => {
    await renderInvitationsPage();

    expect(screen.getByRole('heading', { name: /pending invitations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^invite user$/i })).toHaveAttribute('data-slot', 'button');

    const table = invitationsTable();
    for (const header of ['Email', 'Role', 'Invited By', 'Invited At', 'Expires At', 'Status', 'Actions']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    const pendingRow = rowForEmail('pending.qa@example.test');
    expect(within(pendingRow).getByText('QA Manager')).toBeInTheDocument();
    expect(within(pendingRow).getByText(/^Pending$/i)).toHaveAttribute('data-slot', 'badge');
    expect(within(pendingRow).getByRole('button', { name: /^resend$/i })).toBeEnabled();
    expect(within(pendingRow).getByRole('button', { name: /^revoke$/i })).toBeEnabled();

    const expiredRow = rowForEmail('expired.planner@example.test');
    expect(within(expiredRow).getByText(/^Expired$/i)).toHaveAttribute('data-slot', 'badge');
    expect(within(expiredRow).getByRole('button', { name: /^resend$/i })).toBeEnabled();
    expect(within(expiredRow).queryByRole('button', { name: /^revoke$/i })).not.toBeInTheDocument();

    const acceptedRow = rowForEmail('accepted.wh@example.test');
    expect(within(acceptedRow).getByText(/^Accepted$/i)).toHaveAttribute('data-slot', 'badge');
    expect(within(acceptedRow).queryByRole('button', { name: /^resend$/i })).not.toBeInTheDocument();
    expect(within(acceptedRow).queryByRole('button', { name: /^revoke$/i })).not.toBeInTheDocument();
    expect(within(acceptedRow).getByText(/read-only|immutable|accepted user/i)).toBeInTheDocument();
  });

  it('calls T-124 resend/revoke handlers with invitation identity and never revokes accepted users', async () => {
    const user = userEvent.setup();
    const resendInvitation = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, expiresAt: '2026-05-26 10:00', auditEventId: 'audit-resend-1' })
      .mockResolvedValueOnce({ ok: false, error: 'invite_failed' });
    const revokeInvitation = vi.fn().mockResolvedValue({ ok: true, status: 'revoked', auditEventId: 'audit-revoke-1' });
    await renderInvitationsPage({ resendInvitation, revokeInvitation });

    await user.click(within(rowForEmail('pending.qa@example.test')).getByRole('button', { name: /^resend$/i }));
    expect(resendInvitation).toHaveBeenCalledWith({ invitationId: 'invite-pending', inviteToken: 'token-pending' });
    expect(await screen.findByRole('status')).toHaveTextContent(/resent|audit-resend-1/i);

    await user.click(within(rowForEmail('expired.planner@example.test')).getByRole('button', { name: /^resend$/i }));
    expect(resendInvitation).toHaveBeenCalledWith({ invitationId: 'invite-expired', inviteToken: 'token-expired' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/invite_failed|could not resend/i);

    await user.click(within(rowForEmail('pending.qa@example.test')).getByRole('button', { name: /^revoke$/i }));
    const confirmDialog = await screen.findByRole('dialog', { name: /revoke invitation/i });
    expect(confirmDialog).toHaveTextContent(/pending\.qa@example\.test/i);
    expect(confirmDialog).toHaveTextContent(/2026-05-25 10:00/i);
    await user.click(within(confirmDialog).getByRole('button', { name: /confirm revoke|revoke invitation/i }));
    expect(revokeInvitation).toHaveBeenCalledWith({ invitationId: 'invite-pending', inviteToken: 'token-pending' });
    expect(await screen.findByRole('status')).toHaveTextContent(/revoked|audit-revoke-1/i);

    expect(within(rowForEmail('accepted.wh@example.test')).queryByRole('button', { name: /^revoke$/i })).not.toBeInTheDocument();
    expect(revokeInvitation).not.toHaveBeenCalledWith({ invitationId: 'invite-accepted', inviteToken: 'token-accepted' });
  });
});

describe('SET-010 localized permissions, route visibility, and mandatory states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a read-only table without Invite/Resend/Revoke when write permissions are missing', async () => {
    await renderInvitationsPage({ permissions: [VIEW_PERMISSION] });

    expect(screen.getByRole('table', { name: /pending invitations/i })).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.users\.invite/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.roles\.assign/i)).toBeInTheDocument();
    expect(rowForEmail('pending.qa@example.test')).toBeInTheDocument();
    expect(rowForEmail('expired.planner@example.test')).toBeInTheDocument();
    expect(rowForEmail('accepted.wh@example.test')).toBeInTheDocument();
    expectNoWriteControls();
  });

  it('fails closed for route access when view and invite permissions are missing', async () => {
    await renderInvitationsPage({ permissions: [] });

    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.users\.view|settings\.users\.invite|permission denied/i);
    expect(screen.queryByRole('table', { name: /pending invitations/i })).not.toBeInTheDocument();
    expectNoWriteControls();
  });

  it('covers loading, empty, and error states without silently skipping invariants', async () => {
    await renderInvitationsPage({ state: 'loading' });
    expect(screen.getByTestId('settings-invitations-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByTestId('settings-invitations-skeleton-row').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole('button', { name: /^invite user$/i })).not.toBeInTheDocument();

    cleanup();
    await renderInvitationsPage({ state: 'empty', invitations: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/no pending invitations/i);
    expect(screen.getByRole('status')).toHaveTextContent(/invite a team member/i);
    expect(screen.getByRole('button', { name: /^invite user$/i })).toBeEnabled();

    cleanup();
    await renderInvitationsPage({ state: 'error', errorMessage: 'T-124 lifecycle unavailable' });
    expect(screen.getByRole('alert')).toHaveTextContent(/T-124 lifecycle unavailable|invitations could not be loaded/i);
    expect(screen.queryByRole('button', { name: /^resend$/i })).not.toBeInTheDocument();
  });
});
