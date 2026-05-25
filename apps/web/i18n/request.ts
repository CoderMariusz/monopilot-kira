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

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate that the incoming locale is supported; fall back to defaultLocale.
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const baseMessages = (await import(`./${locale}.json`)).default as MessageTree;
  const settingsMessages = await loadSettingsNamespace(locale);

  return {
    locale,
    messages: mergeMessages(baseMessages, {
      settings: mergeMessages(settingsMessages, isMessageTree(baseMessages.settings) ? baseMessages.settings : {}),
    }),
  };
});
