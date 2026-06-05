/**
 * T-092 — 03-technical Sensory Evaluation screen.
 *
 * Real Supabase-backed read of the Technical-owned sensory read model
 * (public.technical_sensory_evaluations, migration 166 / T-084) through
 * withOrgContext + RLS. No dedicated prototype — built to MON-design-system
 * conventions: breadcrumb + page-title + muted desc, KPI tiles with the 3px
 * bottom accent, dense `.table`, mono item codes, 5 semantic badges, EmptyState.
 *
 * The screen REPORTS sensory state (required / pending / pass / fail / hold /
 * not_required) and surfaces the SENSORIAL_BLOCKED reason for fail/hold so
 * downstream release guards can read it. It is read-only: NO sensory write path,
 * and it does NOT move NPD gate ownership into Technical — NPD consumes the same
 * SensoryStatusBadge read-only. FG is canonical; no FA aliases.
 *
 * States: loading (RSC Suspense), empty (EmptyState), error, permission-denied
 * (the `denied` branch — no data leak), plus the populated table. No optimistic
 * state (read-only surface).
 */

import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('technical.sensory');
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

  if (state === 'denied') {
    return (
      <main data-screen="technical-sensory" className="flex w-full flex-col gap-4 px-6 py-6">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.sensory') }]}
        />
        <div role="alert" data-testid="sensory-denied" className="alert alert-amber">
          <span aria-hidden="true">△</span>
          <div className="alert-title">{t('state.denied')}</div>
        </div>
      </main>
    );
  }

  return (
    <main data-screen="technical-sensory" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.sensory') }]}
      />
      <div role="note" data-testid="sensory-readonly-note" className="alert alert-amber">
        <span aria-hidden="true">△</span> {t('readOnlyNote')}
      </div>

      {/* KPI strip — real counts, 3px bottom accent per tone. */}
      <div className="kpi-row" aria-label={t('kpi.region')} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi">
          <div className="kpi-label">{t('kpi.total')}</div>
          <div className="kpi-value">{counts.total}</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">{t('kpi.blocked')}</div>
          <div className="kpi-value">{counts.blocked}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">{t('kpi.pending')}</div>
          <div className="kpi-value">{counts.pending}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('kpi.notRequired')}</div>
          <div className="kpi-value">{counts.notRequired}</div>
        </div>
      </div>

      {state === 'error' ? (
        <div role="alert" data-testid="sensory-error" className="alert alert-red">
          <span aria-hidden="true">⚠</span>
          <div className="alert-title">{t('state.error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div data-testid="sensory-empty" className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">☷</span>
            <p className="empty-state-title">{t('state.emptyTitle')}</p>
            <p className="empty-state-body">{t('state.emptyBody')}</p>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <Table aria-label={t('tableLabel')} data-testid="sensory-table">
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
                    data-testid={`sensory-row-${row.id}`}
                    style={row.readModel.releaseBlocked ? { background: 'var(--red-050a)' } : undefined}
                  >
                    <TableCell>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {row.subjectItemCode ?? row.subjectRef}
                      </span>
                      <div style={{ fontWeight: 500 }}>{row.subjectItemName ?? row.subjectRef}</div>
                    </TableCell>
                    <TableCell className="text-sm">{subjectTypeLabel(row.subjectType)}</TableCell>
                    <TableCell className="text-sm">
                      {row.policyRequired ? t('policy.required') : t('policy.optional')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="mono text-xs">{formatDate(row.evaluatedAt)}</span>
                      {row.evaluatedByName ? <div className="text-xs">{row.evaluatedByName}</div> : null}
                    </TableCell>
                    <TableCell>
                      <SensoryStatusBadge status={status} labels={statusLabels} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.readModel.blockedReason === SENSORIAL_BLOCKED ? (
                        <div data-testid="sensorial-blocked">
                          <span className="mono text-xs font-semibold text-red-700">{SENSORIAL_BLOCKED}</span>
                          {row.readModel.blockedDetail ? (
                            <div className="text-xs text-muted-foreground">{row.readModel.blockedDetail}</div>
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
        </div>
      )}

      <div role="note" data-testid="sensory-source-note" className="alert alert-blue">
        <span aria-hidden="true">ⓘ</span> {t('sourceNote')}
      </div>
    </main>
  );
}
