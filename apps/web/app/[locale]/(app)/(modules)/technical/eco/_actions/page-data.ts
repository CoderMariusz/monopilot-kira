'use server';

/**
 * N1-A — Change Control (ECO) page-load aggregator.
 *
 * Thin read aggregator for `technical/eco/page.tsx`. The mutation/business
 * actions (list/get/create/update/approve/start/close) are owned by the T2
 * backend and imported as-is; this loader only:
 *   1. resolves the caller's `technical.eco.write` + `technical.eco.approve`
 *      permissions server-side (never client-trusted), and
 *   2. lists the org's items so the create/edit modal can bind an ECO line's
 *      target item to a real item-master FK (never free text), and
 *   3. lists change orders for the requested status filter.
 *
 * Everything runs under withOrgContext + RLS (`app.current_org_id()`); no
 * service-role bypass, no mocks. Mirrors the routings/factory-specs loaders.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  DEFAULT_ECO_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../../lib/shared/pagination';
import {
  ECO_APPROVE_PERMISSION,
  ECO_STATUSES,
  ECO_WRITE_PERMISSION,
  type EcoStatus,
  type EcoStatusTone,
  type EcoSummary,
  hasPermission,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type EcoItemOption = { id: string; itemCode: string; name: string };

export type EcoPageState = 'ready' | 'empty' | 'error' | 'forbidden';

export type EcoPageData = {
  changeOrders: EcoSummary[];
  pagination: PaginatedResult<EcoSummary>;
  items: EcoItemOption[];
  counts: Record<EcoStatus, number> & { all: number };
  canWrite: boolean;
  canApprove: boolean;
  state: EcoPageState;
};

type EcoRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  status_tone: string;
  priority: string;
  change_type: string;
  target_item_id: string | null;
  target_bom_header_id: string | null;
  target_factory_spec_id: string | null;
  updated_at: string;
  line_count: string | number;
};

type ItemRow = { id: string; item_code: string; name: string };
type CountRow = { status: string; n: string | number };

const ITEM_LOOKUP_LIMIT = 500;

function isEcoStatus(value: string): value is EcoStatus {
  return (ECO_STATUSES as readonly string[]).includes(value);
}

export async function loadEcoPage(rawStatus?: string, rawPage?: number): Promise<EcoPageData> {
  const status = rawStatus && isEcoStatus(rawStatus) ? rawStatus : undefined;
  const page = normalizePage({
    page: rawPage,
    defaultLimit: DEFAULT_ECO_PAGE_SIZE,
    maxLimit: 200,
  });

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<EcoPageData> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };

      const [canWrite, canApprove] = await Promise.all([
        hasPermission(ctx, ECO_WRITE_PERMISSION),
        hasPermission(ctx, ECO_APPROVE_PERMISSION),
      ]);

      const emptyCounts: Record<EcoStatus, number> & { all: number } = {
        draft: 0,
        approved: 0,
        implementing: 0,
        closed: 0,
        all: 0,
      };

      if (!canWrite) {
        return {
          changeOrders: [],
          pagination: toPaginatedResult([], 0, page),
          items: [],
          counts: emptyCounts,
          canWrite,
          canApprove,
          state: 'forbidden',
        };
      }

      const baseParams = [status ?? null] as const;

      const [orderRows, itemRows, countRows, filteredCountResult] = await Promise.all([
        qc.query<EcoRow>(
          `select co.id,
                  co.code,
                  co.title,
                  co.status,
                  co.status_tone,
                  co.priority,
                  co.change_type,
                  co.target_item_id,
                  co.target_bom_header_id,
                  co.target_factory_spec_id,
                  co.updated_at::text as updated_at,
                  (select count(*) from public.technical_change_order_lines l
                    where l.org_id = app.current_org_id() and l.change_order_id = co.id) as line_count
             from public.technical_change_orders co
            where co.org_id = app.current_org_id()
              and ($1::text is null or co.status = $1)
            order by co.updated_at desc, co.id desc
            limit $2::integer offset $3::integer`,
          [...baseParams, page.limit, page.offset],
        ),
        qc.query<ItemRow>(
          `select id, item_code, name from public.items
            where org_id = app.current_org_id() order by item_code asc limit $1`,
          [ITEM_LOOKUP_LIMIT],
        ),
        qc.query<CountRow>(
          `select status, count(*) as n
             from public.technical_change_orders
            where org_id = app.current_org_id()
            group by status`,
        ),
        qc.query<{ total: number }>(
          `select count(*)::int as total
             from public.technical_change_orders co
            where co.org_id = app.current_org_id()
              and ($1::text is null or co.status = $1)`,
          [...baseParams],
        ),
      ]);

      const counts = { ...emptyCounts };
      for (const row of countRows.rows) {
        const n = Number(row.n);
        if (isEcoStatus(row.status)) counts[row.status] = n;
        counts.all += n;
      }

      const changeOrders: EcoSummary[] = orderRows.rows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status as EcoStatus,
        statusTone: row.status_tone as EcoStatusTone,
        priority: row.priority,
        changeType: row.change_type,
        targetItemId: row.target_item_id,
        targetBomHeaderId: row.target_bom_header_id,
        targetFactorySpecId: row.target_factory_spec_id,
        updatedAt: row.updated_at,
        lineCount: Number(row.line_count),
      }));

      const pagination = toPaginatedResult(
        changeOrders,
        Number(filteredCountResult.rows[0]?.total ?? 0),
        page,
      );

      const items: EcoItemOption[] = itemRows.rows.map((r) => ({
        id: String(r.id),
        itemCode: r.item_code,
        name: r.name,
      }));

      return {
        changeOrders: pagination.items,
        pagination,
        items,
        counts,
        canWrite,
        canApprove,
        state: pagination.total === 0 ? 'empty' : 'ready',
      };
    });
  } catch (error) {
    console.error('[technical/eco] loadEcoPage load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      changeOrders: [],
      pagination: toPaginatedResult([], 0, page),
      items: [],
      counts: { draft: 0, approved: 0, implementing: 0, closed: 0, all: 0 },
      canWrite: false,
      canApprove: false,
      state: 'error',
    };
  }
}
