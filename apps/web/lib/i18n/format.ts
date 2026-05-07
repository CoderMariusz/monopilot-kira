/**
 * Locale-aware date and number formatters using Intl.*.
 * No string concatenation — use ICU MessageFormat via next-intl for translated strings.
 */

type SupportedLocale = 'pl' | 'en' | 'uk' | 'ro';

const LOCALE_MAP: Record<SupportedLocale, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  uk: 'uk-UA',
  ro: 'ro-RO'
};

/**
 * Formats a Date value using the long date style for the given locale.
 * Returns a locale-formatted date string (day month year).
 */
export function formatDate(date: Date, locale: SupportedLocale): string {
  const intlLocale = LOCALE_MAP[locale] ?? locale;
  return new Intl.DateTimeFormat(intlLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

/**
 * Formats a number using locale-aware grouping and decimal separators.
 */
export function formatNumber(value: number, locale: SupportedLocale): string {
  const intlLocale = LOCALE_MAP[locale] ?? locale;
  return new Intl.NumberFormat(intlLocale).format(value);
}
