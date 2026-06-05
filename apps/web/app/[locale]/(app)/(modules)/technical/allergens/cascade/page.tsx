/**
 * Allergen cascade preview screen — /technical/allergens/cascade.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:1370-1431 (AllergenCascadeScreen). READ-ONLY visualization
 *   of the RM → Intermediate → Process → FG allergen derivation chain
 *   (EU 1169/2011, PRD §10.2). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Consumes the MATERIALIZED FG allergen set + the NPD boundary value read-only
 * (loadAllergenCascade) — no recompute, no write, no mocks. Edits happen in
 * Product detail → Allergens. Five states: loading (Suspense), empty, error,
 * permission-denied, ready. (No optimistic state — read-only surface.)
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { loadAllergenCascade, type ChainNode } from './_actions/load-cascade';

export const dynamic = 'force-dynamic';

const LEVEL_BADGE: Record<ChainNode['level'], string> = {
  RM: 'badge-gray',
  Intermediate: 'badge-blue',
  Process: 'badge-blue',
  FG: 'badge-green',
};

function CascadeSkeleton() {
  return (
    <div data-testid="cascade-loading" aria-busy="true" className="flex flex-col gap-3">
      <div className="h-16 animate-pulse rounded border border-slate-200 bg-slate-100" />
      <div className="h-48 animate-pulse rounded border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function CascadeContent() {
  const t = await getTranslations('technical.allergens.cascade');
  const result = await loadAllergenCascade();

  if (result.state === 'denied') {
    return (
      <div role="alert" data-testid="cascade-denied" className="alert alert-amber">
        <div className="alert-title">{t('denied')}</div>
      </div>
    );
  }
  if (result.state === 'error') {
    return (
      <div role="alert" data-testid="cascade-error" className="alert alert-red">
        <div className="alert-title">{t('error')}</div>
      </div>
    );
  }
  if (result.state === 'empty') {
    return (
      <div data-testid="cascade-empty" className="card">
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">⇣</span>
          <p className="empty-state-title">{t('empty')}</p>
          <p className="empty-state-body">{t('emptyBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="cascade-list">
      {/* Cascade-rule explainer (PRD §10.2). */}
      <div className="alert alert-blue" data-testid="cascade-rule-note">
        <span aria-hidden="true">ⓘ</span>{' '}
        <span>
          <b>{t('ruleTitle')}</b> <span className="mono">allergen_cascade_rm_to_fa</span> — {t('ruleBody')}
        </span>
      </div>

      {result.products.map((p) => (
        <section
          key={p.itemCode}
          data-testid={`cascade-product-${p.itemCode}`}
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 14,
          }}
        >
          <div className="flex items-baseline gap-2">
            <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
              {p.itemCode}
            </span>
            <strong style={{ fontSize: 13 }}>{p.itemName}</strong>
            {p.bomVersionLabel ? (
              <span className="mono text-xs text-muted-foreground">· {p.bomVersionLabel}</span>
            ) : null}
          </div>

          {/* Final allergen profile. */}
          <div className="mt-2.5 text-xs uppercase tracking-wide text-muted-foreground">
            {t('finalTitle')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" data-testid={`cascade-final-${p.itemCode}`}>
            {p.finalAllergens.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t('noFinal')}</span>
            ) : (
              p.finalAllergens.map((a) => {
                const contains = a.intensity === 'contains';
                return (
                  <div
                    key={a.code}
                    style={{
                      padding: '6px 10px',
                      background: contains ? 'var(--red-050a)' : 'var(--amber-050a)',
                      borderRadius: 6,
                      fontSize: 12,
                      border: `1px solid ${contains ? 'var(--red)' : 'var(--amber)'}`,
                    }}
                  >
                    <b>{a.name}</b>{' '}
                    <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                      · {a.code}
                    </span>
                    <span className={`badge ${contains ? 'badge-red' : 'badge-amber'}`} style={{ marginLeft: 6, fontSize: 9 }}>
                      {contains ? t('intensity.contains') : t('intensity.mayContain')}
                    </span>
                    <span className="text-muted-foreground" style={{ fontSize: 10, marginLeft: 4 }}>
                      ({t(`source.${a.source}` as 'source.cascaded')})
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Derivation chain timeline. */}
          <div className="mt-3.5 text-xs uppercase tracking-wide text-muted-foreground">
            {t('chainTitle')}
          </div>
          <div style={{ marginTop: 10, position: 'relative', paddingLeft: 18 }}>
            <div style={{ position: 'absolute', left: 8, top: 12, bottom: 12, width: 2, background: 'var(--border)' }} aria-hidden="true" />
            {p.chain.map((node, i) => (
              <div
                key={`${node.level}-${node.code}-${i}`}
                style={{ position: 'relative', marginBottom: i < p.chain.length - 1 ? 14 : 0, paddingLeft: 18 }}
                data-testid={`cascade-node-${p.itemCode}-${node.code}`}
              >
                <div
                  style={{ position: 'absolute', left: -8, top: 6, width: 14, height: 14, background: '#fff', border: '2px solid var(--blue)', borderRadius: '50%' }}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2">
                  <span className={`badge ${LEVEL_BADGE[node.level]}`} style={{ fontSize: 10 }}>
                    {t(`level.${node.level}` as 'level.RM')}
                  </span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                    {node.code}
                  </span>
                  <span style={{ fontSize: 13 }}>{node.name}</span>
                </div>
                {node.detail ? <div className="text-muted-foreground" style={{ fontSize: 11, marginTop: 2 }}>{node.detail}</div> : null}
                {node.contributes.length > 0 ? (
                  <div style={{ marginTop: 4, fontSize: 11 }}>
                    <span className="text-muted-foreground">{t('contributes')} </span>
                    {node.contributes.map((a) => (
                      <span key={a.code} className="badge badge-red" style={{ fontSize: 9, marginRight: 4 }}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="alert alert-amber" data-testid="cascade-brcgs-note">
        <span aria-hidden="true">△</span> {t('brcgsNote')}
      </div>
    </div>
  );
}

export default async function AllergenCascadePage() {
  const t = await getTranslations('technical.allergens.cascade');

  return (
    <main data-screen="technical-allergen-cascade" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.technical') },
          { label: t('breadcrumb.compliance') },
          { label: t('breadcrumb.cascade') },
        ]}
      />
      <Suspense fallback={<CascadeSkeleton />}>
        <CascadeContent />
      </Suspense>
    </main>
  );
}
