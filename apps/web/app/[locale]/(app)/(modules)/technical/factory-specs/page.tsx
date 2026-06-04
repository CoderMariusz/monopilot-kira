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

import { getTranslations } from 'next-intl/server';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { listFactorySpecs } from './_actions/list-factory-specs';
import type { FactorySpecListItem, FactorySpecStatus } from './_actions/shared';
import { FactorySpecRowActions } from './_components/review-modal.client';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<FactorySpecStatus, BadgeVariant> = {
  draft: 'muted',
  in_review: 'info',
  approved_for_factory: 'success',
  released_to_factory: 'success',
  superseded: 'warning',
  archived: 'muted',
};

function formatShelfLife(days: number | null): string {
  return days === null ? '—' : `${days} d`;
}

export default async function FactorySpecsPage() {
  const t = await getTranslations('Technical.factorySpecs');
  const { specs, canApprove, state } = await listFactorySpecs();

  const statusLabel = (status: FactorySpecStatus): string => t(`status.${status}`);

  return (
    <main
      data-screen="technical-factory-specs"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </header>

      {state === 'error' ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {t('error')}
        </div>
      ) : state === 'empty' ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardHeader className="space-y-1 px-6 py-6">
            <h2 className="text-lg font-semibold tracking-tight">{t('empty.title')}</h2>
            <CardDescription className="text-sm text-muted-foreground">
              {t('empty.body')}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <FactorySpecsTable
          specs={specs}
          canApprove={canApprove}
          statusLabel={statusLabel}
          shelfLifeLabel={formatShelfLife}
          reviewLabel={t('review')}
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
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('permissionView')}
        </div>
      ) : null}
    </main>
  );
}

function FactorySpecsTable({
  specs,
  canApprove,
  statusLabel,
  shelfLifeLabel,
  reviewLabel,
  columns,
}: {
  specs: FactorySpecListItem[];
  canApprove: boolean;
  statusLabel: (status: FactorySpecStatus) => string;
  shelfLifeLabel: (days: number | null) => string;
  reviewLabel: string;
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
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardContent className="p-0">
        <Table aria-label="Factory specifications">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{columns.spec}</TableHead>
              <TableHead scope="col">{columns.product}</TableHead>
              <TableHead scope="col">{columns.category}</TableHead>
              <TableHead scope="col">{columns.version}</TableHead>
              <TableHead scope="col">{columns.shelfLife}</TableHead>
              <TableHead scope="col">{columns.status}</TableHead>
              <TableHead scope="col" className="text-right">
                {columns.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {specs.map((spec) => (
              <TableRow key={spec.id}>
                <TableCell className="font-mono text-sm">{spec.specCode}</TableCell>
                <TableCell className="font-medium">
                  <span className="font-mono text-xs text-muted-foreground">{spec.fgItemCode}</span>{' '}
                  {spec.fgName}
                </TableCell>
                <TableCell className="text-sm">{spec.productGroup ?? '—'}</TableCell>
                <TableCell className="font-mono text-sm">v{spec.version}</TableCell>
                <TableCell className="font-mono text-sm">{shelfLifeLabel(spec.shelfLifeDays)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[spec.status]}>{statusLabel(spec.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <FactorySpecRowActions
                    spec={spec}
                    canApprove={canApprove}
                    reviewLabel={reviewLabel}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
