import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const migrationPath = resolve(repoRoot, 'packages/db/migrations/258-cross-cutting-admin-read-permission-seed.sql');
const permissionsPath = resolve(repoRoot, 'packages/rbac/src/permissions.enum.ts');

const expectedReadPermissions = [
  'quality.dashboard.view',
  'ship.dashboard.view',
  'oee.dashboard.read',
  'oee.shift_pattern.read',
  'oee.tv.kiosk_view',
  'mnt.asset.read',
  'multi_site.site.view',
  'multi_site.cross_site.read',
] as const;

describe('258 cross-cutting admin read permission seed', () => {
  it('uses a new >=258 migration and mirrors the org-admin seed pattern', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migrationPath).toMatch(/\/258-[^/]+\.sql$/);
    expect(migration).toContain('p_org_id uuid');
    expect(migration).toContain('where r.org_id = p_org_id');
    expect(migration).toContain("v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin']");
    expect(migration).toContain('insert into public.role_permissions (role_id, permission)');
    expect(migration).toContain('on conflict (role_id, permission) do nothing');
    expect(migration).toContain('jsonb_array_elements_text(coalesce(r.permissions');
    expect(migration).toContain('create trigger trg_zzz_seed_cross_cutting_admin_read_permissions');
    expect(migration).toContain('for v_org_id in select id from public.organizations loop');
    expect(migration).not.toMatch(/\br\.tenant_id\b|\bwhere\s+[^;\n]*tenant_id\b/i);
    expect(migration).not.toMatch(/current_setting\s*\(/);
  });

  it('seeds only canonical read/view strings from the Permission enum', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const permissions = readFileSync(permissionsPath, 'utf8');

    for (const permission of expectedReadPermissions) {
      expect(migration).toContain(`'${permission}'`);
      expect(permissions).toContain(`'${permission}'`);
    }

    const quotedSeedStrings = [...migration.matchAll(/'([a-z_]+\.[a-z_]+\.[a-z_]+)'/g)].map((match) => match[1]);
    const seededPermissionStrings = quotedSeedStrings.filter((permission) =>
      expectedReadPermissions.includes(permission as (typeof expectedReadPermissions)[number]),
    );
    expect(seededPermissionStrings).toEqual([...expectedReadPermissions]);
  });
});
