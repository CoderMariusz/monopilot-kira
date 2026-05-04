import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const permissionsModulePath = resolve(repoRoot, 'packages/rbac/src/permissions.enum.ts');
const codeownersPath = resolve(repoRoot, 'CODEOWNERS');

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
] as const;

type PermissionsModule = {
  Permission: Record<string, string>;
  LegacyPermissionAlias: Record<string, string>;
  ALL_PERMISSIONS: readonly string[];
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

  it('keeps every canonical permission in the locked lowercase dotted format', async () => {
    const { ALL_PERMISSIONS } = await loadPermissionsModule();

    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
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
