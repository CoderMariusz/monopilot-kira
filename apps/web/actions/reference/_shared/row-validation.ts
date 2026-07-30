/**
 * Row-level validation for generated reference tables — shared by the single-row
 * writer (`actions/reference/upsert.ts`) and the CSV importer
 * (`actions/reference/import-csv.ts`).
 *
 * Lives outside both because they are `'use server'` modules, which may only
 * export async functions. It used to be duplicated, which is how `max` ended up
 * enforced in neither path.
 */
import { numericBounds, patternOf } from '../../../lib/schema/validation-rules';

export type ReferenceSchemaColumn = {
  column_code: string;
  /** Missing/null means "untyped" and is treated as free text, as before. */
  data_type?: string | null;
  required_for_done?: boolean | null;
  is_required?: boolean | null;
  required?: boolean | null;
  enum_values?: unknown;
  validation_json?: unknown;
};

export function isRequiredColumn(column: ReferenceSchemaColumn): boolean {
  return Boolean(column.required_for_done ?? column.is_required ?? column.required);
}

/** Returns a human-readable reason, or null when the value satisfies the column. */
export function describeInvalidValue(value: unknown, column: ReferenceSchemaColumn): string | null {
  switch (column.data_type ?? 'text') {
    case 'text':
    case 'formula':
    case 'relation':
      return describeInvalidText(value, column);
    case 'number':
      return describeInvalidNumber(value, column);
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value))
        ? null
        : `${column.column_code} must be a date`;
    case 'enum': {
      const values = enumValues(column);
      return values.length === 0 || values.includes(String(value))
        ? null
        : `${column.column_code} must be one of ${values.join(', ')}`;
    }
    default:
      return `${column.column_code} has an unsupported data type ${column.data_type}`;
  }
}

function describeInvalidText(value: unknown, column: ReferenceSchemaColumn): string | null {
  if (!(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
    return `${column.column_code} must be a text value`;
  }
  // A stored pattern that does not compile is SKIPPED, not thrown on: the bare
  // `new RegExp(...)` here used to raise SyntaxError, which the caller's catch
  // turned into `persistence_failed` for EVERY row of that table — one typo in
  // one admin rule made the whole table permanently uneditable.
  const pattern = patternOf(column.validation_json);
  if (pattern && !pattern.test(String(value))) {
    return `${column.column_code} does not match the required pattern`;
  }
  return null;
}

function describeInvalidNumber(value: unknown, column: ReferenceSchemaColumn): string | null {
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return `${column.column_code} must be a number`;

  const { min, max } = numericBounds(column.validation_json);
  if (min !== null && numeric < min) return `${column.column_code} must be >= ${min}`;
  if (max !== null && numeric > max) return `${column.column_code} must be <= ${max}`;

  const rules = column.validation_json;
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    const scale = (rules as Record<string, unknown>).scale;
    if (typeof scale === 'number') {
      const [, decimals = ''] = String(value).split('.');
      if (decimals.length > scale) return `${column.column_code} allows at most ${scale} decimal places`;
    }
  }
  return null;
}

export function enumValues(column: ReferenceSchemaColumn): string[] {
  if (Array.isArray(column.enum_values)) return column.enum_values.map(String);
  const rules = column.validation_json;
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    const record = rules as Record<string, unknown>;
    if (Array.isArray(record.enum_values)) return record.enum_values.map(String);
    if (Array.isArray(record.values)) return record.values.map(String);
  }
  return [];
}
