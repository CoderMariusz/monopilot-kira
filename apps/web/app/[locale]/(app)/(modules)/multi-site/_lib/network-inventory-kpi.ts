export type InventoryQtyByUomRow = {
  uom: string;
  qty: string;
};

/** Human-readable per-UoM totals — never sums unlike units into one number. */
export function formatInventoryQtyByUom(rows: readonly InventoryQtyByUomRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.map((row) => `${row.qty} ${row.uom}`).join(' · ');
}
