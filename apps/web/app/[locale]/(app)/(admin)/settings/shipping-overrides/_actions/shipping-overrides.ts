'use server';

import {
  createReasonCode as createReasonCodeForShipOverrideReasons,
  deleteReasonCode as deleteReasonCodeForShipOverrideReasons,
  getOverrideTypes as getOverrideTypesForShipOverrideReasons,
  getReasonCodes as getReasonCodesForShipOverrideReasons,
  getRmaReasonCodes as getRmaReasonCodesForShipOverrideReasons,
  readShippingOverridesSettingsData as readShipOverrideReasonsSettingsData,
  updateReasonCode as updateReasonCodeForShipOverrideReasons,
  type OverrideTypeRow,
  type ReasonCodeMutationResult,
  type ReasonCodeRow,
  type RmaReasonCodeRow,
  type ShippingOverridesSettingsData,
} from '../../ship-override-reasons/_actions/shipping-overrides';

// This module carries `'use server'`, so it may export ONLY async functions —
// never types. (Re-exporting types here makes Turbopack treat them as missing
// server-action exports and fails the build.) The `type` imports above are used
// solely for the function signatures below; consumers needing these types must
// import them from the canonical `ship-override-reasons/_actions/shipping-overrides`.

export async function getOverrideTypes(orgId: string): Promise<OverrideTypeRow[]> {
  return getOverrideTypesForShipOverrideReasons(orgId);
}

export async function getReasonCodes(orgId: string, overrideTypeId: string): Promise<ReasonCodeRow[]> {
  return getReasonCodesForShipOverrideReasons(orgId, overrideTypeId);
}

export async function getRmaReasonCodes(orgId: string): Promise<RmaReasonCodeRow[]> {
  return getRmaReasonCodesForShipOverrideReasons(orgId);
}

export async function readShippingOverridesSettingsData(): Promise<ShippingOverridesSettingsData> {
  return readShipOverrideReasonsSettingsData();
}

export async function createReasonCode(rawInput: unknown): Promise<ReasonCodeMutationResult> {
  return createReasonCodeForShipOverrideReasons(rawInput);
}

export async function updateReasonCode(rawInput: unknown): Promise<ReasonCodeMutationResult> {
  return updateReasonCodeForShipOverrideReasons(rawInput);
}

export async function deleteReasonCode(rawInput: unknown): Promise<ReasonCodeMutationResult> {
  return deleteReasonCodeForShipOverrideReasons(rawInput);
}
