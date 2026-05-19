/**
 * @vitest-environment jsdom
 * T-059 / SET-008 — Users screen
 *
 * RED phase: these RTL tests specify the production users_screen behavior from
 * prototypes/design/Monopilot Design System/settings/access-screens.jsx:4-151.
 * Missing production page modules render an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../../packages/ui/test/assertModalA11y';

type UserRoleCode =
  | 'org_admin'
  | 'npd_manager'
  | 'module_admin'
  | 'planner'
  | 'production_lead'
  | 'quality_lead'
  | 'operator'
  | 'viewer';

type UserStatus = 'active' | 'invited' | 'disabled';

type SettingsUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleCode: UserRoleCode;
  roleLabel: string;
  roleCategory: 'Admin' | 'Manager' | 'Operator' | 'Viewer';
  site: string;
  lastActive: string;
  status: UserStatus;
};

type RoleSummary = {
  code: UserRoleCode;
  label: string;
  category: 'Admin' | 'Manager' | 'Operator' | 'Viewer';
};

type PermissionCell = 'admin' | 'rw' | 'r' | 'none';

type UsersPageProps = {
  users: SettingsUser[];
  roles: RoleSummary[];
  modules: string[];
  permissions: Record<string, Record<string, PermissionCell>>;
  kpis: { activeUsers: number; invitedUsers: number; disabledUsers: number; seatLimit: number };
  searchParams?: { view?: 'table' | 'cards'; role?: 'all' | 'admin' | 'manager' | 'operator' | 'viewer'; q?: string };
  canManageUsers: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  inviteUser?: ReturnType<typeof vi.fn>;
  exportUsers?: ReturnType<typeof vi.fn>;
};

type UsersPage = (props: UsersPageProps) => React.ReactNode | Promise<React.ReactNode>;

const managerRoleCodes: UserRoleCode[] = [
  'npd_manager',
  'module_admin',
  'planner',
  'production_lead',
  'quality_lead',
];

const roles: RoleSummary[] = [
  { code: 'org_admin', label: 'Admin', category: 'Admin' },
  { code: 'npd_manager', label: 'NPD Manager', category: 'Manager' },
  { code: 'module_admin', label: 'Module Admin', category: 'Manager' },
  { code: 'planner', label: 'Planner', category: 'Manager' },
  { code: 'production_lead', label: 'Production Lead', category: 'Manager' },
  { code: 'quality_lead', label: 'Quality Lead', category: 'Manager' },
  { code: 'operator', label: 'Operator', category: 'Operator' },
  { code: 'viewer', label: 'Viewer', category: 'Viewer' },
];

const users: SettingsUser[] = [
  {
    id: 'u-admin',
    name: 'Ada Admin',
    email: 'ada.admin@example.test',
    initials: 'AA',
    roleCode: 'org_admin',
    roleLabel: 'Admin',
    roleCategory: 'Admin',
    site: 'Kraków HQ',
    lastActive: '2026-05-18 08:13',
    status: 'active',
  },
  {
    id: 'u-npd-manager',
    name: 'Marta Manager',
    email: 'marta.manager@example.test',
    initials: 'MM',
    roleCode: 'npd_manager',
    roleLabel: 'NPD Manager',
    roleCategory: 'Manager',
    site: 'Kraków HQ',
    lastActive: '2026-05-17 16:40',
    status: 'active',
  },
  {
    id: 'u-planner',
    name: 'Piotr Planner',
    email: 'piotr.planner@example.test',
    initials: 'PP',
    roleCode: 'planner',
    roleLabel: 'Planner',
    roleCategory: 'Manager',
    site: 'Wrocław',
    lastActive: '2026-05-16 09:05',
    status: 'invited',
  },
  {
    id: 'u-operator',
    name: 'Olga Operator',
    email: 'olga.operator@example.test',
    initials: 'OO',
    roleCode: 'operator',
    roleLabel: 'Operator',
    roleCategory: 'Operator',
    site: 'Kraków HQ',
    lastActive: '2026-05-14 11:20',
    status: 'disabled',
  },
  {
    id: 'u-viewer',
    name: 'Vera Viewer',
    email: 'vera.viewer@example.test',
    initials: 'VV',
    roleCode: 'viewer',
    roleLabel: 'Viewer',
    roleCategory: 'Viewer',
    site: 'All sites',
    lastActive: '2026-05-12 15:48',
    status: 'active',
  },
];

const permissions: UsersPageProps['permissions'] = {
  NPD: { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'none' },
  Planning: { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'none' },
  Quality: { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'r' },
};

async function loadUsersPage(): Promise<UsersPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-008 users page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as UsersPage;
  } catch {
    return function MissingUsersPage() {
      return React.createElement('main', { 'data-testid': 'missing-users-page' });
    };
  }
}

async function renderUsersPage(overrides: Partial<UsersPageProps> = {}) {
  const Page = await loadUsersPage();
  const props: UsersPageProps = {
    users,
    roles,
    modules: Object.keys(permissions),
    permissions,
    kpis: { activeUsers: 17, invitedUsers: 2, disabledUsers: 1, seatLimit: 50 },
    searchParams: { view: 'table', role: 'all' },
    canManageUsers: true,
    state: 'ready',
    inviteUser: vi.fn().mockResolvedValue({ ok: true, invitationId: 'invite-059' }),
    exportUsers: vi.fn().mockResolvedValue({ ok: true, filename: 'settings-users.csv' }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<UsersPageProps>, props)) };
}

function pageSectionSummary() {
  return {
    headings: screen.getAllByRole('heading').map((heading) => heading.textContent),
    kpiLabels: screen.getAllByTestId('users-kpi-tile').map((tile) => within(tile).getByTestId('users-kpi-label').textContent),
    roleFilters: screen.getAllByTestId('users-role-filter').map((filter) => filter.textContent),
    tableHeaders: within(screen.getByRole('table', { name: /users/i }))
      .getAllByRole('columnheader')
      .map((header) => header.textContent),
    permissionModules: within(screen.getByRole('table', { name: /role permissions/i }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]?.textContent),
  };
}

describe('SET-008 users_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the prototype regions, controls, shadcn primitives, states, and keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = await renderUsersPage();

    expect(screen.getByRole('heading', { name: /users & roles/i })).toBeInTheDocument();
    expect(screen.getByText(/5 users · 4 role categories/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^export$/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /invite user/i })).toHaveAttribute('data-slot', 'button');

    expect(screen.getAllByTestId('users-kpi-tile')).toHaveLength(4);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText(/Seats used\s+17\s*\/\s*50/i)).toBeInTheDocument();

    const directory = screen.getByRole('region', { name: /user directory/i });
    expect(within(directory).getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(directory).getByRole('button', { name: /^admin$/i })).toHaveAttribute('data-slot', 'toggle-group-item');
    expect(within(directory).getByRole('button', { name: /^manager$/i })).toHaveAttribute('data-slot', 'toggle-group-item');
    expect(within(directory).getByRole('button', { name: /^operator$/i })).toHaveAttribute('data-slot', 'toggle-group-item');
    expect(within(directory).getByRole('button', { name: /^viewer$/i })).toHaveAttribute('data-slot', 'toggle-group-item');
    expect(within(directory).getByRole('searchbox', { name: /search by name or email/i })).toHaveAttribute('data-slot', 'input');

    const usersTable = screen.getByRole('table', { name: /users/i });
    expect(within(usersTable).getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(within(usersTable).getByRole('columnheader', { name: /email/i })).toBeInTheDocument();
    expect(within(usersTable).getByRole('columnheader', { name: /role/i })).toBeInTheDocument();
    expect(within(usersTable).getByRole('columnheader', { name: /site/i })).toBeInTheDocument();
    expect(within(usersTable).getByRole('columnheader', { name: /last active/i })).toBeInTheDocument();
    expect(within(usersTable).getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(within(usersTable).getAllByText(/active|invited|disabled/i).length).toBeGreaterThanOrEqual(3);

    expect(container.querySelectorAll('select')).toHaveLength(0);
    const roleCombobox = within(usersTable).getAllByRole('combobox', { name: /role/i })[0];
    expect(roleCombobox.closest('[data-slot="select-trigger"], [data-slot="select"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="badge"]').length).toBeGreaterThanOrEqual(8);
    expect(container.querySelectorAll('[data-slot="card"]').length).toBeGreaterThanOrEqual(4);

    const permissionTable = screen.getByRole('table', { name: /role permissions/i });
    expect(within(permissionTable).getByRole('columnheader', { name: /^module$/i })).toBeInTheDocument();
    expect(within(permissionTable).getByRole('columnheader', { name: /^admin$/i })).toBeInTheDocument();
    expect(within(permissionTable).getByRole('columnheader', { name: /^manager$/i })).toBeInTheDocument();
    expect(within(permissionTable).getByRole('columnheader', { name: /^operator$/i })).toBeInTheDocument();
    expect(within(permissionTable).getByRole('columnheader', { name: /^viewer$/i })).toBeInTheDocument();
    expect(screen.getByText(/full admin/i)).toBeInTheDocument();
    expect(screen.getByText(/read & write/i)).toBeInTheDocument();
    expect(screen.getByText(/read only/i)).toBeInTheDocument();
    expect(screen.getByText(/no access/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /^export$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /invite user/i })).toHaveFocus();
    await user.tab();
    expect(within(directory).getByRole('button', { name: /^all$/i })).toHaveFocus();

    expect(pageSectionSummary()).toMatchInlineSnapshot(`
      {
        "headings": [
          "Users & roles",
          "Role permissions",
        ],
        "kpiLabels": [
          "Active",
          "Invited",
          "Disabled",
          "Seats used",
        ],
        "permissionModules": [
          "NPD",
          "Planning",
          "Quality",
        ],
        "roleFilters": [
          "All",
          "Admin",
          "Manager",
          "Operator",
          "Viewer",
        ],
        "tableHeaders": [
          "",
          "Name",
          "Email",
          "Role",
          "Site",
          "Last active",
          "Status",
          "",
        ],
      }
    `);
  });

  it('renders loading, empty, error, and permission-denied states without silently skipping invariants', async () => {
    await renderUsersPage({ state: 'loading' });
    expect(screen.getByTestId('settings-users-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /invite user/i })).not.toBeInTheDocument();

    cleanup();
    await renderUsersPage({ state: 'empty', users: [], searchParams: { role: 'manager', view: 'table' } });
    expect(screen.getByRole('status')).toHaveTextContent(/no users in the "manager" role/i);
    expect(screen.getByRole('button', { name: /invite user/i })).toBeEnabled();

    cleanup();
    await renderUsersPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/users could not be loaded/i);

    cleanup();
    await renderUsersPage({ state: 'permission-denied', canManageUsers: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.users\.manage/i);
    expect(screen.queryByRole('button', { name: /invite user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^export$/i })).not.toBeInTheDocument();
  });
});

describe('SET-008 KPI values and URL view/filter behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Seats used 17 / 50 from server aggregate props, not from rendered row count', async () => {
    await renderUsersPage({ users: users.slice(0, 2), kpis: { activeUsers: 17, invitedUsers: 3, disabledUsers: 4, seatLimit: 50 } });

    expect(screen.getByText(/Seats used\s+17\s*\/\s*50/i)).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByText(/Seats used\s+2\s*\/\s*50/i)).not.toBeInTheDocument();
  });

  it('uses ?view=cards&role=manager to activate card view and list only Manager-category users', async () => {
    await renderUsersPage({ searchParams: { view: 'cards', role: 'manager' } });

    expect(screen.getByRole('button', { name: /^manager$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('settings-users-card-grid')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /users/i })).not.toBeInTheDocument();

    const cards = screen.getAllByTestId('settings-user-card');
    expect(cards).toHaveLength(users.filter((user) => managerRoleCodes.includes(user.roleCode)).length);
    expect(screen.getByText('Marta Manager')).toBeInTheDocument();
    expect(screen.getByText('Piotr Planner')).toBeInTheDocument();
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Olga Operator')).not.toBeInTheDocument();
    expect(screen.queryByText('Vera Viewer')).not.toBeInTheDocument();
    for (const card of cards) {
      expect(managerRoleCodes).toContain(card.getAttribute('data-role-code'));
      expect(within(card).getByTestId('settings-user-role-pill')).toHaveTextContent(/manager|planner|lead|admin/i);
    }
  });
});

describe('SET-008 invite modal trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the SM-06 invite Dialog from the page-head trigger and passes modal a11y', async () => {
    const user = userEvent.setup();
    const { container } = await renderUsersPage();

    await user.click(screen.getByRole('button', { name: /invite user/i }));

    const dialog = await screen.findByRole('dialog', { name: /invite user|invite team member/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-06');
    expect(within(dialog).getByRole('textbox', { name: /email address/i })).toHaveAttribute('type', 'email');
    expect(within(dialog).getByRole('combobox', { name: /^role/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /^site/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /personal message/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^send invitation$/i })).toBeInTheDocument();

    await assertModalA11y(container);
  });
});
