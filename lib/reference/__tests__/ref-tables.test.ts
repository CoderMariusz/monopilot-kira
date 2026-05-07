import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../');
const refTablesModulePath = resolve(repoRoot, 'lib/reference/ref-tables.enum.ts');
const codeownersPath = resolve(repoRoot, 'CODEOWNERS');

const expectedCanonicalRefTables = [
  'Reference.DeptColumns',
  'Reference.FieldTypes',
  'Reference.Formulas',
  'Reference.Rules',
  'Reference.Departments',
  'Reference.DeptOverrides',
  'Reference.ManufacturingOperations',
  'Reference.CodePrefixes',
] as const;

const expectedTableKeys = [
  'DeptColumns',
  'FieldTypes',
  'Formulas',
  'Rules',
  'Departments',
  'DeptOverrides',
  'ManufacturingOperations',
  'CodePrefixes',
] as const;

type RefTablesModule = {
  RefTables: Record<string, string>;
  RefTableName: string;
  ALL_REFERENCE_TABLES: readonly string[];
  isRefTableName: (input: unknown) => boolean;
  assertRefTableName: (input: unknown) => asserts input is string;
};

async function loadRefTablesModule(): Promise<RefTablesModule> {
  expect(
    existsSync(refTablesModulePath),
    'lib/reference/ref-tables.enum.ts must exist as the Reference table-name source of truth',
  ).toBe(true);

  return (await import(refTablesModulePath)) as RefTablesModule;
}

describe('reference table-name source of truth', () => {
  it('exports exactly the canonical Reference table values without duplicates', async () => {
    const { ALL_REFERENCE_TABLES, RefTables } = await loadRefTablesModule();

    expect(ALL_REFERENCE_TABLES).toEqual(expectedCanonicalRefTables);
    expect(Object.values(RefTables)).toEqual(expectedCanonicalRefTables);
    expect(new Set(ALL_REFERENCE_TABLES).size).toBe(ALL_REFERENCE_TABLES.length);
  });

  it('keeps every canonical table name in the locked Reference.PascalCase format', async () => {
    const { ALL_REFERENCE_TABLES } = await loadRefTablesModule();

    for (const tableName of ALL_REFERENCE_TABLES) {
      expect(tableName).toMatch(/^Reference\.[A-Z][A-Za-z]+$/);
    }
  });

  it('ensures RefTables object has exactly 8 keys matching the canonical set', async () => {
    const { RefTables } = await loadRefTablesModule();

    const actualKeys = Object.keys(RefTables).sort();
    const expectedKeys = [...expectedTableKeys].sort();

    expect(actualKeys).toEqual(expectedKeys);
    expect(Object.keys(RefTables).length).toBe(8);
  });

  it('validates that RefTableName type union has exactly 8 members', async () => {
    const { ALL_REFERENCE_TABLES } = await loadRefTablesModule();

    expect(ALL_REFERENCE_TABLES.length).toBe(8);
  });

  it('includes all 8 PRD-specified Reference tables from §6, §7, §9, §9.1', async () => {
    const { RefTables } = await loadRefTablesModule();

    // §6 references
    expect(RefTables.DeptColumns).toBe('Reference.DeptColumns');
    expect(RefTables.FieldTypes).toBe('Reference.FieldTypes');
    expect(RefTables.Formulas).toBe('Reference.Formulas');

    // §7 references
    expect(RefTables.Rules).toBe('Reference.Rules');
    expect(RefTables.CodePrefixes).toBe('Reference.CodePrefixes');

    // §9 references
    expect(RefTables.Departments).toBe('Reference.Departments');
    expect(RefTables.DeptOverrides).toBe('Reference.DeptOverrides');

    // §9.1 references
    expect(RefTables.ManufacturingOperations).toBe('Reference.ManufacturingOperations');
  });

  it('provides isRefTableName guard to validate unknown inputs', async () => {
    const { isRefTableName, ALL_REFERENCE_TABLES } = await loadRefTablesModule();

    for (const tableName of ALL_REFERENCE_TABLES) {
      expect(isRefTableName(tableName)).toBe(true);
    }

    expect(isRefTableName('Reference.Invalid')).toBe(false);
    expect(isRefTableName('Reference.DeptColumn')).toBe(false);
    expect(isRefTableName('dept_columns')).toBe(false);
    expect(isRefTableName(null)).toBe(false);
    expect(isRefTableName(undefined)).toBe(false);
    expect(isRefTableName(123)).toBe(false);
  });

  it('provides assertRefTableName to throw on unknown inputs', async () => {
    const { assertRefTableName, RefTables } = await loadRefTablesModule();

    expect(() => assertRefTableName(RefTables.DeptColumns)).not.toThrow();
    expect(() => assertRefTableName(RefTables.Rules)).not.toThrow();

    expect(() => assertRefTableName('Reference.Unknown')).toThrow(/unknown|unsupported|invalid|not a valid/i);
    expect(() => assertRefTableName('dept_columns')).toThrow(/unknown|unsupported|invalid|not a valid/i);
    expect(() => assertRefTableName(null)).toThrow(/unknown|unsupported|invalid|not a valid/i);
  });

  it('locks ref-tables.enum.ts behind architect review in CODEOWNERS', () => {
    expect(existsSync(codeownersPath), 'CODEOWNERS must exist at the repository root').toBe(true);

    const codeowners = readFileSync(codeownersPath, 'utf8');
    expect(codeowners).toMatch(/^\s*\/?lib\/reference\/ref-tables\.enum\.ts\s+.*(?:@[^\s/]*architect[^\s]*|architect)/im);
  });
});
