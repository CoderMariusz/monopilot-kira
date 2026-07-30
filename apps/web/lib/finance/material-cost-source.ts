type MaterialUnitCostSqlInput = {
  wacSnapshot: string;
  costHistory: string;
  itemMaster: string;
};

/**
 * Transaction-time business order for a new WAC debit/credit:
 * positive WAC snapshot/pool → active cost history → item master.
 *
 * Zero WAC means no WAC basis, while zero in either catalog is an explicit,
 * known free-material cost. Persisted ledger rows must never use this fallback.
 */
export function materialUnitCostSql({
  wacSnapshot,
  costHistory,
  itemMaster,
}: MaterialUnitCostSqlInput): string {
  return `coalesce(
    nullif((${wacSnapshot})::numeric, 0),
    (${costHistory})::numeric,
    (${itemMaster})::numeric
  )`;
}
