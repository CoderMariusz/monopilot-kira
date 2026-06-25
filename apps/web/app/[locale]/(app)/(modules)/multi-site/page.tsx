import { getTranslations } from "next-intl/server";

import { withOrgContext } from "../../../../../lib/auth/with-org-context";

type QueryResult<T> = { rows: T[] };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type SiteRow = {
  id: string;
  site_code: string;
  name: string;
  is_default: boolean;
  timezone: string;
  country: string | null;
};

type NetworkKpis = {
  siteCount: number | null;
  inTransitTransferOrders: number | null;
  inventoryTotalQty: string | null;
};

type SitesOverviewResult =
  | { ok: true; sites: SiteRow[]; kpis: NetworkKpis }
  | { ok: false; sites: SiteRow[]; kpis: NetworkKpis };

const EMPTY_NETWORK_KPIS: NetworkKpis = {
  siteCount: null,
  inTransitTransferOrders: null,
  inventoryTotalQty: null,
};

function countFromRow(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

async function listSitesOverview(): Promise<SitesOverviewResult> {
  try {
    const result = await withOrgContext(async ({ client }): Promise<{ sites: SiteRow[]; kpis: NetworkKpis }> => {
      const queryClient = client as QueryClient;
      const sitesPromise = queryClient.query<SiteRow>(
        `select id::text,
                site_code,
                name,
                is_default,
                timezone,
                country
           from public.sites
          where org_id = app.current_org_id()
            and is_active = true
          order by is_default desc, lower(name), lower(site_code)
          limit 100`,
      );

      const siteCountPromise = queryClient
        .query<{ site_count: string | number }>(
          `select count(*) as site_count
             from public.sites
            where org_id = app.current_org_id()
              and is_active = true`,
        )
        .then(({ rows }) => countFromRow(rows[0]?.site_count))
        .catch((error) => {
          console.error("[multi-site] failed to load network site count", error);
          return null;
        });

      const inTransitTransferOrdersPromise = queryClient
        .query<{ in_transit_count: string | number }>(
          `select count(*) as in_transit_count
             from public.transfer_orders
            where org_id = app.current_org_id()
              and status = 'in_transit'`,
        )
        .then(({ rows }) => countFromRow(rows[0]?.in_transit_count))
        .catch((error) => {
          console.error("[multi-site] failed to load in-transit transfer order count", error);
          return null;
        });

      const inventoryTotalQtyPromise = queryClient
        .query<{ inventory_total_qty: string | null }>(
          `select coalesce(sum(lp.quantity), 0)::text as inventory_total_qty
             from public.license_plates lp
            where lp.org_id = app.current_org_id()
              and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')`,
        )
        .then(({ rows }) => rows[0]?.inventory_total_qty ?? null)
        .catch((error) => {
          console.error("[multi-site] failed to load inventory aggregate", error);
          return null;
        });

      const [sitesResult, siteCount, inTransitTransferOrders, inventoryTotalQty] = await Promise.all([
        sitesPromise,
        siteCountPromise,
        inTransitTransferOrdersPromise,
        inventoryTotalQtyPromise,
      ]);

      return {
        sites: sitesResult.rows,
        kpis: {
          siteCount,
          inTransitTransferOrders,
          inventoryTotalQty,
        },
      };
    });
    return { ok: true, ...result };
  } catch (error) {
    console.error("[multi-site] failed to load sites overview", error);
    return { ok: false, sites: [], kpis: EMPTY_NETWORK_KPIS };
  }
}

export default async function MultiSiteRoutePage() {
  const nav = await getTranslations("Navigation.app.items");
  const t = await getTranslations("MultiSite");
  const result = await listSitesOverview();

  return (
    <section data-testid="module-landing-multi-site" className="p-8" aria-labelledby="module-landing-multi-site-title">
      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 id="module-landing-multi-site-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {nav("multiSite")}
        </h1>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Network KPIs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Number of sites</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{result.kpis.siteCount ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Transfer orders in-transit</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {result.kpis.inTransitTransferOrders ?? "—"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Aggregated inventory</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{result.kpis.inventoryTotalQty ?? "—"}</div>
          </div>
        </div>
        {!result.ok ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {t("errorLoad")}
          </div>
        ) : result.sites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
            {t("empty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.site")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.code")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.timezone")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("columns.country")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {result.sites.map((site) => (
                  <tr key={site.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {site.name}
                      {site.is_default ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {t("default")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{site.site_code}</td>
                    <td className="px-4 py-3 text-slate-600">{site.timezone}</td>
                    <td className="px-4 py-3 text-slate-600">{site.country ?? t("notSet")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
