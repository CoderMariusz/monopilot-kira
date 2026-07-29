import { describe, expect, it } from 'vitest';

import {
  ALL_MAINTENANCE_PERMISSIONS,
  Permission,
} from '../../rbac/src/permissions.enum.js';
import {
  assertDatabaseRoleCanBypassRls,
  assertExactPermissions,
  PERSONA_PROOF_SQL,
  TEST_PERSONAS,
} from '../seeds/test-personas.js';

describe('test persona seed contract', () => {
  it('defines the five RBAC personas with the intended exact permission boundaries', () => {
    const personas = new Map(TEST_PERSONAS.map((persona) => [persona.key, persona]));

    expect([...personas.keys()]).toEqual([
      'admin',
      'no_asset_deactivate',
      'second_signer',
      'single_site_operator',
      'no_module_access',
    ]);

    expect(personas.get('admin')).toMatchObject({
      permissionSource: 'existing_role',
      permissions: [],
    });

    expect(personas.get('no_asset_deactivate')?.permissions).toEqual(
      ALL_MAINTENANCE_PERMISSIONS.filter(
        (permission) => permission !== Permission.MNT_ASSET_DEACTIVATE,
      ),
    );
    expect(personas.get('no_asset_deactivate')?.permissions).not.toContain(
      Permission.MNT_ASSET_DEACTIVATE,
    );

    expect(personas.get('second_signer')?.permissions).toEqual([
      Permission.MNT_ASSET_READ,
      Permission.MNT_LOTO_APPLY,
      Permission.MNT_CALIB_RECORD,
    ]);
    expect(personas.get('second_signer')?.userId).not.toBe(
      personas.get('admin')?.userId,
    );

    expect(personas.get('single_site_operator')?.siteScope).toBe('single');
    expect(personas.get('single_site_operator')?.permissions).toContain(
      Permission.PRODUCTION_WO_START,
    );

    expect(personas.get('no_module_access')?.permissions).toEqual([]);
    expect(new Set(TEST_PERSONAS.map((persona) => persona.userId)).size).toBe(
      TEST_PERSONAS.length,
    );

    expect(PERSONA_PROOF_SQL).toContain('public.role_permissions');
    expect(PERSONA_PROOF_SQL).toContain('jsonb_array_elements_text');
    expect(PERSONA_PROOF_SQL).toContain("'mnt.asset.deactivate'");
  });

  it('refuses a database role that FORCE RLS would make silently see zero rows', () => {
    expect(() =>
      assertDatabaseRoleCanBypassRls({
        current_user: 'monopilot',
        rolsuper: false,
        rolbypassrls: false,
      }),
    ).toThrow(/FORCE ROW LEVEL SECURITY.*zero rows.*BYPASSRLS/);

    expect(() =>
      assertDatabaseRoleCanBypassRls({
        current_user: 'test_admin',
        rolsuper: false,
        rolbypassrls: true,
      }),
    ).not.toThrow();
  });

  it('reports both sides of an effective-permission mismatch', () => {
    expect(() =>
      assertExactPermissions(
        'persona.second-signer@monopilot.test',
        ['mnt.asset.read', 'mnt.asset.edit'],
        ['mnt.asset.edit', 'mnt.asset.deactivate'],
      ),
    ).toThrow(
      'Effective permission mismatch for persona.second-signer@monopilot.test; missing=["mnt.asset.read"]; unexpected=["mnt.asset.deactivate"]',
    );
  });
});
