/**
 * @vitest-environment jsdom
 * Wave F3-G8 — "not yet enforced" badge in the role permissions editor.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    let out = `${namespace}.${key}`;
    if (values) for (const [k, v] of Object.entries(values)) out = out.replace(`{${k}}`, String(v));
    return out;
  },
}));

import RoleEditor, { type EditableRole } from './role-editor.client';

const customRole: EditableRole = { roleId: 'role-1', code: 'qa_reviewer', name: 'QA Reviewer', isSystem: false };

function setup() {
  const listRolePermissions = vi.fn().mockResolvedValue({ ok: true, permissions: [] });
  const props = {
    roles: [customRole],
    createRole: vi.fn(),
    listRolePermissions,
    setRolePermissions: vi.fn(),
  };
  return { ...render(<RoleEditor {...props} />), listRolePermissions };
}

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('permission enforcement badge', () => {
  it('does not render the badge for an enforced permission', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByText(/edit_permissions_help/i));
    await user.click(screen.getByRole('button', { name: /permissions_button/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: 'settings.org.read' })).toBeInTheDocument();
    const row = within(dialog).getByRole('checkbox', { name: 'settings.org.read' }).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByTestId('permission-not-enforced-badge')).not.toBeInTheDocument();
  });

  it('renders the badge for an unenforced permission', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByText(/edit_permissions_help/i));
    await user.click(screen.getByRole('button', { name: /permissions_button/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: 'settings.scim.view' })).toBeInTheDocument();
    const row = within(dialog).getByRole('checkbox', { name: 'settings.scim.view' }).closest('li');
    expect(row).not.toBeNull();
    const badge = within(row as HTMLElement).getByTestId('permission-not-enforced-badge');
    expect(badge).toHaveTextContent('enforcement.badge');
    expect(badge).toHaveAttribute('title', 'settings.roles.enforcement.tooltip');
  });
});
