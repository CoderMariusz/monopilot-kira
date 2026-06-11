/**
 * @vitest-environment jsdom
 * DEFECT-8 — Settings Roles Editor parity-evidence harness (RTL/DOM + a11y).
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running Next
 * server + Supabase auth (the module Gate-5 live-deploy verification), which is
 * unavailable at the component layer. Per UI-PROTOTYPE-PARITY-POLICY.md (and the
 * established T-066 convention), this harness renders every required state, runs
 * landmark/role a11y checks, and writes:
 *
 *   apps/web/e2e/parity-evidence/settings/DEFECT-8/<state>.html       per-state DOM
 *   apps/web/e2e/parity-evidence/settings/DEFECT-8/parity_report.json region summary
 *   apps/web/e2e/parity-evidence/settings/DEFECT-8/a11y-fallback.json role/landmark checks
 *   apps/web/e2e/parity-evidence/settings/DEFECT-8/parity-map.json    prototype → production map
 *   apps/web/e2e/parity-evidence/settings/DEFECT-8/deviation-log.json deviations + reasons
 *
 * Prototype parity source: prototypes/settings/access-screens.jsx:95-129
 * (the module-grouped "Role permissions" surface). DEVIATION: the matrix renders
 * the canonical ALL_<MODULE>_PERMISSIONS catalog as per-permission checkboxes
 * (group header = module) instead of the prototype's read/write/admin cell glyphs —
 * required so grants map 1:1 onto the packages/rbac permission strings the
 * dual-store write persists. Logged in deviation-log.json.
 */
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    let out = `${namespace}.${key}`;
    if (values) for (const [k, v] of Object.entries(values)) out = out.replace(`{${k}}`, String(v));
    return out;
  },
}));

import RoleEditor, { type EditableRole } from './role-editor.client';
import { PERMISSION_GROUPS } from './permission-catalog';

afterEach(() => cleanup());

const OUT_DIR = path.resolve(__dirname, '../../../../../../../e2e/parity-evidence/settings/DEFECT-8');

const customRole: EditableRole = { roleId: 'role-1', code: 'qa_reviewer', name: 'QA Reviewer', isSystem: false };
const systemRole: EditableRole = { roleId: 'role-sys', code: 'owner', name: 'Owner', isSystem: true };

function write(name: string, contents: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), contents, 'utf8');
}

function baseProps() {
  return {
    roles: [systemRole, customRole],
    createRole: vi.fn().mockResolvedValue({ ok: true, data: { roleId: 'new', code: 'qa_reviewer' } }),
    listRolePermissions: vi.fn().mockResolvedValue({ ok: true, permissions: ['settings.org.read'] }),
    setRolePermissions: vi.fn().mockResolvedValue({ ok: true, data: { roleId: 'role-1', count: 1 } }),
  };
}

function dialogSummary(root: HTMLElement) {
  const dialog = root.querySelector('[role="dialog"]') ?? root;
  return {
    hasDialog: Boolean(root.querySelector('[role="dialog"]')),
    groupHeaders: Array.from(dialog.querySelectorAll('[role="group"]')).map((g) => g.getAttribute('aria-label')),
    checkboxes: dialog.querySelectorAll('[role="checkbox"]').length,
    lockNote: Boolean(dialog.querySelector('[data-testid="role-editor-locked"]')),
    rawSelects: dialog.querySelectorAll('select').length,
    radixOutsideUi: dialog.querySelectorAll('[data-radix-portal]').length,
  };
}

describe('DEFECT-8 parity evidence — per-state DOM artifacts + a11y', () => {
  it('emits create-modal / permissions-grid / system-lock DOM + reports', async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const user = userEvent.setup();
    const report: Record<string, unknown> = {
      task: 'DEFECT-8',
      screen: 'settings/roles',
      prototype_anchor: 'prototypes/settings/access-screens.jsx:95-129',
      permission_gate: 'settings.roles.assign',
      dual_store_write: 'role_permissions (delete+insert ON CONFLICT) AND roles.permissions jsonb rebuilt to the same set, one txn',
      generated_at: new Date().toISOString(),
      states: {} as Record<string, unknown>,
    };

    // (1) create-role modal
    {
      const props = baseProps();
      const { container } = render(<RoleEditor {...props} />);
      await user.click(screen.getByRole('button', { name: /create_button/i }));
      await screen.findByRole('dialog');
      write('create-modal.html', container.innerHTML);
      (report.states as Record<string, unknown>)['create_modal'] = dialogSummary(container);
      cleanup();
    }

    // (2) create-modal field errors (bad slug)
    {
      const props = baseProps();
      const { container } = render(<RoleEditor {...props} />);
      await user.click(screen.getByRole('button', { name: /create_button/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/field_code/i), 'Bad Code');
      await user.click(within(dialog).getByRole('button', { name: /create_submit/i }));
      write('create-modal-errors.html', container.innerHTML);
      (report.states as Record<string, unknown>)['create_modal_field_errors'] = {
        alerts: dialog.querySelectorAll('[role="alert"]').length,
        createCalled: props.createRole.mock.calls.length,
      };
      cleanup();
    }

    // (3) permissions grid (custom role, editable)
    {
      const props = baseProps();
      const { container } = render(<RoleEditor {...props} />);
      await user.click(screen.getByText(/edit_permissions_help/i));
      await user.click(screen.getAllByRole('button', { name: /permissions_button/i })[1]);
      await screen.findByRole('dialog');
      await act(async () => {
        await Promise.resolve();
      });
      write('permissions-grid.html', container.innerHTML);
      (report.states as Record<string, unknown>)['permissions_grid'] = {
        ...dialogSummary(container),
        catalogGroups: PERMISSION_GROUPS.length,
        listCalled: props.listRolePermissions.mock.calls[0]?.[0],
      };
      cleanup();
    }

    // (4) system-role read-only lock
    {
      const props = baseProps();
      const { container } = render(<RoleEditor {...props} />);
      await user.click(screen.getByText(/edit_permissions_help/i));
      await user.click(screen.getAllByRole('button', { name: /permissions_button/i })[0]);
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByTestId('role-editor-locked');
      write('system-lock.html', container.innerHTML);
      (report.states as Record<string, unknown>)['system_role_lock'] = {
        ...dialogSummary(container),
        saveButtonAbsent: within(dialog).queryByRole('button', { name: /editor\.save$/i }) === null,
      };
      cleanup();
    }

    write('parity_report.json', JSON.stringify(report, null, 2));

    // a11y fallback (axe-equivalent role/landmark checks; @axe-core/playwright
    // needs a running RBAC-authenticated server — documented blocker).
    const props = baseProps();
    const { container } = render(<RoleEditor {...props} />);
    await user.click(screen.getByRole('button', { name: /create_button/i }));
    const dialog = await screen.findByRole('dialog');
    const a11y = {
      task: 'DEFECT-8',
      note: 'Playwright + @axe-core blocked (no running RBAC-authenticated app server in worktree). RTL role/label checks substitute, per UI-PROTOTYPE-PARITY-POLICY.md.',
      dialogHasAriaModal: dialog.getAttribute('aria-modal') === 'true',
      dialogLabelled: Boolean(dialog.getAttribute('aria-labelledby')),
      allInputsLabelled: Array.from(dialog.querySelectorAll('input,textarea')).every(
        (i) => Boolean(i.getAttribute('aria-label') || (i.id && dialog.querySelector(`label[for="${i.id}"]`))),
      ),
      noRawSelect: dialog.querySelectorAll('select').length === 0,
      closeButtonHasLabel: Boolean(dialog.querySelector('.modal-close')?.getAttribute('aria-label')),
    };
    write('a11y-fallback.json', JSON.stringify(a11y, null, 2));
    expect(a11y.noRawSelect).toBe(true);
    expect(a11y.allInputsLabelled).toBe(true);
    expect(a11y.dialogHasAriaModal).toBe(true);
    cleanup();

    write(
      'parity-map.json',
      JSON.stringify(
        {
          task: 'DEFECT-8',
          anchor: 'prototypes/settings/access-screens.jsx:95-129',
          regions: {
            'Role permissions (module-grouped)': 'RoleEditor PermissionsEditorDialog — per-module checkbox grid',
            'Create role (Invite-style modal)': 'RoleEditor CreateRoleDialog',
            'System Roles table': 'roles-screen.client RolesScreen (unchanged)',
          },
          data_sources: [
            'createRole / listRolePermissions / setRolePermissions (settings/roles/_actions/role-admin-actions.ts)',
            'readEditableRoles (settings/roles/page.tsx — public.roles via withOrgContext)',
          ],
        },
        null,
        2,
      ),
    );

    write(
      'deviation-log.json',
      JSON.stringify(
        {
          task: 'DEFECT-8',
          deviations: [
            {
              area: 'Permission grid representation',
              prototype: 'access-screens.jsx:95-129 — read/write/admin cell glyphs (◉ ✎ ◎ –) per module×role',
              production: 'Per-permission checkbox grid grouped by module (ALL_<MODULE>_PERMISSIONS).',
              reason:
                'Grants must map 1:1 onto the canonical packages/rbac permission strings the dual-store write persists; a 3-level glyph cell cannot express the flat catalog. Aligns with the SET-011 PO decision (no role×module matrix).',
            },
            {
              area: 'description field',
              prototype: 'n/a',
              production: 'createRole accepts description? but public.roles has no description column (migrations untouched); the value is validated and ignored (no storage).',
              reason: 'Hard rule: do not touch migrations. Signature kept for API parity; documented non-persistence.',
            },
            {
              area: 'Playwright pixel capture',
              prototype: 'n/a',
              production: 'Live spec settings-roles-editor.spec.ts skips without PLAYWRIGHT_BASE_URL; RTL DOM artifacts here are the accepted fallback evidence.',
              reason: 'No running RBAC-authenticated server / DATABASE_URL_OWNER in this worktree (same convention as T-066).',
            },
          ],
        },
        null,
        2,
      ),
    );
  });
});
