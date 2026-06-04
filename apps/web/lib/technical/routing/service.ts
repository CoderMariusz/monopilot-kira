/**
 * 03-technical Routing service (T-022 / T-023).
 *
 * The routing CRUD + cost-preview behaviour lives in the co-located Server
 * Actions under
 *   apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/*.ts
 * (the repo's T2-api convention — see MON-t2-api). This module is the
 * non-`'use server'` home for the routing domain's pure, reusable helpers so
 * they can be imported by both the actions and unit tests without pulling in a
 * Server Action boundary. T-022's scope_files names `lib/technical/routing/
 * service.ts`; this is it.
 *
 * V-TEC-60/61/62 set validation and the V-TEC-63 reference lookup are defined in
 * the actions' shared module; they are re-exported here so callers can use a
 * stable `@/lib/technical/routing/service` entry point.
 */

export {
  findUnknownOperationName,
  type ParsedOperation,
  type RoutingActionError,
  ROUTING_APPROVE_PERMISSION,
  ROUTING_STATUSES,
  type RoutingStatus,
  ROUTING_WRITE_PERMISSION,
  validateOperationSet,
} from '../../../app/[locale]/(app)/(modules)/technical/routings/_actions/shared';
