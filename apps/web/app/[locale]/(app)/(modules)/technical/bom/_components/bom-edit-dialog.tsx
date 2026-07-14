'use client';

/**
 * T-039 — TEC-022 BOM Edit modals (component add + version save).
 *
 * PRODUCT DECISION (BOM draft authoring, locked 2026-06-11): readiness checks on
 * the component picker are WARNINGS, not hard blocks, while the BOM is in a
 * draft / non-released state. A freshly created item (no supplier_specs, no cost
 * or spec review) MUST be addable to a draft BOM — its missing-readiness states
 * render as visible WARNING badges (supplier approval missing, supplier spec not
 * active, cost/spec review pending) but the "Add component" button stays enabled.
 * Only a genuinely un-addable item HARD-blocks: ITEM_NOT_ACTIVE (the picker lists
 * active items only) and ALLERGEN_CONFLICT (food-safety incompatibility). The
 * server side enforces the SAME matrix: `validateRmUsability(..., 'bom_edit')`
 * demotes supplier-readiness reasons to warnings, so `createBomDraft` accepts the
 * line — this is not client-cosmetic relaxation. The HARD supplier-readiness gate
 * stays DOWNSTREAM at factory-release / BOM approval (`factory_spec_approval`
 * context, workflow.ts) and is intentionally NOT touched here.
 *
 * Prototype parity:
 *   - `prototypes/design/Monopilot Design System/technical/modals.jsx:192-243`
 *     (bom_component_add_modal) → ComponentAddModal: search-picker over the
 *     material master + Quantity / Scrap % fields + Cancel / "Add component".
 *   - `prototypes/design/Monopilot Design System/technical/modals.jsx:168-190`
 *     (bom_version_save_modal) → VersionSaveModal: Version label + Change reason
 *     (min-10) + read-only "previous version stays available" note + Cancel /
 *     "Save version".
 *
 * Real data — NO mocks:
 *   - the component picker reads the real item master via `listItems`
 *     (withOrgContext + RLS), the manufacturing-operation Select reads
 *     `listManufacturingOperations`, the usability gate calls the real
 *     `validateBomComponent` (T-074) Server Action, and the save persists via
 *     `addBomLine` (append in place on an editable draft/in_review version) or
 *     `createBomDraft` (clone-on-write fork carrying ALL existing lines +
 *     co-products when the source is released/terminal, or the v1 draft in
 *     first-authoring) — never mutating an approved/active/released row in
 *     place (clone-on-write red-line). F-B01 fix: previously EVERY add forked
 *     a new 1-line draft, so multi-ingredient recipes were impossible.
 *
 * Local `Dialog` (not the Radix-backed @monopilot/ui Modal): apps/web runs
 * React 19 while the workspace ships a React-18 peer @radix-ui/react-dialog, so
 * mounting Radix in the jsdom unit test crashes with a dual-React useRef null.
 * Production dialog semantics (role="dialog", aria-modal, focus-on-open,
 * Escape + backdrop close, labelled title) are preserved. Established deviation
 * shared with technical/items items-manager.client.tsx + settings UnitsManager.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import { createBomDraft } from '../_actions/create-draft';
import { addBomLine } from '../_actions/line-actions';
import { ensureBomVersionEditDraft } from '../_actions/request-version-edit';
import type { BomStatus, BomValidationCode, ComponentType } from '../_actions/shared';
import { listItems } from '../../items/_actions/list-items';
import { ITEM_CHOOSER_MAX_LIMIT } from '../../../../../../../lib/shared/pagination';
import type { ItemListItem, ItemType } from '../../items/_actions/shared';

/**
 * Auto-map the picked item's master type → the BOM line's component_type
 * (COMPONENT_TYPES = RM | PM | WIP | FG). Previously every added line landed with
 * a null component_type; this classifies it from the item master so packaging
 * resolves to PM, intermediates to WIP, etc. fg is never a component but mapped
 * for completeness.
 */
const ITEM_TYPE_TO_COMPONENT_TYPE: Record<ItemType, ComponentType> = {
  rm: 'RM',
  ingredient: 'RM',
  intermediate: 'WIP',
  packaging: 'PM',
  fg: 'FG',
  co_product: 'RM',
  byproduct: 'RM',
};
import { listManufacturingOperations } from '../../../../../../../actions/reference/manufacturing-ops/list';
import { validateBomComponent } from '../../../../../../../actions/technical/boms/validate-component';
import type { RmUsabilityVerdict } from '../../../../../../../lib/technical/rm-usability';

/** Statuses for which an in-place edit is forbidden → Save means new draft. */
const RELEASED_STATUSES: ReadonlySet<BomStatus> = new Set<BomStatus>([
  'technical_approved',
  'active',
]);

/** Statuses the server's line actions accept for an IN-PLACE append (mirrors
 *  BOM_LINE_EDITABLE_STATUSES in _actions/shared.ts — never client-decided,
 *  the server re-enforces it). */
const EDITABLE_STATUSES: ReadonlySet<BomStatus> = new Set<BomStatus>(['draft', 'in_review']);

/** One existing component line of the SOURCE version — carried into a
 *  clone-on-write fork so the new draft is COMPLETE (F-B01: forking with only
 *  the new line produced impossible 1-ingredient recipes). */
export type BomEditLine = {
  itemId?: string;
  componentCode: string;
  componentType?: ComponentType;
  quantity: number;
  uom: string;
  scrapPct?: number;
  manufacturingOperationName?: string;
};

export type BomEditCoProduct = {
  coProductItemId: string;
  quantity: number;
  uom: string;
  allocationPct: number;
  isByproduct?: boolean;
};

export type BomEditContext = {
  /** Owning FG product_code (= bom_headers.product_id). */
  productId: string;
  /** Display name for the dialog subtitle. */
  productName?: string;
  /** Current/source BOM version number (for the "previous version" note). */
  currentVersion: number;
  /** Source BOM status — drives the released/clone-on-write copy. */
  sourceStatus: BomStatus;
  /**
   * The SELECTED version's bom_headers.id. When present AND the status is
   * editable (draft | in_review), "Add component" APPENDS the line in place via
   * addBomLine — no version fork. Absent only in first-authoring (no BOM yet).
   */
  bomHeaderId?: string;
  /** The source version's existing lines — carried fully into a clone-on-write fork. */
  existingLines?: BomEditLine[];
  /** The source version's co-products — carried into the fork (keeps V-TEC-12 true). */
  coProducts?: BomEditCoProduct[];
  /** Source version yield — preserved on fork (createBomDraft defaults to 100). */
  yieldPct?: number;
};

// ── Local Dialog primitive (a11y-complete, no Radix) ──────────────────────────
function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'default',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  size?: 'default' | 'wide';
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-box${size === 'wide' ? ' wide' : ''} outline-none`}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle ? <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

// ── MODAL-03: BOM Component Add ───────────────────────────────────────────────
/** One advisory readiness gap to render as a visible warning badge (draft authoring). */
type UsabilityWarning = { code: string; label: string };

type UsabilityState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** Addable: green when warnings is empty, otherwise renders the warning badges. */
  | { kind: 'ok'; warnings: UsabilityWarning[] }
  | { kind: 'blocked'; code: string; message: string };

/** Map the structured RM-usability verdict → the dialog's blocked state (AC5). */
function verdictToBlocked(verdict: RmUsabilityVerdict): { kind: 'blocked'; code: string; message: string } {
  const failing = verdict.checks.find((c) => c.severity === 'block');
  return {
    kind: 'blocked',
    code: verdict.blockingReasons[0] ?? failing?.code ?? 'BLOCKED',
    message: failing?.label ?? 'Component is not usable.',
  };
}

/**
 * Collect the advisory (non-blocking) readiness gaps from a usable verdict so the
 * dialog can render them as visible WARNING badges while authoring a draft BOM.
 */
function verdictWarnings(verdict: RmUsabilityVerdict): UsabilityWarning[] {
  return verdict.checks
    .filter((c) => c.severity === 'warn')
    .map((c) => ({ code: c.code, label: c.label }));
}

export function ComponentAddModal({
  open,
  onClose,
  context,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  context: BomEditContext;
  /** Called after a successful draft create (parent table refresh hook). */
  onAdded?: (result: { id: string; version: number }) => void;
}) {
  const t = useTranslations('technical.bom.edit');
  const router = useRouter();

  // New keys staged in _meta/i18n-staging/bom-fix.json. Until the i18n bundles
  // are updated, resolve them with the established t.has-guarded fallback so a
  // missing key never throws — labels degrade to readable English.
  const tg = React.useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string =>
      t.has(key) ? t(key, vars) : fallback.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? '')),
    [t],
  );

  const [search, setSearch] = React.useState('');
  const [materials, setMaterials] = React.useState<ItemListItem[] | null>(null);
  const [materialsState, setMaterialsState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [operations, setOperations] = React.useState<{ value: string; label: string }[]>([]);
  const [picked, setPicked] = React.useState<ItemListItem | null>(null);
  const [qty, setQty] = React.useState('0.1');
  const [scrap, setScrap] = React.useState('1.0');
  const [operationName, setOperationName] = React.useState('');
  const [usability, setUsability] = React.useState<UsabilityState>({ kind: 'idle' });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const released = RELEASED_STATUSES.has(context.sourceStatus);

  // Load the real material master + manufacturing operations once the modal opens.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMaterialsState('loading');
    void (async () => {
      const [itemsRes, opsRes] = await Promise.all([
        listItems({ limit: ITEM_CHOOSER_MAX_LIMIT }),
        listManufacturingOperations({ includeInactive: false }),
      ]);
      if (cancelled) return;
      if (itemsRes.state === 'error') {
        setMaterialsState('error');
      } else {
        // BOM components are materials/intermediates — exclude FG self-parents.
        setMaterials(itemsRes.items.filter((m) => m.itemType !== 'fg'));
        setMaterialsState('ready');
      }
      setOperations(opsRes.ok ? opsRes.data.map((o) => ({ value: o.operation_name, label: o.operation_name })) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset transient state on close.
  React.useEffect(() => {
    if (open) return;
    setSearch('');
    setPicked(null);
    setQty('0.1');
    setScrap('1.0');
    setOperationName('');
    setUsability({ kind: 'idle' });
    setError(null);
  }, [open]);

  const filtered = React.useMemo(() => {
    const list = materials ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 20);
    return list
      .filter((m) => m.itemCode.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [materials, search]);

  const qtyNum = Number(qty);
  const qtyInvalid = !Number.isFinite(qtyNum) || qtyNum <= 0;
  const operationMissing = operationName.trim().length === 0;
  const blocked = usability.kind === 'blocked';
  const checking = usability.kind === 'checking';
  // ponytail: gate Add on in-flight usability — submit during 'checking' races a second long validate
  const canSubmit = !!picked && !qtyInvalid && !operationMissing && !blocked && !checking && !pending;

  async function onPick(material: ItemListItem) {
    setPicked(material);
    setError(null);
    setUsability({ kind: 'checking' });
    const res = await validateBomComponent({ itemId: material.id });
    if (res.ok) {
      setUsability({ kind: 'ok', warnings: res.verdict ? verdictWarnings(res.verdict) : [] });
    } else if (res.error === 'blocked' && res.verdict) {
      setUsability(verdictToBlocked(res.verdict));
    } else if (res.error === 'item_not_found') {
      setUsability({ kind: 'blocked', code: 'V-TEC-14', message: 'Component not found.' });
    } else {
      // Non-blocking infra failure: don't hard-block the user, but surface it.
      setUsability({ kind: 'idle' });
      setError(t('saveError'));
    }
  }

  function onSubmit() {
    if (!picked || !canSubmit) return;
    setError(null);
    startTransition(async () => {
      // Re-check usability server-side at the save seam (AC5 — never cosmetic).
      const gate = await validateBomComponent({ itemId: picked.id });
      if (!gate.ok && gate.error === 'blocked' && gate.verdict) {
        setUsability(verdictToBlocked(gate.verdict));
        return; // no BOM line mutation
      }

      const newLine = {
        itemId: picked.id,
        componentCode: picked.itemCode,
        componentType: ITEM_TYPE_TO_COMPONENT_TYPE[picked.itemType],
        quantity: qtyNum,
        uom: picked.uomBase,
        scrapPct: Number(scrap) || 0,
        manufacturingOperationName: operationName.trim(),
      };

      // F-B01 — three flows, two persistence paths:
      //  (1) EXISTING editable draft/in_review version → APPEND the line in
      //      place via addBomLine (no version fork).
      //  (2) Released/terminal source version → clone-on-write fork via
      //      createBomDraft with ALL existing lines + the new one (+ carried
      //      co-products & yield), so the fork is COMPLETE — never 1-line.
      //  (3) First-authoring (no bomHeaderId) → create the v1 draft with the
      //      single new line (unchanged).
      if (context.bomHeaderId && EDITABLE_STATUSES.has(context.sourceStatus)) {
        const result = await addBomLine({ bomHeaderId: context.bomHeaderId, ...newLine });
        if (result.ok) {
          onAdded?.({ id: context.bomHeaderId, version: context.currentVersion });
          router.refresh();
          onClose();
        } else if (result.error === 'forbidden') {
          setError(t('forbidden'));
        } else if (result.error === 'validation_failed') {
          setUsability({ kind: 'blocked', code: result.code ?? 'V-TEC-14', message: result.message ?? '' });
        } else {
          setError(result.message ?? t('saveError'));
        }
        return;
      }

      const carriedLines = context.bomHeaderId ? context.existingLines ?? [] : [];
      const carriedCoProducts = context.bomHeaderId ? context.coProducts ?? [] : [];

      if (context.bomHeaderId && RELEASED_STATUSES.has(context.sourceStatus)) {
        const fork = await ensureBomVersionEditDraft({ sourceBomHeaderId: context.bomHeaderId });
        if (!fork.ok) {
          if (fork.error === 'forbidden') setError(t('forbidden'));
          else setError(fork.message ?? t('saveError'));
          return;
        }
        const result = await addBomLine({ bomHeaderId: fork.data.id, ...newLine });
        if (result.ok) {
          onAdded?.({ id: fork.data.id, version: fork.data.version });
          router.refresh();
          onClose();
        } else if (result.error === 'forbidden') {
          setError(t('forbidden'));
        } else if (result.error === 'validation_failed') {
          setUsability({ kind: 'blocked', code: result.code ?? 'V-TEC-14', message: result.message ?? '' });
        } else {
          setError(result.message ?? t('saveError'));
        }
        return;
      }

      // V-TEC-12: parent share = 100 − Σ non-byproduct co-product allocations,
      // reconstructing the validity the source version already satisfied.
      const parentAllocationPct =
        100 - carriedCoProducts.filter((cp) => !cp.isByproduct).reduce((acc, cp) => acc + cp.allocationPct, 0);

      const result = await createBomDraft({
        productId: context.productId,
        ...(context.bomHeaderId ? { sourceBomHeaderId: context.bomHeaderId } : {}),
        lines: [...carriedLines, newLine],
        coProducts: carriedCoProducts,
        parentAllocationPct,
        ...(context.bomHeaderId && context.yieldPct != null ? { yieldPct: context.yieldPct } : {}),
      });
      if (result.ok) {
        onAdded?.({ id: result.data.id, version: result.data.version });
        router.refresh();
        onClose();
      } else if (result.error === 'forbidden') {
        setError(t('forbidden'));
      } else if (result.error === 'conflict') {
        setError(t('conflict'));
      } else if (result.error === 'validation_failed') {
        setUsability({ kind: 'blocked', code: result.code ?? 'V-TEC-14', message: result.message ?? '' });
      } else {
        setError(result.message ?? t('saveError'));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={t('addComponent')}
      subtitle={t('addComponentSubtitle')}
      footer={
        <>
          <Button type="button" className="btn-secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            title={checking ? t('checkingUsability') : undefined}
            onClick={onSubmit}
          >
            {t('addAction')}
          </Button>
        </>
      }
    >
      {released ? (
        <div className="alert alert-amber mb-3" role="status">
          <div className="alert-title">{t('newDraftNotice', { status: context.sourceStatus })}</div>
        </div>
      ) : null}

      <input
        autoFocus
        aria-label={t('searchPlaceholder')}
        placeholder={t('searchPlaceholder')}
        className="form-input mb-2 w-full font-mono"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />

      <div
        className="max-h-72 overflow-y-auto"
        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
        role="listbox"
        aria-label={t('addComponent')}
      >
        {materialsState === 'loading' ? (
          <div className="space-y-2 p-3">
            <div className="h-6 animate-pulse rounded bg-slate-100" />
            <div className="h-6 animate-pulse rounded bg-slate-100" />
            <p className="sr-only">{t('loadingMaterials')}</p>
          </div>
        ) : materialsState === 'error' ? (
          <p role="alert" className="p-5 text-center text-slate-500">
            {t('saveError')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-5 text-center text-slate-500">{t('noMaterials')}</p>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={picked?.id === m.id}
              onClick={() => onPick(m)}
              className={`grid w-full grid-cols-[110px_1fr_70px] items-center gap-2 border-b px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-slate-50 ${
                picked?.id === m.id ? 'bg-blue-50' : 'bg-white'
              }`}
            >
              <span className="font-mono">{m.itemCode}</span>
              <span className="truncate">{m.name}</span>
              <span className="font-mono text-[11px] text-slate-400">{m.itemType}</span>
            </button>
          ))
        )}
      </div>

      {picked ? (
        <div className="mt-3 space-y-3">
          {usability.kind === 'checking' ? (
            <p className="muted" style={{ fontSize: 12 }} role="status">
              {t('checkingUsability')}
            </p>
          ) : usability.kind === 'ok' && usability.warnings.length > 0 ? (
            // Draft authoring: addable, but surface every readiness gap as a
            // visible warning badge so the user knows what factory-release will
            // later require. The "Add component" button stays enabled.
            <div role="status" className="alert alert-amber" data-testid="bom-component-warnings">
              <div className="alert-title">
                {tg('usabilityWarningsTitle', 'Addable now — readiness warnings (resolve before factory release)')}
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px]">
                {usability.warnings.map((w) => (
                  <li key={w.code} data-warning-code={w.code}>
                    {tg('usabilityWarning', '{label} ({code})', { code: w.code, label: w.label })}
                  </li>
                ))}
              </ul>
            </div>
          ) : usability.kind === 'ok' ? (
            <p style={{ fontSize: 12, color: 'var(--green-700)' }} role="status">
              {t('usableOk')}
            </p>
          ) : usability.kind === 'blocked' ? (
            <div role="alert" className="alert alert-red">
              <div className="alert-title">{t('usabilityBlocked', { code: usability.code, message: usability.message })}</div>
            </div>
          ) : null}

          <div className="ff-inline">
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{t('quantityPerPack', { uom: picked.uomBase })}<span className="req">*</span></label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-input"
                aria-label={t('quantity')}
                value={qty}
                onChange={(event) => setQty(event.currentTarget.value)}
              />
              {qtyInvalid ? <span className="ff-error" role="alert">{t('quantityInvalid')}</span> : null}
            </div>
            <div className="ff" style={{ marginBottom: 0 }}>
              <label>{t('scrapPct')}</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="form-input"
                aria-label={t('scrapPct')}
                value={scrap}
                onChange={(event) => setScrap(event.currentTarget.value)}
              />
            </div>
          </div>

          <div className="ff" style={{ marginBottom: 0 }}>
            <label>{t('manufacturingOperation')}<span className="req">*</span></label>
            <Select
              value={operationName}
              onValueChange={setOperationName}
              options={operations}
              placeholder={t('manufacturingOperationPlaceholder')}
              aria-label={t('manufacturingOperation')}
            />
            {operationMissing ? (
              <span className="ff-error" role="alert">{t('manufacturingOperationRequired')}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="alert alert-red mt-3">
          <div className="alert-title">{error}</div>
        </div>
      ) : null}
    </Dialog>
  );
}

// ── MODAL-02: BOM Version Save ────────────────────────────────────────────────
export function VersionSaveModal({
  open,
  onClose,
  context,
  /** The draft lines to persist into the new version (supplied by the parent). */
  lines,
  coProducts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  context: BomEditContext;
  lines: Array<{
    itemId?: string;
    componentCode: string;
    quantity: number;
    uom: string;
    scrapPct?: number;
    manufacturingOperationName?: string;
  }>;
  coProducts?: Array<{ coProductItemId: string; quantity: number; uom: string; allocationPct: number; isByproduct?: boolean }>;
  onSaved?: (result: { id: string; version: number }) => void;
}) {
  const t = useTranslations('technical.bom.edit');
  const router = useRouter();

  const [label, setLabel] = React.useState(`v${context.currentVersion + 1}`);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) return;
    setReason('');
    setLabel(`v${context.currentVersion + 1}`);
    setError(null);
  }, [open, context.currentVersion]);

  const reasonTooShort = reason.trim().length < 10;
  const labelMissing = label.trim().length === 0;
  const canSubmit = !labelMissing && !reasonTooShort && lines.length > 0 && !pending;

  function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      // Clone-on-write: createBomDraft always opens a NEW draft version; the
      // released v{currentVersion} is never mutated in place.
      // F4 (W9 cross-review HIGH): same V-TEC-12 reconstruction as the
      // add-component fork path — parent share = 100 − Σ non-byproduct
      // co-product allocations. Without it, carrying any non-byproduct
      // co-product fails the create-draft allocation validation.
      const carriedCoProducts = coProducts ?? [];
      const parentAllocationPct =
        100 - carriedCoProducts.filter((cp) => !cp.isByproduct).reduce((acc, cp) => acc + cp.allocationPct, 0);
      const result = await createBomDraft({
        productId: context.productId,
        ...(context.bomHeaderId ? { sourceBomHeaderId: context.bomHeaderId } : {}),
        notes: `${label.trim()} — ${reason.trim()}`,
        lines,
        coProducts: carriedCoProducts,
        parentAllocationPct,
      });
      if (result.ok) {
        onSaved?.({ id: result.data.id, version: result.data.version });
        router.refresh();
        onClose();
      } else if (result.error === 'forbidden') {
        setError(t('forbidden'));
      } else if (result.error === 'conflict') {
        setError(t('conflict'));
      } else if (result.error === 'validation_failed') {
        setError(result.message ?? t('saveError'));
      } else {
        setError(t('saveError'));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('saveVersionTitle')}
      subtitle={t('saveVersionSubtitle', { product: context.productName ?? context.productId, version: context.currentVersion })}
      footer={
        <>
          <Button type="button" className="btn-secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="button" className="btn-primary" disabled={!canSubmit} onClick={onSubmit}>
            {t('saveVersion')}
          </Button>
        </>
      }
    >
      <div>
        <div className="ff">
          <label>{t('versionLabel')}<span className="req">*</span></label>
          <input
            className="form-input"
            value={label}
            aria-label={t('versionLabel')}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </div>
        <div className="ff">
          <label>{t('changeReason')}<span className="req">*</span></label>
          <textarea
            rows={3}
            minLength={10}
            aria-label={t('changeReason')}
            placeholder={t('changeReasonPlaceholder')}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <span className="ff-help">{t('changeReasonHelp')}</span>
          {reasonTooShort && reason.length > 0 ? (
            <span className="ff-error" role="alert">{t('changeReasonHelp')}</span>
          ) : null}
        </div>

        <div className="alert alert-blue" role="note">
          <div className="alert-title">{t('previousVersionNote', { version: context.currentVersion })}</div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="alert alert-red mt-3">
          <div className="alert-title">{error}</div>
        </div>
      ) : null}
    </Dialog>
  );
}

export type { BomValidationCode };
