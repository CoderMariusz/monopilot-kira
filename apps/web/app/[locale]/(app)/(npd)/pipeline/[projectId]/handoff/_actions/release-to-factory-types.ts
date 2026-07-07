export type ReleaseToFactoryError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'release_blocked'
  | 'persistence_failed';

export type ReleaseToFactoryResult =
  | {
      ok: true;
      data: {
        projectId: string;
        productCode: string;
        releaseStatus: 'released_to_factory';
        activeBomHeaderId: string;
        activeFactorySpecId: string;
      };
    }
  | { ok: false; error: ReleaseToFactoryError; message?: string };
