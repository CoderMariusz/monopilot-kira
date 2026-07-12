export type SubmitForTrialResult =
  | { ok: true; data: { versionId: string; trialCreated: boolean } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'VERSION_NOT_LOCKED'
        | 'TOTAL_PCT_OUT_OF_RANGE'
        | 'MISSING_COST'
        | 'MISSING_NUTRITION_TARGET'
        | 'persistence_failed';
    };
