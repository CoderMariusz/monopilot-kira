/** Shared NPD create-project wizard Basics boundary guards (client + server). */

export const PACK_WEIGHT_G_MAX_DECIMALS = 3;
export const WEEKLY_VOLUME_PACKS_MAX_DECIMALS = 3;

/** YYYY-MM-DD for `type="date"` min and server fail-closed checks (UTC calendar day). */
export function todayIsoDateUtc(reference = new Date()): string {
  return reference.toISOString().slice(0, 10);
}

function normalizeDecimalInput(value: string): string {
  return value.trim().replace(',', '.');
}

function decimalPlaces(normalized: string): number {
  const dot = normalized.indexOf('.');
  if (dot === -1) return 0;
  return normalized.length - dot - 1;
}

function isPlainDecimal(normalized: string): boolean {
  return /^\d+(\.\d+)?$/.test(normalized);
}

/** Optional pack weight (g): empty → null; when set must be > 0 with ≤3 decimal places. */
export function parseOptionalPackWeightG(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const normalized = normalizeDecimalInput(raw);
  if (normalized.length === 0) return null;
  if (!isPlainDecimal(normalized)) return undefined;
  if (decimalPlaces(normalized) > PACK_WEIGHT_G_MAX_DECIMALS) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/** Optional packs per case: empty → null; when set must be integer ≥ 1. */
export function parseOptionalPacksPerCase(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

/** Required weekly volume (packs/week): finite, > 0, ≤3 decimal places. */
export function parseRequiredWeeklyVolumePacks(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const normalized = normalizeDecimalInput(raw);
  if (normalized.length === 0) return undefined;
  if (!isPlainDecimal(normalized)) return undefined;
  if (decimalPlaces(normalized) > WEEKLY_VOLUME_PACKS_MAX_DECIMALS) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/** Required runs/week: whole number ≥ 1 (no fractional runs). */
export function parseRequiredRunsPerWeek(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const normalized = normalizeDecimalInput(raw);
  if (normalized.length === 0) return undefined;
  if (!isPlainDecimal(normalized)) return undefined;
  if (decimalPlaces(normalized) > 0) return undefined;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

/** Optional target launch: empty → null; YYYY-MM-DD on/after reference day (inclusive). */
export function parseFutureTargetLaunch(
  value: unknown,
  referenceYmd: string = todayIsoDateUtc(),
): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return undefined;
  if (value < referenceYmd) return undefined;
  return value;
}

/** Client-side string parsers — mirror server rules for immediate inline feedback. */

export function parseWeeklyVolumePacksInput(value: string): number | null {
  return parseRequiredWeeklyVolumePacks(value) ?? null;
}

export function parseRunsPerWeekInput(value: string): number | null {
  return parseRequiredRunsPerWeek(value) ?? null;
}

export function parsePackWeightGInput(value: string): number | null {
  const parsed = parseOptionalPackWeightG(value);
  if (parsed === undefined) return null;
  return parsed;
}

export function parsePacksPerCaseInput(value: string): number | null | undefined {
  const parsed = parseOptionalPacksPerCase(value);
  if (parsed === undefined) return null;
  return parsed;
}

export function parseTargetLaunchInput(value: string, referenceYmd: string): string | null {
  const parsed = parseFutureTargetLaunch(value, referenceYmd);
  if (parsed === undefined) return null;
  return parsed;
}

export function packWeightInputInvalid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && parseOptionalPackWeightG(trimmed) === undefined;
}

export function packsPerCaseInputInvalid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && parseOptionalPacksPerCase(trimmed) === undefined;
}

export function targetLaunchInputInvalid(value: string, referenceYmd: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return parseFutureTargetLaunch(trimmed, referenceYmd) === undefined;
}
