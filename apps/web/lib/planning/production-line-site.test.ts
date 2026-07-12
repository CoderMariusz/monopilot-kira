import { describe, expect, it } from 'vitest';

import { productionLineMatchesWoSite } from './production-line-site';

describe('productionLineMatchesWoSite', () => {
  const woSite = '88888888-8888-4888-8888-888888888888';

  it('accepts a line on the same site', () => {
    expect(productionLineMatchesWoSite(woSite, woSite)).toBe(true);
  });

  it('accepts a line with no site binding', () => {
    expect(productionLineMatchesWoSite(null, woSite)).toBe(true);
  });

  it('rejects a line on a different site', () => {
    expect(productionLineMatchesWoSite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', woSite)).toBe(false);
  });
});
