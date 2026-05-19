/**
 * T-053 / SM-07 — RoleAssignModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:410-447
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RoleAssignUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  currentRoleId: string;
  currentRoleLabel: string;
  avatarTone?: string;
};

type RoleOption = {
  id: string;
  label: string;
};

type RoleAssignResult = {
  ok: true;
  userId: string;
  roleId: string;
  revalidatedPath: '/settings/users';
} | {
  ok: false;
  error: string;
};

type RoleAssignModalProps = {
  open: boolean;
  users: RoleAssignUser[];
  roles: RoleOption[];
  searchUsers: (input: { query: string; matchMode: 'ilike'; limit: 8 }) => Promise<RoleAssignUser[]>;
  assignRole: (input: { userId: string; roleId: string }) => Promise<RoleAssignResult>;
  onOpenChange: (open: boolean) => void;
  onAssigned: (result: { userId: string; roleId: string; revalidatedPath: '/settings/users' }) => void;
};

const users: RoleAssignUser[] = [
  {
    id: 'user-jane',
    name: 'Jane Manager',
    email: 'jane@example.com',
    initials: 'JM',
    currentRoleId: 'role-admin',
    currentRoleLabel: 'Admin',
    avatarTone: 'blue',
  },
  {
    id: 'user-john',
    name: 'John Operator',
    email: 'john@example.com',
    initials: 'JO',
    currentRoleId: 'role-operator',
    currentRoleLabel: 'Operator',
    avatarTone: 'green',
  },
];

const roles: RoleOption[] = [
  { id: 'role-admin', label: 'Admin' },
  { id: 'role-planner', label: 'Planner' },
  { id: 'role-operator', label: 'Operator' },
];

async function loadRoleAssignModal() {
  const target = './role-assign-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);
  expect(
    module,
    'apps/web/components/settings/modals/role-assign-modal.tsx should exist and export SM-07 RoleAssignModal',
  ).not.toBeNull();

  const component = module?.RoleAssignModal ?? module?.default;
  expect(component, 'RoleAssignModal must be exported as a renderable React component').toEqual(expect.any(Function));
  return component as React.ComponentType<RoleAssignModalProps>;
}

async function renderRoleAssignModal(overrides: Partial<RoleAssignModalProps> = {}) {
  const RoleAssignModal = await loadRoleAssignModal();
  const props: RoleAssignModalProps = {
    open: true,
    users,
    roles,
    searchUsers: vi.fn().mockResolvedValue(users),
    assignRole: vi.fn().mockResolvedValue({
      ok: true,
      userId: 'user-jane',
      roleId: 'role-planner',
      revalidatedPath: '/settings/users',
    }),
    onOpenChange: vi.fn(),
    onAssigned: vi.fn(),
    ...overrides,
  };

  render(<RoleAssignModal {...props} />);
  return props;
}

function getDialog() {
  return screen.getByRole('dialog', { name: /assign role/i });
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  return {
    title: scoped.getByRole('heading', { name: /assign role/i }).textContent,
    subtitle: scoped.getByText(/pick a user, then the new role/i).textContent,
    fields: [
      scoped.getByLabelText(/search user/i).getAttribute('placeholder'),
      scoped.getByRole('combobox', { name: /new role/i }).getAttribute('aria-label') ?? 'New role',
    ],
    resultCount: scoped.getAllByRole('option', { name: /@example\.com/i }).length,
    footerButtons: scoped.getAllByRole('button').slice(-2).map((button: HTMLElement) => button.textContent),
    nativeSelectCount: dialog.querySelectorAll('select').length,
  };
}

async function pickUserAndRole(user: ReturnType<typeof userEvent.setup>, roleLabel = 'Planner') {
  await user.click(screen.getByRole('option', { name: /Jane Manager.*jane@example\.com.*current: Admin/i }));
  await user.click(screen.getByRole('combobox', { name: /new role/i }));
  await user.click(screen.getByRole('option', { name: roleLabel }));
}

function assertModalA11y(dialog: HTMLElement) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAttribute('data-focus-trap', 'radix-dialog');
  expect(dialog).toHaveAttribute('data-size', 'wide');
  expect(dialog.querySelector('select')).toBeNull();
  expect(within(dialog).getByLabelText(/search user/i)).toHaveFocus();
}

describe('SM-07 RoleAssignModal prototype parity', () => {
  it('matches the role_assign_modal structure, shadcn primitives, disabled rule, focus order, and RTL outline snapshot', async () => {
    const user = userEvent.setup();
    await renderRoleAssignModal();

    const dialog = getDialog();
    assertModalA11y(dialog);
    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "fields": [
          "Name or email…",
          "New role",
        ],
        "footerButtons": [
          "Cancel",
          "Assign role",
        ],
        "nativeSelectCount": 0,
        "resultCount": 2,
        "subtitle": "Pick a user, then the new role.",
        "title": "Assign role",
      }
    `);

    const scoped = within(dialog);
    const assignButton = scoped.getByRole('button', { name: /assign role/i });
    expect(assignButton).toBeDisabled();

    await pickUserAndRole(user);

    expect(scoped.getByText(/Assigning/i)).toHaveTextContent(
      'Assigning Planner to Jane Manager. Previous role Admin will be replaced.',
    );
    expect(assignButton).toBeEnabled();

    await user.tab();
    expect(scoped.getByRole('option', { name: /Jane Manager/i })).toHaveFocus();
    await user.tab();
    expect(scoped.getByRole('option', { name: /John Operator/i })).toHaveFocus();
    await user.tab();
    expect(scoped.getByRole('combobox', { name: /new role/i })).toHaveFocus();
  });
});

describe('SM-07 RoleAssignModal search behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces a 'jane' search for at least 250ms and performs exactly one ILIKE Server Action call", async () => {
    const searchUsers = vi.fn().mockResolvedValue([users[0]]);
    await renderRoleAssignModal({ searchUsers });

    const input = screen.getByLabelText(/search user/i);
    fireEvent.change(input, { target: { value: 'j' } });
    fireEvent.change(input, { target: { value: 'ja' } });
    fireEvent.change(input, { target: { value: 'jan' } });
    fireEvent.change(input, { target: { value: 'jane' } });

    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(searchUsers).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    await waitFor(() => expect(searchUsers).toHaveBeenCalledTimes(1));
    expect(searchUsers).toHaveBeenCalledWith({ query: 'jane', matchMode: 'ilike', limit: 8 });
  });

  it('renders loading, empty, and error states loudly instead of silently hiding search failures', async () => {
    const emptySearch = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('db offline'));
    await renderRoleAssignModal({ searchUsers: emptySearch });

    fireEvent.change(screen.getByLabelText(/search user/i), { target: { value: 'zzzz' } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText(/searching users/i)).toBeInTheDocument();
    expect(await screen.findByText(/no users match “zzzz”/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search user/i), { target: { value: 'jane' } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to search users/i);
  });
});

describe('SM-07 RoleAssignModal assignment behavior', () => {
  it('calls the assign role Server Action, closes the modal, and notifies the parent to render the revalidated table', async () => {
    const user = userEvent.setup();
    const assignRole = vi.fn().mockResolvedValue({
      ok: true,
      userId: 'user-jane',
      roleId: 'role-planner',
      revalidatedPath: '/settings/users',
    } satisfies RoleAssignResult);
    const onOpenChange = vi.fn();
    const onAssigned = vi.fn();

    await renderRoleAssignModal({ assignRole, onOpenChange, onAssigned });
    await pickUserAndRole(user);
    await user.click(screen.getByRole('button', { name: /assign role/i }));

    await waitFor(() => {
      expect(assignRole).toHaveBeenCalledTimes(1);
      expect(assignRole).toHaveBeenCalledWith({ userId: 'user-jane', roleId: 'role-planner' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAssigned).toHaveBeenCalledWith({
      userId: 'user-jane',
      roleId: 'role-planner',
      revalidatedPath: '/settings/users',
    });
  });
});
