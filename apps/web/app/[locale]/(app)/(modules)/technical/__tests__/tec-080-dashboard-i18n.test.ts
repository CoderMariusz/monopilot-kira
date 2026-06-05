/**
 * TEC-080 Technical Dashboard — i18n four-locale parity guard (lane A5).
 *
 * The dashboard RSC (technical/page.tsx) resolves every label via plain
 * next-intl `t('technical.dashboard.…')`. A key missing in any of en/pl/ro/uk
 * surfaces as a MISSING_MESSAGE crash for that locale. This guard walks the EN
 * `technical.dashboard` subtree (the source of truth for the namespace) and
 * asserts the SAME leaf-key set exists in pl/ro/uk. It does not assert the
 * translation text, only structural coverage — the four-locale rule.
 */
import { describe, expect, it } from 'vitest';

import en from '../../../../../../i18n/en.json';
import pl from '../../../../../../i18n/pl.json';
import ro from '../../../../../../i18n/ro.json';
import uk from '../../../../../../i18n/uk.json';

type Json = Record<string, unknown>;

function leafKeys(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return [prefix];
  }
  return Object.entries(node as Json).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

function subtree(root: Json, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Json)[part];
    }
    return undefined;
  }, root);
}

const NAMESPACE = 'technical.dashboard';
const LOCALES: Record<string, Json> = { pl: pl as Json, ro: ro as Json, uk: uk as Json };

describe('TEC-080 dashboard i18n — four-locale coverage', () => {
  const enSubtree = subtree(en as Json, NAMESPACE);
  const enKeys = leafKeys(enSubtree).sort();

  it('EN defines the technical.dashboard namespace', () => {
    expect(enSubtree).toBeTypeOf('object');
    expect(enKeys.length).toBeGreaterThan(0);
  });

  for (const [locale, root] of Object.entries(LOCALES)) {
    it(`${locale}.json mirrors every technical.dashboard leaf key`, () => {
      const localeSubtree = subtree(root, NAMESPACE);
      expect(localeSubtree, `${locale} is missing technical.dashboard`).toBeTypeOf('object');
      const localeKeys = leafKeys(localeSubtree).sort();
      const missing = enKeys.filter((k) => !localeKeys.includes(k));
      expect(missing, `${locale} missing keys: ${missing.join(', ')}`).toEqual([]);
    });
  }
});
