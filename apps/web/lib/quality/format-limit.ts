export type LimitTranslator = (key: string, values?: Record<string, string | number>) => string;

/** Formats a critical-limit range for display using the caller's i18n key prefix. */
export function formatLimit(
  t: LimitTranslator,
  keyPrefix: string,
  min: string | null,
  max: string | null,
  unit: string,
): string {
  const u = unit?.trim() ?? '';
  if (min !== null && max !== null) return t(`${keyPrefix}.limitRange`, { min, max, unit: u });
  if (min !== null) return t(`${keyPrefix}.limitMinOnly`, { min, unit: u });
  if (max !== null) return t(`${keyPrefix}.limitMaxOnly`, { max, unit: u });
  return t(`${keyPrefix}.limitNone`);
}
