'use server';

/**
 * Cold-chain (gaps #9) — read-only listing for the /quality/cold-chain page.
 *
 * The reviewed cold-chain backend (quality/_actions/cold-chain-actions.ts) owns
 * the WRITE paths (upsertProductTempRange / submitConditionCheck) and a
 * `listProductTempRanges` read that is gated on `quality.coldchain.MANAGE` (the
 * config-editor tier). The cold-chain LANDING is a read-only viewer that also
 * needs the recent delivery-condition-check records, and it must open at the
 * READ tier — `quality.coldchain.record` (the GRN-receiver who records checks
 * can also read them) OR `quality.coldchain.manage` (manage implies read).
 *
 * Rather than relax / re-author the MANAGE-gated action (T2-owned, do not edit
 * from a T3 page), this is an ADDITIVE read confined to cold-chain/** — it
 * mirrors the sibling additive-read pattern (ccp-monitoring/_actions/
 * can-edit-ccp.ts): a tiny `withOrgContext`-scoped query, never a mutation,
 * never client-trusted. RBAC is enforced HERE, server-side; a `forbidden`
 * result renders the permission-denied panel.
 *
 * Columns are read VERBATIM from migration 315-cold-chain-condition-checks.sql:
 *   product_temp_ranges(id, org_id, site_id, item_id, min_temp_c, max_temp_c,
 *                       requires_check)
 *   delivery_condition_checks(id, org_id, site_id, grn_item_id, lp_id, item_id,
 *                       measured_temp_c, min_temp_c, max_temp_c, in_range,
 *                       reason, hold_id, checked_by, checked_at)
 * No `*_id` leaks to the UI — joins resolve item_code/name + site name; the
 * recent-checks feed is capped (recent slice, not a full history scroll).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

import type {
  ColdChainConditionCheck,
  ColdChainListResult,
  ColdChainTempRange,
} from './cold-chain-view-types';

type QueryResult<T> = { rows: T[] };
type QueryClient = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type Ctx = { userId: string; orgId: string; client: QueryClient };

// Read tier: a GRN receiver who RECORDS checks can read them; MANAGE implies read.
const READ_PERMISSIONS = ['quality.coldchain.record', 'quality.coldchain.manage'] as const;

const RECENT_CHECKS_LIMIT = 50;

type TempRangeRow = {
  id: string;
  item_code: string | null;
  item_name: string | null;
  site_name: string | null;
  min_temp_c: string | number | null;
  max_temp_c: string | number | null;
  requires_check: boolean;
};

type ConditionCheckRow = {
  id: string;
  item_code: string | null;
  item_name: string | null;
  site_name: string | null;
  measured_temp_c: string | number | null;
  min_temp_c: string | number | null;
  max_temp_c: string | number | null;
  in_range: boolean;
  reason: string | null;
  has_hold: boolean;
  checked_at: string;
};

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function hasReadPermission(ctx: Ctx): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
        )
      limit 1`,
    [ctx.userId, ctx.orgId, READ_PERMISSIONS as unknown as string[]],
  );
  return rows.length > 0;
}

/**
 * Configured product temperature ranges + the most recent delivery-condition
 * checks for the current org. Read-only; RBAC-gated at the READ tier.
 * Fail-closed: any failure returns `{ ok: false, error: 'load_failed' }` so the
 * page renders the error panel rather than a 500.
 */
export async function listColdChainOverview(): Promise<ColdChainListResult> {
  try {
    return await withOrgContext<ColdChainListResult>(async (rawCtx): Promise<ColdChainListResult> => {
      const ctx = rawCtx as Ctx;
      if (!(await hasReadPermission(ctx))) return { ok: false, error: 'forbidden' };

      const rangesResult = await ctx.client.query<TempRangeRow>(
        `select
           ptr.id::text,
           i.item_code,
           i.name        as item_name,
           s.name        as site_name,
           ptr.min_temp_c::text,
           ptr.max_temp_c::text,
           ptr.requires_check
         from public.product_temp_ranges ptr
         join public.items i on i.id = ptr.item_id and i.org_id = ptr.org_id
         left join public.sites s on s.id = ptr.site_id and s.org_id = ptr.org_id
        where ptr.org_id = app.current_org_id()
        order by i.item_code, i.name`,
      );

      const checksResult = await ctx.client.query<ConditionCheckRow>(
        `select
           dcc.id::text,
           i.item_code,
           i.name        as item_name,
           s.name        as site_name,
           dcc.measured_temp_c::text,
           dcc.min_temp_c::text,
           dcc.max_temp_c::text,
           dcc.in_range,
           dcc.reason,
           (dcc.hold_id is not null) as has_hold,
           dcc.checked_at::text
         from public.delivery_condition_checks dcc
         left join public.items i on i.id = dcc.item_id and i.org_id = dcc.org_id
         left join public.sites s on s.id = dcc.site_id and s.org_id = dcc.org_id
        where dcc.org_id = app.current_org_id()
        order by dcc.checked_at desc
        limit ${RECENT_CHECKS_LIMIT}`,
      );

      const ranges: ColdChainTempRange[] = rangesResult.rows.map((row) => ({
        id: row.id,
        itemCode: row.item_code ?? '',
        itemName: row.item_name ?? '',
        siteName: row.site_name,
        minTempC: toNullableNumber(row.min_temp_c),
        maxTempC: toNullableNumber(row.max_temp_c),
        requiresCheck: row.requires_check,
      }));

      const checks: ColdChainConditionCheck[] = checksResult.rows.map((row) => ({
        id: row.id,
        itemCode: row.item_code ?? '',
        itemName: row.item_name ?? '',
        siteName: row.site_name,
        measuredTempC: toNullableNumber(row.measured_temp_c),
        minTempC: toNullableNumber(row.min_temp_c),
        maxTempC: toNullableNumber(row.max_temp_c),
        inRange: row.in_range,
        reason: row.reason,
        hasHold: row.has_hold,
        checkedAt: row.checked_at,
      }));

      return { ok: true, ranges, checks };
    });
  } catch {
    return { ok: false, error: 'load_failed' };
  }
}
