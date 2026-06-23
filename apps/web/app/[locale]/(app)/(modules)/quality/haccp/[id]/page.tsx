/**
 * Wave E3 — HACCP plan detail route (/quality/haccp/[id]).
 *
 * Design-system conformance to the prototype QaHaccpPlans detail pane
 * (prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:44-103):
 * a plan header card + the plan's linked Critical Control Points, with a draft
 * "🔒 Approve Plan" (e-sign) action and a "＋ Add CCP" action (editing CCP
 * limits allowed only while the plan is a draft).
 *
 * Data: the reviewed HACCP plan Server Action `getHaccpPlan` (returns the plan
 * header + its linked CCPs) + `activateHaccpPlan`, imported from
 * quality/_actions/haccp-plan-actions.ts, and `upsertCcp` (with this plan's
 * plan_id) from quality/_actions/haccp-actions.ts — never authored here — run
 * inside withOrgContext (RLS-scoped). RBAC is enforced server-side in the
 * actions; this page never trusts a client flag: a `forbidden` result renders
 * the permission-denied panel and a `null` plan renders the not-found panel.
 * The plan/CCP ids are routing keys only — never rendered as text (rule 0.11).
 *
 * UI states (all four — plan rule 0.11): loading (Suspense skeleton), empty
 * (no CCPs → CTA → add-CCP modal), error (failed live read → banner, never a
 * 500), permission-denied (forbidden → panel). Optimistic: the add-CCP /
 * activate modals use useTransition + router.refresh().
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the reviewed HACCP backend. Imported, never authored here.
import { activateHaccpPlan, getHaccpPlan } from '../../_actions/haccp-plan-actions';
import { upsertCcp } from '../../_actions/haccp-actions';
// Read-only RBAC probe (additive read confined to haccp/**) — gates the mutating
// controls on quality.haccp.plan_edit (rule 0.13c).
import { canEditHaccpPlan } from '../_actions/can-edit-plan';
import { PlanDetailClient } from './_components/plan-detail.client';
import type {
  ActivatePlanAction,
  UpsertCcpAction,
} from '../_components/haccp-contracts';
import {
  buildCcpAddLabels,
  buildPlanActivateLabels,
  buildPlanDetailLabels,
  type Translator,
} from '../_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; id: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:44-103';

function DetailSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="haccp-detail-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-6"
    >
      <div className="h-9 w-40 animate-pulse self-end rounded-md bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DetailContent({ locale, id, t }: { locale: string; id: string; t: Translator }) {
  const labels = buildPlanDetailLabels(t);
  const ccpAddLabels = buildCcpAddLabels(t);
  const activateLabels = buildPlanActivateLabels(t);

  const planResult = await getHaccpPlan(id);

  if (!planResult.ok) {
    if (planResult.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="haccp-detail-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{labels.denied.title}</p>
          <p className="mt-1">{labels.denied.body}</p>
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="haccp-detail-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{labels.error.title}</p>
        <p className="mt-1">{labels.error.body}</p>
      </div>
    );
  }

  if (!planResult.data) {
    return (
      <div
        data-testid="haccp-detail-notfound"
        data-state="empty"
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
      >
        <span className="text-base font-semibold text-slate-700">{labels.notFound.title}</span>
        <span className="max-w-md text-sm text-slate-500">{labels.notFound.body}</span>
        <a
          href={`/${locale}/quality/haccp`}
          data-testid="haccp-detail-notfound-back"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {labels.notFound.back}
        </a>
      </div>
    );
  }

  const canEdit = await canEditHaccpPlan();

  return (
    <PlanDetailClient
      plan={planResult.data}
      labels={labels}
      ccpAddLabels={ccpAddLabels}
      activateLabels={activateLabels}
      canEdit={canEdit}
      upsertCcpAction={upsertCcp as unknown as UpsertCcpAction}
      activatePlanAction={activateHaccpPlan as unknown as ActivatePlanAction}
      t={t}
    />
  );
}

export default async function HaccpPlanDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('quality.haccp');

  return (
    <main
      data-screen="quality-haccp-plan-detail"
      data-prototype-label="haccp_plan_detail"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        subtitle={t('detail.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.haccp'), href: `/${locale}/quality/haccp` },
          { label: t('detail.breadcrumb') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton loadingLabel={t('loading')} />}>
        <DetailContent locale={locale} id={id} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
