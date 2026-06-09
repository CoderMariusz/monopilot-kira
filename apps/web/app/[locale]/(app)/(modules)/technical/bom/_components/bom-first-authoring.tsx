'use client';

/**
 * LANE-10 — BOM FIRST-AUTHORING state (create the v1 draft for an FG with no BOM).
 *
 * Why this island exists: the New-BOM picker routes an eligible (active) FG to
 * `/technical/bom/{code}`, but that route called `notFound()` (404) whenever the
 * item existed yet had NO `bom_headers` row — so authoring the FIRST BOM was
 * impossible. This island renders the BOM-detail *shell* (breadcrumb + item
 * header, parity `bom-detail.jsx:3-65`) plus a design-system `.empty-state`
 * inviting the user to add the first component. The primary `.btn-primary`
 * "+ Add first component" opens the EXISTING `ComponentAddModal`, whose submit
 * creates the v1 draft via the real `createBomDraft` Server Action (single line —
 * `CreateBomDraftInput.lines.min(1)`). On success the modal calls
 * `router.refresh()`, the route re-runs `getBomDetailPage`, now finds the draft
 * and renders the full 7-tab detail.
 *
 * RBAC: authoring is gated on `canCreate` (technical.bom.create), resolved
 * server-side and passed in — never client-trusted. Without it the empty-state
 * still renders (read context) but the CTA / modal are hidden.
 *
 * Real data — NO mocks. The component picker inside `ComponentAddModal` reads the
 * real item master and the operations reference; the save persists a real draft.
 */

import React from 'react';

import { ComponentAddModal, type BomEditContext } from './bom-edit-dialog';

export type BomFirstAuthoringLabels = {
  breadcrumbRoot: string;
  emptyTitle: string;
  emptyBody: string; // "{code}" interpolated
  addFirstComponent: string;
  draftBadge: string; // e.g. "Not started"
};

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function BomFirstAuthoring({
  productId,
  productName,
  detailHrefBase,
  canCreate,
  labels,
}: {
  productId: string;
  productName: string | null;
  detailHrefBase: string;
  canCreate: boolean;
  labels: BomFirstAuthoringLabels;
}) {
  const [addOpen, setAddOpen] = React.useState(false);

  // Source status for a not-yet-existing BOM is treated as a fresh draft: the
  // modal's clone-on-write "released" notice must NOT show (nothing to clone).
  const ctx: BomEditContext = {
    productId,
    productName: productName ?? undefined,
    currentVersion: 0,
    sourceStatus: 'draft',
  };

  return (
    <main
      data-screen="technical-bom-detail"
      data-bom-state="first-authoring"
      className="flex w-full flex-col gap-4 px-6 py-6"
    >
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href={detailHrefBase}>{labels.breadcrumbRoot}</a> / <span className="mono">{productId}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{productName ?? productId}</h1>
            <span className="badge badge-gray">{labels.draftBadge}</span>
          </div>
        </div>
      </header>

      <div className="card" style={{ padding: 0 }}>
        <div className="empty-state" data-testid="bom-first-authoring-empty">
          <div className="empty-state-icon">🧩</div>
          <div className="empty-state-title">{labels.emptyTitle}</div>
          <div className="empty-state-body">{interpolate(labels.emptyBody, { code: productId })}</div>
          {canCreate ? (
            <div className="empty-state-action">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="bom-add-first-component-cta"
                onClick={() => setAddOpen(true)}
              >
                {labels.addFirstComponent}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {canCreate && addOpen ? (
        <ComponentAddModal open={addOpen} onClose={() => setAddOpen(false)} context={ctx} />
      ) : null}
    </main>
  );
}

export default BomFirstAuthoring;
