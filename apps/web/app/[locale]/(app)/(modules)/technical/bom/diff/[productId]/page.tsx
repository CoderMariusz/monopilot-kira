/**
 * T-040 — TEC-023 BOM Version Diff route (standalone, self-contained).
 *
 * Real data: calls the `diffBomVersions` (T-015) Server Action ONCE
 * (withOrgContext + RLS) for the `?from=&to=` version pair of the route's FG
 * product_code, and renders the structured diff via the parity client renderer.
 * Reachable from the Versions tab in the BOM detail page (TEC-021 / T-038, built
 * by a parallel agent) — kept on its OWN static `diff/[productId]` route so the
 * union merge stays clean (no clash with the parallel agent's `bom/[id]` detail
 * dynamic segment).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * bom-detail.jsx:373-468 (bom_versions_tab compare panel).
 *
 * States: loading (RSC streams), empty ("No differences"), error (invalid pair /
 * load failure → Alert), permission/not-found (RLS returns zero rows → the
 * action's not_found is surfaced as the not-found alert).
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { diffBomVersions } from '../../_actions/diff-action';
import { BomVersionDiff } from '../../_components/bom-version-diff.client';

export const dynamic = 'force-dynamic';

type SearchParams = { from?: string; to?: string };

export default async function BomDiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale, productId } = await params;
  const { from, to } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'technical.bom.diff' });

  const fromV = Number(from);
  const toV = Number(to);
  const paramsValid = Number.isInteger(fromV) && fromV > 0 && Number.isInteger(toV) && toV > 0;
  const decoded = decodeURIComponent(productId);

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{decoded}</p>
        </div>
        <Link
          href={`/${locale}/technical/bom`}
          className="text-sm font-medium text-blue-600 underline-offset-4 hover:underline"
        >
          {t('close')}
        </Link>
      </div>

      <DiffBody
        productId={decoded}
        fromV={fromV}
        toV={toV}
        paramsValid={paramsValid}
        errorCopy={t('error')}
        notFoundCopy={t('notFound')}
      />
    </main>
  );
}

async function DiffBody({
  productId,
  fromV,
  toV,
  paramsValid,
  errorCopy,
  notFoundCopy,
}: {
  productId: string;
  fromV: number;
  toV: number;
  paramsValid: boolean;
  errorCopy: string;
  notFoundCopy: string;
}) {
  if (!paramsValid) {
    return <Alert>{errorCopy}</Alert>;
  }

  const result = await diffBomVersions({ productId, from: fromV, to: toV });

  if (!result.ok) {
    return <Alert>{result.error === 'not_found' ? notFoundCopy : errorCopy}</Alert>;
  }

  return <BomVersionDiff diff={result.data} fromVersion={fromV} toVersion={toV} />;
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}
