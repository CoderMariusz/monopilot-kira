'use client';

/**
 * T-040 — AllergenCascadeWidget (SCR-09 Allergen Cascade, Technical-tab slot).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
 *
 * Translation notes (from the prototype + prototype-index allergen_cascade):
 *   - 3-column cascade grid (RM / Process / FA Final)  → 3 @monopilot/ui Card sections.
 *     The production fa_allergen_cascade VIEW aggregates RM∪process into one derived set,
 *     so the prototype's columns ① (RM) + ② (Process) collapse into section ①
 *     "Derived (RM + process)"; section ② becomes the override-delta view (additive
 *     overrides made explicit — MON-domain-npd: overrides are additive deltas over the
 *     derived union); section ③ is the FA-final Contains + May-contain (unchanged).
 *   - window.NPD_ALLERGEN_CASCADE                       → server prefetch of public.fa_allergen_cascade
 *     (derived_allergens / published_allergens / may_contain_allergens / conditional_process_allergens),
 *     materialized to product.allergens / product.may_contain by the T-038 engine.
 *   - source tooltip on each badge                      → title attr (allergen source), a11y red-line.
 *   - manual-override badge (amber border)              → published ∖ derived ⇒ data-manual="true".
 *   - Refresh button + ↻                                → debounced refresh Server Action (T-038 engine);
 *                                                          do NOT hammer the server (risk red-line).
 *   - EU14 presence row                                 → all 14 mandatory EU allergens with a
 *     present/absent state shown via TEXT + ICON (color is never the sole signal — a11y).
 *   - SVG cascade diagram + 30s polling                 → deferred (BL-NPD-05; out_of_scope: no SVG animation).
 *
 * RBAC: `canWrite` is resolved server-side (page) and never trusted from the client —
 * the Refresh + per-allergen Override controls are omitted when false (no render-then-disable).
 */

import React from 'react';

import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';

import {
  AllergenOverrideModal,
  type AllergenOverrideLabels,
  type SetAllergenOverrideAction,
} from '../../../_modals/allergen-override-modal';

export type WidgetState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** Raw cascade read-model row (public.fa_allergen_cascade), already org-scoped server-side. */
export type AllergenCascadeData = {
  productCode: string;
  /** union(confirmed RM, confirmed process) — untouched by overrides. */
  derivedAllergens: string[];
  /** derived with current additive overrides applied (this is product.allergens). */
  publishedAllergens: string[];
  /** union(RM may_contain/trace, conditional process) minus confirmed. */
  mayContainAllergens: string[];
  /** conditional process allergens surfaced separately (recipe_condition unevaluated). */
  conditionalProcessAllergens: string[];
  /**
   * product.allergens_declaration_accepted — the sign-off that satisfies approval
   * criterion C5 "Allergens declared". Authored server-side; the client only mirrors it.
   */
  declarationAccepted?: boolean;
  /** product.allergens_declaration_accepted_by (display name or user id), when accepted. */
  declarationAcceptedBy?: string | null;
  /** product.allergens_declaration_accepted_at (ISO string), when accepted. */
  declarationAcceptedAt?: string | null;
};

export type AllergenCascadeLabels = AllergenOverrideLabels & {
  title: string;
  subtitle: string;
  refresh: string;
  override: string;
  sectionDerived: string;
  sectionDerivedSource: string;
  sectionDeltas: string;
  sectionFinal: string;
  contains: string;
  mayContain: string;
  deltaAdded: string;
  deltaRemoved: string;
  noDeltas: string;
  manual: string;
  present: string;
  absent: string;
  eu14Title: string;
  derivationNote: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  refreshing: string;
  sourceRm: string;
  sourceProcess: string;
  sourceOverride: string;
  // Declaration accept control (FG-final sign-off — satisfies approval criterion C5).
  declarationTitle: string;
  declarationDescription: string;
  declarationAcceptLabel: string;
  declarationAcceptedBadge: string;
  declarationNotAccepted: string;
  declarationAcceptedBy: string;
  declarationPending: string;
  declarationError: string;
};

/** EU FIC 1169/2011 — 14 mandatory allergens (codes match Reference."Allergens" EU14 seed). */
export const EU14_ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type RefreshAction = (productCode: string) => Promise<unknown> | void;

/**
 * Accept / revoke the FG-final allergen declaration. Owned server-side
 * (accept-declaration.ts): returns `{ ok: true; productCode } | { ok: false; code }`.
 * Injected across the RSC boundary as a function prop (Next16 sibling-modal pattern).
 */
export type DeclarationAction = (input: {
  productCode: string;
}) => Promise<{ ok: true; productCode: string } | { ok: false; code: string }>;

const REFRESH_DEBOUNCE_MS = 600;

/** Render the accepted-at timestamp as a short date; falls back to the raw value. */
function formatAcceptedAtClient(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function FormattedDeclarationAcceptedBy({
  label,
  name,
  acceptedAt,
}: {
  label: string;
  name: string;
  acceptedAt: string | null | undefined;
}) {
  const [dateLabel, setDateLabel] = React.useState(() => acceptedAt ?? '');

  React.useEffect(() => {
    setDateLabel(formatAcceptedAtClient(acceptedAt));
  }, [acceptedAt]);

  return <>{label.replace('{name}', name).replace('{date}', dateLabel)}</>;
}

function StateNotice({
  state,
  labels,
}: {
  state: WidgetState;
  labels: AllergenCascadeLabels;
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: 24, fontSize: 13 }}>
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">⚠</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.error}
      </div>
    );
  }
  return (
    <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
      {labels.forbidden}
    </div>
  );
}

/** Override-modal intent: the allergen the user is editing. */
type OverrideIntent = {
  allergenCode: string;
  allergenLabel: string;
  currentlyPresent: boolean;
};

export function AllergenCascadeWidget({
  data,
  labels,
  canWrite,
  canAcceptDeclaration = false,
  state = 'ready',
  refreshAction,
  setAllergenOverrideAction,
  allergenDisplayNames,
  acceptDeclarationAction,
  revokeDeclarationAction,
}: {
  data: AllergenCascadeData | null;
  labels: AllergenCascadeLabels;
  canWrite: boolean;
  /** Broader permission OR-list for C5 declaration accept (independent of override write). */
  canAcceptDeclaration?: boolean;
  state?: WidgetState;
  refreshAction?: RefreshAction;
  setAllergenOverrideAction?: SetAllergenOverrideAction;
  /** Optional code→display-name map (locale-resolved server-side). Falls back to code. */
  allergenDisplayNames?: Record<string, string>;
  /** Sets product.allergens_declaration_accepted = true (satisfies C5). */
  acceptDeclarationAction?: DeclarationAction;
  /** Clears product.allergens_declaration_accepted. */
  revokeDeclarationAction?: DeclarationAction;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [override, setOverride] = React.useState<OverrideIntent | null>(null);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // FG-final declaration sign-off (criterion C5). Optimistic local mirror so the
  // checkbox reflects the click immediately; reconciled from the Server Action result.
  const [accepted, setAccepted] = React.useState<boolean>(data?.declarationAccepted ?? false);
  const [declPending, setDeclPending] = React.useState(false);
  const [declError, setDeclError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAccepted(data?.declarationAccepted ?? false);
  }, [data?.declarationAccepted, data?.productCode]);

  React.useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const derived = React.useMemo(() => new Set(data?.derivedAllergens ?? []), [data]);
  const published = React.useMemo(() => new Set(data?.publishedAllergens ?? []), [data]);

  // Additive override deltas: added = published ∖ derived; removed = derived ∖ published.
  const addedDeltas = React.useMemo(
    () => [...published].filter((code) => !derived.has(code)).sort(),
    [published, derived],
  );
  const removedDeltas = React.useMemo(
    () => [...derived].filter((code) => !published.has(code)).sort(),
    [derived, published],
  );

  const showCascadePanels =
    (data?.derivedAllergens.length ?? 0) > 0 ||
    addedDeltas.length > 0 ||
    removedDeltas.length > 0;

  const displayName = React.useCallback(
    (code: string) => allergenDisplayNames?.[code] ?? code,
    [allergenDisplayNames],
  );

  // Debounced refresh: collapse a click burst into a single Server Action call.
  const handleRefresh = React.useCallback(() => {
    if (!data) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void Promise.resolve(refreshAction?.(data.productCode))
        .then(() => {
          router.refresh();
        })
        .finally(() => setRefreshing(false));
    }, REFRESH_DEBOUNCE_MS);
    setRefreshing(true);
  }, [data, refreshAction, router]);

  const handleOpenOverride = React.useCallback(
    (intent: OverrideIntent) => {
      if (!setAllergenOverrideAction) return;
      setOverride(intent);
    },
    [setAllergenOverrideAction],
  );

  const handleSubmitOverride = React.useCallback<SetAllergenOverrideAction>(
    async (productCode, allergenCode, action, reason) => {
      if (!setAllergenOverrideAction) return { ok: false };
      const result = await setAllergenOverrideAction(productCode, allergenCode, action, reason);
      if (result.ok) {
        router.refresh();
      }
      return result;
    },
    [setAllergenOverrideAction, router],
  );

  // Accept (checked) / revoke (unchecked) the FG-final declaration. Disabled while
  // pending; failures surface inline (role="alert") and roll the checkbox back —
  // the Server Action never throws (returns { ok:false, code }).
  const handleToggleDeclaration = React.useCallback(
    (next: boolean) => {
      if (!data || declPending) return;
      const action = next ? acceptDeclarationAction : revokeDeclarationAction;
      if (!action) return;
      const previous = accepted;
      setAccepted(next);
      setDeclError(null);
      setDeclPending(true);
      void Promise.resolve(action({ productCode: data.productCode }))
        .then((result) => {
          if (!result || result.ok !== true) {
            setAccepted(previous);
            setDeclError(labels.declarationError);
          }
        })
        .catch(() => {
          setAccepted(previous);
          setDeclError(labels.declarationError);
        })
        .finally(() => setDeclPending(false));
    },
    [data, declPending, accepted, acceptDeclarationAction, revokeDeclarationAction, labels.declarationError],
  );

  if (state !== 'ready' || !data) {
    return (
      <section
        data-testid="allergen-cascade-widget"
        aria-labelledby="allergen-cascade-title"
        className="card"
      >
        <div className="card-head">
          <h2 id="allergen-cascade-title" className="card-title">
            {labels.title}
          </h2>
        </div>
        <StateNotice state={!data && state === 'ready' ? 'empty' : state} labels={labels} />
      </section>
    );
  }

  return (
    <section
      data-testid="allergen-cascade-widget"
      aria-labelledby="allergen-cascade-title"
      className="card"
    >
      <div className="card-head">
        <div>
          <h2 id="allergen-cascade-title" className="card-title">
            {labels.title}
          </h2>
          <div className="muted" style={{ fontSize: 11 }}>{labels.subtitle}</div>
        </div>
        {canWrite && refreshAction ? (
          <Button
            type="button"
            className="btn-secondary btn-sm"
            aria-label={labels.refresh}
            data-testid="allergen-refresh"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            {refreshing ? labels.refreshing : `↻ ${labels.refresh}`}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3" style={{ marginBottom: 12 }}>
        {showCascadePanels ? (
          <>
        {/* ① Derived (RM + process). */}
        <Card data-testid="allergen-section-derived">
          <CardHeader>
            <CardTitle>{labels.sectionDerived}</CardTitle>
            <p className="text-xs text-slate-500">{labels.sectionDerivedSource}</p>
          </CardHeader>
          <CardContent>
            {data.derivedAllergens.length === 0 ? (
              <p className="text-xs text-slate-400">{labels.empty}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.derivedAllergens.map((code) => (
                  <li key={code}>
                    <Badge
                      variant="danger"
                      className="badge-red"
                      data-testid={`allergen-source-${code}`}
                      title={labels.sourceRm}
                      aria-label={`${displayName(code)} · ${labels.sourceRm}`}
                    >
                      {displayName(code)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ② Override deltas (additive). */}
        <Card data-testid="allergen-section-deltas">
          <CardHeader>
            <CardTitle>{labels.sectionDeltas}</CardTitle>
          </CardHeader>
          <CardContent>
            {addedDeltas.length === 0 && removedDeltas.length === 0 ? (
              <p className="text-xs text-slate-400">{labels.noDeltas}</p>
            ) : (
              <div className="space-y-3">
                {addedDeltas.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {labels.deltaAdded}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {addedDeltas.map((code) => (
                        <li key={code}>
                          <Badge
                            variant="warning"
                            className="badge-amber"
                            data-testid={`allergen-delta-added-${code}`}
                            title={labels.sourceOverride}
                            aria-label={`${displayName(code)} · ${labels.deltaAdded}`}
                          >
                            + {displayName(code)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {removedDeltas.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {labels.deltaRemoved}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {removedDeltas.map((code) => (
                        <li key={code}>
                          <Badge
                            variant="muted"
                            className="badge-gray"
                            data-testid={`allergen-delta-removed-${code}`}
                            title={labels.sourceOverride}
                            aria-label={`${displayName(code)} · ${labels.deltaRemoved}`}
                          >
                            − {displayName(code)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
          </>
        ) : null}

        {/* ③ FA Final — Contains + May contain + declaration sign-off (C5). */}
        <Card data-testid="allergen-section-final" className="border-2 border-blue-300">
          <CardHeader>
            <CardTitle>
              {labels.sectionFinal} — {data.productCode}
            </CardTitle>
            <p className="text-xs text-slate-500">{labels.declarationDescription}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{labels.contains}</p>
            {data.publishedAllergens.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">{labels.empty}</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-2">
                {data.publishedAllergens.map((code) => {
                  const manual = !derived.has(code);
                  return (
                    <li key={code}>
                      <Badge
                        variant="danger"
                        data-testid={`allergen-final-contains-${code}`}
                        data-manual={manual ? 'true' : 'false'}
                        className={manual ? 'badge-red border border-amber-400' : 'badge-red'}
                        title={manual ? labels.sourceOverride : labels.sourceRm}
                        aria-label={
                          manual
                            ? `${displayName(code)} · ${labels.manual}`
                            : displayName(code)
                        }
                      >
                        {displayName(code)}
                        {manual ? ` · ${labels.manual}` : ''}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              {labels.mayContain}
            </p>
            {data.mayContainAllergens.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">{labels.empty}</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-2">
                {data.mayContainAllergens.map((code) => (
                  <li key={code}>
                    <Badge
                      variant="warning"
                      className="badge-amber"
                      data-testid={`allergen-may-contain-${code}`}
                      title={labels.sourceProcess}
                      aria-label={`${displayName(code)} · ${labels.mayContain}`}
                    >
                      {labels.mayContain}: {displayName(code)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <div className="alert alert-blue" style={{ marginTop: 12 }}>{labels.derivationNote}</div>

            {/* Declaration sign-off — satisfies approval criterion C5 "Allergens declared". */}
            <div
              data-testid="allergen-declaration"
              data-accepted={accepted ? 'true' : 'false'}
              className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {labels.declarationTitle}
              </p>
              {canAcceptDeclaration ? (
                <label
                  className="mt-2 flex items-start gap-2 text-sm"
                  style={{ cursor: declPending ? 'progress' : 'pointer' }}
                >
                  <input
                    type="checkbox"
                    data-testid="allergen-declaration-accept"
                    className="mt-0.5"
                    checked={accepted}
                    disabled={declPending}
                    onChange={(event) => handleToggleDeclaration(event.target.checked)}
                  />
                  <span>{labels.declarationAcceptLabel}</span>
                </label>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  {accepted ? labels.declarationAcceptedBadge : labels.declarationNotAccepted}
                </p>
              )}

              {accepted ? (
                <p
                  data-testid="allergen-declaration-confirmation"
                  className="mt-2 flex flex-wrap items-baseline gap-1 text-xs text-green-700"
                >
                  <span aria-hidden="true">✓</span>
                  <span className="font-medium">{labels.declarationAcceptedBadge}</span>
                  {data.declarationAcceptedBy ? (
                    <span className="text-slate-500">
                      <FormattedDeclarationAcceptedBy
                        label={labels.declarationAcceptedBy}
                        name={data.declarationAcceptedBy}
                        acceptedAt={data.declarationAcceptedAt}
                      />
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-700">{labels.declarationNotAccepted}</p>
              )}

              {declPending ? (
                <p
                  data-testid="allergen-declaration-pending"
                  role="status"
                  aria-live="polite"
                  className="mt-1 text-xs text-slate-500"
                >
                  {labels.declarationPending}
                </p>
              ) : null}

              {declError ? (
                <p
                  data-testid="allergen-declaration-error"
                  role="alert"
                  className="mt-1 text-xs text-red-700"
                >
                  {declError}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* EU14 presence grid — text + icon, never color-only (a11y). */}
      <Card data-testid="allergen-eu14-card">
        <CardHeader>
          <CardTitle>{labels.eu14Title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul
            data-testid="allergen-eu14-grid"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7"
          >
            {EU14_ALLERGEN_CODES.map((code) => {
              const present = published.has(code);
              const stateText = present ? labels.present : labels.absent;
              return (
                <li
                  key={code}
                  data-testid={`allergen-eu14-cell-${code}`}
                  data-present={present ? 'true' : 'false'}
                  className={[
                    'flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs',
                    present
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-1">
                    <span aria-hidden="true">{present ? '●' : '○'}</span>
                    <span>{displayName(code)}</span>
                  </span>
                  <span className="font-medium">{stateText}</span>
                  {canWrite && setAllergenOverrideAction ? (
                    <button
                      type="button"
                      data-testid={`allergen-override-trigger-${code}`}
                      aria-label={`${labels.override} ${displayName(code)}`}
                      className="text-blue-700 underline-offset-2 hover:underline"
                      onClick={() =>
                        handleOpenOverride({
                          allergenCode: code,
                          allergenLabel: displayName(code),
                          currentlyPresent: present,
                        })
                      }
                    >
                      {labels.override}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {override ? (
        <AllergenOverrideModal
          open
          productCode={data.productCode}
          allergenCode={override.allergenCode}
          allergenLabel={override.allergenLabel}
          currentlyPresent={override.currentlyPresent}
          labels={labels}
          onClose={() => setOverride(null)}
          setAllergenOverrideAction={handleSubmitOverride}
        />
      ) : null}
    </section>
  );
}

export default AllergenCascadeWidget;
