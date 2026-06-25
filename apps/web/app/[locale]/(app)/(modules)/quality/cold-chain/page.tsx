/**
 * Cold-chain (gaps #9) — read-only route (/quality/cold-chain).
 *
 * The cold-chain backend (quality/_actions/cold-chain-actions.ts + migration
 * 315) shipped with NO UI route and no nav card. This page closes that gap: a
 * read-only viewer for (1) the configured per-product temperature ranges and
 * (2) the recent delivery-condition checks (pass/fail + measured temp + site).
 * Recording happens at GRN receive (submitConditionCheck), so v1 is read-only.
 *
 * No quality JSX prototype exists for cold-chain (grep of
 * prototypes/design/Monopilot Design System/quality returns none — the only
 * cold-chain hits are in shipping/multi-site). Per UI-PROTOTYPE-PARITY-POLICY
 * §"Spec-driven source", this mirrors the nearest reusable sibling pattern:
 * quality/ccp-monitoring/page.tsx (PageHeader + Suspense skeleton + server-side
 * RBAC gate + the four UI states). prototype_match = false.
 *
 * Data: listColdChainOverview (cold-chain/_actions/list-cold-chain.ts) — an
 * additive read-only action confined to this route, run inside withOrgContext
 * (RLS-scoped). RBAC is enforced SERVER-SIDE there at the READ tier
 * (quality.coldchain.record OR .manage); this page never trusts a client flag —
 * a `forbidden` result renders the permission-denied panel, never the data.
 *
 * UI states (all four): loading (Suspense skeleton, no CLS), empty (honest
 * per-table empty panels inside the island), error (failed live read → banner,
 * never a 500), permission-denied (forbidden → panel). No optimistic path:
 * read-only screen (the mutating path lives at GRN receive).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Read-only listing action — owned by this route (additive, confined to
// cold-chain/**); imported, never re-authored from the page body.
import { listColdChainOverview } from './_actions/list-cold-chain';
import { ColdChainView } from './_components/cold-chain-view.client';
import { buildColdChainLabels } from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

// No prototype JSX for this scope — sibling-mirrored (ccp-monitoring).
const SPEC_SOURCE = 'docs/prd quality cold-chain; sibling quality/ccp-monitoring/page.tsx';

function ViewSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="cold-chain-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-8"
    >
      <div className="flex flex-col gap-3">
        <div className="h-6 w-56 animate-pulse rounded-md bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-56 animate-pulse rounded-md bg-slate-100" />
        <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

async function ViewContent({ locale }: { locale: string }) {
  const t = await getTranslations('quality.coldChain');
  const result = await listColdChainOverview();

  if (!result.ok) {
    if (result.error === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="cold-chain-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{t('denied.title')}</p>
          <p className="mt-1">{t('denied.body')}</p>
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="cold-chain-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{t('error.title')}</p>
        <p className="mt-1">{t('error.body')}</p>
      </div>
    );
  }

  return (
    <ColdChainView
      ranges={result.ranges}
      checks={result.checks}
      labels={buildColdChainLabels((key, values) => t(key, values))}
      locale={locale}
    />
  );
}

export default async function ColdChainPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.coldChain');

  return (
    <main
      data-screen="quality-cold-chain"
      data-prototype-label="quality_cold_chain"
      data-spec-source={SPEC_SOURCE}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.coldChain') },
        ]}
      />
      <Suspense fallback={<ViewSkeleton loadingLabel={t('loading')} />}>
        <ViewContent locale={locale} />
      </Suspense>
    </main>
  );
}
