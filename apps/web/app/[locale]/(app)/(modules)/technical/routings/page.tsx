/**
 * 03-technical Routing list + edit (TEC-060, T-051) and Routing cost preview +
 * resource utilization (TEC-062, T-052) page.
 *
 * Real Supabase-backed (org-scoped via withOrgContext + RLS). The server
 * component loads the item list + line/machine/operation references + the
 * routing RBAC gates; the client island renders the item picker, the routing
 * version list, the create/edit modal (ordered operations bound to a real
 * line/machine FK and a manufacturing-operation name), and the NUMERIC-exact
 * cost preview + resource utilization view. Loading / empty / error /
 * permission-denied states are all rendered.
 *
 * Rebuilt to MON-design-system (lane A2): breadcrumb + `.page-title` + muted
 * desc, `.card`/`.alert`/`.empty-state`; copy via next-intl (technical.routings).
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:4-34
 *     (`RoutingsScreen`) + other-screens.jsx:1270-1287 (product-detail Routing tab
 *     version list) — routing list.
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:271-304
 *     (`RoutingStepAddModal`) — the operation editor.
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *     (`CostingScreen`) — the cost breakdown / utilization panel.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listRoutingItems } from './_actions/list-routing-items';
// ROUTINGS_DEFAULT_LABELS must come from the PLAIN module — importing it from
// the 'use client' manager module hands this Server Component a client-reference
// proxy whose Object.keys() are NOT the label keys, which blanked every label
// in the builder (W9-L5 FIX 3, 2026-06-11 clickthrough §2).
import { ROUTINGS_DEFAULT_LABELS, type RoutingsLabels } from './_components/routings-labels';
import { RoutingsManager } from './_components/routings-manager.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildLabels(t: Translator): RoutingsLabels {
  const keys = Object.keys(ROUTINGS_DEFAULT_LABELS) as Array<keyof RoutingsLabels>;
  return keys.reduce((acc, key) => {
    try {
      const value = t(`manager.${key}`);
      // next-intl echoes the (full) message path for a missing key.
      acc[key] = !value || value.endsWith(`manager.${key}`) ? ROUTINGS_DEFAULT_LABELS[key] : value;
    } catch {
      acc[key] = ROUTINGS_DEFAULT_LABELS[key];
    }
    return acc;
  }, {} as RoutingsLabels);
}

export default async function TechnicalRoutingsPage() {
  const { items, lines, machines, operationNames, canWrite, canApprove, state } = await listRoutingItems();
  const t = await getTranslations('technical.routings');
  const labels = buildLabels(t);

  return (
    <main data-screen="technical-routings" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/technical">{t('breadcrumbRoot')}</Link> / {t('title')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
        </div>
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{t('error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon">🧭</div>
            <div className="empty-state-title">{t('empty.title')}</div>
            <div className="empty-state-body">{t('empty.body')}</div>
          </div>
        </div>
      ) : (
        <RoutingsManager
          items={items}
          lines={lines}
          machines={machines}
          operationNames={operationNames}
          canWrite={canWrite}
          canApprove={canApprove}
          labels={labels}
        />
      )}
    </main>
  );
}
