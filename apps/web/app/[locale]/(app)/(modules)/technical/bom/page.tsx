/**
 * T-037 — BOM List page (TEC-020), Server Component.
 *
 * Route: /[locale]/(app)/technical/bom
 *
 * Reads REAL, org-scoped data via the existing BOM read action
 * (`listBomHeaders` → withOrgContext + RLS as app_user with app.current_org_id()).
 * No mocks, no hardcoded rows. The presentational `BomListScreen` (tested via RTL)
 * receives `state`/`data`/`labels` and the server-resolved RBAC flags.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-list.jsx:3-95 (BOMList)
 *
 * Red-lines: list is server-paginated (never unpaginated); FG canonical; RBAC
 * (`technical.bom.*`) resolved server-side.
 */

import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { listBomHeaders, type ListBomHeadersResult } from './_actions/queries';
import { BOM_LIST_PAGE_SIZE } from './_actions/shared';
import {
  BomListScreen,
  type BomListData,
  type BomListLabels,
  type BomListItem,
  type PageState,
} from './_components/bom-list-screen';

export const dynamic = 'force-dynamic';

const DETAIL_HREF_BASE = '/technical/bom';

const LABEL_KEYS = [
  'breadcrumbRoot',
  'title',
  'subtitle',
  'newBom',
  'generateBoms',
  'kpiActive',
  'kpiTotalSuffix',
  'kpiDraft',
  'kpiInReview',
  'tabAll',
  'tabDraft',
  'tabActive',
  'tabInReview',
  'tabArchived',
  'colCode',
  'colProduct',
  'colCategory',
  'colVersion',
  'colYield',
  'colUpdated',
  'colStatus',
  'componentsMeta',
  'statusDraft',
  'statusInReview',
  'statusApproved',
  'statusActive',
  'statusSuperseded',
  'statusArchived',
  'searchPlaceholder',
  'emptyTitle',
  'emptyBody',
  'noMatchTitle',
  'noMatchBody',
  'loading',
  'error',
  'forbidden',
] satisfies Array<keyof BomListLabels>;

function translateLabel(t: (key: string) => string, key: keyof BomListLabels): string {
  try {
    const value = t(key);
    return value === key ? key : value;
  } catch {
    return key;
  }
}

async function buildLabels(locale: string): Promise<BomListLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.bomList' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as BomListLabels);
  } catch {
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = key;
      return labels;
    }, {} as BomListLabels);
  }
}

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[]; rowCount?: number | null }>;
  };
};

async function resolvePermissions(): Promise<{ canCreate: boolean; canGenerate: boolean } | null> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ permission: string }>(
        `select rp.permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id
          where ur.user_id = $1::uuid and ur.org_id = $2::uuid
            and rp.permission in ('technical.bom.create', 'technical.bom.generate_batch')`,
        [ctx.userId, ctx.orgId],
      );
      const set = new Set(rows.map((r) => r.permission));
      return {
        canCreate: set.has('technical.bom.create'),
        canGenerate: set.has('technical.bom.generate_batch'),
      };
    });
  } catch {
    return null;
  }
}

type BomListPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; status?: string; q?: string; new?: string }>;
  // Test-only injection seam (mirrors costing/page.tsx).
  data?: BomListData | null;
  state?: PageState;
};

function buildData(result: ListBomHeadersResult): { state: PageState; data: BomListData | null } {
  if (!result.ok) return { state: 'error', data: null };
  if (result.data.length === 0) return { state: 'empty', data: null };

  const items: BomListItem[] = result.data.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    category: r.category,
    version: r.version,
    status: r.status,
    yieldPct: r.yieldPct,
    componentCount: r.componentCount,
    updatedAt: r.updatedAt,
  }));

  const activeCount = items.filter((i) => i.status === 'active').length;
  const draftCount = items.filter((i) => i.status === 'draft').length;
  const inReviewCount = items.filter((i) => i.status === 'in_review').length;

  return {
    state: 'ready',
    data: {
      items,
      kpi: { activeCount, totalCount: result.total, draftCount, inReviewCount },
      detailHrefBase: DETAIL_HREF_BASE,
    },
  };
}

export default async function BomListPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as BomListPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const sp = props.searchParams ? await props.searchParams : {};

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  if (injected) {
    return (
      <BomListScreen
        state={props.state ?? (props.data ? 'ready' : 'empty')}
        data={props.data ?? null}
        labels={labels}
      />
    );
  }

  const page = Math.max(Number(sp.page ?? '1') || 1, 1);
  const status = sp.status as BomListItem['status'] | undefined;
  const [result, perms] = await Promise.all([
    listBomHeaders({ page, pageSize: BOM_LIST_PAGE_SIZE, status, query: sp.q }),
    resolvePermissions(),
  ]);

  const { state, data } = buildData(result);

  // Deep-link from the item-detail BOM tab CTA: `?new=<fgCode>` auto-opens the
  // FG picker with that finished good preselected (server-gated by canCreate).
  const prefillFg = typeof sp.new === 'string' && sp.new.length > 0 ? sp.new : undefined;

  return (
    <BomListScreen
      state={perms === null ? 'error' : state}
      data={data}
      labels={labels}
      canCreate={perms?.canCreate ?? false}
      canGenerate={perms?.canGenerate ?? false}
      openNew={Boolean(prefillFg)}
      prefillFg={prefillFg}
    />
  );
}
