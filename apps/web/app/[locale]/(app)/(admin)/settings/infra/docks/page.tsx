/**
 * WAVE E5 — SCREEN /settings/infra/docks (mig 317 dock_doors).
 *
 * Dock-door management (list + add/edit: code, name, direction, warehouse).
 * Lives in the localized (admin) settings tree so the AppShell/AppSidebar wrap
 * it, and is registered in the settings infra nav group (settings-nav.ts).
 *
 * Prototype anchor: NONE EXISTS (no yard/dock prototype). Spec-driven;
 * prototype_match=false, nearest pattern = settings/infra/lines list+dialog.
 *
 * Real data only: dock doors come from the org-scoped listDockDoors action
 * (RBAC server-side — it THROWS `forbidden`, mapped to the permission-denied
 * state here); warehouses are read via withOrgContext. upsertDockDoor is passed
 * through to the client (which also re-gates server-side). No client-trusted
 * permission flag drives the write — `canManage` only hides the affordance; the
 * action re-checks.
 *
 * UI states: loading (handled by the dynamic page render), empty, error,
 * permission-denied (forbidden → amber note), optimistic (dialog pending +
 * disabled while the upsert runs).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listDockDoors, upsertDockDoor } from '../../../../(modules)/yard/_actions/yard-actions';
import { buildDocksLabels } from '../../../../(modules)/yard/_components/yard-labels';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { DocksView, type WarehouseOption } from './docks-view.client';
import type { DockDoorRow } from '../../../../(modules)/yard/_components/yard-shared';

export const dynamic = 'force-dynamic';

type DocksPageProps = {
  params: Promise<{ locale: string }>;
};

type WarehouseRow = { id: string; name: string };
type QueryResult<T> = { rows: T[] };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };

async function loadWarehouses(): Promise<WarehouseOption[]> {
  try {
    return await withOrgContext(async (ctx): Promise<WarehouseOption[]> => {
      const client = (ctx as { client: QueryClient }).client;
      const { rows } = await client.query<WarehouseRow>(
        `select id, name
           from public.warehouses
          where org_id = app.current_org_id()
          order by lower(name), id`,
      );
      return rows.map((row) => ({ id: row.id, name: row.name }));
    });
  } catch {
    return [];
  }
}

async function loadDocks(): Promise<{ state: 'ready' | 'empty' | 'forbidden' | 'error'; docks: DockDoorRow[] }> {
  try {
    const docks = await listDockDoors();
    return { state: docks.length === 0 ? 'empty' : 'ready', docks };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message === 'forbidden') return { state: 'forbidden', docks: [] };
    return { state: 'error', docks: [] };
  }
}

export default async function DocksPage({ params }: DocksPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Yard');

  const [{ state, docks }, warehouses] = await Promise.all([loadDocks(), loadWarehouses()]);
  // `canManage` only governs the affordance; upsertDockDoor re-checks the write
  // permission server-side, so a denied caller cannot mutate even if it forged
  // the flag. We expose the action to non-denied states (the upsert throws
  // `forbidden` if the caller lacks the write gate).
  const canManage = state !== 'forbidden';

  return (
    <main
      data-screen="settings-infra-docks"
      data-testid="settings-docks-page"
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6"
      aria-labelledby="settings-infra-docks-title"
    >
      <PageHeader
        title={t('docks.title')}
        subtitle={t('docks.subtitle')}
        breadcrumb={[
          { label: t('board.warehouse') },
          { label: t('docks.breadcrumb') },
        ]}
      />
      <h1 id="settings-infra-docks-title" className="sr-only">{t('docks.title')}</h1>
      <DocksView
        labels={buildDocksLabels(t)}
        initialDocks={docks}
        warehouses={warehouses}
        canManage={canManage}
        upsertDockDoorAction={upsertDockDoor}
        state={state}
      />
    </main>
  );
}
