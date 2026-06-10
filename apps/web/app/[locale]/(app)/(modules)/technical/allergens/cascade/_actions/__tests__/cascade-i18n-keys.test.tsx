/**
 * RED — TW1-allergens cascade dynamic-i18n-key coverage.
 *
 * The cascade page (other-screens.jsx:1370-1431 parity) builds i18n keys with
 * template literals: t(`source.${a.source}`) and t(`level.${node.level}`). If any
 * value from the live data domain is missing a key, next-intl THROWS at render
 * (raw key shown / 500). This guards that the per-lane i18n fragment enumerates
 * every member of both domains:
 *   - source ∈ item_allergen_profiles_source_check (migration 161);
 *   - level  ∈ ChainNode['level'] (load-cascade.ts).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FRAGMENT = join(
  __dirname,
  '../../../../../../../../../../../_meta/runs/overnight/i18n/TW1-allergens.json',
);

// migration 161 item_allergen_profiles_source_check
const SOURCE_DOMAIN = ['brief_declared', 'supplier_spec', 'lab_result', 'cascaded', 'manual_override'];
// ChainNode['level'] in load-cascade.ts
const LEVEL_DOMAIN = ['RM', 'Intermediate', 'Packaging', 'Process', 'FG'];

describe('cascade dynamic i18n keys are fully enumerated in the lane fragment', () => {
  const fragment = JSON.parse(readFileSync(FRAGMENT, 'utf8')) as Record<string, string>;

  it.each(SOURCE_DOMAIN)('has technical.allergens.cascade.source.%s', (source) => {
    expect(fragment[`technical.allergens.cascade.source.${source}`]).toBeTruthy();
  });

  it.each(LEVEL_DOMAIN)('has technical.allergens.cascade.level.%s', (level) => {
    expect(fragment[`technical.allergens.cascade.level.${level}`]).toBeTruthy();
  });
});
