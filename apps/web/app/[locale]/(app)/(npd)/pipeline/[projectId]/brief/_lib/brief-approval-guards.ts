/**
 * Brief edit guards after formal G4 gate e-sign approval.
 *
 * Policy (PF-R04-02): once a verified G4 gate approval is active, physical /
 * costing / label-defining brief fields are frozen until revert-npd-gate
 * supersedes the approval. Non-audit fields such as `notes` remain editable.
 */

import { G4_DEFINITION_FREEZE_GATE } from '../../../../../../../../lib/npd/g4-definition-freeze';

export const SIGNED_BRIEF_GATE_CODES = [G4_DEFINITION_FREEZE_GATE] as const;
export type SignedBriefGateCode = (typeof SIGNED_BRIEF_GATE_CODES)[number];

/** Patch keys that may change after a signed gate approval. */
export const BRIEF_NON_CRITICAL_PATCH_KEYS = ['notes'] as const;

export type BriefPatchField =
  | 'productName'
  | 'category'
  | 'targetLaunchDate'
  | 'packFormat'
  | 'packWeightG'
  | 'packsPerCase'
  | 'outputUnit'
  | 'weeklyVolumePacks'
  | 'runsPerWeek'
  | 'marketingClaims'
  | 'targetRetailPriceEur'
  | 'salesChannel'
  | 'targetAudience'
  | 'constraints'
  | 'notes';

export type BriefPatchInput = Partial<Record<BriefPatchField, unknown>>;

export type BriefBeforeRow = {
  name: string | null;
  type: string | null;
  target_launch: string | null;
  pack_format: string | null;
  pack_weight_g: string | null;
  packs_per_case: number | null;
  output_unit: string | null;
  weekly_volume_packs: string | null;
  runs_per_week: string | null;
  marketing_claims: string | null;
  target_retail_price_eur: string | null;
  sales_channel: string | null;
  target_audience: string | null;
  constraints: string | null;
  notes: string | null;
};

const PATCH_TO_ROW: Record<Exclude<BriefPatchField, 'notes'>, keyof BriefBeforeRow> = {
  productName: 'name',
  category: 'type',
  targetLaunchDate: 'target_launch',
  packFormat: 'pack_format',
  packWeightG: 'pack_weight_g',
  packsPerCase: 'packs_per_case',
  outputUnit: 'output_unit',
  weeklyVolumePacks: 'weekly_volume_packs',
  runsPerWeek: 'runs_per_week',
  marketingClaims: 'marketing_claims',
  targetRetailPriceEur: 'target_retail_price_eur',
  salesChannel: 'sales_channel',
  targetAudience: 'target_audience',
  constraints: 'constraints',
};

export function hasSignedBriefGateApproval(signedGateCodes: readonly string[]): boolean {
  return signedGateCodes.includes(G4_DEFINITION_FREEZE_GATE);
}

function normalizeComparable(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return String(value);
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function patchValueEqualsBefore(patchKey: BriefPatchField, patchValue: unknown, before: BriefBeforeRow): boolean {
  const rowKey = PATCH_TO_ROW[patchKey as Exclude<BriefPatchField, 'notes'>];
  if (!rowKey) return normalizeComparable(patchValue) === normalizeComparable(before.notes);
  return normalizeComparable(patchValue) === normalizeComparable(before[rowKey]);
}

/**
 * Returns critical brief patch keys that would mutate the signed definition.
 */
export function getBlockedCriticalBriefPatchKeys(
  patch: BriefPatchInput,
  before: BriefBeforeRow,
): BriefPatchField[] {
  const blocked: BriefPatchField[] = [];
  for (const key of Object.keys(patch) as BriefPatchField[]) {
    if ((BRIEF_NON_CRITICAL_PATCH_KEYS as readonly string[]).includes(key)) continue;
    if (patch[key] === undefined) continue;
    if (!patchValueEqualsBefore(key, patch[key], before)) {
      blocked.push(key);
    }
  }
  return blocked;
}

export type BriefPatchGuardResult =
  | { ok: true }
  | { ok: false; blockedFields: BriefPatchField[]; signedGateCodes: SignedBriefGateCode[] };

export function guardBriefPatchAfterSignedApproval(
  patch: BriefPatchInput,
  before: BriefBeforeRow,
  signedGateCodes: readonly string[],
): BriefPatchGuardResult {
  if (!hasSignedBriefGateApproval(signedGateCodes)) {
    return { ok: true };
  }
  const blockedFields = getBlockedCriticalBriefPatchKeys(patch, before);
  if (blockedFields.length === 0) {
    return { ok: true };
  }
  return { ok: false, blockedFields, signedGateCodes: [G4_DEFINITION_FREEZE_GATE] };
}
