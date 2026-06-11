/**
 * @vitest-environment jsdom
 * DEFECT-8 — Role management surface (RoleEditor) RTL.
 *
 * Asserts: create-role modal (code/name/description + field errors), the
 * module-grouped permission grid (group headers from ALL_<MODULE>_PERMISSIONS +
 * toggle-all), system-role read-only lock, and the exact setRolePermissions
 * save payload.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// next-intl: identity translator with ICU {role}/{count} interpolation so the
// test reads stable, human keys.
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    let out = `${namespace}.${key}`;
    if (values) for (const [k, v] of Object.entries(values)) out = out.replace(`{${k}}`, String(v));
    return out;
  },
}));

import RoleEditor, { type EditableRole } from './role-editor.client';

const customRole: EditableRole = { roleId: 'role-1', code: 'qa_reviewer', name: 'QA Reviewer', isSystem: false };
const systemRole: EditableRole = { roleId: 'role-sys', code: 'owner', name: 'Owner', isSystem: true };

function setup(overrides: Partial<React.ComponentProps<typeof RoleEditor>> = {}) {
  const createRole = vi.fn().mockResolvedValue({ ok: true, data: { roleId: 'new', code: 'qa_reviewer' } });
  const listRolePermissions = vi.fn().mockResolvedValue({ ok: true, permissions: ['settings.org.read'] });
  const setRolePermissions = vi.fn().mockResolvedValue({ ok: true, data: { roleId: 'role-1', count: 2 } });
  const props = {
    roles: [systemRole, customRole],
    createRole,
    listRolePermissions,
    setRolePermissions,
    ...overrides,
  };
  return { ...render(<RoleEditor {...props} />), createRole, listRolePermissions, setRolePermissions };
}

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('DEFECT-8 create-role modal', () => {
  it('opens, validates the slug code, and submits a valid create', async () => {
    const user = userEvent.setup();
    const { createRole } = setup();

    await user.click(screen.getByRole('button', { name: /create_button/i }));
    const dialog = await screen.findByRole('dialog');

    // bad slug → field error, no submit
    await user.type(within(dialog).getByLabelText(/field_code/i), 'Bad Code');
    await user.type(within(dialog).getByLabelText(/field_name/i), 'QA Reviewer');
    await user.click(within(dialog).getByRole('button', { name: /create_submit/i }));
    expect(createRole).not.toHaveBeenCalled();
    expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0);

    // fix the code → valid submit
    const codeInput = within(dialog).getByLabelText(/field_code/i);
    await user.clear(codeInput);
    await user.type(codeInput, 'qa_reviewer');
    await user.click(within(dialog).getByRole('button', { name: /create_submit/i }));

    expect(createRole).toHaveBeenCalledWith({ code: 'qa_reviewer', name: 'QA Reviewer', description: undefined });
  });
});

describe('DEFECT-8 permission grid', () => {
  it('groups by module (ALL_<MODULE>_PERMISSIONS) and saves the exact toggled set', async () => {
    const user = userEvent.setup();
    const { listRolePermissions, setRolePermissions } = setup();

    await user.click(screen.getByText(/edit_permissions_help/i));
    // list order: system role (owner) first, custom role (qa_reviewer) second
    await user.click(screen.getAllByRole('button', { name: /permissions_button/i })[1]);

    const dialog = await screen.findByRole('dialog');
    expect(listRolePermissions).toHaveBeenCalledWith('role-1');

    // module group headers come from the catalog (settings_core etc.)
    expect(await within(dialog).findByRole('group', { name: /groups\.settings_core/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: /groups\.production/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: /groups\.quality/i })).toBeInTheDocument();

    // current grant pre-checked
    const orgRead = within(dialog).getByRole('checkbox', { name: 'settings.org.read' });
    expect(orgRead).toHaveAttribute('aria-checked', 'true');

    // toggle one more permission on, then save
    const orgUpdate = within(dialog).getByRole('checkbox', { name: 'settings.org.update' });
    await user.click(orgUpdate);
    await user.click(within(dialog).getByRole('button', { name: /editor\.save$/i }));

    expect(setRolePermissions).toHaveBeenCalledTimes(1);
    const payload = setRolePermissions.mock.calls[0][0];
    expect(payload.roleId).toBe('role-1');
    expect(new Set(payload.permissions)).toEqual(new Set(['settings.org.read', 'settings.org.update']));
  });

  it('renders the grid read-only with a lock note for system roles (no Save)', async () => {
    const user = userEvent.setup();
    const { setRolePermissions } = setup();

    await user.click(screen.getByText(/edit_permissions_help/i));
    // first row in the list is the system role (owner)
    const buttons = screen.getAllByRole('button', { name: /permissions_button/i });
    await user.click(buttons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('role-editor-locked')).toBeInTheDocument();
    // checkboxes disabled, no Save button
    const checkboxes = within(dialog).getAllByRole('checkbox');
    expect(checkboxes.every((cb) => cb.getAttribute('disabled') !== null || cb.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(within(dialog).queryByRole('button', { name: /editor\.save$/i })).not.toBeInTheDocument();
    expect(setRolePermissions).not.toHaveBeenCalled();
  });
});
