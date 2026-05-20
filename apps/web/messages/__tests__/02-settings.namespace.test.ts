import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface MessageTree {
  [key: string]: string | MessageTree;
}

const LOCALES = ['en', 'pl'] as const;
const KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const REQUIRED_TOP_LEVEL_GROUPS = [
  'nav',
  'users',
  'roles',
  'infra',
  'schema',
  'rules',
  'reference',
  'tenant',
  'modules',
  'flags',
  'd365',
  'email',
  'notifications',
  'security',
  'onboarding',
  'audit',
  'validations',
] as const;

function namespacePath(locale: (typeof LOCALES)[number]): string {
  return path.resolve(__dirname, '..', locale, '02-settings.json');
}

function isMessageTree(value: unknown): value is MessageTree {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadNamespace(locale: (typeof LOCALES)[number]): MessageTree {
  const filePath = namespacePath(locale);
  expect(
    fs.existsSync(filePath),
    `Expected ${locale.toUpperCase()} 02-settings next-intl namespace to exist at ${filePath}`,
  ).toBe(true);

  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  expect(isMessageTree(parsed), `${filePath} must contain a JSON object at the top level`).toBe(true);
  return parsed as MessageTree;
}

function flattenMessages(tree: MessageTree, prefix = ''): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const [key, value] of Object.entries(tree)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      flattened[fullKey] = value;
      continue;
    }

    expect(isMessageTree(value), `${fullKey} must resolve to a string or nested message object`).toBe(true);
    Object.assign(flattened, flattenMessages(value as MessageTree, fullKey));
  }

  return flattened;
}

function getMessage(tree: MessageTree, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((current, segment) => {
    if (!isMessageTree(current)) {
      return undefined;
    }
    return current[segment];
  }, tree);
}

describe('02-settings next-intl namespace', () => {
  it('keeps EN and PL flattened key lists in exact parity', () => {
    const flattenedByLocale = Object.fromEntries(
      LOCALES.map((locale) => [locale, Object.keys(flattenMessages(loadNamespace(locale))).sort()]),
    );

    expect(flattenedByLocale.pl).toEqual(flattenedByLocale.en);
  });

  it('uses non-empty EN messages with canonical dotted key names', () => {
    const flattenedEn = flattenMessages(loadNamespace('en'));

    expect(Object.keys(flattenedEn).length, 'EN namespace must contain at least one translated message').toBeGreaterThan(0);

    for (const [key, value] of Object.entries(flattenedEn)) {
      expect(key, `Invalid 02-settings message key: ${key}`).toMatch(KEY_PATTERN);
      expect(value.trim(), `EN message must not be empty for key: ${key}`).not.toBe('');
    }
  });

  it('includes every required SETTINGS top-level group in both bundles', () => {
    for (const locale of LOCALES) {
      const namespace = loadNamespace(locale);
      for (const group of REQUIRED_TOP_LEVEL_GROUPS) {
        expect(namespace, `${locale} bundle is missing top-level group ${group}`).toHaveProperty(group);
      }
    }
  });

  it('keeps PL validation v_set_60 parameterized with the ICU parentLevel placeholder', () => {
    const plNamespace = loadNamespace('pl');
    const message = getMessage(plNamespace, 'validations.v_set_60');

    expect(message, 'PL validations.v_set_60 must be a translated string').toEqual(expect.any(String));
    expect(message as string).toContain('{parentLevel}');
  });
});
