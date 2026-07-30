import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing.js';

type MessageTree = Record<string, unknown>;

const settingsLoaders: Record<string, () => Promise<{ default: MessageTree }>> = {
  en: () => import('../messages/en/02-settings.json'),
  pl: () => import('../messages/pl/02-settings.json'),
  ro: () => import('../messages/ro/02-settings.json'),
  uk: () => import('../messages/uk/02-settings.json'),
};

function isMessageTree(value: unknown): value is MessageTree {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeMessages(...trees: MessageTree[]): MessageTree {
  const merged: MessageTree = {};
  for (const tree of trees) {
    for (const [key, value] of Object.entries(tree)) {
      const current = merged[key];
      merged[key] = isMessageTree(current) && isMessageTree(value) ? mergeMessages(current, value) : value;
    }
  }
  return merged;
}

async function loadSettingsNamespace(locale: string): Promise<MessageTree> {
  try {
    return (await settingsLoaders[locale]?.())?.default ?? {};
  } catch {
    return {};
  }
}

/** Base catalog + the split-out settings namespace, in the precedence the app ships. */
function localeTree(base: MessageTree, settings: MessageTree): MessageTree {
  return mergeMessages(base, {
    settings: mergeMessages(settings, isMessageTree(base.settings) ? base.settings : {}),
  });
}

async function loadLocaleTree(locale: string): Promise<MessageTree> {
  const base = (await import(`./${locale}.json`)).default as MessageTree;
  return localeTree(base, await loadSettingsNamespace(locale));
}

/**
 * next-intl returns the dotted KEY PATH for a missing message, never undefined —
 * so `t('x') ?? 'fallback'` at a call site can never fire. This is the only place
 * a real backstop can live: layering EN under the locale means a catalog hole
 * degrades to English instead of putting `production.wos.actions.complete.overridePin`
 * in front of an operator. Trees merge as a UNION of keys, so the payload handed to
 * the client grows only by the holes themselves.
 * The hole itself is caught by i18n/__tests__/wave-4-locale-parity.test.ts.
 */
export async function buildMessages(locale: string): Promise<MessageTree> {
  const messages = await loadLocaleTree(locale);
  if (locale === 'en') return messages;
  return mergeMessages(await loadLocaleTree('en'), messages);
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate that the incoming locale is supported; fall back to defaultLocale.
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return { locale, messages: await buildMessages(locale) };
});
