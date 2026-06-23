/**
 * Wave E3 — HACCP Plans route (/quality/haccp).
 *
 * Design-system conformance to the HACCP Plans prototype
 * (prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:3-106,
 * QaHaccpPlans): page header + breadcrumb, a "＋ New HACCP Plan" action and a
 * list of plans showing code/name, version, status badge and CCP count, with a
 * draft → e-sign approve action and an active → new-version action.
 * The prototype's two-pane tree + inline detail is a DOCUMENTED
 * DEVIATION (rendered as a flat list table whose rows link to a dedicated
 * /quality/haccp/[id] detail route — see plan-list.client.tsx).
 *
 * Data: the reviewed HACCP plan Server Actions (listHaccpPlans +
 * upsertHaccpPlan + activateHaccpPlan + newPlanVersion), imported from
 * quality/_actions/haccp-plan-actions.ts — never authored here — and run inside
 * withOrgContext (RLS-scoped). RBAC is enforced server-side in the actions; this
 * page never trusts a client flag: a `forbidden` result renders the
 * permission-denied panel. No `*_id` reaches the UI as text — the plan id is a
 * routing key only (rule 0.11).
 *
 * UI states (all four — plan rule 0.11): loading (Suspense skeleton, no CLS),
 * empty (CTA → new-plan modal), error (failed live read → banner, never a 500),
 * permission-denied (forbidden → panel). Optimistic: the create/activate modals
 * use useTransition + router.refresh().
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the reviewed HACCP plan backend (quality/_actions/haccp-plan-actions.ts).
// Imported, never authored here.
import {
  activateHaccpPlan,
  listHaccpPlans,
  newPlanVersion,
  upsertHaccpPlan,
} from '../_actions/haccp-plan-actions';
// Read-only RBAC probe (additive read confined to haccp/**) — gates the mutating
// controls on quality.haccp.plan_edit (rule 0.13c).
import { canEditHaccpPlan } from './_actions/can-edit-plan';
import { PlanListClient } from './_components/plan-list.client';
import type {
  ActivatePlanAction,
  NewPlanVersionAction,
  PlanListRow,
  UpsertPlanAction,
} from './_components/haccp-contracts';
import {
  buildPlanActivateLabels,
  buildPlanCreateLabels,
  buildPlanListLabels,
  type Translator,
} from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:3-106';

function ListSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="haccp-plan-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-4"
    >
      <div className="h-9 w-40 animate-pulse self-end rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale, t }: { locale: string; t: Translator }) {
  const labels = buildPlanListLabels(t);
  const createLabels = buildPlanCreateLabels(t);
  const activateLabels = buildPlanActivateLabels(t);

  const plansResult = await listHaccpPlans();

  if (!plansResult.ok) {
    if (plansResult.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="haccp-plan-denied"
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
        data-testid="haccp-plan-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{labels.error.title}</p>
        <p className="mt-1">{labels.error.body}</p>
      </div>
    );
  }

  const canEdit = await canEditHaccpPlan();

  const rows: PlanListRow[] = plansResult.data.map((plan) => ({
    id: plan.id,
    name: plan.name,
    scopeType: plan.scopeType,
    scopeRef: plan.scopeRef,
    version: plan.version,
    status: plan.status,
    ccpCount: plan.ccps.length,
  }));

  return (
    <PlanListClient
      rows={rows}
      labels={labels}
      createLabels={createLabels}
      activateLabels={activateLabels}
      locale={locale}
      canEdit={canEdit}
      upsertPlanAction={upsertHaccpPlan as unknown as UpsertPlanAction}
      activatePlanAction={activateHaccpPlan as unknown as ActivatePlanAction}
      newPlanVersionAction={newPlanVersion as unknown as NewPlanVersionAction}
    />
  );
}

export default async function HaccpPlansPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.haccp');

  return (
    <main
      data-screen="quality-haccp-plans"
      data-prototype-label="haccp_plans"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.haccp') },
        ]}
      />
      <Suspense fallback={<ListSkeleton loadingLabel={t('loading')} />}>
        <ListContent locale={locale} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
