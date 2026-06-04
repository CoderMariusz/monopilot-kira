/**
 * T-092 — 03-technical Sensory Evaluation screen.
 *
 * Real Supabase-backed read of the Technical-owned sensory read model
 * (public.technical_sensory_evaluations, migration 166 / T-084) through
 * withOrgContext + RLS. Translated from the read-model status-list layout
 * primitive prototypes/design/Monopilot Design System/technical/
 * spec-driven-screens.jsx:472-569 (`lab_results_log_screen`): read-only banner +
 * verdict-pill status table + source note. PRD §0/§5/§17 is canonical; the
 * prototype is the layout primitive only.
 *
 * The screen REPORTS sensory state (required / pending / pass / fail / hold /
 * not_required) and surfaces the SENSORIAL_BLOCKED reason for fail/hold so
 * downstream release guards can read it. It is read-only: NO sensory write path,
 * and it does NOT move NPD gate ownership into Technical — NPD consumes the same
 * SensoryStatusBadge read-only. FG is canonical; no FA aliases.
 *
 * States: loading (RSC Suspense at the segment), empty, error, permission-denied
 * (the `denied` branch — no data leak), plus the populated table.
 */

import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { SENSORIAL_BLOCKED, type SensoryStatus } from '../../../../../../lib/technical/sensory';
import { listSensory } from './_actions/list-sensory';
import { type SensoryStatusLabels, SensoryStatusBadge } from './_components/sensory-status-badge';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default async function TechnicalSensoryPage() {
  const t = await getTranslations('Technical.sensory');
  const { rows, state, counts } = await listSensory();

  const statusLabels: SensoryStatusLabels = {
    required: t('status.required'),
    pending: t('status.pending'),
    pass: t('status.pass'),
    fail: t('status.fail'),
    hold: t('status.hold'),
    not_required: t('status.notRequired'),
  };

  const subjectTypeLabel = (type: string): string => {
    switch (type) {
      case 'product':
        return t('subject.product');
      case 'project':
        return t('subject.project');
      case 'work_order':
        return t('subject.workOrder');
      default:
        return t('subject.item');
    }
  };

  return (
    <main data-screen="technical-sensory" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.sensory') }]}
      />

      {state === 'denied' ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          {t('state.denied')}
        </div>
      ) : (
        <>
          <div
            role="note"
            className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-3 text-xs text-amber-800"
          >
            {t('readOnlyNote')}
          </div>

          <section aria-label={t('kpi.region')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="rounded-xl border bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{t('kpi.total')}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{counts.total}</div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{t('kpi.blocked')}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" data-tone="red">
                  {counts.blocked}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{t('kpi.pending')}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" data-tone="amber">
                  {counts.pending}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{t('kpi.notRequired')}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{counts.notRequired}</div>
              </CardContent>
            </Card>
          </section>

          {state === 'error' ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
              {t('state.error')}
            </div>
          ) : state === 'empty' ? (
            <Card className="rounded-xl border bg-white shadow-sm">
              <CardHeader className="space-y-1 px-6 py-6">
                <h2 className="text-lg font-semibold tracking-tight">{t('state.emptyTitle')}</h2>
                <CardDescription className="text-sm text-muted-foreground">
                  {t('state.emptyBody')}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card className="rounded-xl border bg-white shadow-sm">
              <CardContent className="p-0">
                <Table aria-label={t('tableLabel')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('col.subject')}</TableHead>
                      <TableHead scope="col">{t('col.type')}</TableHead>
                      <TableHead scope="col">{t('col.policy')}</TableHead>
                      <TableHead scope="col">{t('col.evaluated')}</TableHead>
                      <TableHead scope="col">{t('col.status')}</TableHead>
                      <TableHead scope="col">{t('col.blockedReason')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const status: SensoryStatus = row.readModel.status;
                      return (
                        <TableRow
                          key={row.id}
                          className={row.readModel.releaseBlocked ? 'bg-red-50/60' : undefined}
                        >
                          <TableCell className="font-medium">
                            {row.subjectItemName ?? row.subjectRef}
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.subjectItemCode ?? row.subjectRef}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{subjectTypeLabel(row.subjectType)}</TableCell>
                          <TableCell className="text-sm">
                            {row.policyRequired ? t('policy.required') : t('policy.optional')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <span className="font-mono text-xs">{formatDate(row.evaluatedAt)}</span>
                            {row.evaluatedByName ? (
                              <div className="text-xs">{row.evaluatedByName}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <SensoryStatusBadge status={status} labels={statusLabels} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.readModel.blockedReason === SENSORIAL_BLOCKED ? (
                              <div data-testid="sensorial-blocked">
                                <span className="font-mono text-xs font-semibold text-red-700">
                                  {SENSORIAL_BLOCKED}
                                </span>
                                {row.readModel.blockedDetail ? (
                                  <div className="text-xs text-muted-foreground">
                                    {row.readModel.blockedDetail}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div
            role="note"
            className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-sm text-blue-800"
          >
            {t('sourceNote')}
          </div>
        </>
      )}
    </main>
  );
}
