/**
 * T-087 — TEC-031 Regulatory Compliance Dashboard (spec-driven server page).
 *
 * Spec-driven Wave0 surface (PRD §0/§5/§17). Parity anchor (layout-primitive):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:359-446
 *   (regulatory_compliance_dashboard_screen). See _meta/atomic-tasks/
 *   UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Reads REAL Supabase data org-scoped via withOrgContext + RLS (loadCompliance);
 * no mocks. Visibility + remediation-ROUTING only — lab/HACCP gaps route to
 * 09-QUALITY which owns the lifecycle; this surface never raises NCR or signs off.
 *
 * UI states: loading (Suspense skeleton), empty (no active FG → empty card),
 * error (failed read → banner), permission-denied (page itself is read-only and
 * gated by the route shell's technical access; flag Route links target gated
 * destinations), optimistic — N/A (read-only dashboard, no mutations).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import { loadCompliance } from './_actions/load-compliance';
import type { RegulationCode } from './_actions/shared';
import { ComplianceDashboard, type ComplianceCopy } from './_components/compliance-dashboard.client';

export const dynamic = 'force-dynamic';

function ComplianceSkeleton() {
  return (
    <div data-testid="technical-compliance-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ComplianceContent() {
  const t = await getTranslations('technical.compliance');
  const result = await loadCompliance();

  if (result.state === 'error') {
    return (
      <div
        role="alert"
        data-testid="technical-compliance-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  if (result.state === 'empty') {
    return (
      <Card data-testid="technical-compliance-empty" className="rounded-xl border bg-white shadow-sm">
        <CardHeader className="space-y-1 px-6 py-6">
          <h2 className="text-lg font-semibold tracking-tight">{t('empty.title')}</h2>
          <CardDescription className="text-sm text-muted-foreground">{t('empty.body')}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  const copy: ComplianceCopy = {
    routingNotice: t('routingNotice'),
    coverageTitle: t('coverage.title'),
    flagsTitle: (count) => t('flags.title', { count }),
    flagsHint: t('flags.hint'),
    col: {
      fg: t('flags.col.fg'),
      regulation: t('flags.col.regulation'),
      issue: t('flags.col.issue'),
      severity: t('flags.col.severity'),
      action: t('flags.col.action'),
    },
    route: t('flags.route'),
    emptyTitle: t('empty.title'),
    emptyBody: t('flags.empty'),
    regulationLabel: (code: RegulationCode) => t(`regulation.${code}.label`),
    regulationScope: (code: RegulationCode) => t(`regulation.${code}.scope`),
    issueLabel: (key) => t(`issue.${key}.label`),
    remediationLabel: (key) => t(`issue.${key}.remediation`),
    severityLabel: (s) => t(`severity.${s}`),
    gapsLabel: (n) => t('gaps', { count: n }),
  };

  return (
    <>
      {result.truncated ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          Showing first {result.limit} of {result.fgTotalAvailable} active finished goods.
        </div>
      ) : null}
      <ComplianceDashboard regulations={result.regulations} flags={result.flags} copy={copy} />
    </>
  );
}

export default async function TechnicalCompliancePage() {
  const t = await getTranslations('technical.compliance');

  return (
    <main data-screen="technical-compliance-page" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.compliance') }]}
      />
      <Suspense fallback={<ComplianceSkeleton />}>
        <ComplianceContent />
      </Suspense>
    </main>
  );
}
