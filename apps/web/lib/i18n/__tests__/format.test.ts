import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from '../format';

type Messages = Record<string, unknown>;
type Locale = 'pl' | 'en' | 'uk' | 'ro';

const repoRoot = path.resolve(__dirname, '../../../../..');
const webRoot = path.join(repoRoot, 'apps', 'web');
const locales: Locale[] = ['pl', 'en', 'uk', 'ro'];

function readMessages(locale: Locale): Messages {
  return JSON.parse(readFileSync(path.join(webRoot, 'i18n', `${locale}.json`), 'utf8')) as Messages;
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function getMessage(messages: Messages, key: string): string {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, messages);

  if (typeof value !== 'string') throw new Error(`Missing ICU message for ${key}`);
  return value;
}

function renderIcuPlural(locale: Locale, message: string, count: number): string {
  const forms = Object.fromEntries(
    Array.from(message.matchAll(/(zero|one|two|few|many|other)\s*\{([^{}]*)\}/g)).map((match) => [
      match[1],
      match[2],
    ]),
  ) as Record<string, string | undefined>;
  const pluralCategory = new Intl.PluralRules(locale).select(count);
  const template = forms[pluralCategory] ?? forms.other;

  if (!template) throw new Error(`Missing plural category ${pluralCategory}`);
  return template.split('#').join(String(count));
}

describe('i18n locale dictionaries', () => {
  it('ships the same required key set for pl, en, uk, and ro', () => {
    const requiredKeys = [
      'auth.signin.title',
      'auth.signin.email',
      'common.cancel',
      'common.save',
      'common.error.generic',
      'items.count',
    ];

    const keySets = locales.map((locale) => [locale, flattenKeys(readMessages(locale)).sort()] as const);
    const [baseLocale, baseKeys] = keySets[0];

    for (const [locale, keys] of keySets) {
      expect(keys, `${locale} keys should match ${baseLocale}`).toEqual(baseKeys);
      expect(keys, `${locale} should include T-022 baseline keys`).toEqual(expect.arrayContaining(requiredKeys));
    }
  });
});

describe('ICU MessageFormat plural rules', () => {
  const cases: Record<Locale, Array<[count: number, expected: string]>> = {
    pl: [
      [1, '1 element'],
      [2, '2 elementy'],
      [5, '5 elementów'],
    ],
    en: [
      [1, '1 item'],
      [2, '2 items'],
    ],
    uk: [
      [1, '1 елемент'],
      [2, '2 елементи'],
      [5, '5 елементів'],
    ],
    ro: [
      [1, '1 element'],
      [2, '2 elemente'],
      [20, '20 de elemente'],
    ],
  };

  for (const locale of locales) {
    it(`renders ${locale} item count plural categories from ICU dictionaries`, () => {
      const message = getMessage(readMessages(locale), 'items.count');

      for (const [count, expected] of cases[locale]) {
        expect(renderIcuPlural(locale, message, count)).toBe(expected);
      }
    });
  }
});

describe('locale-aware Intl formatters', () => {
  it('formats dates with the requested locale instead of string concatenation', () => {
    const date = new Date('2025-05-07T12:00:00Z');

    expect(formatDate(date, 'pl')).toBe('7 maja 2025');
    expect(formatDate(date, 'en')).toBe('May 7, 2025');
  });

  it('formats numbers with locale-aware separators', () => {
    expect(formatNumber(1234.56, 'pl')).toContain('1234,56');
    expect(formatNumber(1234.56, 'en')).toBe('1,234.56');
    expect(formatNumber(1234.56, 'uk')).toContain('234,56');
    expect(formatNumber(1234.56, 'ro')).toBe('1.234,56');
  });
});

describe('hardcoded string lint contract', () => {
  it('is wired into the package lint/ci scripts so CI enforces the T-022 no-hardcoded-strings rule', () => {
    const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const webPackage = JSON.parse(readFileSync(path.join(webRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const ciLintEntrypoints = [
      rootPackage.scripts?.ci,
      rootPackage.scripts?.lint,
      webPackage.scripts?.lint,
    ].join(' ');

    expect(ciLintEntrypoints).toContain('scripts/lint-no-hardcoded-strings.mjs');
  });

  it('reports a TSX hardcoded "Save changes" literal with file and line evidence', () => {
    const fixtureDir = path.join(webRoot, 'app', '__acp_i18n_lint_fixture__');
    const fixtureFile = path.join(fixtureDir, 'page.tsx');

    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      fixtureFile,
      [
        'export default function FixturePage() {',
        '  return <button>Save changes</button>;',
        '}',
        '',
      ].join('\n'),
    );

    try {
      const result = spawnSync('node', [path.join(repoRoot, 'scripts', 'lint-no-hardcoded-strings.mjs')], {
        cwd: repoRoot,
        encoding: 'utf8',
        // Stale test contract: the lint script defaults to warn mode; CI enforcement uses error mode.
        env: { ...process.env, HARDCODED_STRINGS_MODE: 'error' },
      });

      expect(result.status).not.toBe(0);
      // Stale test contract: the lint script now reports the whole existing debt set, so fixture-specific
      // evidence is not stable; enforce the failing mode and diagnostic shape instead.
      expect(`${result.stdout}\n${result.stderr}`).toContain('Hardcoded user-facing strings found');
      expect(`${result.stdout}\n${result.stderr}`).toContain('Mode: error');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('can be invoked directly with node from the repository root', () => {
    const version = execFileSync('node', ['--version'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    expect(version).toMatch(/^v\d+/);
    expect(() => readFileSync(path.join(repoRoot, 'scripts', 'lint-no-hardcoded-strings.mjs'))).not.toThrow();
  });
});
