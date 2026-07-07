/** Among rows with the same role/currency/effective_from, latest created_at wins. */
export type LaborRatePickRow = {
  createdAt: string;
};

export function pickPrecedingLaborRate<T extends LaborRatePickRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => (row.createdAt > best.createdAt ? row : best));
}
