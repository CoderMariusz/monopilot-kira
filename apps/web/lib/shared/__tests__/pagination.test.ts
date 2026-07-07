import { describe, expect, it } from 'vitest';

import { normalizePage, toPaginatedResult } from '../pagination';

describe('normalizePage', () => {
  it('defaults to page 1 with the configured limit', () => {
    expect(normalizePage({ defaultLimit: 25 })).toEqual({ page: 1, offset: 0, limit: 25 });
  });

  it('computes offset from a 1-based page', () => {
    expect(normalizePage({ page: 3, limit: 10 })).toEqual({ page: 3, offset: 20, limit: 10 });
  });

  it('honours an explicit offset', () => {
    expect(normalizePage({ offset: 50, limit: 25 })).toEqual({ page: 3, offset: 50, limit: 25 });
  });

  it('clamps limit to maxLimit', () => {
    expect(normalizePage({ limit: 999, maxLimit: 50, defaultLimit: 25 }).limit).toBe(50);
  });
});

describe('toPaginatedResult', () => {
  it('reports hasMore when more rows exist beyond the page', () => {
    const page = normalizePage({ page: 1, limit: 25 });
    const result = toPaginatedResult(['a', 'b'], 60, page);
    expect(result).toMatchObject({
      items: ['a', 'b'],
      total: 60,
      page: 1,
      limit: 25,
      offset: 0,
      hasMore: true,
    });
  });

  it('reports hasMore false on the last page', () => {
    const page = normalizePage({ page: 3, limit: 25 });
    const result = toPaginatedResult(['z'], 51, page);
    expect(result.hasMore).toBe(false);
    expect(result.items).toEqual(['z']);
  });
});
