import React from 'react';

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
  roles?: SystemRole[];
  permissionsByRole?: Record<RoleCode, RolePermission[]>;
  assignableUsers?: AssignableUser[];
  canManageRoles?: boolean;
  assignRole?: (payload: { userId: string; roleCode: RoleCode; reason: string }) => Promise<unknown> | unknown;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
};

type RolesPageState = {
  permissionsRoleCode: RoleCode | null;
  permissionSearch: string;
  assignmentOpen: boolean;
  userSearch: string;
  selectedUserId: string;
  selectedRoleCode: RoleCode;
  reason: string;
  assignmentStatus: string | null;
};

const h = React.createElement;

const SYSTEM_ROLES: SystemRole[] = [
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

const NPD_MANAGER_PERMISSIONS: RolePermission[] = [
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
    policySummary: 'Role assignment policy is disabled for this organization.',
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
    policySummary: 'Authorization policy is disabled by org authorization policy for released-product edits.',
  },
  {
    group: 'Technical approval',
    name: 'technical.product_spec.approve',
    directlyGrantedBySeed: true,
    status: 'misconfigured_policy',
    policySummary: 'Technical approval policy is misconfigured: approver role seed is missing.',
  },
];

const DEFAULT_PERMISSIONS_BY_ROLE = SYSTEM_ROLES.reduce<Record<RoleCode, RolePermission[]>>((acc, role) => {
  acc[role.code] = role.code === 'npd_manager'
    ? NPD_MANAGER_PERMISSIONS
    : [{
      group: 'Settings',
      name: 'settings.roles.view',
      directlyGrantedBySeed: true,
      status: 'enabled',
      policySummary: 'System default grant from role seed.',
    }];
  return acc;
}, {} as Record<RoleCode, RolePermission[]>);

const DEFAULT_USERS: AssignableUser[] = [
  { id: 'user-nora', name: 'Nora NPD', email: 'nora.npd@example.test', currentRoleCode: 'viewer' },
  { id: 'user-ada', name: 'Ada Admin', email: 'ada.admin@example.test', currentRoleCode: 'admin' },
];

const PERMISSION_GROUPS: RolePermission['group'][] = ['Settings', 'NPD workflow authorization', 'Technical approval'];

function statusLabel(status: PermissionStatus) {
  if (status === 'disabled_by_org_policy') return 'Policy disabled';
  if (status === 'misconfigured_policy') return 'Needs policy repair';
  return 'Enabled';
}

function roleByCode(roles: SystemRole[], code: RoleCode | null) {
  return roles.find((role) => role.code === code) ?? roles[0];
}

function StateShell({ state }: { state: NonNullable<RolesPageProps['state']> }) {
  const copy = {
    loading: ['Roles & Permissions', 'Loading roles and permissions…'],
    empty: ['Roles & Permissions', 'No system roles are configured yet.'],
    error: ['Roles & Permissions', 'Roles and permissions could not be loaded.'],
    'permission-denied': ['Roles & Permissions', 'Read-only: settings.roles.assign is required to manage role assignments.'],
    ready: ['Roles & Permissions', ''],
  }[state];
  return h(
    'main',
    { className: 'mx-auto max-w-6xl space-y-6 p-6', 'aria-busy': state === 'loading' },
    h('h1', { className: 'text-2xl font-semibold tracking-tight' }, copy[0]),
    h('div', { role: state === 'error' ? 'alert' : 'status', className: 'rounded-xl border bg-white p-6 text-sm text-slate-700' }, copy[1]),
  );
}

export default class SettingsRolesPage extends React.Component<RolesPageProps, RolesPageState> {
  state: RolesPageState = {
    permissionsRoleCode: null,
    permissionSearch: '',
    assignmentOpen: false,
    userSearch: '',
    selectedUserId: '',
    selectedRoleCode: 'viewer',
    reason: '',
    assignmentStatus: null,
  };

  openPermissions = (roleCode: RoleCode) => {
    this.setState({ permissionsRoleCode: roleCode, permissionSearch: '' });
  };

  closePermissions = () => {
    this.setState({ permissionsRoleCode: null, permissionSearch: '' });
  };

  openAssignment = () => {
    this.setState({ assignmentOpen: true, userSearch: '', selectedUserId: '', selectedRoleCode: 'viewer', reason: '', assignmentStatus: null });
  };

  closeAssignment = () => {
    this.setState({ assignmentOpen: false });
  };

  submitAssignment = async () => {
    const assignRole = this.props.assignRole ?? (() => Promise.resolve({ ok: true }));
    await assignRole({
      userId: this.state.selectedUserId,
      roleCode: this.state.selectedRoleCode,
      reason: this.state.reason,
    });
    this.setState({ assignmentStatus: 'settings.role_assignment.updated', assignmentOpen: false });
  };

  renderPermissionsDialog(roles: SystemRole[], permissionsByRole: Record<RoleCode, RolePermission[]>) {
    const role = roleByCode(roles, this.state.permissionsRoleCode);
    if (!this.state.permissionsRoleCode || !role) return null;

    const query = this.state.permissionSearch.trim().toLowerCase();
    const permissions = (permissionsByRole[role.code] ?? []).filter((permission) => {
      if (!query) return true;
      return `${permission.group} ${permission.name} ${permission.policySummary ?? ''}`.toLowerCase().includes(query);
    });

    return h(
      'div',
      { className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4', onClick: this.closePermissions },
      h(
        'div',
        {
          role: 'dialog',
          'aria-modal': true,
          'aria-label': `Permissions for ${role.name}`,
          className: 'max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white shadow-2xl',
          onClick: (event: React.MouseEvent) => event.stopPropagation(),
        },
        h('div', { className: 'border-b p-5' },
          h('div', { className: 'flex items-start justify-between gap-4' },
            h('div', null,
              h('h2', { className: 'text-lg font-semibold' }, `Permissions — ${role.name}`),
              h('p', { className: 'mt-1 text-sm text-slate-600' }, 'Flat permission strings grouped by Settings-owned module and workflow namespace.'),
            ),
            h('button', { type: 'button', className: 'rounded-md border px-3 py-1 text-sm', onClick: this.closePermissions }, 'Close'),
          ),
          h('label', { className: 'mt-4 block text-sm font-medium' },
            'Search permissions',
            h('input', {
              type: 'search',
              'aria-label': 'Search permissions',
              className: 'mt-2 w-full rounded-md border px-3 py-2 text-sm',
              value: this.state.permissionSearch,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => this.setState({ permissionSearch: event.target.value }),
              placeholder: 'Search permission string or policy state…',
            }),
          ),
        ),
        h('div', { className: 'space-y-4 p-5' },
          PERMISSION_GROUPS.map((group) => {
            const groupPermissions = permissions.filter((permission) => permission.group === group);
            return h(
              'section',
              { key: group, role: 'region', 'aria-label': group, className: 'rounded-xl border p-4' },
              h('h3', { className: 'text-sm font-semibold text-slate-950' }, group),
              groupPermissions.length === 0
                ? h('p', { className: 'mt-3 text-sm text-slate-500' }, 'No permissions match this filter.')
                : h('ul', { className: 'mt-3 space-y-3' }, groupPermissions.map((permission) => h(
                    'li', { key: permission.name, className: 'rounded-lg bg-slate-50 p-3 text-sm' },
                    h('code', { className: 'font-mono text-slate-950' }, permission.name),
                    h('div', { className: 'mt-2 flex flex-wrap gap-2' },
                      h('span', { className: 'rounded-full bg-slate-900 px-2 py-1 text-xs text-white' },
                        permission.directlyGrantedBySeed ? 'Direct grant by role seed' : 'Not granted by role seed',
                      ),
                      h('span', { className: 'rounded-full border px-2 py-1 text-xs text-slate-700' }, statusLabel(permission.status)),
                    ),
                    permission.policySummary ? h('p', { className: 'mt-2 text-xs text-slate-600' }, permission.policySummary) : null,
                  ))),
            );
          }),
        ),
      ),
    );
  }

  renderAssignmentDialog(roles: SystemRole[], users: AssignableUser[]) {
    if (!this.state.assignmentOpen) return null;
    const query = this.state.userSearch.trim().toLowerCase();
    const filteredUsers = users.filter((user) => `${user.name} ${user.email} ${user.currentRoleCode}`.toLowerCase().includes(query));
    return h(
      'div',
      { className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4', onClick: this.closeAssignment },
      h(
        'div',
        {
          role: 'dialog',
          'aria-modal': true,
          'aria-label': 'Assign role',
          'data-modal-id': 'SM-07',
          className: 'w-full max-w-xl rounded-xl bg-white shadow-2xl',
          onClick: (event: React.MouseEvent) => event.stopPropagation(),
        },
        h('div', { className: 'border-b p-5' },
          h('h2', { className: 'text-lg font-semibold' }, 'Assign role to user'),
          h('p', { className: 'mt-1 text-sm text-slate-600' }, 'SM-07 role assignment uses the T-018 action contract.'),
        ),
        h('div', { className: 'space-y-4 p-5' },
          h('label', { className: 'block text-sm font-medium' },
            'Search user',
            h('input', {
              type: 'text',
              'aria-label': 'Search user',
              className: 'mt-2 w-full rounded-md border px-3 py-2 text-sm',
              value: this.state.userSearch,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => this.setState({ userSearch: event.target.value }),
              placeholder: 'Search by name or email…',
            }),
          ),
          h('div', { role: 'listbox', 'aria-label': 'Assignable users', className: 'max-h-44 space-y-2 overflow-auto' },
            filteredUsers.length === 0
              ? h('div', { className: 'rounded-md border p-3 text-sm text-slate-500' }, 'No users match this search.')
              : filteredUsers.map((user) => h(
                  'button',
                  {
                    key: user.id,
                    type: 'button',
                    role: 'option',
                    'aria-selected': this.state.selectedUserId === user.id,
                    className: `block w-full rounded-md border p-3 text-left text-sm ${this.state.selectedUserId === user.id ? 'border-slate-950 bg-slate-50' : ''}`,
                    onClick: () => this.setState({ selectedUserId: user.id }),
                  },
                  `${user.name} ${user.email} current: ${user.currentRoleCode}`,
                )),
          ),
          h('label', { className: 'block text-sm font-medium' },
            'New role',
            h('select', {
              'aria-label': 'New role',
              className: 'mt-2 w-full rounded-md border px-3 py-2 text-sm',
              value: this.state.selectedRoleCode,
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) => this.setState({ selectedRoleCode: event.target.value as RoleCode }),
            }, roles.map((role) => h('option', { key: role.code, value: role.code }, `${role.name} (${role.code})`))),
          ),
          h('label', { className: 'block text-sm font-medium' },
            'Reason',
            h('textarea', {
              'aria-label': 'Reason',
              className: 'mt-2 w-full rounded-md border px-3 py-2 text-sm',
              value: this.state.reason,
              onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => this.setState({ reason: event.target.value }),
              rows: 3,
            }),
          ),
        ),
        h('div', { className: 'flex justify-end gap-2 border-t bg-slate-50 p-4' },
          h('button', { type: 'button', className: 'rounded-md border px-4 py-2 text-sm', onClick: this.closeAssignment }, 'Cancel'),
          h('button', {
            type: 'button',
            className: 'rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white',
            onClick: this.submitAssignment,
            disabled: !this.state.selectedUserId,
          }, 'Assign role'),
        ),
      ),
    );
  }

  render() {
    const state = this.props.state ?? 'ready';
    if (state !== 'ready') return h(StateShell, { state });

    const roles = this.props.roles ?? SYSTEM_ROLES;
    const permissionsByRole = this.props.permissionsByRole ?? DEFAULT_PERMISSIONS_BY_ROLE;
    const assignableUsers = this.props.assignableUsers ?? DEFAULT_USERS;
    const canManageRoles = this.props.canManageRoles ?? true;

    return h(
      'main',
      { className: 'mx-auto max-w-6xl space-y-6 p-6' },
      h('section', { 'data-region': 'page-head', className: 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between' },
        h('div', null,
          h('p', { className: 'text-xs font-semibold uppercase tracking-wide text-slate-500' }, 'Settings'),
          h('h1', { className: 'mt-1 text-2xl font-semibold tracking-tight text-slate-950' }, 'Roles & Permissions'),
          h('p', { className: 'mt-1 text-sm text-slate-600' }, `${roles.length} system roles · flat workflow permissions`),
        ),
        canManageRoles
          ? h('button', { type: 'button', className: 'rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white', onClick: this.openAssignment }, 'Assign Role to User')
          : h('div', { className: 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900' }, 'Read-only: settings.roles.assign is required to assign roles.'),
      ),
      h('section', { className: 'rounded-xl border bg-white shadow-sm' },
        h('div', { role: 'tablist', 'aria-label': 'Role type', className: 'flex gap-2 border-b p-4' },
          h('button', { type: 'button', role: 'tab', 'aria-selected': true, className: 'rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white' }, 'System Roles'),
          h('button', { type: 'button', role: 'tab', disabled: true, className: 'rounded-md border px-3 py-2 text-sm text-slate-400' }, 'Custom Roles'),
          h('span', { className: 'self-center text-xs text-slate-500' }, 'Enterprise / Phase 3 soon'),
        ),
        h('div', { className: 'overflow-x-auto p-4' },
          h('table', { 'aria-label': 'System roles', className: 'w-full border-collapse text-sm' },
            h('thead', null,
              h('tr', { className: 'border-b text-left text-xs uppercase tracking-wide text-slate-500' },
                h('th', { scope: 'col', className: 'p-3' }, 'Role name'),
                h('th', { scope: 'col', className: 'p-3' }, 'Code'),
                h('th', { scope: 'col', className: 'p-3' }, 'Users assigned'),
                h('th', { scope: 'col', className: 'p-3' }, 'Scope'),
                h('th', { scope: 'col', className: 'p-3' }, 'Actions'),
              ),
            ),
            h('tbody', null,
              roles.map((role) => h('tr', { key: role.code, className: 'border-b last:border-0' },
                h('td', { className: 'p-3 font-medium text-slate-950' }, role.name),
                h('td', { className: 'p-3 font-mono text-xs text-slate-700' }, role.code),
                h('td', { className: 'p-3 text-slate-700' }, role.usersAssigned),
                h('td', { className: 'p-3' }, h('span', { className: 'rounded-full border px-2 py-1 text-xs text-slate-700' }, !canManageRoles && role.scope === 'Read-only' ? 'View-only' : role.scope)),
                h('td', { className: 'p-3' }, h('button', {
                  type: 'button',
                  className: 'rounded-md border px-3 py-1.5 text-sm',
                  onClick: () => this.openPermissions(role.code),
                }, 'View Permissions')),
              )),
            ),
          ),
        ),
      ),
      this.state.assignmentStatus ? h('div', { role: 'status', className: 'rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800' }, this.state.assignmentStatus) : null,
      this.renderPermissionsDialog(roles, permissionsByRole),
      this.renderAssignmentDialog(roles, assignableUsers),
    );
  }
}

export { StateShell as LoadingState };
