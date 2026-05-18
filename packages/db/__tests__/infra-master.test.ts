import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(packageRoot, 'schema/infra-master.ts');
const migrationsDir = resolve(packageRoot, 'migrations');
const seedPath = resolve(packageRoot, 'seeds/eu-14-allergens.sql');

const infraTables = [
  ['warehouses', 'warehouses'],
  ['locations', 'locations'],
  ['machines', 'machines'],
  ['productionLines', 'production_lines'],
  ['lineMachines', 'line_machines'],
  ['allergens', 'allergens'],
  ['taxCodes', 'tax_codes'],
] as const;

const orgScopedTables = ['warehouses', 'locations', 'machines', 'production_lines', 'tax_codes'] as const;
const eu14Codes = Array.from({ length: 14 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`);

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => resolve(migrationsDir, file));
}

function findInfraMasterMigrationPaths() {
  return migrationFiles().filter((file) => {
    const sql = readFileSync(file, 'utf8').toLowerCase();
    return (
      sql.includes('create table') &&
      sql.includes('warehouses') &&
      sql.includes('locations') &&
      sql.includes('production_lines') &&
      sql.includes('tax_codes')
    );
  });
}

function infraMasterSql() {
  const paths = findInfraMasterMigrationPaths();
  expect(
    paths.map((path) => basename(path)),
    'a new infra-master migration must create warehouses, locations, machines, lines, allergens, and tax codes',
  ).not.toHaveLength(0);
  return paths.map((file) => readFileSync(file, 'utf8')).join('\n\n');
}

function expectSqlMatch(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(true);
}

function expectSqlNotMatch(sql: string, pattern: RegExp, label: string) {
  expect(pattern.test(sql), label).toBe(false);
}

describe('infra master schema contract (T-009 RED)', () => {
  it('adds a Drizzle infra-master schema for the seven §5.6 infrastructure/master tables with org_id scope and no tenant/GUC drift', () => {
    expect(existsSync(schemaPath), 'packages/db/schema/infra-master.ts must define infra master tables').toBe(true);
    if (!existsSync(schemaPath)) {
      return;
    }

    const source = readFileSync(schemaPath, 'utf8');
    for (const [exportName, tableName] of infraTables) {
      expect(
        new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*pgTable\\(\\s*['"]${tableName}['"]`, 'i').test(
          source,
        ),
        `${exportName} pgTable(${tableName})`,
      ).toBe(true);
    }

    for (const tableName of orgScopedTables) {
      expect(
        new RegExp(`pgTable\\(\\s*['"]${tableName}['"][\\s\\S]*orgId:\\s*uuid\\(\\s*['"]org_id['"]\\s*\\)[\\s\\S]{0,220}references\\(`, 'i').test(
          source,
        ),
        `${tableName}.org_id references organizations`,
      ).toBe(true);
    }
    expect(source).toMatch(/path:\s*(?:text|customType)\s*\(\s*['"]path['"]/i);
    expect(source).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('adds a migration that creates all seven tables, preserves org-scoped uniqueness, and documents an ltree-safe path index fallback', () => {
    const sql = infraMasterSql();
    if (!sql) {
      return;
    }

    for (const [, tableName] of infraTables) {
      expectSqlMatch(
        sql,
        new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tableName}\\b`, 'i'),
        `${tableName} table is created`,
      );
    }
    for (const tableName of orgScopedTables) {
      expectSqlMatch(
        sql,
        new RegExp(`create\\s+table[\\s\\S]{0,1800}${tableName}[\\s\\S]{0,900}\\borg_id\\s+uuid\\s+not\\s+null[\\s\\S]{0,180}references\\s+(?:public\\.)?organizations\\s*\\(\\s*id\\s*\\)`, 'i'),
        `${tableName}.org_id references organizations`,
      );
    }

    expectSqlMatch(sql, /unique\s*\(\s*org_id\s*,\s*code\s*\)/i, 'org/code uniqueness exists');
    expectSqlMatch(sql, /primary\s+key\s*\(\s*line_id\s*,\s*machine_id\s*\)/i, 'line_machines composite primary key');
    expectSqlMatch(sql, /unique\s*\(\s*org_id\s*,\s*code\s*,\s*effective_from\s*\)/i, 'tax_codes effective-date uniqueness');
    expectSqlMatch(sql, /\bpath\s+(?:ltree|text)\s+not\s+null/i, 'locations.path persisted as ltree or text');
    expectSqlMatch(sql, /ltree[\s\S]{0,260}(fallback|text|ascii|separator|\/)|fallback[\s\S]{0,260}(ltree|\/)/i, 'migration documents ltree availability and text / separator fallback');
    expectSqlMatch(sql, /create\s+index[\s\S]{0,220}(?:on\s+(?:public\.)?locations|locations[\w_]*\s+on)[\s\S]{0,180}\bpath\b/i, 'locations.path has an operational index');
    expectSqlMatch(sql, /alter\s+table\s+(?:public\.)?warehouses\s+force\s+row\s+level\s+security/i, 'org-scoped infra tables force RLS');
    expectSqlMatch(sql, /create\s+policy[\s\S]{0,200}warehouses[\s\S]{0,520}app\.current_org_id\s*\(\s*\)/i, 'RLS uses app.current_org_id()');
    expectSqlNotMatch(sql, /\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i, 'no tenant_id or raw org GUC drift');
  });

  it('adds an idempotent EU-14 allergen seed with A01..A14 codes and PL/EN names', () => {
    expect(existsSync(seedPath), 'packages/db/seeds/eu-14-allergens.sql must seed EU-14 allergens').toBe(true);
    if (!existsSync(seedPath)) {
      return;
    }

    const sql = readFileSync(seedPath, 'utf8');
    expectSqlMatch(sql, /insert\s+into\s+(?:public\.)?allergens/i, 'seed inserts into allergens');
    expectSqlMatch(sql, /\bname\b[\s\S]{0,80}\bname_pl\b|\bname_pl\b[\s\S]{0,80}\bname\b/i, 'seed carries English and Polish names');
    for (const code of eu14Codes) {
      expectSqlMatch(sql, new RegExp(`['"]${code}['"]`, 'i'), `${code} allergen code is seeded`);
    }
    const uniqueCodes = new Set(sql.match(/['"]A(?:0[1-9]|1[0-4])['"]/g)?.map((code) => code.replace(/['"]/g, '')) ?? []);
    expect(uniqueCodes, 'exactly EU-14 A01..A14 codes are seeded').toHaveLength(14);
    expectSqlMatch(sql, /on\s+conflict\s*\(\s*code\s*\)\s+do\s+update|on\s+conflict\s*\(\s*code\s*\)\s+do\s+nothing/i, 'seed is idempotent');
  });
});
