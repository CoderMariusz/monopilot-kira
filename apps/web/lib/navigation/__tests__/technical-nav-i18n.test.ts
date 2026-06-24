/**
 * Technical module i18n — sub-nav + dashboard Polish-parity guard (i18n lane).
 *
 * The Technical left rail (technical-nav.ts) was rendering hardcoded English on
 * every locale, and the `technical.dashboard.*` PL values were English
 * placeholders. This guard locks two things:
 *   1. The new `Navigation.technical` namespace (groups + items) exists in all
 *      four locales with the SAME leaf-key set as EN (next-intl MISSING_MESSAGE
 *      guard — same shape as the settings nav).
 *   2. A representative sample of user-facing PL strings (sub-nav + dashboard)
 *      is REAL Polish, i.e. differs from the EN source. ro/uk intentionally
 *      MIRROR the EN value (two-locale policy 2026-06-10), so they are NOT
 *      asserted to differ.
 *
 * Structural coverage only for ro/uk; value-quality only for pl.
 */
import { describe, expect, it } from 'vitest';

import en from '../../../i18n/en.json';
import pl from '../../../i18n/pl.json';
import ro from '../../../i18n/ro.json';
import uk from '../../../i18n/uk.json';

import { TECHNICAL_NAV_GROUPS } from '../technical-nav';

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

function valueAt(root: Json, path: string): string | undefined {
  const node = subtree(root, path);
  return typeof node === 'string' ? node : undefined;
}

const LOCALES: Record<string, Json> = { pl: pl as Json, ro: ro as Json, uk: uk as Json };

describe('Technical i18n — Navigation.technical four-locale coverage', () => {
  const enSubtree = subtree(en as Json, 'Navigation.technical');
  const enKeys = leafKeys(enSubtree).sort();

  it('EN defines the Navigation.technical namespace (groups + items)', () => {
    expect(enSubtree).toBeTypeOf('object');
    expect(enKeys.length).toBeGreaterThan(0);
  });

  it('every nav group + item i18nKey resolves under Navigation.technical (all locales)', () => {
    // Walk the EXACT i18nKey the component renders with, so a code↔json key
    // mismatch (e.g. groups.cost_trace vs cost-trace) is caught, not masked.
    const roots: Array<[string, Json]> = [['en', en as Json], ['pl', pl as Json], ['ro', ro as Json], ['uk', uk as Json]];
    for (const group of TECHNICAL_NAV_GROUPS) {
      for (const [locale, root] of roots) {
        expect(
          valueAt(root, `Navigation.technical.${group.i18nKey}`),
          `${locale}: missing group label for i18nKey ${group.i18nKey}`,
        ).toBeTypeOf('string');
      }
      for (const item of group.items) {
        for (const [locale, root] of roots) {
          expect(
            valueAt(root, `Navigation.technical.${item.i18nKey}`),
            `${locale}: missing item label for i18nKey ${item.i18nKey}`,
          ).toBeTypeOf('string');
        }
      }
    }
  });

  for (const [locale, root] of Object.entries(LOCALES)) {
    it(`${locale}.json mirrors every Navigation.technical leaf key`, () => {
      const localeSubtree = subtree(root, 'Navigation.technical');
      expect(localeSubtree, `${locale} is missing Navigation.technical`).toBeTypeOf('object');
      const localeKeys = leafKeys(localeSubtree).sort();
      const missing = enKeys.filter((k) => !localeKeys.includes(k));
      expect(missing, `${locale} missing keys: ${missing.join(', ')}`).toEqual([]);
    });
  }
});

describe('Technical i18n — Polish is real (not the English placeholder)', () => {
  // Representative high-visibility strings: sub-nav groups/items + dashboard.
  const PL_REAL_SAMPLES = [
    'Navigation.technical.groups.overview',
    'Navigation.technical.groups.products',
    'Navigation.technical.items.boms',
    'Navigation.technical.items.materials',
    'technical.dashboard.title',
    'technical.dashboard.kpi.activeItems.label',
    'technical.dashboard.kpi.pendingBom.label',
    'technical.dashboard.quickActions.createItem',
    'technical.dashboard.recentChanges.title',
    'technical.dashboard.nav.items.title',
  ];

  for (const path of PL_REAL_SAMPLES) {
    it(`PL value for ${path} differs from EN (real translation)`, () => {
      const enVal = valueAt(en as Json, path);
      const plVal = valueAt(pl as Json, path);
      expect(enVal, `EN missing ${path}`).toBeTypeOf('string');
      expect(plVal, `PL missing ${path}`).toBeTypeOf('string');
      expect(plVal, `PL still equals EN for ${path} (untranslated placeholder)`).not.toBe(enVal);
    });
  }
});
