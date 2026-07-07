export type SubmitFactorySpecForReviewResult =
  | { ok: true; data: { specId: string; status: 'in_review' } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'persistence_failed';
      message?: string;
    };

export type LinkFactorySpecBomResult =
  | {
      ok: true;
      data: {
        specId: string;
        bomHeaderId: string;
        bomVersion: number;
        bomStatus: string;
      };
    }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'invalid_state'
        | 'product_mismatch'
        | 'persistence_failed';
      message?: string;
    };

export type ReleaseFactorySpecResult =
  | { ok: true; data: { specId: string; status: 'released_to_factory' } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'invalid_state'
        | 'npd_handoff_required'
        | 'persistence_failed';
      message?: string;
    };
