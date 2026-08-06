/**
 * Every failure code the pack path can return must have an operator-facing label.
 *
 * shipment-pack-view.tsx does `labels.errors[result.error] ?? labels.errors.persistence_failed`,
 * so an UNMAPPED code silently degrades into "Something went wrong saving. Please retry."
 * That is how `lp_blocked_for_pack` — the food-safety gate for LPs on a quality hold, not
 * QA-released, or past their site-day expiry — told operators to retry a save that can never
 * succeed. `missing_gs1_prefix`/`invalid_gs1_prefix` (commit 48e0f149) were the same bug.
 *
 * This measures the mapping instead of trusting it: codes are read out of the source file,
 * not restated here, so a NEW `return { ok: false, error: '…' }` fails this test until it is
 * given a label in the map and in every locale.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const PACK_CORE = join(WEB_ROOT, 'lib/shipping/pack-lp-into-box.ts');
const PACK_PAGE = join(WEB_ROOT, 'app/[locale]/(app)/(modules)/shipping/shipments/[shipmentId]/page.tsx');
const LOCALES = ['en', 'pl', 'ro', 'uk'] as const;

function packErrorCodes(): string[] {
  const source = readFileSync(PACK_CORE, 'utf8');
  const codes = [...source.matchAll(/error:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
  return [...new Set(codes)].sort();
}

function mappedLabelKeys(): string[] {
  const source = readFileSync(PACK_PAGE, 'utf8');
  const block = source.match(/errors:\s*\{([\s\S]*?)\n {4}\},\n {4}ship:/);
  if (!block) throw new Error('pack errors map not found in page.tsx — did the block move?');
  return [...block[1].matchAll(/^\s*([a-z0-9_]+):\s*t\(/gm)].map((m) => m[1]);
}

function localeMessages(locale: string): Record<string, string> {
  const json = JSON.parse(readFileSync(join(WEB_ROOT, `i18n/${locale}.json`), 'utf8'));
  return json.Shipping.shipments.pack.errors ?? {};
}

describe('pack failure codes are all operator-readable', () => {
  it('reads a non-trivial set of codes out of the source (guards the regexes above)', () => {
    expect(packErrorCodes()).toContain('lp_blocked_for_pack');
    expect(mappedLabelKeys()).toContain('persistence_failed');
  });

  it('every code returned by pack-lp-into-box.ts is mapped on the shipment screen', () => {
    const mapped = mappedLabelKeys();
    const unmapped = packErrorCodes().filter((code) => !mapped.includes(code));
    expect(unmapped, `unmapped pack codes fall back to "please retry": ${unmapped.join(', ')}`).toEqual([]);
  });

  it.each(LOCALES)('%s has a message for every mapped pack code', (locale) => {
    const messages = localeMessages(locale);
    // 'forbidden'/'persistence_failed' live in the shared errors.* namespace, not pack.errors.
    const packScoped = mappedLabelKeys().filter((key) => !['forbidden', 'persistence_failed'].includes(key));
    const missing = packScoped.filter((key) => !messages[key]?.trim());
    expect(missing, `missing ${locale} translations: ${missing.join(', ')}`).toEqual([]);
  });

  it('the food-safety block does not tell the operator to retry', () => {
    for (const locale of LOCALES) {
      const messages = localeMessages(locale);
      expect(messages.lp_blocked_for_pack).toBeTruthy();
      expect(messages.lp_blocked_for_pack).not.toBe(messages.persistence_failed);
    }
  });
});
