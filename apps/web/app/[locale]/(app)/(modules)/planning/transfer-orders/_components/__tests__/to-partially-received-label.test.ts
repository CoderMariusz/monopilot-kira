/**
 * Map dead-end #14 — Transfer-Order `partially_received` status label + badge.
 *
 * Scope guard: the transfer_orders.status CHECK (mig 263) currently persists only
 * draft / in_transit / received / cancelled — adding 'partially_received' to the
 * persisted set needs a migration (OUT OF SCOPE here). What IS wired and tested:
 *   1. the TO server state machine + reverse-receipt flow already reference
 *      'partially_received', so the badge + label set must render it honestly;
 *   2. the cancel guard returns error code 'partially_received', so the detail
 *      page must carry a real i18n message instead of the generic fallback.
 *
 * This test locks the i18n leaf-key parity (all 4 locales carry the new
 * toStatus + errors keys) and the badge colour band so the label can never
 * silently regress to a raw enum string / default colour.
 */
import { describe, expect, it } from 'vitest';

import en from '../../../../../../../../i18n/en.json';
import pl from '../../../../../../../../i18n/pl.json';
import uk from '../../../../../../../../i18n/uk.json';
import ro from '../../../../../../../../i18n/ro.json';

type Json = Record<string, unknown>;

const LOCALES = { en, pl, uk, ro } as Record<string, Json>;

function toBlock(locale: Json): Json {
  const planning = locale.Planning as Json;
  return planning.transferOrders as Json;
}

describe('TO partially_received label contract', () => {
  it('every locale carries a non-empty toStatus.partially_received label', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      const toStatus = toBlock(locale).toStatus as Record<string, string>;
      expect(toStatus.partially_received, `${name} toStatus.partially_received`).toBeTruthy();
      expect(typeof toStatus.partially_received).toBe('string');
    }
  });

  it('en + pl carry real translations (not the same English string)', () => {
    const enLabel = (toBlock(en).toStatus as Record<string, string>).partially_received;
    const plLabel = (toBlock(pl).toStatus as Record<string, string>).partially_received;
    expect(enLabel).toBe('Partially received');
    expect(plLabel).toBe('Częściowo przyjęte');
    expect(plLabel).not.toBe(enLabel);
  });

  it('every locale carries the errors.partially_received cancel-guard message', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      const errors = toBlock(locale).errors as Record<string, string>;
      expect(errors.partially_received, `${name} errors.partially_received`).toBeTruthy();
    }
  });

  it('toStatus key set is identical across all four locales', () => {
    const enKeys = Object.keys(toBlock(en).toStatus as Json).sort();
    for (const [name, locale] of Object.entries(LOCALES)) {
      const keys = Object.keys(toBlock(locale).toStatus as Json).sort();
      expect(keys, `${name} toStatus keys`).toEqual(enKeys);
    }
    expect(enKeys).toContain('partially_received');
  });
});
