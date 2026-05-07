import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing.js';

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate that the incoming locale is supported; fall back to defaultLocale.
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./${locale}.json`)).default,
  };
});
