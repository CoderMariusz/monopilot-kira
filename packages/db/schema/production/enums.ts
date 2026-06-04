import { pgEnum } from 'drizzle-orm/pg-core';

// 08-Production — shared pgEnums for the waste/downtime/OEE/changeover schema family.
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.6.
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
//
// downtime_source_enum — provenance of a downtime_events row (T-005, §9.6).
//   manual      — operator-entered downtime (P1 baseline).
//   wo_pause    — system-generated when a WO is paused (V-PROD-22: wo_id must be set).
//   plc_auto    — OPC-UA / PLC fault auto-capture (P2 subset).
//   changeover  — line changeover window (links to changeover_events).
export const downtimeSourceEnum = pgEnum('downtime_source_enum', [
  'manual',
  'wo_pause',
  'plc_auto',
  'changeover',
]);
