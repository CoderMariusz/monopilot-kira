'use client';

/**
 * T-039 — TEC-022 BOM Edit modals (component add + version save).
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
 *     `validateBomComponent` (T-074) Server Action, and the save persists a
 *     NEW draft version via `createBomDraft` (T-013) — never mutating an
 *     approved/active/released row in place (clone-on-write red-line).
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
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import { createBomDraft } from '../_actions/create-draft';
import type { BomStatus, BomValidationCode } from '../_actions/shared';
import { listItems } from '../../items/_actions/list-items';
import type { ItemListItem } from '../../items/_actions/shared';
import { listManufacturingOperations } from '../../../../../../../actions/reference/manufacturing-ops/list';
import { validateBomComponent } from '../../../../../../../actions/technical/boms/validate-component';
import type { RmUsabilityVerdict } from '../../../../../../../lib/technical/rm-usability';

/** Statuses for which an in-place edit is forbidden → Save means new draft. */
const RELEASED_STATUSES: ReadonlySet<BomStatus> = new Set<BomStatus>([
  'technical_approved',
  'active',
]);

export type BomEditContext = {
  /** Owning FG product_code (= bom_headers.product_id). */
  productId: string;
  /** Display name for the dialog subtitle. */
  productName?: string;
  /** Current/source BOM version number (for the "previous version" note). */
  currentVersion: number;
  /** Source BOM status — drives the released/clone-on-write copy. */
  sourceStatus: BomStatus;
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
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
        className={`w-full ${size === 'wide' ? 'max-w-2xl' : 'max-w-lg'} rounded-xl border bg-white p-5 text-sm shadow-lg outline-none`}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

// ── MODAL-03: BOM Component Add ───────────────────────────────────────────────
type UsabilityState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
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
      const [itemsRes, opsRes] = await Promise.all([listItems(), listManufacturingOperations({ includeInactive: false })]);
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
  const canSubmit = !!picked && !qtyInvalid && !operationMissing && !blocked && !pending;

  async function onPick(material: ItemListItem) {
    setPicked(material);
    setError(null);
    setUsability({ kind: 'checking' });
    const res = await validateBomComponent({ itemId: material.id });
    if (res.ok) {
      setUsability({ kind: 'ok' });
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

      // Clone-on-write: always create a NEW draft version (never edit in place).
      const result = await createBomDraft({
        productId: context.productId,
        lines: [
          {
            itemId: picked.id,
            componentCode: picked.itemCode,
            quantity: qtyNum,
            uom: picked.uomBase,
            scrapPct: Number(scrap) || 0,
            manufacturingOperationName: operationName.trim(),
          },
        ],
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
        setError(t('saveError'));
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
          <Button type="button" className="btn-primary" disabled={!canSubmit} onClick={onSubmit}>
            {t('addAction')}
          </Button>
        </>
      }
    >
      {released ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          {t('newDraftNotice', { status: context.sourceStatus })}
        </p>
      ) : null}

      <Input
        autoFocus
        aria-label={t('searchPlaceholder')}
        placeholder={t('searchPlaceholder')}
        className="mb-2 w-full font-mono"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />

      <div className="max-h-72 overflow-y-auto rounded-md border" role="listbox" aria-label={t('addComponent')}>
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
            <p className="text-xs text-slate-500" role="status">
              {t('checkingUsability')}
            </p>
          ) : usability.kind === 'ok' ? (
            <p className="text-xs text-green-700" role="status">
              {t('usableOk')}
            </p>
          ) : usability.kind === 'blocked' ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {t('usabilityBlocked', { code: usability.code, message: usability.message })}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              {t('quantityPerPack', { uom: picked.uomBase })}
              <Input
                type="number"
                step="0.0001"
                min="0"
                aria-label={t('quantity')}
                value={qty}
                onChange={(event) => setQty(event.currentTarget.value)}
              />
              {qtyInvalid ? (
                <span role="alert" className="mt-1 block text-xs text-red-600">
                  {t('quantityInvalid')}
                </span>
              ) : null}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {t('scrapPct')}
              <Input
                type="number"
                step="0.1"
                min="0"
                aria-label={t('scrapPct')}
                value={scrap}
                onChange={(event) => setScrap(event.currentTarget.value)}
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            {t('manufacturingOperation')}
            <Select
              value={operationName}
              onValueChange={setOperationName}
              options={operations}
              placeholder={t('manufacturingOperationPlaceholder')}
              aria-label={t('manufacturingOperation')}
            />
            {operationMissing ? (
              <span role="alert" className="mt-1 block text-xs text-red-600">
                {t('manufacturingOperationRequired')}
              </span>
            ) : null}
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
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
      const result = await createBomDraft({
        productId: context.productId,
        notes: `${label.trim()} — ${reason.trim()}`,
        lines,
        coProducts: coProducts ?? [],
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
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          {t('versionLabel')} *
          <Input
            value={label}
            aria-label={t('versionLabel')}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t('changeReason')} *
          <textarea
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            rows={3}
            minLength={10}
            aria-label={t('changeReason')}
            placeholder={t('changeReasonPlaceholder')}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">{t('changeReasonHelp')}</span>
          {reasonTooShort && reason.length > 0 ? (
            <span role="alert" className="mt-1 block text-xs text-red-600">
              {t('changeReasonHelp')}
            </span>
          ) : null}
        </label>

        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800" role="note">
          {t('previousVersionNote', { version: context.currentVersion })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

export type { BomValidationCode };
