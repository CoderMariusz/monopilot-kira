export type LimitTranslator = (key: string, values?: Record<string, string | number>) => string;

export type LimitTemplates = {
  limitRange: string;
  limitMinOnly: string;
  limitMaxOnly: string;
  limitNone: string;
};

function interpolateTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) =>
    values[k] !== undefined ? String(values[k]) : `{${k}}`,
  );
}

/** Formats a critical-limit range from pre-resolved label templates (RSC-safe). */
export function formatLimitFromTemplates(
  templates: LimitTemplates,
  min: string | null,
  max: string | null,
  unit: string,
): string {
  const u = unit?.trim() ?? '';
  if (min !== null && max !== null) return interpolateTemplate(templates.limitRange, { min, max, unit: u });
  if (min !== null) return interpolateTemplate(templates.limitMinOnly, { min, unit: u });
  if (max !== null) return interpolateTemplate(templates.limitMaxOnly, { max, unit: u });
  return templates.limitNone;
}

/** Formats a critical-limit range for display using the caller's i18n key prefix. */
export function formatLimit(
  t: LimitTranslator,
  keyPrefix: string,
  min: string | null,
  max: string | null,
  unit: string,
): string {
  return formatLimitFromTemplates(
    {
      limitRange: t(`${keyPrefix}.limitRange`),
      limitMinOnly: t(`${keyPrefix}.limitMinOnly`),
      limitMaxOnly: t(`${keyPrefix}.limitMaxOnly`),
      limitNone: t(`${keyPrefix}.limitNone`),
    },
    min,
    max,
    unit,
  );
}
