export function resolveSalesLinePrice(
  item: { id: string; list_price_gbp?: number | null },
  opts?: { customerId?: string },
): number {
  // opts.customerId is reserved for a future per-customer price-list lookup before item fallback.
  void opts;
  return item.list_price_gbp ?? 0;
}
