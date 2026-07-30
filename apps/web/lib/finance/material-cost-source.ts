type MaterialUnitCostSqlInput = {
  wacSnapshot: string;
  costHistory: string;
  itemMaster: string;
};

/**
 * Business order for material unit cost:
 * positive WAC snapshot/pool → active cost history → item master.
 *
 * Zero WAC means no WAC basis, while zero in either catalog is an explicit,
 * known free-material cost. NULL after all three sources means unknown cost.
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
