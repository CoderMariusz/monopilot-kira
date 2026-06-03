import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const permissionsModulePath = resolve(repoRoot, 'packages/rbac/src/permissions.enum.ts');
const codeownersPath = resolve(repoRoot, 'CODEOWNERS');

const expectedSettingsCorePermissions = [
  'settings.org.read',
  'settings.org.update',
  'settings.users.create',
  'settings.users.deactivate',
  'settings.users.invite',
  'settings.users.manage',
  'settings.roles.assign',
  'settings.audit.read',
  'settings.impersonate.tenant',
] as const;

const expectedSettingsExtPermissions = [
  'settings.schema.view',
  'settings.schema.edit',
  'settings.schema.promote_l1',
  'settings.rules.view',
  'settings.reference.view',
  'settings.reference.edit',
  'settings.reference.import',
  'settings.infra.view',
  'settings.infra.edit',
  'settings.d365.view',
  'settings.d365.edit',
  'settings.d365.toggle',
  'settings.email.view',
  'settings.email.edit',
  'settings.onboarding.complete',
  'settings.security.edit',
  'settings.security.manage',
  'settings.sso.view',
  'settings.sso.edit',
  'settings.scim.view',
  'settings.scim.edit',
  'settings.ip_allowlist.view',
  'settings.ip_allowlist.edit',
  'settings.flags.view',
  'settings.flags.edit',
  'settings.authorization.view',
  'settings.authorization.edit',
  'npd.released_product_edit.request',
  'npd.released_product_edit.authorize',
  'technical.product_spec.approve',
] as const;

const expectedWorkflowAuthorizationPermissions = [
  'settings.authorization.view',
  'settings.authorization.edit',
  'npd.released_product_edit.request',
  'npd.released_product_edit.authorize',
  'technical.product_spec.approve',
] as const;

const expectedNpdPermissions = [
  'brief.create',
  'npd.project.delete',
  'npd.core.write',
  'npd.dashboard.view',
  'npd.d365_builder.execute',
  'npd.closed_flag.unset',
  'npd.schema.edit',
  'npd.rule.edit',
  'npd.risk.write',
  'npd.compliance_doc.write',
  'npd.formulation.create_draft',
  'npd.formulation.lock',
  'npd.recipe.submit_for_trial',
  'npd.pilot.promote_to_bom',
  'npd.gate.advance',
  'npd.gate.approve',
  'npd.bom.export',
] as const;

const settingsExtPermissionPattern = /^(settings\.[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*|npd\.released_product_edit\.(request|authorize)|technical\.product_spec\.approve)$/;
const npdPermissionPattern = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/;
const npdPermissionsOutsideLiteralPattern = ['brief.create', 'npd.d365_builder.execute'] as const;

const expectedCanonicalPermissions = [
  'org.access.admin',
  'org.schema.admin',
  'org.scim.write',
  'fg.create',
  'fg.edit',
  'brief.convert_to_npd_project',
  'ref.edit',
  'audit.read',
  'outbox.admin',
  'impersonate.org',
  ...expectedSettingsCorePermissions,
  ...expectedSettingsExtPermissions,
  ...expectedNpdPermissions,
] as const;

type PermissionsModule = {
  Permission: Record<string, string>;
  LegacyPermissionAlias: Record<string, string>;
  ALL_PERMISSIONS: readonly string[];
  ALL_SETTINGS_CORE_PERMISSIONS: readonly string[];
  ALL_SETTINGS_EXT_PERMISSIONS: readonly string[];
  ALL_NPD_PERMISSIONS: readonly string[];
  SOD_EXCLUSIVE_PAIRS: readonly (readonly [string, string])[];
  normalizePermission: (input: string) => string;
};

async function loadPermissionsModule(): Promise<PermissionsModule> {
  expect(
    existsSync(permissionsModulePath),
    'packages/rbac/src/permissions.enum.ts must exist as the RBAC permission source of truth',
  ).toBe(true);

  return (await import(permissionsModulePath)) as PermissionsModule;
}

describe('rbac permission source of truth', () => {
  it('exports exactly the canonical org-scoped permission values without duplicates', async () => {
    const { ALL_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(ALL_PERMISSIONS).toEqual(expectedCanonicalPermissions);
    expect(Object.values(Permission)).toEqual(expectedCanonicalPermissions);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('exports the settings core permission group as a typed Permission array literal', async () => {
    const { ALL_PERMISSIONS, ALL_SETTINGS_CORE_PERMISSIONS } = await loadPermissionsModule();

    expect(ALL_SETTINGS_CORE_PERMISSIONS).toEqual(expectedSettingsCorePermissions);
    expect(new Set(ALL_SETTINGS_CORE_PERMISSIONS).size).toBe(ALL_SETTINGS_CORE_PERMISSIONS.length);

    for (const permission of ALL_SETTINGS_CORE_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission).toMatch(/^settings\.[a-z_]+\.[a-z_]+$/);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const settingsCoreExport = source.match(
      /export\s+const\s+ALL_SETTINGS_CORE_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(settingsCoreExport?.[0]).toContain('ALL_SETTINGS_CORE_PERMISSIONS');
  });

  it('exports the settings extension permissions as one typed mixed-namespace Permission array', async () => {
    const { ALL_PERMISSIONS, ALL_SETTINGS_EXT_PERMISSIONS } = await loadPermissionsModule();

    expect(ALL_SETTINGS_EXT_PERMISSIONS).toEqual(expectedSettingsExtPermissions);
    expect(ALL_SETTINGS_EXT_PERMISSIONS).toHaveLength(expectedSettingsExtPermissions.length);
    expect(new Set(ALL_SETTINGS_EXT_PERMISSIONS).size).toBe(ALL_SETTINGS_EXT_PERMISSIONS.length);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);

    for (const permission of ALL_SETTINGS_EXT_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
      expect(permission).toMatch(settingsExtPermissionPattern);
    }

    expect(ALL_SETTINGS_EXT_PERMISSIONS.some((permission) => permission.startsWith('npd.'))).toBe(true);
    expect(ALL_SETTINGS_EXT_PERMISSIONS.some((permission) => permission.startsWith('technical.'))).toBe(true);

    const source = readFileSync(permissionsModulePath, 'utf8');
    const settingsExtExport = source.match(
      /export\s+const\s+ALL_SETTINGS_EXT_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(settingsExtExport?.[0]).toContain('ALL_SETTINGS_EXT_PERMISSIONS');
  });

  it('groups workflow authorization permissions under Settings/Auth without adding a derived matrix', async () => {
    const { ALL_SETTINGS_EXT_PERMISSIONS } = await loadPermissionsModule();
    const source = readFileSync(permissionsModulePath, 'utf8');
    const workflowSection = source.match(/Workflow Authorization[\s\S]*?(?:ALL_SETTINGS_EXT_PERMISSIONS|$)/i)?.[0] ?? '';

    expect(Array.isArray(ALL_SETTINGS_EXT_PERMISSIONS)).toBe(true);
    expect((ALL_SETTINGS_EXT_PERMISSIONS ?? []).filter((permission) => expectedWorkflowAuthorizationPermissions.includes(permission as never))).toEqual(
      expectedWorkflowAuthorizationPermissions,
    );
    expect(workflowSection).toContain('PRD');

    for (const permission of expectedWorkflowAuthorizationPermissions) {
      expect(workflowSection).toContain(permission);
    }

    expect(source).not.toMatch(/npd\.released_product_edit\.(?:request|authorize)\.[a-z_0-9]+/);
    expect(source).not.toMatch(/technical\.product_spec\.approve\.[a-z_0-9]+/);
  });

  it('exports the NPD permissions as a typed Permission array literal', async () => {
    const { ALL_PERMISSIONS, ALL_NPD_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(ALL_NPD_PERMISSIONS).toEqual(expectedNpdPermissions);
    expect(ALL_NPD_PERMISSIONS).toHaveLength(17);
    expect(new Set(ALL_NPD_PERMISSIONS).size).toBe(ALL_NPD_PERMISSIONS.length);
    expect(new Set(Object.values(Permission)).size).toBe(Object.values(Permission).length);

    for (const permission of ALL_NPD_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }

    for (const permission of ALL_NPD_PERMISSIONS.filter(
      (permission) => !npdPermissionsOutsideLiteralPattern.includes(permission as never),
    )) {
      expect(permission).toMatch(npdPermissionPattern);
    }

    const source = readFileSync(permissionsModulePath, 'utf8');
    const npdExport = source.match(
      /export\s+const\s+ALL_NPD_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]/,
    );
    expect(npdExport?.[0]).toContain('ALL_NPD_PERMISSIONS');
  });

  it('keeps every canonical permission in the locked lowercase dotted format', async () => {
    const { ALL_PERMISSIONS } = await loadPermissionsModule();

    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+(\.[a-z_][a-z_0-9]*)+$/);
    }
  });

  it('locks the Org Admin and Schema Admin separation-of-duties pair exactly', async () => {
    const { SOD_EXCLUSIVE_PAIRS } = await loadPermissionsModule();

    expect(SOD_EXCLUSIVE_PAIRS).toEqual([['org.access.admin', 'org.schema.admin']]);
  });

  it('uses fg.* and NPD conversion as the only canonical finished-good permission contract', async () => {
    const { ALL_PERMISSIONS, Permission } = await loadPermissionsModule();

    expect(Permission.FG_CREATE).toBe('fg.create');
    expect(Permission.FG_EDIT).toBe('fg.edit');
    expect(Permission.BRIEF_CONVERT_TO_NPD_PROJECT).toBe('brief.convert_to_npd_project');

    expect(ALL_PERMISSIONS).toContain('fg.create');
    expect(ALL_PERMISSIONS).toContain('fg.edit');
    expect(ALL_PERMISSIONS).toContain('brief.convert_to_npd_project');
    expect(ALL_PERMISSIONS).not.toContain('fa.create');
    expect(ALL_PERMISSIONS).not.toContain('fa.edit');
    expect(ALL_PERMISSIONS).not.toContain('brief.convert_to_fa');
    expect(ALL_PERMISSIONS.some((permission) => permission.startsWith('fa.'))).toBe(false);
  });

  it('keeps legacy fa and FA conversion strings only as explicit normalization aliases', async () => {
    const { LegacyPermissionAlias, normalizePermission } = await loadPermissionsModule();

    expect(LegacyPermissionAlias).toEqual({
      'fa.create': 'fg.create',
      'fa.edit': 'fg.edit',
      'brief.convert_to_fa': 'brief.convert_to_npd_project',
    });

    expect(normalizePermission('fa.create')).toBe('fg.create');
    expect(normalizePermission('fa.edit')).toBe('fg.edit');
    expect(normalizePermission('brief.convert_to_fa')).toBe('brief.convert_to_npd_project');
  });

  it('normalizes canonical permissions unchanged and rejects unknown strings', async () => {
    const { ALL_PERMISSIONS, normalizePermission } = await loadPermissionsModule();

    for (const permission of ALL_PERMISSIONS) {
      expect(normalizePermission(permission)).toBe(permission);
    }

    expect(() => normalizePermission('tenant.access.admin')).toThrow(/unknown|unsupported|invalid/i);
    expect(() => normalizePermission('fa.delete')).toThrow(/unknown|unsupported|invalid/i);
    expect(() => normalizePermission('brief.convert_to_product')).toThrow(/unknown|unsupported|invalid/i);
  });

  it('locks permissions.enum.ts behind architect review in CODEOWNERS', () => {
    expect(existsSync(codeownersPath), 'CODEOWNERS must exist at the repository root').toBe(true);

    const codeowners = readFileSync(codeownersPath, 'utf8');
    expect(codeowners).toMatch(
      /^\s*\/?packages\/rbac\/src\/permissions\.enum\.ts\s+.*(?:@[^\s/]*architect[^\s]*|architect)/im,
    );
  });
});
