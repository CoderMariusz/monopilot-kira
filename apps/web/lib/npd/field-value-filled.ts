/** Mirrors load-stage-dept-sections isFilled — shared for dashboard completeness. */
export function isNpdFieldValueFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
