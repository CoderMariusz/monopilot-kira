import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { PageHead, Section } from '../_components';
import { listCriterionConfig } from './_actions/list-criterion-config';
import { NPD_APPROVAL_CRITERIA_PERMISSION } from './_actions/criterion-config-schema';
import { CriterionToggle } from './_components/criterion-toggle.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type CriterionRow = {
  key: string;
  label: string;
  required: boolean;
};

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
        [ctx.userId, ctx.orgId, NPD_APPROVAL_CRITERIA_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

export default async function NpdApprovalSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const t = await getTranslations({ locale, namespace: 'settings.npdApproval' });

  const [result, canWrite] = await Promise.all([listCriterionConfig(), canEditNpdSchema()]);

  // Permission-denied — the loader RBAC-gates with `npd.schema.edit`.
  if (!result.ok && result.code === 'forbidden') {
    return (
      <main aria-label={t('title')} className="mx-auto grid max-w-5xl gap-3 p-6">
        <PageHead title={t('title')} sub={t('subtitle')} />
        <div className="alert alert-amber" role="status" data-testid="npd-approval-forbidden">
          {t('forbidden')}
        </div>
      </main>
    );
  }

  // Error — persistence failed.
  if (!result.ok) {
    return (
      <main aria-label={t('title')} className="mx-auto grid max-w-5xl gap-3 p-6">
        <PageHead title={t('title')} sub={t('subtitle')} />
        <div className="alert alert-red" role="alert" data-testid="npd-approval-error">
          {t('load_error')}
        </div>
      </main>
    );
  }

  const criteria: CriterionRow[] = result.data;

  return (
    <main aria-label={t('title')} className="mx-auto grid max-w-5xl gap-3 p-6">
      <PageHead title={t('title')} sub={t('subtitle')} />

      {!canWrite ? (
        <div className="alert alert-amber" role="status" data-testid="npd-approval-read-only">
          {t('read_only_notice')}
        </div>
      ) : null}

      <Section title={t('section_title')} sub={t('helper')}>
        {criteria.length === 0 ? (
          <div className="muted" role="status" data-testid="npd-approval-empty">
            {t('empty')}
          </div>
        ) : (
          <table data-testid="npd-approval-table">
            <thead>
              <tr>
                <th>{t('column_criterion')}</th>
                <th>{t('column_required')}</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion) => (
                <tr key={criterion.key}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{criterion.label}</div>
                    <div className="muted mono">{criterion.key}</div>
                  </td>
                  <td>
                    {canWrite ? (
                      <CriterionToggle
                        criterionKey={criterion.key}
                        label={criterion.label}
                        required={criterion.required}
                        toggleLabel={t('column_required')}
                        errorMessage={t('toggle_error')}
                        savingLabel={t('saving')}
                      />
                    ) : (
                      <span
                        className={`badge ${criterion.required ? 'badge-green' : 'badge-gray'}`}
                        data-testid={`criterion-readonly-${criterion.key}`}
                      >
                        {criterion.required ? t('required_yes') : t('required_no')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}
