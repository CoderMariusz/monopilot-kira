/**
 * N1-A — Change Control (ECO) list screen.
 *
 * Real Supabase-backed list of public.technical_change_orders (org-scoped via
 * withOrgContext + RLS `app.current_org_id()`, migration 229), the canonical
 * Engineering Change Order register. Status machine is
 * draft → approved → implementing → closed, enforced server-side + by DB CHECKs;
 * the UI only ever offers the one transition legal for a row's current status.
 * All five UI states (loading via Suspense/streaming, empty, error,
 * permission-denied, optimistic-via-router.refresh) are rendered.
 *
 * Prototype parity:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:132-180
 *     (`EcoScreen`, "Change control (ECO)"): PageHeader "+ New ECO" + `.pills`
 *     status strip + table (ECO / Title / Affects / Author / Opened / Priority /
 *     Status). Translated 1:1 to the design-system Card + Table; the prototype's
 *     hardcoded "Author/Opened" columns are folded into canonical updatedAt +
 *     lineCount (no author FK surfaced in the summary read model), and the
 *     pills map to the canonical status machine (All/Draft/Approved/
 *     Implementing/Closed) instead of the prototype's Open/Closed/All.
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:352-414
 *     (`EcoChangeRequestModal`) → create-eco-modal.client.tsx.
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:417-455
 *     (`EcoApprovalModal`) → the approve transition in eco-detail-drawer.client.tsx.
 * Evidence policy: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * RBAC: both `technical.eco.write` (list/create/transition) and
 * `technical.eco.approve` (approve) are resolved SERVER-SIDE in loadEcoPage and
 * passed as props — never client-trusted.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { EcoSummary } from './_actions/shared';
import { loadEcoPage } from './_actions/page-data';
import { CreateEcoButton } from './_components/create-eco-modal.client';
import { EcoDetailButton } from './_components/eco-detail-drawer.client';
import { EcoFilterPills } from './_components/eco-filter-pills.client';
import { ECO_FILTERS, type EcoFilter, ECO_PRIORITY_BADGE, ECO_STATUS_BADGE } from './_components/eco-ui';
import { ListPaginationFooter } from '../../../../../../lib/shared/list-pagination-footer';

export const dynamic = 'force-dynamic';

function safeLabel(t: Awaited<ReturnType<typeof getTranslations>>, key: string, fallback: string): string {
  try {
    const value = t(key);
    return value === key || value.endsWith(`.${key}`) ? fallback : value;
  } catch {
    return fallback;
  }
}

function asFilter(value: string | string[] | undefined): EcoFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v && (ECO_FILTERS as readonly string[]).includes(v) ? (v as EcoFilter) : 'all';
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function ecoPageHref(locale: string, filter: EcoFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('status', filter);
  if (page > 1) params.set('page', String(page));
  const q = params.toString();
  return q ? `/${locale}/technical/eco?${q}` : `/${locale}/technical/eco`;
}

export default async function EcoPage({
  params = Promise.resolve({ locale: 'en' }),
  searchParams,
}: {
  params?: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string | string[]; page?: string | string[] }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('Technical.eco');
  const sp = await searchParams;
  const filter = asFilter(sp.status);
  const page = parsePage(sp.page);
  const tl = (key: string, fallback: string) => safeLabel(t, key, fallback);

  const { changeOrders, pagination, items, counts, canWrite, canApprove, state } = await loadEcoPage(
    filter === 'all' ? undefined : filter,
    page,
  );

  return (
    <main data-screen="technical-eco" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href={`/${locale}/technical`}>Technical</Link> / {tl('breadcrumb', 'Change control')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{tl('title', 'Change control (ECO)')}</h1>
          <p className="helper mt-1 max-w-3xl">
            {tl(
              'subtitle',
              'Engineering Change Orders — all recipe, process, packaging and supplier changes flow through here.',
            )}
          </p>
        </div>
        {canWrite ? <CreateEcoButton items={items} label={tl('create.open', '+ New ECO')} /> : null}
      </header>

      {state === 'forbidden' ? (
        <div role="alert" className="alert alert-amber">
          <div className="alert-title">
            {tl('permissionDenied', 'You do not have permission to view change control.')}
          </div>
        </div>
      ) : (
        <>
          <EcoFilterPills active={filter} counts={counts} />

          {state === 'error' ? (
            <div role="alert" className="alert alert-red">
              <div className="alert-title">{tl('error', 'The change orders could not be loaded.')}</div>
            </div>
          ) : state === 'empty' ? (
            <div className="card" style={{ padding: 0 }}>
              <div className="empty-state">
                <div className="empty-state-icon">🗂️</div>
                <div className="empty-state-title">{tl('empty.title', 'No change orders')}</div>
                <div className="empty-state-body">
                  {tl('empty.body', 'Open an ECO to track a recipe, process, packaging or supplier change.')}
                </div>
              </div>
            </div>
          ) : (
            <>
              <EcoTable
                orders={changeOrders}
                canApprove={canApprove}
                statusLabel={(s) => tl(`status.${s}`, s)}
                priorityLabel={(p) => tl(`priority.${p}`, p)}
                detailLabel={tl('open', 'Open')}
                columns={{
                  code: tl('col.code', 'ECO'),
                  title: tl('col.title', 'Title'),
                  changeType: tl('col.changeType', 'Impact'),
                  lines: tl('col.lines', 'Lines'),
                  updated: tl('col.updated', 'Updated'),
                  priority: tl('col.priority', 'Priority'),
                  status: tl('col.status', 'Status'),
                  actions: tl('col.actions', 'Actions'),
                }}
              />
              <ListPaginationFooter
                shown={pagination.offset + changeOrders.length}
                total={pagination.total}
                previousHref={pagination.page > 1 ? ecoPageHref(locale, filter, pagination.page - 1) : null}
                nextHref={pagination.hasMore ? ecoPageHref(locale, filter, pagination.page + 1) : null}
                labels={{
                  showing: tl('pagination.showing', 'Showing {shown} of {total}'),
                  previous: tl('pagination.previous', 'Previous'),
                  next: tl('pagination.next', 'Next'),
                }}
                testId="eco-list-pagination"
              />
            </>
          )}
        </>
      )}
    </main>
  );
}

function EcoTable({
  orders,
  canApprove,
  statusLabel,
  priorityLabel,
  detailLabel,
  columns,
}: {
  orders: EcoSummary[];
  canApprove: boolean;
  statusLabel: (status: EcoSummary['status']) => string;
  priorityLabel: (priority: string) => string;
  detailLabel: string;
  columns: {
    code: string;
    title: string;
    changeType: string;
    lines: string;
    updated: string;
    priority: string;
    status: string;
    actions: string;
  };
}) {
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table aria-label="Change orders">
        <thead>
          <tr>
            <th scope="col">{columns.code}</th>
            <th scope="col">{columns.title}</th>
            <th scope="col">{columns.changeType}</th>
            <th scope="col">{columns.lines}</th>
            <th scope="col">{columns.updated}</th>
            <th scope="col">{columns.priority}</th>
            <th scope="col">{columns.status}</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              {columns.actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="mono">{order.code}</td>
              <td style={{ fontWeight: 500 }}>{order.title}</td>
              <td style={{ fontSize: 12 }}>{order.changeType}</td>
              <td className="mono">{order.lineCount}</td>
              <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {order.updatedAt.slice(0, 10)}
              </td>
              <td>
                <span className={`badge ${ECO_PRIORITY_BADGE[order.priority] ?? 'badge-gray'}`}>
                  {priorityLabel(order.priority)}
                </span>
              </td>
              <td>
                <span className={`badge ${ECO_STATUS_BADGE[order.status]}`}>{statusLabel(order.status)}</span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <EcoDetailButton id={order.id} canApprove={canApprove} openLabel={detailLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
