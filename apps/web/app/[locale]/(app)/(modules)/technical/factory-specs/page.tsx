/**
 * T-060 — 03-technical Factory Specs list page (TEC-086) + entry to the Review
 * modal (TEC-085) and the FactorySpec+BOM bundle approval panel (T-090).
 *
 * Real Supabase-backed list of public.factory_specs (org-scoped via withOrgContext
 * + RLS) joined to the FG item master + paired shared-BOM SSOT version. Backing
 * domain is `factory_specs`/`internal_product_spec` — NOT a generic
 * reference_tables.specifications store (AC6). Loading / empty / error /
 * permission-denied / optimistic states are all rendered.
 *
 * Prototype parity:
 *   - `prototypes/design/Monopilot Design System/technical/other-screens.jsx:40-75`
 *     (`SpecsScreen`, TEC-086): PageHeader "+ New specification" + table
 *     Spec / Product / Category / Ver. / Shelf life / Storage / Status. Translated
 *     1:1 to shadcn Card + Table; the prototype's free-text Customer column is folded
 *     (no customer FK in factory_specs scope) and an Actions column carries the
 *     Review CTA. Legacy `FA*`/`SP-*` ids are red-lined to canonical FG + spec_code.
 *   - `prototypes/design/Monopilot Design System/technical/modals.jsx:460-483`
 *     (`SpecReviewModal`, TEC-085) → review-modal.client.tsx.
 *   - `prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:653-781`
 *     (`FactorySpecBomBundleApprovalModal`, T-090) → release-bundle-panel.client.tsx.
 * Evidence policy: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listFactorySpecs } from './_actions/list-factory-specs';
import type { FactorySpecListItem, FactorySpecStatus } from './_actions/shared';
import { CreateFactorySpecButton } from './_components/create-factory-spec-modal.client';
import { FactorySpecRowActions } from './_components/review-modal.client';

export const dynamic = 'force-dynamic';

// 5 semantic tones (MON-design-system rule 8).
const STATUS_TONE: Record<FactorySpecStatus, string> = {
  draft: 'badge-gray',
  in_review: 'badge-blue',
  approved_for_factory: 'badge-green',
  released_to_factory: 'badge-green',
  superseded: 'badge-amber',
  archived: 'badge-red',
};

function formatShelfLife(days: number | null): string {
  return days === null ? '—' : `${days} d`;
}

export default async function FactorySpecsPage() {
  const t = await getTranslations('Technical.factorySpecs');
  const tTechnical = await getTranslations('technical.dashboard.breadcrumb');
  const { specs, canApprove, canRecall, state } = await listFactorySpecs();

  const statusLabel = (status: FactorySpecStatus): string => t(`status.${status}`);

  return (
    <main data-screen="technical-factory-specs" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/technical">{tTechnical('technical')}</Link> / {t('title')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
        </div>
        {canApprove ? <CreateFactorySpecButton label={t('create.open')} /> : null}
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{t('error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">{t('empty.title')}</div>
            <div className="empty-state-body">{t('empty.body')}</div>
          </div>
        </div>
      ) : (
        <FactorySpecsTable
          specs={specs}
          canApprove={canApprove}
          canRecall={canRecall}
          statusLabel={statusLabel}
          shelfLifeLabel={formatShelfLife}
          reviewLabel={t('review')}
          tableLabel={t('title')}
          columns={{
            spec: t('col.spec'),
            product: t('col.product'),
            category: t('col.category'),
            version: t('col.version'),
            shelfLife: t('col.shelfLife'),
            status: t('col.status'),
            actions: t('col.actions'),
          }}
        />
      )}

      {!canApprove ? (
        <div role="status" className="alert alert-amber">
          <div className="alert-title">{t('permissionView')}</div>
        </div>
      ) : null}
    </main>
  );
}

function FactorySpecsTable({
  specs,
  canApprove,
  canRecall,
  statusLabel,
  shelfLifeLabel,
  reviewLabel,
  tableLabel,
  columns,
}: {
  specs: FactorySpecListItem[];
  canApprove: boolean;
  canRecall: boolean;
  statusLabel: (status: FactorySpecStatus) => string;
  shelfLifeLabel: (days: number | null) => string;
  reviewLabel: string;
  tableLabel: string;
  columns: {
    spec: string;
    product: string;
    category: string;
    version: string;
    shelfLife: string;
    status: string;
    actions: string;
  };
}) {
  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table aria-label={tableLabel}>
        <thead>
          <tr>
            <th scope="col">{columns.spec}</th>
            <th scope="col">{columns.product}</th>
            <th scope="col">{columns.category}</th>
            <th scope="col">{columns.version}</th>
            <th scope="col">{columns.shelfLife}</th>
            <th scope="col">{columns.status}</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              {columns.actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {specs.map((spec) => (
            <tr key={spec.id}>
              <td className="mono">{spec.specCode}</td>
              <td style={{ fontWeight: 500 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{spec.fgItemCode}</span>{' '}
                {spec.fgName}
              </td>
              <td>{spec.productGroup ?? '—'}</td>
              <td className="mono">v{spec.version}</td>
              <td className="mono">{shelfLifeLabel(spec.shelfLifeDays)}</td>
              <td>
                <span className={`badge ${STATUS_TONE[spec.status]}`}>{statusLabel(spec.status)}</span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <FactorySpecRowActions spec={spec} canApprove={canApprove} canRecall={canRecall} reviewLabel={reviewLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
