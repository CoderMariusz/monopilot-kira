import pg from 'pg';

const { Pool } = pg;

/**
 * Returns a new pg.Pool connected as the app role (DATABASE_URL_APP).
 * Used at runtime and in tests — subject to RLS, never BYPASSRLS.
 * Exported from index.ts for general consumption.
 */
export function getAppConnection(): pg.Pool {
  // Production guard: DATABASE_URL_APP must be explicitly set in production deployments.
  // The fallback (DATABASE_URL + username rewrite to app_user with a hardcoded test
  // password) is intentionally test-only. Guard fires when NODE_ENV=production and
  // no Vitest context is active (VITEST env var absent), so the throw does NOT fire
  // in CI test runs that happen to export NODE_ENV=production.
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.VITEST &&
    !process.env.DATABASE_URL_APP
  ) {
    throw new Error('DATABASE_URL_APP must be set in production');
  }

  const connectionString = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_APP (or DATABASE_URL fallback) must be set for app-role connections',
    );
  }

  // Override the user in the connection string to app_user when using the
  // DATABASE_URL fallback so that integration tests connect as the app role.
  // NOTE: the hardcoded password is intentionally test-only (see production guard above).
  const url = new URL(connectionString);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app_user_test_password';
  }

  return new Pool({ connectionString: url.toString() });
}

/**
 * Returns a new pg.Pool connected as the owner/superuser role (DATABASE_URL_OWNER).
 * RESTRICTED: only migrations and scripts/migrate.ts may import this.
 * ESLint no-restricted-imports enforces this in packages/db/.eslintrc.cjs.
 */
export function getOwnerConnection(): pg.Pool {
  const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_OWNER (or DATABASE_URL fallback) must be set for owner connections',
    );
  }
  return new Pool({ connectionString });
}
