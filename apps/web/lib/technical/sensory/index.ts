/**
 * T-084 — Technical sensory read model public surface.
 *
 * Stable import point for NPD approval + Quality release guards consuming the
 * Technical-owned sensory contract. The sensory UI (T-092) consumes this later.
 */
export {
  SENSORIAL_BLOCKED,
  SENSORY_STATUSES,
  isSensoryStatus,
  npdMayProceed,
  toSensoryReadModel,
} from './sensory-read-model';
export type {
  SensoryEvaluationRow,
  SensoryReadModel,
  SensorialBlockedReason,
  SensoryStatus,
} from './sensory-read-model';
