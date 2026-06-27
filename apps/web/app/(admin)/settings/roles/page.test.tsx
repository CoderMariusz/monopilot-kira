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

// All-business-roles contract (post-fix): a role code is any business role
// surfaced by the loader (every org role except the three platform-internal
// `org.*.admin` codes) — no longer a curated 10-literal union.
type RoleCode = string;

type SystemRole = {
  code: RoleCode;
  name: string;
  usersAssigned: number;
  scope: 'Full system' | 'Module-scoped' | 'Workflow-scoped' | 'Read-only';
};

type AssignableUser = {
  id: string;
  name: string;
  email: string;
  currentRoleCode: RoleCode;
};

type RolesPageProps = {
  roles: SystemRole[];
  // roleCode → REAL granted permission strings; the View modal groups them by
  // the rbac catalog and renders them read-only.
  permissionsByRole: Record<RoleCode, string[]>;
  assignableUsers: AssignableUser[];
  canManageRoles: boolean;
  assignRole: ReturnType<typeof vi.fn>;
};

type RolesPage = (props: RolesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const systemRoles: SystemRole[] = [
  { code: 'owner', name: 'Owner', usersAssigned: 1, scope: 'Full system' },
  { code: 'admin', name: 'Admin', usersAssigned: 2, scope: 'Full system' },
  { code: 'npd_manager', name: 'NPD Manager', usersAssigned: 3, scope: 'Workflow-scoped' },
  { code: 'finance_manager', name: 'Finance Manager', usersAssigned: 4, scope: 'Module-scoped' },
  { code: 'qa_inspector', name: 'QA Inspector', usersAssigned: 5, scope: 'Module-scoped' },
  { code: 'shift_lead', name: 'Shift Lead', usersAssigned: 6, scope: 'Module-scoped' },
  { code: 'auditor', name: 'Auditor', usersAssigned: 7, scope: 'Read-only' },
  { code: 'viewer', name: 'Viewer', usersAssigned: 8, scope: 'Read-only' },
];

// The role's REAL granted permission strings (from role_permissions).
const npdManagerPermissions: string[] = [
  'settings.roles.assign',
  'settings.org.read',
  'npd.released_product_edit.request',
  'technical.product_spec.approve',
];

const permissionsByRole = systemRoles.reduce<Record<RoleCode, string[]>>((acc, role) => {
  acc[role.code] = role.code === 'npd_manager' ? npdManagerPermissions : ['settings.org.read'];
  return acc;
}, {} as Record<RoleCode, string[]>);

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

  it('renders System Roles, disabled Custom Roles, and one row per surfaced business role (incl. personas) with required columns and actions', async () => {
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
    expect(bodyRows).toHaveLength(systemRoles.length);
    expect(systemRoles.map((role) => role.code)).toEqual(expect.arrayContaining(['finance_manager', 'qa_inspector', 'shift_lead']));
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

describe('SET-011 View Permissions depth patch', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the role REAL granted permissions, grouped by the rbac catalog, read-only with search (no phantom 5-permission list, no matrix)', async () => {
    const user = userEvent.setup();
    await renderRolesPage();

    const table = screen.getByRole('table', { name: /system roles/i });
    await user.click(within(rowForRole(table, /NPD Manager/i)).getByRole('button', { name: /view permissions/i }));

    const dialog = await screen.findByRole('dialog', { name: /permissions.+npd manager/i });

    // Catalog module groups (from settings.roles.editor.groups.*), not the old
    // hardcoded 3-group / 5-permission list.
    expect(within(dialog).getByRole('region', { name: /settings — core/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: /npd \(new product development\)/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: /technical \/ bom/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: /^production$/i })).toBeInTheDocument();

    // The role's REAL granted permissions are pre-checked (disabled checkboxes).
    expect(within(dialog).getByRole('checkbox', { name: 'settings.org.read' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('checkbox', { name: 'settings.roles.assign' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('checkbox', { name: 'npd.released_product_edit.request' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('checkbox', { name: 'technical.product_spec.approve' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('checkbox', { name: 'settings.org.read' })).toBeDisabled();

    // A catalog permission this role does NOT hold renders un-checked.
    expect(within(dialog).getByRole('checkbox', { name: 'settings.org.update' })).toHaveAttribute('aria-checked', 'false');

    // Phantom permission string is gone.
    expect(within(dialog).queryByText('settings.roles.view')).not.toBeInTheDocument();

    for (const matrixHeader of [/^view$/i, /^create$/i, /^edit$/i, /^delete$/i, /^execute$/i]) {
      expect(within(dialog).queryByRole('columnheader', { name: matrixHeader })).not.toBeInTheDocument();
    }

    await user.type(within(dialog).getByRole('searchbox', { name: /search permissions/i }), 'technical.product_spec.approve');
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
    expect(screen.getAllByRole('button', { name: /view permissions/i })).toHaveLength(systemRoles.length);
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    // The read-only notice cites the real gate permission only.
    expect(screen.getByText(/settings\.roles\.assign/i)).toBeInTheDocument();
    expect(screen.queryByText(/settings\.roles\.manage|settings\.roles\.view/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign role to user/i })).not.toBeInTheDocument();
  });
});
