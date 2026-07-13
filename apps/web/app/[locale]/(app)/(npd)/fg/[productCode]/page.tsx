/**
 * C7b consolidation — FG detail folded into the pipeline (Approval stage mount).
 *
 * Route: /[locale]/(app)/(npd)/fg/[productCode]
 *
 * Resolves productCode → projectId and redirects into the canonical pipeline.
 * Child routes (docs/risks/allergens) remain until C8 deletion; they become
 * unreachable once this index redirects.
 */

import { redirect } from 'next/navigation';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { resolveProjectIdByProductCode } from '../../../../../../lib/npd/product-project-resolver';

export const dynamic = 'force-dynamic';

type FgDetailRedirectProps = {
  params?: Promise<{ locale: string; productCode: string }>;
};

type OrgContextLike = {
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[] }>;
  };
};

export default async function FgDetailRedirectPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FgDetailRedirectProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const result = await withOrgContext(async (rawCtx) =>
    resolveProjectIdByProductCode(rawCtx as OrgContextLike, productCode),
  );

  if (result.kind === 'ok') {
    redirect(`/${locale}/pipeline/${result.projectId}`);
  }
  if (result.kind === 'ambiguous') {
    const projectId = result.projectIds[0];
    if (projectId) {
      redirect(`/${locale}/pipeline/${projectId}`);
    }
  }

  redirect(`/${locale}/pipeline`);
}
