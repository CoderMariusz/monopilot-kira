'use client';

/**
 * NPD HANDOFF stage — HandoffScreen (HandoffScreen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)
 *
 * The prototype's lines 478-484 carry a "LEGACY — Phase 2 deprecation" banner.
 * That banner is INTENTIONALLY NOT translated: per the focused build mandate the
 * Handoff stage is a live production screen, so the banner is OMITTED.
 *
 * Parity checklist (translated to shadcn / @monopilot/ui — no verbatim JSX,
 * no raw <select>, no @radix-ui/* outside packages/ui):
 *   - green "Ready to promote" success bar (line 485) when the checklist is
 *     complete + gates pass; an amber "blocked" bar otherwise
 *   - "Handoff checklist" card (line 488) — Checkbox items (checked = ✓)
 *   - two cards: "Destination BOM" label/value table (lines 505-516) +
 *     "What happens on promote" ordered list (lines 517-527)
 *   - footer: "Export handoff packet" + "✓ Promote to production BOM" (lines
 *     530-533); Promote disabled until the checklist is complete + gates pass
 *
 * RBAC (`permission_denied`) is resolved server-side in page.tsx and is never
 * trusted from the client. Writes go through the injected Server Action callbacks.
 */

import React from 'react';

import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type HandoffChecklistItemView = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type HandoffDestinationBomView = {
  bomCode: string | null;
  productSku: string | null;
  productName: string | null;
  effectiveFrom: string | null;
  warehouseName: string | null;
  releaseStatus: string | null;
  releaseBomHeaderId: string | null;
};

export type HandoffScreenData = {
  checklistId: string;
  projectId: string;
  bomVerificationStatus: string | null;
  promoteToProductionDate: string | null;
  ready: boolean;
  promoted: boolean;
  checklist: HandoffChecklistItemView[];
  destinationBom: HandoffDestinationBomView;
};

export type HandoffLabels = {
  title: string;
  breadcrumb: string;
  readyTitle: string;
  readyBody: string;
  blockedTitle: string;
  blockedBody: string;
  promotedTitle: string;
  promotedBody: string;
  checklistTitle: string;
  destinationTitle: string;
  whatHappensTitle: string;
  bomCode: string;
  productSku: string;
  effectiveFrom: string;
  productionLine: string;
  warehouse: string;
  releaseStatus: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  step5: string;
  step6: string;
  exportPacket: string;
  promote: string;
  promoting: string;
  promoteError: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  notSet: string;
};

export type PromoteCall = { projectId: string };
export type PromoteOutcome = { ok: boolean; error?: string };
export type ToggleChecklistCall = { itemId: string; isChecked: boolean };
export type ToggleChecklistOutcome = { ok: boolean; error?: string };

function StateNotice({ state, labels }: { state: PageState; labels: HandoffLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">📦</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function HandoffScreen({
  state = 'ready',
  data,
  labels,
  onPromote,
  onToggleChecklistItem,
}: {
  state?: PageState;
  data: HandoffScreenData | null;
  labels: HandoffLabels;
  onPromote?: (call: PromoteCall) => Promise<PromoteOutcome>;
  onToggleChecklistItem?: (call: ToggleChecklistCall) => Promise<ToggleChecklistOutcome>;
}) {
  const [optimistic, setOptimistic] = React.useState<Record<string, boolean>>({});
  const [promoting, setPromoting] = React.useState(false);
  const [promoteError, setPromoteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOptimistic({});
    setPromoteError(null);
  }, [data?.checklistId]);

  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="handoff-screen"
        aria-labelledby="handoff-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="handoff-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  const { checklist, destinationBom, promoted } = data;

  // Optimistic checklist projection (server is the source of truth).
  const effectiveChecklist = checklist.map((item) => ({
    ...item,
    isChecked: item.id in optimistic ? optimistic[item.id]! : item.isChecked,
  }));
  const allChecked =
    effectiveChecklist.length > 0 && effectiveChecklist.every((i) => i.isChecked);
  const canPromote = allChecked && !promoted;

  async function handleToggle(item: HandoffChecklistItemView, next: boolean) {
    if (!onToggleChecklistItem) return;
    setOptimistic((prev) => ({ ...prev, [item.id]: next }));
    try {
      const result = await onToggleChecklistItem({ itemId: item.id, isChecked: next });
      if (!result.ok) {
        setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
      }
    } catch {
      setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
    }
  }

  async function handlePromote() {
    if (!onPromote || !canPromote || promoting) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      const result = await onPromote({ projectId: data!.projectId });
      if (!result.ok) {
        setPromoteError(result.error ?? 'error');
      }
    } catch {
      setPromoteError('error');
    } finally {
      setPromoting(false);
    }
  }

  const steps = [
    labels.step1,
    labels.step2,
    labels.step3,
    labels.step4,
    labels.step5,
    labels.step6,
  ];

  return (
    <main
      data-testid="handoff-screen"
      aria-labelledby="handoff-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head" data-region="page-head">
        <nav aria-label="breadcrumb" className="breadcrumb">
          {labels.breadcrumb}
        </nav>
        <h1 id="handoff-title" className="page-title mt-1">
          {labels.title}
        </h1>
      </header>

      {/* Promotion-state bar — prototype line 485 (green "Ready to promote"). */}
      {promoted ? (
        <div role="status" data-testid="handoff-promoted-bar" className="alert alert-green">
          <strong>{labels.promotedTitle}</strong> <span>{labels.promotedBody}</span>
        </div>
      ) : allChecked ? (
        <div role="status" data-testid="handoff-ready-bar" className="alert alert-green">
          <strong>{labels.readyTitle}</strong> <span>{labels.readyBody}</span>
        </div>
      ) : (
        <div role="status" data-testid="handoff-blocked-bar" className="alert alert-amber">
          <strong>{labels.blockedTitle}</strong> <span>{labels.blockedBody}</span>
        </div>
      )}

      {/* Handoff checklist — prototype lines 487-502. */}
      <Card data-testid="handoff-checklist-card">
        <CardHeader>
          <CardTitle>{labels.checklistTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul data-testid="handoff-checklist" className="divide-y">
            {effectiveChecklist.map((item) => (
              <li
                key={item.id}
                data-testid="handoff-checklist-item"
                data-checked={item.isChecked}
                className="flex items-center gap-3 py-2"
              >
                <Checkbox
                  checked={item.isChecked}
                  disabled={!onToggleChecklistItem || promoted}
                  onCheckedChange={(next) => handleToggle(item, next)}
                  aria-label={item.label}
                />
                <span
                  className={item.isChecked ? 'muted' : ''}
                  data-testid="handoff-checklist-label"
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Two-panel grid — prototype lines 504-528. */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Destination BOM — prototype lines 505-516. */}
        <Card data-testid="handoff-destination-card">
          <CardHeader>
            <CardTitle>{labels.destinationTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="muted py-1 pr-4">{labels.bomCode}</td>
                  <td className="mono">{destinationBom.bomCode ?? labels.notSet}</td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.productSku}</td>
                  <td className="mono">
                    {destinationBom.productSku
                      ? destinationBom.productName
                        ? `${destinationBom.productSku} · ${destinationBom.productName}`
                        : destinationBom.productSku
                      : labels.notSet}
                  </td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.effectiveFrom}</td>
                  <td className="mono">{destinationBom.effectiveFrom ?? labels.notSet}</td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.warehouse}</td>
                  <td>{destinationBom.warehouseName ?? labels.notSet}</td>
                </tr>
                <tr>
                  <td className="muted py-1 pr-4">{labels.releaseStatus}</td>
                  <td className="mono" data-testid="handoff-release-status">
                    {destinationBom.releaseStatus ?? labels.notSet}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* What happens on promote — prototype lines 517-527. */}
        <Card data-testid="handoff-steps-card">
          <CardHeader>
            <CardTitle>{labels.whatHappensTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="muted list-decimal pl-5 text-xs leading-7" data-testid="handoff-steps">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {promoteError ? (
        <div role="alert" data-testid="handoff-promote-error" className="alert alert-red">
          <div className="alert-title">{labels.promoteError}</div>
        </div>
      ) : null}

      {/* Footer actions — prototype lines 530-533. */}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" data-testid="handoff-export-btn">
          {labels.exportPacket}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="handoff-promote-btn"
          disabled={!canPromote || promoting || !onPromote}
          aria-disabled={!canPromote || promoting || !onPromote}
          onClick={handlePromote}
        >
          {promoting ? labels.promoting : labels.promote}
        </button>
      </div>
    </main>
  );
}

export default HandoffScreen;
