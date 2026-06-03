import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(packageRoot, 'seeds/reference-schemas.sql');

const expectedReferenceTableCodes = [
  'reference.dept_columns',
  'reference.pack_sizes',
  'reference.lines_by_pack_size',
  'reference.dieset_by_line_pack',
  'reference.templates',
  'reference.email_config',
  'reference.processes',
  'reference.partners',
  'reference.close_confirm',
  'reference.alert_thresholds',
  'reference.allergens_reference',
  'reference.d365_constants',
  'reference.quality_hold_reasons',
  'reference.qa_failure_reasons',
  'reference.waste_categories',
  'reference.allergen_hold_reasons',
  'reference.shipping_override_reasons',
  'reference.rma_reason_codes',
  'reference.dashboards_catalog',
  'reference.shift_configs',
  'reference.oee_alert_thresholds',
  'reference.maintenance_alert_thresholds',
  'reference.technician_skills',
  'reference.spare_parts_categories',
  'reference.sites_hierarchy_config',
  'reference.changeover_target_duration_min',
] as const;

type SeedRow = {
  orgIdSql: string;
  tableCode: string;
  columnCode: string;
  dataType: string;
  tier: string;
  storage: string;
  dropdownSource: string | null;
  requiredForDone: boolean;
  validationJson: Record<string, unknown>;
  presentationJson: Record<string, unknown>;
};

function seedSql() {
  expect(existsSync(seedPath), 'packages/db/seeds/reference-schemas.sql must exist').toBe(true);
  if (!existsSync(seedPath)) {
    return '';
  }
  return readFileSync(seedPath, 'utf8');
}

function splitTopLevel(input: string, delimiter: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let inString = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === "'" && inString && next === "'") {
      index += 1;
      continue;
    }
    if (char === "'") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === delimiter && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

function unquoteSqlString(value: string) {
  const trimmed = value.trim().replace(/::(?:text|jsonb|boolean|int(?:eger)?|numeric)\b/gi, '');
  const match = /^'(.*)'$/s.exec(trimmed);
  expect(match, `expected SQL string literal, got ${value}`).not.toBeNull();
  return (match?.[1] ?? '').replace(/''/g, "'");
}

function jsonLiteral(value: string) {
  return JSON.parse(unquoteSqlString(value)) as Record<string, unknown>;
}

function nullableString(value: string) {
  return /^null\b/i.test(value.trim()) ? null : unquoteSqlString(value);
}

function booleanLiteral(value: string) {
  if (/^true\b/i.test(value.trim())) return true;
  if (/^false\b/i.test(value.trim())) return false;
  throw new Error(`Expected boolean literal, got ${value}`);
}

function extractInsertRows(sql: string): SeedRow[] {
  const insertMatch = /insert\s+into\s+public\.reference_schemas\s*\(([^)]*)\)\s*values\s*([\s\S]*?)(?:on\s+conflict|;)/i.exec(sql);
  expect(insertMatch, 'seed must insert VALUES rows into public.reference_schemas').not.toBeNull();
  if (!insertMatch) {
    return [];
  }

  const columns = insertMatch[1].split(',').map((column) => column.trim().replace(/"/g, ''));
  const requiredColumns = [
    'org_id',
    'table_code',
    'column_code',
    'data_type',
    'tier',
    'storage',
    'dropdown_source',
    'required_for_done',
    'validation_json',
    'presentation_json',
  ];
  for (const column of requiredColumns) {
    expect(columns, `seed insert must include ${column}`).toContain(column);
  }

  const indexOf = (column: string) => columns.indexOf(column);
  return splitTopLevel(insertMatch[2].trim(), ',')
    .map((tuple) => tuple.replace(/^\(/, '').replace(/\)$/, ''))
    .map((tuple) => {
      const values = splitTopLevel(tuple, ',');
      return {
        orgIdSql: values[indexOf('org_id')].trim(),
        tableCode: unquoteSqlString(values[indexOf('table_code')]),
        columnCode: unquoteSqlString(values[indexOf('column_code')]),
        dataType: unquoteSqlString(values[indexOf('data_type')]),
        tier: unquoteSqlString(values[indexOf('tier')]),
        storage: unquoteSqlString(values[indexOf('storage')]),
        dropdownSource: nullableString(values[indexOf('dropdown_source')]),
        requiredForDone: booleanLiteral(values[indexOf('required_for_done')]),
        validationJson: jsonLiteral(values[indexOf('validation_json')]),
        presentationJson: jsonLiteral(values[indexOf('presentation_json')]),
      };
    });
}

function rowsByKey(rows: SeedRow[]) {
  return new Map(rows.map((row) => [`${row.tableCode}.${row.columnCode}`, row]));
}

describe('reference_schemas universal seed (T-093 RED)', () => {
  it('seeds exactly 25 distinct universal L1 reference table codes and no org-scoped overrides', () => {
    const sql = seedSql();
    const rows = extractInsertRows(sql);
    const distinctCodes = [...new Set(rows.map((row) => row.tableCode))].sort();

    expect(distinctCodes).toEqual([...expectedReferenceTableCodes].sort());
    expect(distinctCodes).toHaveLength(26);
    expect(rows.length, 'each reference table must have at least one schema column').toBeGreaterThanOrEqual(26);
    expect(rows.every((row) => /^null\b/i.test(row.orgIdSql)), 'all baseline reference_schemas rows must use org_id IS NULL universal L1 scope').toBe(true);
    expect(rows.every((row) => row.tier === 'L1'), 'baseline seed rows must be L1').toBe(true);
    expect(sql).not.toMatch(/tenant_id|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('keeps the universal seed idempotent despite nullable org_id uniqueness', () => {
    const sql = seedSql();

    expect(sql, 'nullable org_id does not conflict on UNIQUE(org_id, table_code, column_code); seed must guard universal rows explicitly').toMatch(
      /where\s+not\s+exists[\s\S]{0,500}org_id\s+is\s+null[\s\S]{0,500}table_code[\s\S]{0,500}column_code/i,
    );
  });

  it('defines the §8.2 pack_sizes column metadata used by the schema-driven reference UI', () => {
    const rows = rowsByKey(extractInsertRows(seedSql()));
    const packSize = rows.get('reference.pack_sizes.pack_size');
    const displayOrder = rows.get('reference.pack_sizes.display_order');
    const isActive = rows.get('reference.pack_sizes.is_active');

    expect(packSize, 'pack_sizes.pack_size schema row').toBeDefined();
    expect(packSize?.dataType).toBe('text');
    expect(packSize?.storage).toBe('ext_jsonb');
    expect(packSize?.requiredForDone).toBe(true);
    expect(packSize?.validationJson).toMatchObject({ required: true, unique: true, regex: '^\\d+x\\d+cm$' });

    expect(displayOrder, 'pack_sizes.display_order schema row').toBeDefined();
    expect(displayOrder?.dataType).toBe('number');
    expect(displayOrder?.validationJson).toMatchObject({ required: false });

    expect(isActive, 'pack_sizes.is_active schema row').toBeDefined();
    expect(isActive?.dataType).toBe('enum');
    expect(isActive?.validationJson).toMatchObject({ required: true, enum_values: ['true', 'false'] });
  });

  it('applies v3.4 defaults for OEE target pct and changeover target duration metadata', () => {
    const rows = rowsByKey(extractInsertRows(seedSql()));
    const oeeTarget = rows.get('reference.oee_alert_thresholds.oee_target_pct');
    const changeoverTarget = rows.get('reference.changeover_target_duration_min.changeover_target_duration_min');

    expect(oeeTarget, 'oee_alert_thresholds.oee_target_pct schema row').toBeDefined();
    expect(oeeTarget?.dataType).toBe('number');
    expect(oeeTarget?.validationJson).toMatchObject({ default: 70, min: 0, max: 100, decimal_places: 1 });
    expect(oeeTarget?.presentationJson).toMatchObject({ editable_by: ['oee_admin'] });

    expect(changeoverTarget, 'changeover_target_duration_min schema row').toBeDefined();
    expect(changeoverTarget?.dataType).toBe('number');
    expect(changeoverTarget?.validationJson).toMatchObject({ default: null, min: 1, max: 480, unit: 'minutes' });
    expect(changeoverTarget?.presentationJson).toMatchObject({ editable_by: ['admin', 'production_manager'] });
  });
});
