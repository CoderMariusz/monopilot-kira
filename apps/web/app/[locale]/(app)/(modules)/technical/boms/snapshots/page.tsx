/**
 * 03-technical · TEC-025 BOM Snapshots Viewer (T-086, spec-driven) page.
 *
 * Spec-driven Wave0 surface — PRD §7.5 + prototypes/design/03-TECHNICAL-UX.md are
 * canonical; layout-primitive prototype anchors
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:223-303
 *     (`bom_snapshots_viewer_screen`)
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:307-354
 *     (`bom_snapshot_diff_modal`).
 * Does NOT claim 1:1 visual parity.
 *
 * Real Supabase-backed: lists immutable public.bom_snapshots org-scoped
 * (withOrgContext + RLS) and computes the JSON-flatten diff vs the current
 * canonical BOM server-side. Strictly read-only — snapshots are immutable.
 * UI states: loading (RSC) / empty / error / populated. There is no write
 * surface, so there is no permission-denied write gate.
 */

import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';

import { listBomSnapshots } from './_actions/list-snapshots';
import { diffBomSnapshot } from './_actions/diff-snapshot';
import { SnapshotsViewer, type SnapshotsViewerLabels } from './_components/snapshots-viewer.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildLabels(t: Translator): SnapshotsViewerLabels {
  return {
    immutableBanner: t('immutableBanner'),
    orphanedNote: t('orphanedNote'),
    searchPlaceholder: t('searchPlaceholder'),
    filterAll: t('filter.all'),
    filterInUse: t('filter.inUse'),
    filterClosed: t('filter.closed'),
    filterOrphaned: t('filter.orphaned'),
    colSnapshot: t('col.snapshot'),
    colVersion: t('col.version'),
    colWo: t('col.wo'),
    colFg: t('col.fg'),
    colLines: t('col.lines'),
    colTaken: t('col.taken'),
    colStatus: t('col.status'),
    diffCta: t('diffCta'),
    noMatches: t('noMatches'),
    modalTitle: t('modal.title'),
    modalReadOnly: t('modal.readOnly'),
    diffColKind: t('modal.col.kind'),
    diffColPath: t('modal.col.path'),
    diffColFrozen: t('modal.col.frozen'),
    diffColCurrent: t('modal.col.current'),
    diffLoading: t('modal.loading'),
    diffError: t('modal.error'),
    diffEmpty: t('modal.empty'),
    close: t('modal.close'),
    noWo: t('noWo'),
  };
}

export default async function TechnicalBomSnapshotsPage() {
  const { snapshots, state } = await listBomSnapshots();
  const t = await getTranslations('technical.bomSnapshots');
  const labels = buildLabels(t);

  return (
    <main data-screen="technical-bom-snapshots" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('breadcrumb')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {state === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {t('error')}
        </div>
      ) : state === 'empty' ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardHeader className="space-y-1 px-6 py-6">
            <h2 className="text-lg font-semibold tracking-tight">{t('empty.title')}</h2>
            <CardDescription className="text-sm text-muted-foreground">{t('empty.body')}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <SnapshotsViewer snapshots={snapshots} diffAction={diffBomSnapshot} labels={labels} />
      )}
    </main>
  );
}
