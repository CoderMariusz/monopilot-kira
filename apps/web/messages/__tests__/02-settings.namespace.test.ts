import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface MessageTree {
  [key: string]: string | MessageTree;
}

const LOCALES = ['en', 'pl'] as const;
const KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/;
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

const T118_QUALITY_FLAG_KEYS = [
  'flags.quality.require_grn_qc_inspection.title',
  'flags.quality.require_grn_qc_inspection.description',
  'flags.quality.require_grn_qc_inspection.coming_banner',
  'flags.quality.require_grn_qc_inspection.on_label',
  'flags.quality.require_grn_qc_inspection.off_label',
  'flags.quality.require_grn_qc_inspection.read_only',
  'flags.quality.require_grn_qc_inspection.save_success',
] as const;

const ROUTE_FACING_INFRA_NAMESPACES = [
  'infra.lines.title',
  'infra.lines.error',
  'infra.lines.provenance',
  'infra.warehouses.title',
  'infra.warehouses.error',
  'infra.warehouses.provenance',
  'infra.locations.title',
  'infra.locations.error',
  'infra.locations.provenance',
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

  it('includes T-118 quality GRN QC flag messages in EN and PL without introducing a settings.quality permission namespace', () => {
    for (const locale of LOCALES) {
      const namespace = loadNamespace(locale);
      for (const key of T118_QUALITY_FLAG_KEYS) {
        const message = getMessage(namespace, key);
        expect(message, `${locale} 02-settings namespace is missing ${key}`).toEqual(expect.any(String));
        expect((message as string).trim(), `${locale} ${key} must not be empty`).not.toBe('');
      }

      expect(
        getMessage(namespace, 'flags.quality.require_grn_qc_inspection.permission'),
        `${locale} copy must not define a settings.quality.* permission label; T-118 uses settings.flags.edit`,
      ).toBeUndefined();
    }
  });

  it('keeps route-facing infra namespaces available to the runtime next-intl settings merge', () => {
    const requestSource = fs.readFileSync(path.resolve(__dirname, '../../i18n/request.ts'), 'utf8');
    expect(requestSource).toContain('../messages/en/02-settings.json');
    expect(requestSource).toContain('settings: mergeMessages');

    for (const locale of LOCALES) {
      const namespace = loadNamespace(locale);
      for (const key of ROUTE_FACING_INFRA_NAMESPACES) {
        const message = getMessage(namespace, key);
        expect(message, `${locale} 02-settings namespace is missing ${key}`).toEqual(expect.any(String));
        expect(message as string, `${locale} ${key} must not leak a raw settings.* key`).not.toMatch(/^settings\./);
        expect((message as string).trim(), `${locale} ${key} must not be empty`).not.toBe('');
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
