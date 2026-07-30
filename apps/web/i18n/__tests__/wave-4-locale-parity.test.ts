import { describe, expect, it } from 'vitest';

import { buildMessages } from '../request';

import en from '../en.json';
import pl from '../pl.json';
import ro from '../ro.json';
import uk from '../uk.json';
import enSettings from '../../messages/en/02-settings.json';
import plSettings from '../../messages/pl/02-settings.json';
import roSettings from '../../messages/ro/02-settings.json';
import ukSettings from '../../messages/uk/02-settings.json';

/**
 * FULL locale parity — replaces the frozen ~44-key "wave-4" allow-list that went
 * 604x green while pl/ro/uk were missing 32/119/119 keys (the operator saw raw
 * key paths, e.g. `production.wos.actions.complete.overridePin`).
 *
 * Reference set = UNION of all four catalogs, not just en. A key that exists in
 * pl but not in en is just as broken (the EN operator sees the raw path) — that
 * is how `quality.ncrs.createModal.lookup.*` hid for so long.
 *
 * The tree here mirrors i18n/request.ts's settings merge, but deliberately NOT
 * its EN backstop: the backstop keeps a hole off the operator's screen, this
 * test is what keeps the hole from existing.
 */

type MessageTree = Record<string, unknown>;

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

/** Same shape the app ships: base catalog + the split-out settings namespace. */
function runtimeTree(base: MessageTree, settings: MessageTree): MessageTree {
  return mergeMessages(base, {
    settings: mergeMessages(settings, isMessageTree(base.settings) ? base.settings : {}),
  });
}

const LOCALES: Record<string, MessageTree> = {
  en: runtimeTree(en as MessageTree, enSettings as MessageTree),
  pl: runtimeTree(pl as MessageTree, plSettings as MessageTree),
  ro: runtimeTree(ro as MessageTree, roSettings as MessageTree),
  uk: runtimeTree(uk as MessageTree, ukSettings as MessageTree),
};

function collectLeafPaths(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return prefix ? [prefix] : [];
  if (!isMessageTree(node)) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    collectLeafPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

function getAtPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (isMessageTree(node) && key in node) return node[key];
    return undefined;
  }, root);
}

const leafPaths = Object.fromEntries(
  Object.entries(LOCALES).map(([locale, tree]) => [locale, new Set(collectLeafPaths(tree))]),
);

const ALL_KEY_PATHS = [...new Set(Object.values(leafPaths).flatMap((set) => [...set]))].sort();

/**
 * A value that is blank, or is the dotted key path echoed back, is not a translation.
 * Two deliberate exemptions:
 *  - the last path segment alone ("kg", "NIST", "days") is a legitimate value;
 *  - a blank that is blank in EVERY locale is intentional (action-column headers
 *    carry no visible label) — a blank is only a hole if some locale has text there.
 */
function isRealString(value: unknown, path: string): boolean {
  if (typeof value !== 'string' || value === path || value.startsWith('MISSING_MESSAGE')) return false;
  if (value.trim() !== '') return true;
  return Object.values(LOCALES).every((tree) => {
    const other = getAtPath(tree, path);
    return typeof other !== 'string' || other.trim() === '';
  });
}

describe('locale parity (full catalog)', () => {
  it('has keys to compare', () => {
    expect(ALL_KEY_PATHS.length).toBeGreaterThan(10_000);
  });

  for (const locale of Object.keys(LOCALES)) {
    it(`${locale}: no missing keys vs. the other locales`, () => {
      const missing = ALL_KEY_PATHS.filter((path) => !leafPaths[locale].has(path));
      expect(missing, `${locale} is missing ${missing.length} key(s):\n${missing.join('\n')}`).toEqual([]);
    });

    it(`${locale}: no blank or key-path-echo values`, () => {
      const junk = [...leafPaths[locale]].filter((path) => !isRealString(getAtPath(LOCALES[locale], path), path));
      expect(junk, `${locale} has ${junk.length} unusable value(s):\n${junk.join('\n')}`).toEqual([]);
    });
  }
});

/**
 * The runtime backstop that replaces the dead `t('x') ?? 'literal'` fallbacks:
 * a key absent from a locale must render EN text, never the dotted key path.
 */
describe('EN backstop under every locale', () => {
  it('serves an EN string for a key the locale does not have', async () => {
    const HOLE = '__parity_probe__.missingOnPurpose';
    const enTree = en as unknown as Record<string, unknown>;
    (enTree as Record<string, unknown>).__parity_probe__ = { missingOnPurpose: 'English text' };
    try {
      const messages = await buildMessages('pl');
      expect(getAtPath(messages, HOLE)).toBe('English text');
      // and the locale still wins where it has its own value
      expect(getAtPath(messages, 'production.wos.actions.complete.overridePin')).toBe(
        getAtPath(LOCALES.pl, 'production.wos.actions.complete.overridePin'),
      );
    } finally {
      delete (enTree as Record<string, unknown>).__parity_probe__;
    }
  });
});
