type SupportedLocale = 'pl' | 'en' | 'uk' | 'ro';

const LOCALE_MAP: Record<SupportedLocale, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  uk: 'uk-UA',
  ro: 'ro-RO'
};

export function formatDate(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(LOCALE_MAP[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

export function formatNumber(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(LOCALE_MAP[locale]).format(value);
}
