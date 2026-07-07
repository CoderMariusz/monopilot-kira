/**
 * Pure inbound schedule partition — extracted from page.tsx so RTL tests can
 * assert date bucketing without importing the async RSC page (and its planning
 * action dependency graph).
 */
import type { InboundRow } from './_components/inbound-schedule.client';

export type InboundPartition = {
  today: InboundRow[];
  overdue: InboundRow[];
  upcoming: InboundRow[];
};

function wholeDaysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Partition open inbound rows against `today` (YYYY-MM-DD, server-provided):
 *   - today    : expectedDate === today
 *   - overdue  : expectedDate !== null && expectedDate < today
 *   - upcoming : expectedDate === null OR expectedDate > today
 */
export function partitionInbound(rows: InboundRow[], today: string): InboundPartition {
  const todayRows: InboundRow[] = [];
  const overdue: InboundRow[] = [];
  const upcoming: InboundRow[] = [];

  for (const row of rows) {
    const key = row.expectedDate;
    if (key !== null && key === today) {
      todayRows.push(row);
    } else if (key !== null && key < today) {
      overdue.push({ ...row, overdueDays: wholeDaysBetween(key, today) });
    } else {
      upcoming.push(row);
    }
  }

  overdue.sort((a, b) => (a.expectedDate! < b.expectedDate! ? -1 : a.expectedDate! > b.expectedDate! ? 1 : 0));
  upcoming.sort((a, b) => {
    if (a.expectedDate === null && b.expectedDate === null) return 0;
    if (a.expectedDate === null) return 1;
    if (b.expectedDate === null) return -1;
    return a.expectedDate < b.expectedDate ? -1 : a.expectedDate > b.expectedDate ? 1 : 0;
  });

  return { today: todayRows, overdue, upcoming };
}
