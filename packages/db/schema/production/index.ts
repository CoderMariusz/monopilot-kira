// 08-Production — waste / downtime / changeover / allergen-validation / OEE schema barrel.
// Canonical owners (D-OEE-1): oee_snapshots producer = 08-production (15-OEE read-only).
// APPENDED at the end of the module barrel to minimise merge collisions with the
// parallel execution-core agent (wo_outputs / wo_executions / wo_events / wo_material_consumption).

export { downtimeSourceEnum } from './enums.js';

export { woWasteLog } from './wo-waste-log.js';
export type { WoWasteLog, NewWoWasteLog } from './wo-waste-log.js';

export { downtimeEvents } from './downtime-events.js';
export type { DowntimeEvent, NewDowntimeEvent } from './downtime-events.js';

export { changeoverEvents } from './changeover-events.js';
export type { ChangeoverEvent, NewChangeoverEvent } from './changeover-events.js';

export { allergenChangeoverValidations } from './allergen-changeover-validations.js';
export type {
  AllergenChangeoverValidation,
  NewAllergenChangeoverValidation,
} from './allergen-changeover-validations.js';

export { oeeSnapshots } from './oee-snapshots.js';
export type { OeeSnapshot, NewOeeSnapshot } from './oee-snapshots.js';
