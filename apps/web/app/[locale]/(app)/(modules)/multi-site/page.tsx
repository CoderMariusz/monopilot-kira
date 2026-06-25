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

type SitesOverviewResult = { ok: true; sites: SiteRow[] } | { ok: false; sites: SiteRow[] };

async function listSitesOverview(): Promise<SitesOverviewResult> {
  try {
    const sites = await withOrgContext(async ({ client }): Promise<SiteRow[]> => {
      const { rows } = await (client as QueryClient).query<SiteRow>(
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
      return rows;
    });
    return { ok: true, sites };
  } catch (error) {
    console.error("[multi-site] failed to load sites overview", error);
    return { ok: false, sites: [] };
  }
}

export default async function MultiSiteRoutePage() {
  const t = await getTranslations("Navigation.app.items");
  const result = await listSitesOverview();

  return (
    <section data-testid="module-landing-multi-site" className="p-8" aria-labelledby="module-landing-multi-site-title">
      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 id="module-landing-multi-site-title" className="text-3xl font-semibold tracking-tight text-slate-950">
          {t("multiSite")}
        </h1>
        {!result.ok ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Sites could not be loaded. Try again later.
          </div>
        ) : result.sites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
            No active sites are configured for this organization yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Site
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Timezone
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Country
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
                          Default
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{site.site_code}</td>
                    <td className="px-4 py-3 text-slate-600">{site.timezone}</td>
                    <td className="px-4 py-3 text-slate-600">{site.country ?? "Not set"}</td>
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
