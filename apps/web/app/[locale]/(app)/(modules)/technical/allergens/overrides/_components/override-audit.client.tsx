'use client';

/**
 * T-049 — TEC-044 Allergen Manual Override Audit panel (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:309-347
 *   (AllergenDeclarationModal, override variant) — clicking a row re-opens the
 *   declaration modal pre-filled with the override's allergen + reason.
 *
 * Renders the APPEND-ONLY override history (public.item_allergen_profile_overrides)
 * — one immutable row per (item × allergen × actor × timestamp). The panel is
 * read-only over the ledger itself (the table grants only SELECT/INSERT, no
 * UPDATE/DELETE); the "Review / re-override" action opens the write path
 * (saveAllergenOverride) which requires technical.allergens.edit + a reason
 * (V-TEC-42). Save is disabled for callers without the permission.
 *
 * Two scopes share this component:
 *   - scope='item'      → a card on the item-detail Allergens tab (no Item column);
 *   - scope='aggregate' → the cross-item view at /technical/allergens/overrides.
 *
 * Five UI states: loading / empty / error / permission-denied / ready.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import {
  AllergenDeclarationModal,
  type AllergenDeclarationLabels,
  type AllergenChoice,
  type DeclarationDraft,
  type DeclarationSaveResult,
} from '../../../items/[item_code]/_components/allergen-declaration-modal';

export type OverrideAuditState = 'ready' | 'empty' | 'error' | 'loading' | 'permission_denied';

export type OverrideAuditLabels = {
  title: string;
  subtitle: string;
  colItem: string;
  colAllergen: string;
  colAction: string;
  colIntensity: string;
  colReason: string;
  colActor: string;
  colTimestamp: string;
  actionSet: string;
  actionClear: string;
  actionAdjustIntensity: string;
  actionAdjustConfidence: string;
  reviewCta: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  intensity: Record<string, string>;
};

export type OverrideAuditEntry = {
  id: string;
  itemCode: string;
  allergenCode: string;
  action: string;
  intensity: string | null;
  confidence: string | null;
  reason: string;
  overriddenAt: string;
  overriddenBy: string | null;
};

type ActionLabelKey = 'actionSet' | 'actionClear' | 'actionAdjustIntensity' | 'actionAdjustConfidence';

const ACTION_LABEL_KEY: Record<string, ActionLabelKey> = {
  set: 'actionSet',
  clear: 'actionClear',
  adjust_intensity: 'actionAdjustIntensity',
  adjust_confidence: 'actionAdjustConfidence',
};

function actionLabel(labels: OverrideAuditLabels, action: string): string {
  return labels[ACTION_LABEL_KEY[action] ?? 'actionSet'];
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 16);
}

export function OverrideAuditPanel({
  rows,
  labels,
  state,
  canReview,
  scope,
  declarationLabels,
  allergens,
  saveOverrideAction,
}: {
  rows: OverrideAuditEntry[];
  labels: OverrideAuditLabels;
  state: OverrideAuditState;
  canReview: boolean;
  scope: 'item' | 'aggregate';
  /** Declaration-modal labels + choices + action — required for the re-override path. */
  declarationLabels?: AllergenDeclarationLabels;
  allergens?: AllergenChoice[];
  saveOverrideAction?: (
    draft: DeclarationDraft & { itemCode: string },
  ) => Promise<DeclarationSaveResult>;
}) {
  const router = useRouter();
  const [active, setActive] = React.useState<OverrideAuditEntry | null>(null);

  if (state === 'loading') {
    return (
      <section data-testid="override-audit-panel" data-state="loading" className="card">
        <div role="status" className="text-sm text-muted-foreground">
          {labels.loading}
        </div>
      </section>
    );
  }
  if (state === 'permission_denied') {
    return (
      <section data-testid="override-audit-panel" data-state="permission_denied">
        <div role="alert" className="alert alert-amber">
          <div className="alert-title">{labels.forbidden}</div>
        </div>
      </section>
    );
  }
  if (state === 'error') {
    return (
      <section data-testid="override-audit-panel" data-state="error">
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{labels.error}</div>
        </div>
      </section>
    );
  }

  const canReReview = canReview && Boolean(declarationLabels) && Boolean(saveOverrideAction);

  async function handleSave(draft: DeclarationDraft): Promise<DeclarationSaveResult> {
    if (!saveOverrideAction || !active) return { ok: false, error: 'persistence_failed' };
    const result = await saveOverrideAction({ ...draft, itemCode: active.itemCode });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <section
      data-testid="override-audit-panel"
      data-state={state}
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <header className="card-head" style={{ marginBottom: 0, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 className="card-title">{labels.title}</h2>
          <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div data-testid="override-audit-empty" className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">⊘</span>
          <p className="empty-state-title">{labels.empty}</p>
          <p className="empty-state-body">{labels.emptyBody}</p>
        </div>
      ) : (
        <Table aria-label={labels.title}>
          <TableHeader>
            <TableRow>
              {scope === 'aggregate' ? <TableHead scope="col">{labels.colItem}</TableHead> : null}
              <TableHead scope="col">{labels.colAllergen}</TableHead>
              <TableHead scope="col">{labels.colAction}</TableHead>
              <TableHead scope="col">{labels.colIntensity}</TableHead>
              <TableHead scope="col">{labels.colReason}</TableHead>
              <TableHead scope="col">{labels.colActor}</TableHead>
              <TableHead scope="col">{labels.colTimestamp}</TableHead>
              {canReReview ? <TableHead scope="col" className="text-right" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`override-row-${r.id}`}>
                {scope === 'aggregate' ? (
                  <TableCell className="font-mono text-xs">{r.itemCode}</TableCell>
                ) : null}
                <TableCell className="font-medium">{r.allergenCode}</TableCell>
                <TableCell>
                  <Badge variant={r.action === 'clear' ? 'muted' : 'warning'}>
                    {actionLabel(labels, r.action)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {r.intensity ? (labels.intensity[r.intensity] ?? r.intensity) : '—'}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={r.reason}>
                  {r.reason}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.overriddenBy ? r.overriddenBy.slice(0, 8) : '—'}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatTs(r.overriddenAt)}
                </TableCell>
                {canReReview ? (
                  <TableCell className="text-right">
                    <button
                      type="button"
                      data-testid={`override-review-${r.id}`}
                      className="btn btn-secondary btn-sm"
                      onClick={() => setActive(r)}
                    >
                      {labels.reviewCta}
                    </button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canReReview && declarationLabels ? (
        <AllergenDeclarationModal
          open={active !== null}
          onClose={() => setActive(null)}
          labels={declarationLabels}
          allergens={allergens ?? []}
          initial={
            active
              ? {
                  allergenCode: active.allergenCode,
                  intensity: active.intensity ?? 'contains',
                  confidence: active.confidence ?? 'declared',
                  reason: active.reason,
                }
              : undefined
          }
          canEdit={canReview}
          onSave={handleSave}
        />
      ) : null}
    </section>
  );
}
