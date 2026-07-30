import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/557-license-plate-site-id-repair.sql'),
  'utf8',
).toLowerCase();

describe('migration 557 license plate site repair', () => {
  it('derives from receipt, adjustment, warehouse, production, and transfer evidence', () => {
    for (const source of [
      'public.warehouses',
      'public.grns',
      'public.grn_items',
      'public.purchase_orders',
      'public.stock_adjustments',
      'public.stock_moves',
      'public.lp_state_history',
      'public.count_sessions',
      'public.work_orders',
      'public.wo_outputs',
      'public.transfer_order_line_lps',
    ]) {
      expect(sql).toContain(source);
    }
  });

  it('updates only an unambiguous single-site candidate and never guesses conflicts', () => {
    expect(sql).toContain('count(distinct candidates.site_id) as site_count');
    expect(sql).toContain('and resolved.site_count = 1');
    expect(sql).toContain('conflicting_related_sites');
  });

  it('fails the post-check when a uniquely derivable LP remains null and explains other remainders', () => {
    expect(sql).toContain('where lp.site_id is null');
    expect(sql).toContain('related_records_but_all_sites_null');
    expect(sql).toContain('missing_related_records');
    expect(sql).toContain('if v_derivable_null > 0 then');
    expect(sql).toContain('raise exception');
  });
});
