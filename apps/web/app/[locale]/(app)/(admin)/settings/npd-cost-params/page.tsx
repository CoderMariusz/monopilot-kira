import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { PageHead, Section } from '../_components';
import { listNpdCostParams } from './_actions/list-npd-cost-params';
import { NPD_COST_PARAMS_PERMISSION } from './_actions/npd-cost-params-schema';
import NpdCostParamsScreen, { type NpdCostParamsLabels } from './npd-cost-params-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function canEditNpdSchema(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, NPD_COST_PARAMS_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

function tWithFallback(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  try {
    const value = t(key);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

async function buildLabels(locale: string): Promise<NpdCostParamsLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.npdCostParams' });
  return {
    title: tWithFallback(t, 'title', 'NPD cost parameters'),
    subtitle: tWithFallback(t, 'subtitle', 'Org-wide overhead and logistics defaults for costing'),
    sectionTitle: tWithFallback(t, 'section_title', 'Default rates'),
    helper: tWithFallback(
      t,
      'helper',
      'These defaults apply when a project has no override on the costing screen.',
    ),
    fieldOverhead: tWithFallback(t, 'field_overhead', 'Overhead (£/kg)'),
    fieldLogistics: tWithFallback(t, 'field_logistics', 'Logistics (£/box)'),
    save: tWithFallback(t, 'save', 'Save'),
    saving: tWithFallback(t, 'saving', 'Saving…'),
    saved: tWithFallback(t, 'saved', 'Saved'),
    saveError: tWithFallback(t, 'save_error', 'Could not save cost parameters'),
    readOnlyNotice: tWithFallback(t, 'read_only_notice', 'You can view but not edit cost parameters.'),
    forbidden: tWithFallback(t, 'forbidden', 'You do not have permission to view cost parameters.'),
    loadError: tWithFallback(t, 'load_error', 'Unable to load cost parameters.'),
  };
}

export default async function NpdCostParamsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const labels = await buildLabels(locale);

  const [result, canWrite] = await Promise.all([listNpdCostParams(), canEditNpdSchema()]);

  if (!result.ok && result.code === 'forbidden') {
    return (
      <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
        <PageHead title={labels.title} sub={labels.subtitle} />
        <div className="alert alert-amber" role="status" data-testid="npd-cost-params-forbidden">
          {labels.forbidden}
        </div>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
        <PageHead title={labels.title} sub={labels.subtitle} />
        <div className="alert alert-red" role="alert" data-testid="npd-cost-params-error">
          {labels.loadError}
        </div>
      </main>
    );
  }

  return (
    <main aria-label={labels.title} className="mx-auto grid max-w-5xl gap-3 p-6">
      <PageHead title={labels.title} sub={labels.subtitle} />
      <Section title={labels.sectionTitle} sub={labels.helper}>
        <NpdCostParamsScreen
          labels={labels}
          overheadPerKg={result.data.overheadPerKg}
          logisticsPerBox={result.data.logisticsPerBox}
          canWrite={canWrite}
        />
      </Section>
    </main>
  );
}
