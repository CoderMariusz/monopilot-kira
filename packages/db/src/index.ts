// packages/db/src/index.ts
// Public API for @monopilot/db — exposes getAppConnection only.
// getOwnerConnection is intentionally NOT re-exported here; ESLint enforces
// that only packages/db/src/migrations/** and scripts/migrate.ts may use it.
export { getAppConnection } from './clients.js';
export { getFaStatusOverall } from './queries/status-overall.js';
export type { FaStatusOverallRow, StatusOverall } from './queries/status-overall.js';
export { outboxEvents, tenantMigrations } from '../schema/index.js';
