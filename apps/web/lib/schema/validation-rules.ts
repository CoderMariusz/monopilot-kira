/**
 * ONE reader for the validation-rule dictionaries that grew apart in this repo.
 *
 * Canonical spelling is JSON Schema — `minimum` / `maximum` / `minLength` /
 * `maxLength` / `pattern` — because that is what the LIVE rows already store
 * (`npd_field_catalog.validation_json`: 42x `minimum`, 10x `maximum`,
 * 2x `minLength`) and because it is a standard rather than an invention.
 *
 * The other spellings that exist in the codebase are read as ALIASES, so a rule
 * an admin already saved keeps working and no data migration is needed:
 *   - flat `min` / `max` / `regex`   — schema column wizard (SchemaColumnWizard)
 *   - `range.min` / `range.max`      — preview engine (lib/schema/zod-runtime)
 *   - `length.min` / `length.max`    — same
 *
 * ponytail: aliases, not a migration. Collapse writers onto the canonical keys
 * only if one ever has to round-trip the rules it read.
 */

export type Bounds = { min: number | null; max: number | null };

const NO_BOUNDS: Bounds = { min: null, max: null };

export function numericBounds(validation: unknown): Bounds {
  const rules = asRecord(validation);
  if (!rules) return NO_BOUNDS;
  const range = asRecord(rules.range) ?? {};
  return {
    min: firstFiniteNumber(rules.minimum, rules.min, range.min),
    max: firstFiniteNumber(rules.maximum, rules.max, range.max),
  };
}

export function lengthBounds(validation: unknown): Bounds {
  const rules = asRecord(validation);
  if (!rules) return NO_BOUNDS;
  const length = asRecord(rules.length) ?? {};
  return {
    min: firstFiniteNumber(rules.minLength, length.min),
    max: firstFiniteNumber(rules.maxLength, length.max),
  };
}

/**
 * Compiles a stored pattern, or returns null when it is absent or unusable.
 * NEVER throws: an uncompilable pattern must not brick every write to the table
 * that carries it (that was a `persistence_failed` on every row of the table).
 */
export function safeRegex(pattern: unknown): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 512) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function patternOf(validation: unknown): RegExp | null {
  const rules = asRecord(validation);
  if (!rules) return null;
  return safeRegex(rules.pattern) ?? safeRegex(rules.regex);
}

/**
 * Producer-side guard: names the key whose regex does not compile so an admin
 * gets a readable rejection at save time, instead of storing a rule that every
 * later read has to silently skip. Returns null when the rules are fine.
 */
export function invalidPatternKey(validation: unknown): string | null {
  const rules = asRecord(validation);
  if (!rules) return null;
  for (const key of ['pattern', 'regex'] as const) {
    const raw = rules[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (safeRegex(raw) === null) return key;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstFiniteNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return null;
}
