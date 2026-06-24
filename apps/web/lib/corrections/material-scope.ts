type ConsumptionRow = {
  ext_jsonb: unknown;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function materialIdFromConsumptionExt(original: ConsumptionRow): string | null {
  const ext = original.ext_jsonb;
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return null;
  const materialId = (ext as { materialId?: unknown }).materialId;
  return typeof materialId === 'string' && isUuid(materialId) ? materialId : null;
}
