/** Build a list-route href preserving active filters and an optional page number. */
export function buildListPageHref(
  basePath: string,
  query: Record<string, string | undefined | null>,
  page = 1,
): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw == null || raw === '') continue;
    params.set(key, raw);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
