/**
 * 03-technical · TEC-087 Tooling / Equipment Setup List (T-053): shared types +
 * RBAC helper. Plain (non-`'use server'`) module so it may export non-async
 * values; the `'use server'` action file imports from here. Mirrors
 * technical/routings/_actions/shared.ts.
 *
 * Data authority: packages/db/migrations/163-routings.sql (routings +
 * routing_operations). There is no dedicated `tooling_setups` table; a tooling /
 * equipment setup is a routing operation that binds a production line + setup time.
 *
 * RBAC: there is no dedicated `technical.tooling.*` string in the PRD §3
 * `technical.*` family (Wave0 enum-lock — new strings are forbidden). Tooling
 * setups are routing-authoring data owned by the same Technical Manager who owns
 * routings/BOM, so the write gate reuses `technical.bom.create` (identical to the
 * routings surface).
 */

import { hasPermission } from '../../../../../../../lib/auth/has-permission';

export { hasPermission };

// ── RBAC permission strings (packages/rbac/src/permissions.enum.ts) ───────────
export const TOOLING_WRITE_PERMISSION = 'technical.bom.create';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

/** A tooling / equipment setup derived from a routing operation. */
export type ToolingSetupRow = {
  id: string;
  opCode: string;
  opName: string;
  manufacturingOperationName: string | null;
  setupTimeMin: number;
  /** NUMERIC(10,4) cost-per-hour returned verbatim as a string; never a JS float. */
  costPerHour: string | null;
  resourceKind: 'line' | null;
  resourceCode: string | null;
  resourceName: string | null;
  itemCode: string;
  itemName: string;
  routingVersion: number;
  routingStatus: string;
  updatedAt: string;
};
