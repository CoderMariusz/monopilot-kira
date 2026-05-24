import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

type MessageTree = { [key: string]: string | MessageTree };

const LOCALES = ['en', 'pl'] as const;
const REQUIRED_ROUTE_KEYS = [
  'rules_registry.title',
  'rules_registry.subtitle',
  'rules_registry.dryRunAllRules',
  'rules_registry.exportAllJson',
  'rules_registry.readOnlyNotice',
  'rules_registry.deployedRules',
  'rules_registry.loading',
  'rules_registry.empty',
  'rules_registry.error',
  'flags_admin.title',
  'flags_admin.subtitle',
  'flags_admin.openPostHog',
  'flags_admin.preflightNotice',
  'flags_admin.coreTab',
  'flags_admin.localTab',
  'flags_admin.tenantTab',
  'flags_admin.loading',
  'flags_admin.empty',
  'flags_admin.error',
] as const;

function isMessageTree(value: unknown): value is MessageTree {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadSettingsNamespace(locale: (typeof LOCALES)[number]): MessageTree {
  const filePath = path.resolve(__dirname, '..', locale, '02-settings.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  expect(isMessageTree(parsed), `${filePath} must contain a JSON object`).toBe(true);
  return parsed as MessageTree;
}

function getMessage(tree: MessageTree, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((current, segment) => {
    if (!isMessageTree(current)) return undefined;
    return current[segment];
  }, tree);
}

describe('F10-I18N-01 settings rules/flags i18n namespaces', () => {
  it('defines route-facing rules_registry and flags_admin copy in EN and PL 02-settings catalogs', () => {
    for (const locale of LOCALES) {
      const namespace = loadSettingsNamespace(locale);
      for (const key of REQUIRED_ROUTE_KEYS) {
        const message = getMessage(namespace, key);
        expect(message, `${locale} 02-settings namespace is missing ${key} used by /settings/rules or /settings/flags`).toEqual(expect.any(String));
        expect((message as string).trim(), `${locale} ${key} must not be empty`).not.toBe('');
      }
    }
  });
});
