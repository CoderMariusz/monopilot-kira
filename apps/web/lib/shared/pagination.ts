/**
 * Small server-side pagination helpers — offset/limit + total count.
 * Used by list actions that previously hard-capped rows (movements, finance WO
 * costs, schedule-board unscheduled backlog).
 */

export const DEFAULT_MOVEMENT_PAGE_SIZE = 50;
export const DEFAULT_FINANCE_WO_COST_PAGE_SIZE = 25;
export const DEFAULT_UNSCHEDULED_PAGE_SIZE = 50;
export const DEFAULT_LP_PAGE_SIZE = 50;
export const DEFAULT_WO_LIST_PAGE_SIZE = 50;
export const DEFAULT_PO_LIST_PAGE_SIZE = 50;
export const DEFAULT_TO_LIST_PAGE_SIZE = 50;
export const DEFAULT_NCR_PAGE_SIZE = 50;

export type PageInput = {
  page?: number;
  offset?: number;
  limit?: number;
  defaultLimit?: number;
  maxLimit?: number;
};

export type NormalizedPage = {
  page: number;
  offset: number;
  limit: number;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Normalize 1-based page + limit into offset/limit (offset wins when both supplied). */
export function normalizePage(input: PageInput = {}): NormalizedPage {
  const defaultLimit = input.defaultLimit ?? 25;
  const maxLimit = input.maxLimit ?? 500;
  const limit = clampInt(input.limit, defaultLimit, 1, maxLimit);

  if (input.offset !== undefined) {
    const offset = clampInt(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const page = Math.floor(offset / limit) + 1;
    return { page, offset, limit };
  }

  const page = clampInt(input.page, 1, 1, Number.MAX_SAFE_INTEGER);
  return { page, offset: (page - 1) * limit, limit };
}

export function toPaginatedResult<T>(
  items: readonly T[],
  total: number,
  page: NormalizedPage,
): PaginatedResult<T> {
  const safeTotal = Math.max(0, total);
  const shown = page.offset + items.length;
  return {
    items: [...items],
    total: safeTotal,
    page: page.page,
    limit: page.limit,
    offset: page.offset,
    hasMore: shown < safeTotal,
  };
}

export function emptyPaginatedResult<T>(page: NormalizedPage): PaginatedResult<T> {
  return toPaginatedResult([], 0, page);
}
