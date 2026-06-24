'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createHold } from './hold-actions';

import type {
  ListProductTempRangesResult,
  ProductTempRange,
  SubmitConditionCheckInput,
  SubmitConditionCheckResult,
  UpsertProductTempRangeInput,
  UpsertProductTempRangeResult,
} from './cold-chain-types';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
  siteId?: string | null;
};

type ProductTempRangeRow = {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  min_temp_c: string | number | null;
  max_temp_c: string | number | null;
  requires_check: boolean;
};

type RangeConfigRow = {
  id: string;
  min_temp_c: string | number | null;
  max_temp_c: string | number | null;
  requires_check: boolean;
};

type ExistingColdChainHoldRow = {
  id: string;
};

const QUALITY_COLDCHAIN_RECORD_PERMISSION = 'quality.coldchain.record';
const QUALITY_COLDCHAIN_MANAGE_PERMISSION = 'quality.coldchain.manage';

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

function mapProductTempRange(row: ProductTempRangeRow): ProductTempRange {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code ?? '',
    itemName: row.item_name ?? '',
    minTempC: toNullableNumber(row.min_temp_c),
    maxTempC: toNullableNumber(row.max_temp_c),
    requiresCheck: row.requires_check,
  };
}

function coldChainBreachReason(input: {
  measuredTempC: number;
  minTempC: number | null;
  maxTempC: number | null;
}): string {
  return `Cold-chain breach: measured ${input.measuredTempC} C outside configured range ${formatTempRange(input)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTempRange(input: { minTempC: number | null; maxTempC: number | null }): string {
  if (input.minTempC !== null && input.maxTempC !== null) {
    return `${input.minTempC} C to ${input.maxTempC} C`;
  }
  if (input.minTempC !== null) return `at least ${input.minTempC} C`;
  if (input.maxTempC !== null) return `at most ${input.maxTempC} C`;
  return 'unbounded';
}

async function resolveConditionSiteId(
  client: QueryClient,
  input: { grnItemId?: string | null; lpId?: string | null },
): Promise<string | null> {
  if (!input.grnItemId && !input.lpId) return null;

  const { rows } = await client.query<{ site_id: string | null }>(
    `select coalesce(
        (
          select gi.site_id
            from public.grn_items gi
           where gi.org_id = app.current_org_id()
             and gi.id = $1::uuid
           limit 1
        ),
        (
          select lp.site_id
            from public.license_plates lp
           where lp.org_id = app.current_org_id()
             and lp.id = $2::uuid
           limit 1
        )
      )::text as site_id`,
    [input.grnItemId ?? null, input.lpId ?? null],
  );
  return rows[0]?.site_id ?? null;
}

async function loadRangeConfig(client: QueryClient, itemId: string): Promise<RangeConfigRow | null> {
  const { rows } = await client.query<RangeConfigRow>(
    `select id::text, min_temp_c::text, max_temp_c::text, requires_check
       from public.product_temp_ranges
      where org_id = app.current_org_id()
        and item_id = $1::uuid
      order by site_id nulls last
      limit 1`,
    [itemId],
  );
  return rows[0] ?? null;
}

async function findExistingColdChainHold(client: QueryClient, lpId: string): Promise<ExistingColdChainHoldRow | null> {
  const { rows } = await client.query<ExistingColdChainHoldRow>(
    `select h.id::text
       from public.quality_holds h
      where h.org_id = app.current_org_id()
        and h.reference_type = 'lp'
        and h.reference_id = $1::uuid
        and h.hold_status in ('open', 'investigating', 'escalated', 'quarantined')
        and h.released_at is null
        and h.reason_free_text like 'Cold-chain breach:%'
        and h.created_at >= pg_catalog.now() - interval '24 hours'
      order by h.created_at desc
      limit 1`,
    [lpId],
  );
  return rows[0] ?? null;
}

export async function listProductTempRanges(): Promise<ListProductTempRangesResult> {
  try {
    return await withOrgContext<ListProductTempRangesResult>(async (ctx): Promise<ListProductTempRangesResult> => {
      if (!(await hasPermission(ctx as OrgActionContext, QUALITY_COLDCHAIN_MANAGE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const client = (ctx as OrgActionContext).client;
      const { rows } = await client.query<ProductTempRangeRow>(
        `select
           ptr.id::text,
           ptr.item_id::text,
           i.item_code,
           i.name as item_name,
           ptr.min_temp_c::text,
           ptr.max_temp_c::text,
           ptr.requires_check
         from public.product_temp_ranges ptr
         join public.items i on i.id = ptr.item_id and i.org_id = ptr.org_id
        where ptr.org_id = app.current_org_id()
        order by i.item_code, i.name`,
      );

      return { ok: true, ranges: rows.map(mapProductTempRange) };
    });
  } catch {
    return { ok: false, error: 'load_failed' };
  }
}

export async function upsertProductTempRange(
  input: UpsertProductTempRangeInput,
): Promise<UpsertProductTempRangeResult> {
  if (
    !input?.itemId ||
    !isFiniteNumber(input.minTempC) ||
    !isFiniteNumber(input.maxTempC) ||
    input.minTempC > input.maxTempC
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext<UpsertProductTempRangeResult>(async (ctx): Promise<UpsertProductTempRangeResult> => {
      if (!(await hasPermission(ctx, QUALITY_COLDCHAIN_MANAGE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string }>(
        `insert into public.product_temp_ranges
           (org_id, item_id, min_temp_c, max_temp_c, requires_check)
         values (app.current_org_id(), $1::uuid, $2::numeric, $3::numeric, $4::boolean)
         on conflict (org_id, item_id) do update
            set min_temp_c = excluded.min_temp_c,
                max_temp_c = excluded.max_temp_c,
                requires_check = excluded.requires_check
         returning id::text`,
        [input.itemId, input.minTempC, input.maxTempC, input.requiresCheck],
      );

      const id = rows[0]?.id;
      return id ? { ok: true, id } : { ok: false, error: 'persistence_failed' };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function submitConditionCheck(
  input: SubmitConditionCheckInput,
): Promise<SubmitConditionCheckResult> {
  if (!input?.itemId || !isFiniteNumber(input.measuredTempC)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext<SubmitConditionCheckResult>(async (rawCtx): Promise<SubmitConditionCheckResult> => {
      const ctx = rawCtx as OrgActionContext;
      const { userId, client } = ctx;
      if (!(await hasPermission(ctx, QUALITY_COLDCHAIN_RECORD_PERMISSION))) return { ok: false, error: 'forbidden' };

      const contextSiteId = ctx.siteId ?? null;
      const range = await loadRangeConfig(client, input.itemId);
      const minTempC = toNullableNumber(range?.min_temp_c);
      const maxTempC = toNullableNumber(range?.max_temp_c);
      const hasBounds = minTempC !== null || maxTempC !== null;
      const inRange =
        !range ||
        !range.requires_check ||
        !hasBounds ||
        ((minTempC === null || input.measuredTempC >= minTempC) && (maxTempC === null || input.measuredTempC <= maxTempC));
      const reason = !inRange && hasBounds
        ? coldChainBreachReason({ measuredTempC: input.measuredTempC, minTempC, maxTempC })
        : null;
      const siteId = contextSiteId ?? await resolveConditionSiteId(client, input);
      let holdId: string | null = null;

      if (!inRange && input.lpId && hasBounds) {
        const existingHold = await findExistingColdChainHold(client, input.lpId);
        holdId = existingHold?.id ?? null;
        if (!holdId) {
          // TODO: make hold creation share the outer txn
          const hold = await createHold({
            referenceType: 'lp',
            referenceId: input.lpId,
            reasonText: reason ?? coldChainBreachReason({ measuredTempC: input.measuredTempC, minTempC, maxTempC }),
            priority: 'critical',
          });
          if (!hold.ok) return { ok: false, error: 'persistence_failed' };
          holdId = hold.data.id;
        }
      }

      const inserted = await client.query<{ id: string }>(
        `insert into public.delivery_condition_checks (
           org_id,
           site_id,
           grn_item_id,
           lp_id,
           item_id,
           measured_temp_c,
           min_temp_c,
           max_temp_c,
           in_range,
           reason,
           hold_id,
           checked_by,
           checked_at
         )
         values (
           app.current_org_id(),
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::uuid,
           $5::numeric,
           $6::numeric,
           $7::numeric,
           $8::boolean,
           $9,
           $10::uuid,
           $11::uuid,
           pg_catalog.now()
         )
         returning id::text`,
        [
          siteId,
          input.grnItemId ?? null,
          input.lpId ?? null,
          input.itemId,
          input.measuredTempC,
          minTempC,
          maxTempC,
          inRange,
          reason,
          holdId,
          userId,
        ],
      );
      const checkId = inserted.rows[0]?.id;
      if (!checkId) return { ok: false, error: 'persistence_failed' };

      return holdId ? { ok: true, inRange: false, holdId } : { ok: true, inRange };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
