/**
 * Allergen matrix screen — /technical/allergens-config.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:78-132 (AllergenScreen). At-a-glance allergen presence
 *   across all active products: product rows × EU-14 allergen columns, cell =
 *   contains (red ●) / may contain (amber ⚠) / absent. Read-only viewer (edits
 *   happen in Product Detail → Allergens). See _meta/atomic-tasks/
 *   UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Real Supabase data via withOrgContext + RLS (loadAllergenMatrix); no mocks.
 * Five states: loading (Suspense skeleton), empty, error, permission-denied, ready.
 * (No optimistic state — this surface is read-only.)
 */

import { type CSSProperties, Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { loadAllergenMatrix, type MatrixCell } from './_actions/load-matrix';

export const dynamic = 'force-dynamic';

function MatrixSkeleton() {
  return (
    <div data-testid="allergen-matrix-loading" aria-busy="true" className="card">
      <div className="h-72 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

function cellStyle(cell: MatrixCell): CSSProperties {
  const bg = cell === 2 ? 'var(--red)' : cell === 1 ? 'var(--amber)' : 'var(--gray-100)';
  return {
    width: 20,
    height: 20,
    margin: '0 auto',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: '#fff',
    fontWeight: 600,
    background: bg,
    border: cell === 0 ? '1px solid var(--border)' : undefined,
  };
}

async function MatrixContent() {
  const t = await getTranslations('technical.allergens.matrix');
  const result = await loadAllergenMatrix();

  if (result.state === 'denied') {
    return (
      <div role="alert" data-testid="allergen-matrix-denied" className="alert alert-amber">
        <span aria-hidden="true">△</span>
        <div className="alert-title">{t('denied')}</div>
      </div>
    );
  }

  if (result.state === 'error') {
    return (
      <div role="alert" data-testid="allergen-matrix-error" className="alert alert-red">
        <span aria-hidden="true">⚠</span>
        <div className="alert-title">{t('error')}</div>
      </div>
    );
  }

  if (result.state === 'empty') {
    return (
      <div data-testid="allergen-matrix-empty" className="card">
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">⚠</span>
          <p className="empty-state-title">{t('empty')}</p>
          <p className="empty-state-body">{t('emptyBody')}</p>
        </div>
      </div>
    );
  }

  const { columns, rows } = result;

  return (
    <>
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'auto',
        }}
      >
        <table className="table" data-testid="allergen-matrix-table">
          <thead>
            <tr>
              <th scope="col" style={{ minWidth: 220 }}>
                {t('colProduct')}
              </th>
              {columns.map((c) => (
                <th
                  key={c.code}
                  scope="col"
                  title={c.name}
                  style={{
                    textAlign: 'center',
                    fontSize: 10,
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    padding: '10px 4px',
                    height: 100,
                  }}
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemCode}>
                <td>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {r.itemCode}
                  </span>
                  <div style={{ fontWeight: 500 }}>{r.itemName}</div>
                </td>
                {r.cells.map((cell, j) => {
                  const label =
                    cell === 2
                      ? t('legend.contains')
                      : cell === 1
                        ? t('legend.mayContain')
                        : t('legend.absent');
                  return (
                    <td key={columns[j].code} style={{ textAlign: 'center', padding: 4 }}>
                      <div style={cellStyle(cell)} aria-label={`${columns[j].name}: ${label}`}>
                        <span aria-hidden="true">{cell === 2 ? '●' : cell === 1 ? '⚠' : ''}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500" data-testid="allergen-matrix-legend">
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--red)', borderRadius: 2 }} aria-hidden="true" />
          {t('legend.contains')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--amber)', borderRadius: 2 }} aria-hidden="true" />
          {t('legend.mayContain')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: 2 }} aria-hidden="true" />
          {t('legend.absent')}
        </span>
      </div>
    </>
  );
}

export default async function AllergenMatrixPage() {
  const t = await getTranslations('technical.allergens.matrix');

  return (
    <main data-screen="technical-allergen-matrix" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.matrix') }]}
      />
      <Suspense fallback={<MatrixSkeleton />}>
        <MatrixContent />
      </Suspense>
    </main>
  );
}
