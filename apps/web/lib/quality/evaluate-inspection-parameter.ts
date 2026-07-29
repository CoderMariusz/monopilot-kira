import { compareDecimalStrings, DECIMAL_QTY_RE } from '../shared/decimal';

export type SpecParameterBounds = {
  parameterName: string;
  minValue: string | null;
  maxValue: string | null;
};

export type InspectionParameterRecord = {
  name: string;
  expected?: string;
  actual: string;
  pass: boolean;
};

export function normalizeParameterName(name: string): string {
  return name.trim().toLowerCase();
}

export function hasNumericBounds(bounds: Pick<SpecParameterBounds, 'minValue' | 'maxValue'>): boolean {
  return bounds.minValue != null || bounds.maxValue != null;
}

export function isValidParameterActual(actual: string): boolean {
  return DECIMAL_QTY_RE.test(actual.trim());
}

/**
 * Inclusive spec limits: value equal to min or max passes.
 * Uses full-precision decimal comparison — never Number() or 6dp truncation.
 * Non-numeric actual values always fail (fail-closed).
 */
export function isWithinSpecBounds(
  actual: string,
  minValue: string | null,
  maxValue: string | null,
): boolean {
  if (!isValidParameterActual(actual)) return false;
  if (minValue != null) {
    const cmp = compareDecimalStrings(actual, minValue);
    if (cmp === null || cmp < 0) return false;
  }
  if (maxValue != null) {
    const cmp = compareDecimalStrings(actual, maxValue);
    if (cmp === null || cmp > 0) return false;
  }
  return true;
}

export function deriveBoundedParameterPass(
  actual: string,
  bounds: SpecParameterBounds | undefined,
): { pass: boolean; enforced: boolean } {
  if (!bounds || !hasNumericBounds(bounds)) {
    return { pass: false, enforced: false };
  }
  return {
    pass: isWithinSpecBounds(actual, bounds.minValue, bounds.maxValue),
    enforced: true,
  };
}

export type SpecParameterCompletenessResult =
  | { ok: true }
  | { ok: false; reason: 'missing_spec_parameters' | 'unknown_spec_parameters'; names: string[] };

/**
 * Fail-closed completeness: every active-spec parameter must be present exactly once
 * (normalized name match). Unknown parameter names are rejected when a spec exists.
 *
 * Operator-facing codes are distinct:
 * - `missing_spec_parameters` — a required spec parameter was not measured/submitted.
 * - `unknown_spec_parameters` — the payload includes a name the active spec does not define
 *   (e.g. renamed parameter) while at least one spec parameter is already present.
 *
 * When nothing in the payload matches the spec, missing takes precedence so stale/extra rows
 * do not mask an incomplete measurement set.
 */
export function validateSpecParameterCompleteness(
  parameters: InspectionParameterRecord[],
  boundsByName: ReadonlyMap<string, SpecParameterBounds>,
): SpecParameterCompletenessResult {
  if (boundsByName.size === 0) return { ok: true };

  const submitted = new Map<string, InspectionParameterRecord>();
  for (const parameter of parameters) {
    const key = normalizeParameterName(parameter.name);
    if (submitted.has(key)) {
      return { ok: false, reason: 'unknown_spec_parameters', names: [parameter.name] };
    }
    submitted.set(key, parameter);
  }

  const missing: string[] = [];
  for (const bounds of boundsByName.values()) {
    const key = normalizeParameterName(bounds.parameterName);
    if (!submitted.has(key)) missing.push(bounds.parameterName);
  }

  const unknown: string[] = [];
  for (const parameter of parameters) {
    const key = normalizeParameterName(parameter.name);
    if (!boundsByName.has(key)) unknown.push(parameter.name);
  }

  const hasSpecMatch = parameters.some((parameter) =>
    boundsByName.has(normalizeParameterName(parameter.name)),
  );

  if (unknown.length > 0 && hasSpecMatch) {
    return { ok: false, reason: 'unknown_spec_parameters', names: unknown };
  }
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_spec_parameters', names: missing };
  }
  if (unknown.length > 0) {
    return { ok: false, reason: 'unknown_spec_parameters', names: unknown };
  }

  return { ok: true };
}

/**
 * Server trust boundary: numeric spec bounds override client pass flags.
 * Rejects when the client claims pass=true for an out-of-spec bounded measurement.
 */
export function applySpecBoundsToParameters(
  parameters: InspectionParameterRecord[],
  boundsByName: ReadonlyMap<string, SpecParameterBounds>,
): { parameters: InspectionParameterRecord[]; clientPassRejected: boolean } {
  let clientPassRejected = false;
  const normalized = parameters.map((parameter) => {
    const bounds = boundsByName.get(normalizeParameterName(parameter.name));
    const { pass: derivedPass, enforced } = deriveBoundedParameterPass(parameter.actual, bounds);
    if (!enforced) return parameter;
    if (parameter.pass && !derivedPass) clientPassRejected = true;
    return { ...parameter, pass: derivedPass };
  });
  return { parameters: normalized, clientPassRejected };
}

export function allParametersPass(parameters: InspectionParameterRecord[]): boolean {
  return parameters.length > 0 && parameters.every((parameter) => parameter.pass);
}
