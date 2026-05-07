export interface RunHistoryRow {
  aggregate_id: string;
  newest_at: string;
  count: number;
}

export function deriveRunHistory(
  events: { aggregate_id: string; created_at: string; [key: string]: unknown }[],
): RunHistoryRow[] {
  const map = new Map<string, { newest_at: string; count: number }>();

  for (const event of events) {
    const existing = map.get(event.aggregate_id);
    if (!existing) {
      map.set(event.aggregate_id, { newest_at: event.created_at, count: 1 });
    } else {
      const isNewer = event.created_at > existing.newest_at;
      map.set(event.aggregate_id, {
        newest_at: isNewer ? event.created_at : existing.newest_at,
        count: existing.count + 1,
      });
    }
  }

  const rows: RunHistoryRow[] = Array.from(map.entries()).map(([aggregate_id, { newest_at, count }]) => ({
    aggregate_id,
    newest_at,
    count,
  }));

  // Sort descending by newest_at (ISO strings compare lexicographically correctly)
  rows.sort((a, b) => (a.newest_at > b.newest_at ? -1 : a.newest_at < b.newest_at ? 1 : 0));

  return rows;
}
