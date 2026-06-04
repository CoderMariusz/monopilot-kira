'use client';

/**
 * T-047 — TEC-040 Allergen Profile Editor tab (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:309-347
 *   (`AllergenDeclarationModal`) — the editor's declaration/override modal.
 *   The cascade-preview list restates the prototype's "Auto-suggestions come from
 *   BOM component allergen flags" banner as a per-source badge list.
 *
 * Behaviour:
 *   - Renders each allergen badge under its SOURCE label (cascaded / supplier_spec
 *     / lab_result / brief_declared / manual_override) — cascade preview AC.
 *   - Auto-cascaded badges (source='cascaded') are READ-ONLY: no Override control
 *     is shown beyond the additive declaration path; the override never clears the
 *     cascade source (enforced server-side, V-TEC-42).
 *   - "Declare / override" opens the AllergenDeclarationModal; Save is disabled for
 *     callers without technical.allergens.edit.
 *   - Five UI states: loading / empty / error / permission-denied / ready+optimistic.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';

import {
  AllergenDeclarationModal,
  type AllergenDeclarationLabels,
  type DeclarationDraft,
  type DeclarationSaveResult,
} from './allergen-declaration-modal';
import { SOURCE_VARIANT, isCascaded } from './allergen-options';
import type {
  AllergenProfileEditorData,
  ProfileBadge,
  AllergenRef,
} from '../_actions/allergen-profile';

export type AllergensTabState = 'ready' | 'empty' | 'error' | 'loading' | 'permission_denied';

export type AllergensTabLabels = {
  title: string;
  subtitle: string;
  declareCta: string;
  sourceHeading: Record<string, string>;
  readOnlyTag: string;
  overrideTag: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  intensity: Record<string, string>;
  modal: AllergenDeclarationLabels;
};

export type AllergensTabProps = {
  data: AllergenProfileEditorData | null;
  labels: AllergensTabLabels;
  state: AllergensTabState;
  canEdit: boolean;
  /** Server Action; injected so RTL can stub it without next-intl/Supabase. */
  saveOverrideAction?: (draft: DeclarationDraft & { itemCode: string }) => Promise<DeclarationSaveResult>;
};

// Order the source groups so cascaded (read-only, auto) sits first, then external
// declarations, then manual overrides — mirrors the prototype's "auto first" framing.
const SOURCE_ORDER = ['cascaded', 'brief_declared', 'supplier_spec', 'lab_result', 'manual_override'];

function groupBySource(badges: ProfileBadge[]): Map<string, ProfileBadge[]> {
  const map = new Map<string, ProfileBadge[]>();
  for (const b of badges) {
    map.set(b.source, [...(map.get(b.source) ?? []), b]);
  }
  return map;
}

export function AllergensTab({
  data,
  labels,
  state,
  canEdit,
  saveOverrideAction,
}: AllergensTabProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [initial, setInitial] = React.useState<Partial<DeclarationDraft> | undefined>(undefined);

  if (state === 'loading') {
    return (
      <div data-testid="allergens-tab" data-state="loading" className="space-y-3 p-1">
        <div role="status" className="text-sm text-muted-foreground">
          {labels.loading}
        </div>
        <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-6 w-64 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (state === 'permission_denied') {
    return (
      <div data-testid="allergens-tab" data-state="permission_denied" className="p-1">
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          {labels.forbidden}
        </div>
      </div>
    );
  }

  if (state === 'error' || !data) {
    return (
      <div data-testid="allergens-tab" data-state="error" className="p-1">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {labels.error}
        </div>
      </div>
    );
  }

  const allergenChoices: AllergenRef[] = data.references;

  function openDeclare(badge?: ProfileBadge) {
    if (badge) {
      setInitial({
        allergenCode: badge.allergenCode,
        intensity: badge.intensity,
        confidence: badge.confidence,
        reason: badge.source === 'manual_override' ? (badge.manualOverrideReason ?? '') : '',
      });
    } else {
      setInitial(undefined);
    }
    setModalOpen(true);
  }

  async function handleSave(draft: DeclarationDraft): Promise<DeclarationSaveResult> {
    if (!saveOverrideAction) return { ok: false, error: 'persistence_failed' };
    const result = await saveOverrideAction({ ...draft, itemCode: data!.itemCode });
    if (result.ok) router.refresh();
    return result;
  }

  const grouped = groupBySource(data.badges);
  const orderedSources = [
    ...SOURCE_ORDER.filter((s) => grouped.has(s)),
    ...[...grouped.keys()].filter((s) => !SOURCE_ORDER.includes(s)),
  ];

  return (
    <div data-testid="allergens-tab" data-state={state} className="space-y-4 p-1">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{labels.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        {canEdit ? (
          <Button type="button" className="btn-primary" data-testid="allergen-declare-cta" onClick={() => openDeclare()}>
            {labels.declareCta}
          </Button>
        ) : null}
      </header>

      {data.badges.length === 0 ? (
        <div data-testid="allergens-empty" className="rounded-xl border bg-white px-6 py-6 text-sm">
          <p className="font-medium">{labels.empty}</p>
          <p className="mt-1 text-muted-foreground">{labels.emptyBody}</p>
        </div>
      ) : (
        <section aria-label={labels.title} className="space-y-4">
          {orderedSources.map((source) => {
            const rows = grouped.get(source) ?? [];
            const cascaded = isCascaded(source);
            return (
              <div
                key={source}
                data-testid={`allergen-source-group-${source}`}
                className="rounded-xl border bg-white p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {labels.sourceHeading[source] ?? source}
                  </h3>
                  {cascaded ? (
                    <Badge variant="muted" data-testid={`allergen-readonly-${source}`}>
                      {labels.readOnlyTag}
                    </Badge>
                  ) : null}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {rows.map((b) => (
                    <li key={`${source}-${b.allergenCode}`}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => openDeclare(b)}
                        data-testid={`allergen-badge-${b.allergenCode}`}
                        className="inline-flex items-center gap-1 rounded-full disabled:cursor-default"
                        title={cascaded ? labels.readOnlyTag : labels.overrideTag}
                      >
                        <Badge variant={SOURCE_VARIANT[source] ?? 'default'}>
                          {b.allergenName}
                          <span className="ml-1 opacity-70">· {labels.intensity[b.intensity] ?? b.intensity}</span>
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      <AllergenDeclarationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        labels={labels.modal}
        allergens={allergenChoices}
        initial={initial}
        canEdit={canEdit}
        onSave={handleSave}
      />
    </div>
  );
}
