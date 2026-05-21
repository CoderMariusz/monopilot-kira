/**
 * @vitest-environment jsdom
 * T-120 / SET-011 — Roles & Permissions screen
 *
 * RED phase: these RTL tests specify UX SET-011 plus the 2026-05-03
 * permission-depth patch. Missing production page modules render an empty
 * placeholder so RED reports behavior assertion failures, not import noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../lib/auth/with-org-context';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (callback: (ctx: { userId: string; orgId: string; client: { query: ReturnType<typeof vi.fn> } }) => unknown) => callback({
    userId: '00000000-0000-0000-0000-000000000001',
    orgId: '00000000-0000-0000-0000-000000000002',
    client: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  })),
}));

type RoleCode =
  | 'owner'
  | 'admin'
  | 'npd_manager'
  | 'module_admin'
  | 'planner'
  | 'production_lead'
  | 'quality_lead'
  | 'warehouse_operator'
  | 'auditor'
  | 'viewer';

type SystemRole = {
  code: RoleCode;
  name: string;
  usersAssigned: number;
  scope: 'Full system' | 'Module-scoped' | 'Workflow-scoped' | 'Read-only';
};

type PermissionStatus = 'enabled' | 'disabled_by_org_policy' | 'misconfigured_policy';

type RolePermission = {
  name: string;
  group: 'Settings' | 'NPD workflow authorization' | 'Technical approval';
  directlyGrantedBySeed: boolean;
  status: PermissionStatus;
  policySummary?: string;
};

type AssignableUser = {
  id: string;
  name: string;
  email: string;
  currentRoleCode: RoleCode;
};

type RolesPageProps = {
  roles: SystemRole[];
  permissionsByRole: Record<RoleCode, RolePermission[]>;
  assignableUsers: AssignableUser[];
  canManageRoles: boolean;
  assignRole: ReturnType<typeof vi.fn>;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
};

type RolesPage = (props: RolesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const systemRoles: SystemRole[] = [
  { code: 'owner', name: 'Owner', usersAssigned: 1, scope: 'Full system' },
  { code: 'admin', name: 'Admin', usersAssigned: 2, scope: 'Full system' },
  { code: 'npd_manager', name: 'NPD Manager', usersAssigned: 3, scope: 'Workflow-scoped' },
  { code: 'module_admin', name: 'Module Admin', usersAssigned: 4, scope: 'Module-scoped' },
  { code: 'planner', name: 'Planner', usersAssigned: 5, scope: 'Module-scoped' },
  { code: 'production_lead', name: 'Production Lead', usersAssigned: 6, scope: 'Module-scoped' },
  { code: 'quality_lead', name: 'Quality Lead', usersAssigned: 7, scope: 'Module-scoped' },
  { code: 'warehouse_operator', name: 'Warehouse Operator', usersAssigned: 8, scope: 'Module-scoped' },
  { code: 'auditor', name: 'Auditor', usersAssigned: 9, scope: 'Read-only' },
  { code: 'viewer', name: 'Viewer', usersAssigned: 10, scope: 'Read-only' },
];

const npdManagerPermissions: RolePermission[] = [
  {
    group: 'Settings',
    name: 'settings.roles.view',
    directlyGrantedBySeed: true,
    status: 'enabled',
    policySummary: 'System default grant from role seed.',
  },
  {
    group: 'Settings',
    name: 'settings.roles.assign',
    directlyGrantedBySeed: false,
    status: 'disabled_by_org_policy',
    policySummary: 'Role assignment is disabled by org authorization policy.',
  },
  {
    group: 'NPD workflow authorization',
    name: 'npd.released_product_edit.request',
    directlyGrantedBySeed: true,
    status: 'enabled',
    policySummary: 'Request workflow remains enabled by org policy.',
  },
  {
    group: 'NPD workflow authorization',
    name: 'npd.released_product_edit.authorize',
    directlyGrantedBySeed: true,
    status: 'disabled_by_org_policy',
    policySummary: 'Authorization policy is disabled for released-product edits.',
  },
  {
    group: 'Technical approval',
    name: 'technical.product_spec.approve',
    directlyGrantedBySeed: true,
    status: 'misconfigured_policy',
    policySummary: 'Technical approval policy is misconfigured: approver role seed is missing.',
  },
];

const permissionsByRole = systemRoles.reduce<Record<RoleCode, RolePermission[]>>((acc, role) => {
  acc[role.code] = role.code === 'npd_manager' ? npdManagerPermissions : [
    {
      group: 'Settings',
      name: 'settings.roles.view',
      directlyGrantedBySeed: true,
      status: 'enabled',
      policySummary: 'System default grant from role seed.',
    },
  ];
  return acc;
}, {} as Record<RoleCode, RolePermission[]>);

const assignableUsers: AssignableUser[] = [
  { id: 'user-nora', name: 'Nora NPD', email: 'nora.npd@example.test', currentRoleCode: 'viewer' },
  { id: 'user-ada', name: 'Ada Admin', email: 'ada.admin@example.test', currentRoleCode: 'admin' },
];

async function loadRolesPage(): Promise<RolesPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-011 roles page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as RolesPage;
  } catch {
    return function MissingRolesPage() {
      return React.createElement('main', { 'data-testid': 'missing-roles-page' });
    };
  }
}

async function renderRolesPage(overrides: Partial<RolesPageProps> = {}) {
  const Page = await loadRolesPage();
  const props: RolesPageProps = {
    roles: systemRoles,
    permissionsByRole,
    assignableUsers,
    canManageRoles: true,
    assignRole: vi.fn().mockResolvedValue({ ok: true, auditAction: 'settings.role_assignment.updated' }),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<RolesPageProps>, props)) };
}

function rowForRole(table: HTMLElement, roleName: RegExp) {
  const row = within(table).getAllByRole('row').find((candidate) => roleName.test(candidate.textContent ?? ''));
  expect(row, `Expected system roles table to include ${roleName}`).toBeTruthy();
  return row as HTMLElement;
}

describe('SET-011 Roles & Permissions layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders System Roles, disabled Custom Roles, and exactly 10 seeded system-role rows with required columns and actions', async () => {
    await renderRolesPage();

    expect(screen.getByRole('heading', { name: /roles & permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^system roles$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /custom roles/i })).toBeDisabled();
    expect(screen.getByText(/enterprise|phase 3|soon/i)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /system roles/i });
    for (const header of [/role name/i, /code/i, /users assigned/i, /scope/i, /actions/i]) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(10);
    for (const role of systemRoles) {
      const row = rowForRole(table, new RegExp(role.name, 'i'));
      expect(within(row).getByText(role.code)).toBeInTheDocument();
      expect(within(row).getByText(String(role.usersAssigned))).toBeInTheDocument();
      expect(within(row).getByText(role.scope)).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: /view permissions/i })).toBeEnabled();
    }

    expect(screen.getByRole('button', { name: /assign role to user/i })).toBeEnabled();
  });
});

describe('SET-011 server route wiring', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses the localized App Router server path with next-intl and withOrgContext before delegating to the client screen', async () => {
    const Page = await loadRolesPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }) } as unknown as RolesPageProps);
    render(React.createElement(React.Fragment, null, node));

    expect(getTranslations).toHaveBeenCalledWith({ locale: 'en', namespace: 'settings.users_screen' });
    expect(withOrgContext).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /roles & permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/settings\.roles\.assign is required/i);
  });
});

describe('SET-011 required UI states', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders loading, empty, error, and permission-denied state shells without losing the page heading', async () => {
    const stateExpectations: Array<[NonNullable<RolesPageProps['state']>, RegExp, 'status' | 'alert']> = [
      ['loading', /loading roles and permissions/i, 'status'],
      ['empty', /no system roles are configured/i, 'status'],
      ['error', /could not be loaded/i, 'alert'],
      ['permission-denied', /settings\.roles\.assign is required/i, 'status'],
    ];

    for (const [state, body, role] of stateExpectations) {
      cleanup();
      await renderRolesPage({ state });
      expect(screen.getByRole('heading', { name: /roles & permissions/i })).toBeInTheDocument();
      expect(screen.getByRole(role)).toHaveTextContent(body);
    }
  });
});

describe('SET-011 View Permissions depth patch', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens a flat grouped permission detail with workflow strings, org-policy states, search, and no rejected 4-level matrix', async () => {
    const user = userEvent.setup();
    await renderRolesPage();

    const table = screen.getByRole('table', { name: /system roles/i });
    await user.click(within(rowForRole(table, /NPD Manager/i)).getByRole('button', { name: /view permissions/i }));

    const dialog = await screen.findByRole('dialog', { name: /permissions.+npd manager/i });
    expect(within(dialog).getByRole('region', { name: /^settings$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: /npd workflow authorization/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: /technical approval/i })).toBeInTheDocument();

    expect(within(dialog).getByText('settings.roles.view')).toBeInTheDocument();
    expect(within(dialog).getByText('npd.released_product_edit.request')).toBeInTheDocument();
    expect(within(dialog).getByText('npd.released_product_edit.authorize')).toBeInTheDocument();
    expect(within(dialog).getByText('technical.product_spec.approve')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/direct grant|granted by role seed/i).length).toBeGreaterThanOrEqual(3);
    expect(within(dialog).getByText(/disabled by org authorization policy/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/misconfigured/i)).toBeInTheDocument();

    for (const matrixHeader of [/^view$/i, /^create$/i, /^edit$/i, /^delete$/i, /^execute$/i]) {
      expect(within(dialog).queryByRole('columnheader', { name: matrixHeader })).not.toBeInTheDocument();
    }

    await user.type(within(dialog).getByRole('searchbox', { name: /search permissions/i }), 'technical');
    expect(within(dialog).getByText('technical.product_spec.approve')).toBeInTheDocument();
    expect(within(dialog).queryByText('npd.released_product_edit.request')).not.toBeInTheDocument();
  });
});

describe('SET-011 SM-07 role assignment', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens the SM-07 assignment modal and submits through the T-018 role-assignment action contract', async () => {
    const user = userEvent.setup();
    const assignRole = vi.fn().mockResolvedValue({ ok: true, auditAction: 'settings.role_assignment.updated' });
    await renderRolesPage({ assignRole });

    await user.click(screen.getByRole('button', { name: /assign role to user/i }));

    const dialog = await screen.findByRole('dialog', { name: /^assign role/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-07');
    await user.type(within(dialog).getByRole('textbox', { name: /search user/i }), 'nora');
    await user.click(within(dialog).getByRole('option', { name: /Nora NPD.*nora\.npd@example\.test.*current: viewer/i }));
    fireEvent.change(within(dialog).getByLabelText(/new role/i), { target: { value: 'npd_manager' } });
    await user.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'Coverage handoff for released-product workflow authorization');
    await user.click(within(dialog).getByRole('button', { name: /^assign role$/i }));

    expect(assignRole).toHaveBeenCalledWith({
      userId: 'user-nora',
      roleCode: 'npd_manager',
      reason: 'Coverage handoff for released-product workflow authorization',
    });
  });

  it('keeps role permissions viewable but hides role assignment controls without settings role-management permission', async () => {
    await renderRolesPage({ canManageRoles: false });

    expect(screen.getByRole('table', { name: /system roles/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /view permissions/i })).toHaveLength(10);
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/settings\.roles\.assign|settings\.roles\.manage/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign role to user/i })).not.toBeInTheDocument();
  });
});
