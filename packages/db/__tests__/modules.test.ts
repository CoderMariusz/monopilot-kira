import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(packageRoot, 'seeds/modules.sql');
const schemaPath = resolve(packageRoot, 'schema/settings-core.ts');
const settingsCoreMigrationPath = resolve(packageRoot, 'migrations/037-settings-core.sql');

// PRD §10.1 enumerates code 00-foundation through 15-oee and forbids any code 16+ beyond OEE.
// This intentionally pins the table entries rather than inferring a different omission from the off-by-one "15 rows" prose.
const expectedModules = [
  { code: '00-foundation', phase: 1, dependencies: [], canDisable: false, defaultEnabled: true },
  { code: '01-npd', phase: 1, dependencies: ['00-foundation', '02-settings'], canDisable: true, defaultEnabled: true },
  { code: '02-settings', phase: 1, dependencies: ['00-foundation'], canDisable: true, defaultEnabled: true },
  { code: '03-technical', phase: 1, dependencies: ['00-foundation', '02-settings'], canDisable: true, defaultEnabled: true },
  { code: '04-planning-basic', phase: 1, dependencies: ['00-foundation', '02-settings', '03-technical'], canDisable: true, defaultEnabled: true },
  { code: '05-warehouse', phase: 1, dependencies: ['00-foundation', '02-settings', '03-technical'], canDisable: true, defaultEnabled: true },
  { code: '06-scanner-p1', phase: 1, dependencies: ['05-warehouse'], canDisable: true, defaultEnabled: true },
  { code: '07-planning-ext', phase: 2, dependencies: ['04-planning-basic'], canDisable: true, defaultEnabled: false },
  { code: '08-production', phase: 1, dependencies: ['04-planning-basic', '05-warehouse'], canDisable: true, defaultEnabled: true },
  { code: '09-quality', phase: 2, dependencies: ['08-production'], canDisable: true, defaultEnabled: false },
  { code: '10-finance', phase: 2, dependencies: ['08-production', '10-finance'], canDisable: true, defaultEnabled: false },
  { code: '11-shipping', phase: 2, dependencies: ['05-warehouse', '08-production'], canDisable: true, defaultEnabled: false },
  { code: '12-reporting', phase: 2, dependencies: ['01-npd', '08-production', '10-finance'], canDisable: true, defaultEnabled: false },
  { code: '13-maintenance', phase: 2, dependencies: ['03-technical'], canDisable: true, defaultEnabled: false },
  { code: '14-multi-site', phase: 3, dependencies: [], canDisable: true, defaultEnabled: false },
  { code: '15-oee', phase: 3, dependencies: ['08-production'], canDisable: true, defaultEnabled: false },
] as const;

const defaultEnabledCodes = expectedModules.filter((module) => module.defaultEnabled).map((module) => module.code);
const defaultDisabledCodes = expectedModules.filter((module) => !module.defaultEnabled).map((module) => module.code);

function seedSql(): string {
  expect(existsSync(seedPath), 'packages/db/seeds/modules.sql must exist for T-092').toBe(true);
  if (!existsSync(seedPath)) {
    return '';
  }
  return readFileSync(seedPath, 'utf8');
}

function compact(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function expectSqlToken(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(true);
}

describe('T-092 modules baseline seed', () => {
  it('has existing settings schema and migration tables for modules and organization_modules', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const migration = readFileSync(settingsCoreMigrationPath, 'utf8');

    expect(schema).toMatch(/export\s+const\s+modules\s*=\s*pgTable\(\s*['"]modules['"]/);
    expect(schema).toMatch(/export\s+const\s+organizationModules\s*=\s*pgTable\(\s*['"]organization_modules['"]/);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.modules/i);
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.organization_modules/i);
  });

  it('seeds the exact PRD §10.1 module rows through 15-oee and no module beyond OEE', () => {
    const sql = compact(seedSql());

    expectSqlToken(sql, /insert\s+into\s+public\.modules\s*\(/i, 'seed inserts public.modules rows');
    expectSqlToken(sql, /on\s+conflict\s*\(\s*code\s*\)\s+do\s+nothing/i, 'modules seed is additive/idempotent');
    expect(sql).not.toMatch(/\b(delete\s+from|truncate\s+table)\s+public\.modules\b/i);

    for (const module of expectedModules) {
      const dependencyPattern = module.dependencies.length === 0
        ? /array\s*\[\s*\]\s*::\s*text\s*\[\s*\]|'\{\}'\s*::\s*text\s*\[\s*\]/i
        : new RegExp(`array\\s*\\[[^\\]]*${module.dependencies.map((dependency) => `'${dependency}'`).join('[^\\]]*')}[^\\]]*\\]\\s*::\\s*text\\s*\\[\\s*\\]`, 'i');
      const rowPattern = new RegExp(`['"]${module.code}['"][\\s\\S]{0,220}${module.canDisable}[\\s\\S]{0,120}${module.phase}`, 'i');
      expectSqlToken(sql, rowPattern, `${module.code} has can_disable=${module.canDisable} and phase=${module.phase}`);
      expectSqlToken(sql, dependencyPattern, `${module.code} dependencies are represented as text[]`);
    }
    expect(sql).not.toMatch(/['"]16-[a-z0-9-]+['"]/i);
  });

  it('locks 00-foundation as non-disableable', () => {
    const sql = compact(seedSql());

    expectSqlToken(
      sql,
      /['"]00-foundation['"][\s\S]{0,220}false[\s\S]{0,120}1/i,
      '00-foundation seed row must set can_disable=false in phase 1',
    );
  });

  it('creates additive organization_modules defaults with only Phase 1 core modules enabled', () => {
    const sql = compact(seedSql());

    expectSqlToken(sql, /insert\s+into\s+public\.organization_modules\s*\(\s*org_id\s*,\s*module_code\s*,\s*enabled\s*\)/i, 'seed inserts org defaults');
    expectSqlToken(sql, /from\s+public\.organizations\b/i, 'org defaults derive from existing organizations');
    expectSqlToken(sql, /on\s+conflict\s*\(\s*org_id\s*,\s*module_code\s*\)\s+do\s+nothing/i, 'org defaults are additive/idempotent');
    expect(sql).not.toMatch(/\b(delete\s+from|truncate\s+table)\s+public\.organization_modules\b/i);

    for (const code of defaultEnabledCodes) {
      expectSqlToken(sql, new RegExp(`['"]${code}['"][\\s\\S]{0,160}true|true[\\s\\S]{0,160}['"]${code}['"]`, 'i'), `${code} default enabled`);
    }
    for (const code of defaultDisabledCodes) {
      expectSqlToken(sql, new RegExp(`['"]${code}['"][\\s\\S]{0,160}false|false[\\s\\S]{0,160}['"]${code}['"]`, 'i'), `${code} default disabled`);
    }
  });
});
