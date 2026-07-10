import { describe, expect, it } from 'vitest';

import {
  bomMaterialTotalSql,
  portfolioMaterialTotalSql,
} from '../_actions/recipe-cost-rollup-sql';

describe('recipe cost roll-up item match (N-58)', () => {
  it('prefers item_id and only falls back to component_code when item_id is null', () => {
    const bomSql = bomMaterialTotalSql();
    const portfolioSql = portfolioMaterialTotalSql();

    for (const sql of [bomSql, portfolioSql]) {
      expect(sql).toContain('bl.item_id is not null and ci.id = bl.item_id');
      expect(sql).toContain('bl.item_id is null and ci.item_code = bl.component_code');
      expect(sql).not.toContain('ci.id = bl.item_id or ci.item_code = bl.component_code');
    }
  });
});
