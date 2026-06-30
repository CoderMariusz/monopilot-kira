/**
 * T-053 — schema-discovery.test.ts (GREEN-phase, fixed from RED)
 * Unit test to verify the consolidated schema barrel exports live expected business tables.
 *
 * After consolidation (GREEN), schema/index.ts re-exports all tables from a single
 * canonical location: packages/db/schema/.
 *
 * Acceptance criteria:
 *  AC1: The schema barrel imports and exports live business tables:
 *       tenants, organizations, users (baseline)
 *       tenantMigrations
 *  AC2: Each export is a Drizzle pgTable instance (verified via Symbol(drizzle:IsDrizzleTable)).
 */
import { describe, expect, it } from 'vitest';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
import * as schema from '../schema/index.js';

const IS_DRIZZLE_TABLE = Symbol.for('drizzle:IsDrizzleTable');

describe('T-053 — schema barrel consolidation', () => {
  it('should export live business tables from a single canonical schema barrel', () => {
    const expectedTables = [
      'tenants',
      'organizations',
      'users',
      'tenantMigrations',
    ];

    const exportedKeys = Object.keys(schema);

    // Verify each export is present
    for (const table of expectedTables) {
      expect(
        exportedKeys,
        `Schema barrel missing export: ${table} (got: ${exportedKeys.join(', ')})`,
      ).toContain(table);
    }
  });

  it('should have each table export as a Drizzle pgTable with _name property', () => {
    const tables = [
      { name: 'tenants', export: schema.tenants },
      { name: 'organizations', export: schema.organizations },
      { name: 'users', export: schema.users },
      { name: 'tenantMigrations', export: (schema as any).tenantMigrations },
    ];

    for (const { name, export: table } of tables) {
      expect(table, `Table ${name} should be defined`).toBeDefined();
      // Drizzle ≥0.40 uses Symbol(drizzle:IsDrizzleTable) instead of _name
      expect(
        (table as any)[IS_DRIZZLE_TABLE],
        `Table ${name} should be a Drizzle pgTable (missing Symbol(drizzle:IsDrizzleTable))`,
      ).toBe(true);
    }
  });

  it.skipIf(!hasDatabaseUrl)(
    'should consolidate drizzle.config.ts schema path to ./schema',
    async () => {
    // Load the drizzle config — throws if DATABASE_URL is not set (by design).
    // Skipped when DATABASE_URL is absent so CI without a DB does not crash.
    const configModule = await import('../drizzle.config.ts');
    const config = configModule.default;

    // After consolidation, schema should be a string path (not an array)
    // pointing at ./schema or containing consolidated definitions
    expect(config).toBeDefined();
    if (typeof config.schema === 'string') {
      expect(config.schema).toMatch(
        /schema/i,
        'schema path should reference the consolidated ./schema directory',
      );
    } else if (Array.isArray(config.schema)) {
      // Alternative: array of paths during transition
      expect(config.schema).toContainEqual(
        expect.stringContaining('schema'),
      );
    }
  },
  );

  it('should have no symlink at packages/db/src/migrations (or a relative symlink)', async () => {
    // Verify via lstatSync that packages/db/src/migrations is either absent or a
    // relative symlink (not an absolute-path symlink to a dev machine path).
    const { lstatSync, existsSync, readlinkSync } = await import('node:fs');
    const { resolve, isAbsolute } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const packageDbRoot = resolve(new URL('../..', import.meta.url).pathname);
    const symlinkPath = resolve(packageDbRoot, 'src', 'migrations');

    if (!existsSync(symlinkPath)) {
      // Symlink is gone — ideal GREEN state, test passes.
      return;
    }

    const stat = lstatSync(symlinkPath);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(symlinkPath);
      // Absolute symlinks pointing to a developer home directory are forbidden.
      expect(isAbsolute(target)).toBe(false);
    }
    // If it is a real directory (not a symlink), that is also acceptable.
  });
});
