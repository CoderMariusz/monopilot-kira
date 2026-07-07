import type { ReleasePreflightBlocker } from '../_lib/release-preflight';
import { RELEASED_TO_FACTORY_EVENT } from '../../../../lib/technical/factory-release-persistence';

export type ReleaseNpdProjectToFactoryResult =
  | {
      ok: true;
      data: {
        projectId: string;
        productCode: string;
        activeBomHeaderId: string;
        activeFactorySpecId: string;
        yieldPromptRequired: boolean;
        productionCode: string;
        bomHeaderId: string;
        releaseStatus: 'released_to_factory';
        factoryAvailableAt: string;
        releaseEventId: number;
        outboxEventType: typeof RELEASED_TO_FACTORY_EVENT;
      };
    }
  | {
      ok: false;
      error:
        | 'INVALID_INPUT'
        | 'FORBIDDEN'
        | 'PRECONDITION_BLOCKERS'
        | 'PACKAGING_UNLINKED'
        | 'PERSISTENCE_FAILED';
      status: number;
      blockers?: ReleasePreflightBlocker[];
      unlinkedComponents?: string[];
      message?: string;
    };
