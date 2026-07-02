import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(resolve(packageRoot, 'migrations/410-platform-admins.sql'), 'utf8');
const runIntegrationTest = process.env.DATABASE_URL ? it : it.skip;

describe('migration 410 - platform admins', () => {
  it('creates private platform admin and audit tables with revoked app_user access', () => {
    expect(migration).toMatch(/create table if not exists app\.platform_admins/i);
    expect(migration).toMatch(/create table if not exists app\.platform_audit/i);
    expect(migration).toMatch(/revoke all on app\.platform_admins from public, app_user, anon, authenticated/i);
    expect(migration).toMatch(/revoke all on app\.platform_audit from public, app_user, anon, authenticated/i);
  });

  it('defines the platform-admin trust-chain function and grants execute only to app_user', () => {
    expect(migration).toMatch(/create or replace function app\.current_user_is_platform_admin\(\)/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = pg_catalog/i);
    expect(migration).toMatch(/grant execute on function app\.current_user_is_platform_admin\(\) to app_user/i);
  });

  it('seeds admin@monopilot.test idempotently', () => {
    expect(migration).toMatch(/where u\.email = 'admin@monopilot\.test'/i);
    expect(migration).toMatch(/on conflict do nothing/i);
  });

  describe('live DB privileges', () => {
    let closeOwner: (() => Promise<void>) | undefined;
    let closeApp: (() => Promise<void>) | undefined;

    afterAll(async () => {
      await closeApp?.();
      await closeOwner?.();
    });

    runIntegrationTest('keeps app.platform_admins and app.platform_audit unreadable to app_user', async () => {
      const owner = getOwnerConnection();
      closeOwner = () => owner.end();

      const { rows } = await owner.query<{
        platform_admins_select: boolean;
        platform_audit_select: boolean;
      }>(
        `select
           has_table_privilege('app_user', 'app.platform_admins', 'SELECT') as platform_admins_select,
           has_table_privilege('app_user', 'app.platform_audit', 'SELECT') as platform_audit_select`,
      );

      expect(rows[0]?.platform_admins_select).toBe(false);
      expect(rows[0]?.platform_audit_select).toBe(false);
    });

    runIntegrationTest('allows app_user to execute app.current_user_is_platform_admin() and returns boolean', async () => {
      const app = getAppConnection();
      closeApp = () => app.end();

      const { rows } = await app.query<{ ok: boolean }>(
        `select app.current_user_is_platform_admin() as ok`,
      );

      expect(typeof rows[0]?.ok).toBe('boolean');
    });
  });
});
