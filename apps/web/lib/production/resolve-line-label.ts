const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human-readable production-line label — never a full raw UUID (C039). */
export function resolveProductionLineLabel(params: {
  lineCode?: string | null;
  lineName?: string | null;
  lineId?: string | null;
}): string {
  const code = params.lineCode?.trim();
  const name = params.lineName?.trim();
  const lineId = params.lineId?.trim();

  if (code && name) return `${code} — ${name}`;
  if (code) return code;
  if (name) return name;
  if (!lineId) return '—';
  if (UUID_RE.test(lineId)) return lineId.slice(0, 8);
  return lineId;
}
