'use client';

/**
 * Wave E7 — Disassembly BOM create flow.
 *
 * A disassembly BOM breaks ONE input item into N co-product OUTPUTS, each with an
 * expected yield % and a cost allocation % that MUST total 100 (±0.01, V-TEC-12).
 *
 * Two consumers share the authoring body here:
 *   - `DisassemblyBomCreate` — a standalone modal carrying the
 *     [Forward | Disassembly] type toggle (Forward mode reproduces the FG-picker
 *     route-to-detail behaviour; Disassembly mode embeds the authoring form).
 *   - `DisassemblyAuthoring` — the disassembly authoring body alone (input picker
 *     + co-products table + live allocation total + submit), embedded by the
 *     existing `NewBomModal` under its toggle so the forward path's test IDs and
 *     behaviour stay byte-for-byte intact.
 *
 * The co-products table provides [+ Add output], per-row remove, a LIVE running
 * allocation total, and a visual V-TEC-12 error whenever the total ≠ 100. Submit
 * → the real `createDisassemblyBomDraft` Server Action (1 input line + N
 * co-products). The server re-validates V-TEC-12 authoritatively; the live sum +
 * disabled-submit are cosmetic UX guards only, never the security boundary.
 *
 * Parity baseline: the existing BOM screens (bom-list.jsx:33 New BOM CTA,
 * modals.jsx:192-243 component-add picker chrome). Design-system tokens only;
 * no raw <select> (accessible listbox pickers); no UUID leak (code + name only).
 *
 * Real data — NO mocks: items come from `listItems` (withOrgContext + RLS); the
 * input + co-product pickers bind the real item master; submit persists a real
 * draft. RBAC is server-resolved (`canCreate`) and gates the CTA upstream.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import { createDisassemblyBomDraft } from '../_actions/disassembly';
import { listItems } from '../../items/_actions/list-items';
import type { ItemListItem, ItemStatus } from '../../items/_actions/shared';

export type BomType = 'forward' | 'disassembly';

type CoProductRow = {
  /** Stable client key for the row (React list reconciliation). */
  key: string;
  item: ItemListItem | null;
  expectedYield: string;
  allocation: string;
};

const ALLOCATION_TOLERANCE = 0.01;

const FG_STATUS_TONE: Record<ItemStatus, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  deprecated: 'badge-amber',
  blocked: 'badge-red',
};

let rowSeq = 0;
function newRow(): CoProductRow {
  rowSeq += 1;
  return { key: `cp-${rowSeq}`, item: null, expectedYield: '', allocation: '' };
}

function isEligibleFg(item: ItemListItem): boolean {
  return item.status === 'active';
}

/** Co-products / by-products / intermediates are valid disassembly outputs; the
 *  input may be any non-FG bulk item. Only active items are eligible. */
function isEligibleOutput(item: ItemListItem): boolean {
  return item.status === 'active' && item.itemType !== 'fg';
}

function isEligibleInput(item: ItemListItem): boolean {
  return item.status === 'active' && item.itemType !== 'fg';
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Format the running allocation total to at most 3 dp, trailing-zero trimmed. */
function formatSum(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

// ── Shared accessible item picker (listbox of options) ──────────────────────────
function ItemPicker({
  listState,
  filtered,
  pickedId,
  labelLoading,
  labelError,
  labelEmpty,
  onPick,
}: {
  listState: 'idle' | 'loading' | 'ready' | 'error';
  filtered: ItemListItem[];
  pickedId: string | null;
  labelLoading: string;
  labelError: string;
  labelEmpty: string;
  onPick: (item: ItemListItem) => void;
}) {
  return (
    <div
      className="max-h-60 overflow-y-auto"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
      role="listbox"
      aria-label={labelEmpty}
    >
      {listState === 'loading' ? (
        <div className="space-y-2 p-3">
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <p className="sr-only">{labelLoading}</p>
        </div>
      ) : listState === 'error' ? (
        <p role="alert" className="p-5 text-center" style={{ color: 'var(--muted)' }}>
          {labelError}
        </p>
      ) : filtered.length === 0 ? (
        <p className="p-5 text-center" style={{ color: 'var(--muted)' }}>
          {labelEmpty}
        </p>
      ) : (
        filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={pickedId === m.id}
            onClick={() => onPick(m)}
            className="grid w-full grid-cols-[120px_1fr_auto] items-center gap-2 px-3 py-2 text-left text-[13px]"
            style={{
              borderBottom: '1px solid var(--border)',
              background: pickedId === m.id ? 'var(--blue-050)' : '#fff',
            }}
          >
            <span className="mono">{m.itemCode}</span>
            <span className="truncate">{m.name}</span>
            <span className="font-mono text-[11px] text-slate-400">{m.itemType}</span>
          </button>
        ))
      )}
    </div>
  );
}

/**
 * The disassembly authoring body: input item picker + co-products table + live
 * allocation total + submit. Embedded by both the standalone modal and
 * NewBomModal. It owns its own item-master load + submit so either host needs
 * only render it under a toggle.
 */
export function DisassemblyAuthoring({
  detailHrefBase,
  onClose,
}: {
  detailHrefBase: string;
  onClose: () => void;
}) {
  const t = useTranslations('technical.bom.disassembly');
  const router = useRouter();

  const [items, setItems] = React.useState<ItemListItem[] | null>(null);
  const [listState, setListState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [inputSearch, setInputSearch] = React.useState('');
  const [inputPickerOpen, setInputPickerOpen] = React.useState(false);
  const [pickedInput, setPickedInput] = React.useState<ItemListItem | null>(null);
  const [rows, setRows] = React.useState<CoProductRow[]>(() => [newRow()]);
  const [openPickerKey, setOpenPickerKey] = React.useState<string | null>(null);
  const [rowSearch, setRowSearch] = React.useState('');

  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Load the real item master on mount.
  React.useEffect(() => {
    let cancelled = false;
    setListState('loading');
    void (async () => {
      try {
        const res = await listItems();
        if (cancelled) return;
        if (res.state === 'error') {
          setListState('error');
          return;
        }
        setItems(res.items);
        setListState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[technical/bom] DisassemblyAuthoring listItems failed', err);
        setListState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inputCandidates = React.useMemo(() => (items ?? []).filter(isEligibleInput), [items]);
  const inputFiltered = React.useMemo(() => {
    const q = inputSearch.trim().toLowerCase();
    if (!q) return inputCandidates.slice(0, 20);
    return inputCandidates
      .filter((m) => m.itemCode.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [inputCandidates, inputSearch]);

  const outputCandidates = React.useMemo(() => (items ?? []).filter(isEligibleOutput), [items]);
  const rowFiltered = React.useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    if (!q) return outputCandidates.slice(0, 20);
    return outputCandidates
      .filter((m) => m.itemCode.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [outputCandidates, rowSearch]);

  const allocationSum = React.useMemo(
    () => rows.reduce((acc, r) => acc + (toNumber(r.allocation) ?? 0), 0),
    [rows],
  );
  const allocationValid = Math.abs(allocationSum - 100) <= ALLOCATION_TOLERANCE;
  const allRowsComplete = rows.every(
    (r) => r.item != null && toNumber(r.expectedYield) != null && toNumber(r.allocation) != null,
  );
  const submittable = pickedInput != null && rows.length > 0 && allRowsComplete && allocationValid && !pending;

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }
  function patchRow(key: string, patch: Partial<CoProductRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onSubmit() {
    if (!submittable || !pickedInput) return;
    setError(null);
    startTransition(async () => {
      const result = await createDisassemblyBomDraft({
        bom_type: 'disassembly',
        productId: pickedInput.itemCode,
        lines: [
          {
            itemId: pickedInput.id,
            componentCode: pickedInput.itemCode,
            quantity: 1,
            uom: pickedInput.uomBase,
          },
        ],
        coProducts: rows.map((r) => ({
          itemId: r.item!.id,
          coProductItemId: r.item!.id,
          quantity: 1,
          uom: r.item!.uomBase,
          allocationPct: toNumber(r.allocation) ?? 0,
          expectedYieldPct: toNumber(r.expectedYield) ?? 0,
        })),
      });

      if (result.ok) {
        onClose();
        router.push(`${detailHrefBase}/${encodeURIComponent(pickedInput.itemCode)}`);
        router.refresh();
        return;
      }
      if (result.error === 'forbidden') {
        setError(t('forbidden'));
      } else if (result.error === 'invalid_input') {
        setError(t('invalidInput'));
      } else if (result.error.startsWith('V-TEC-12')) {
        setError(t('allocationError'));
      } else {
        setError(t('saveError'));
      }
    });
  }

  return (
    <div data-testid="disassembly-form">
      {/* ── Input item picker ──────────────────────────────────────────────── */}
      <div className="ff">
        <label>
          {t('inputLabel')}
          <span className="req">*</span>
        </label>
        <button
          type="button"
          data-testid="disassembly-input-picker"
          className="form-input w-full text-left font-mono"
          aria-haspopup="listbox"
          aria-expanded={inputPickerOpen}
          onClick={() => setInputPickerOpen((v) => !v)}
        >
          {pickedInput ? (
            <span>
              <span className="mono">{pickedInput.itemCode}</span>
              <span className="muted"> · {pickedInput.name}</span>
            </span>
          ) : (
            <span className="muted">{t('inputPlaceholder')}</span>
          )}
        </button>
        {inputPickerOpen ? (
          <div className="mt-1">
            <input
              autoFocus
              aria-label={t('searchPlaceholder')}
              placeholder={t('searchPlaceholder')}
              className="form-input mb-1 w-full font-mono"
              value={inputSearch}
              onChange={(event) => setInputSearch(event.currentTarget.value)}
            />
            <ItemPicker
              listState={listState}
              filtered={inputFiltered}
              pickedId={pickedInput?.id ?? null}
              labelLoading={t('loadingItems')}
              labelError={t('saveError')}
              labelEmpty={t('noItems')}
              onPick={(m) => {
                setPickedInput(m);
                setInputPickerOpen(false);
              }}
            />
          </div>
        ) : null}
        {!pickedInput ? <span className="ff-help">{t('inputRequired')}</span> : null}
      </div>

      {/* ── Co-products table ──────────────────────────────────────────────── */}
      <div className="ff" style={{ marginBottom: 6 }}>
        <span className="ff-label" style={{ display: 'block', marginBottom: 4 }}>
          {t('outputsLabel')}
        </span>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }} data-testid="disassembly-coproducts-table">
        <table aria-label={t('outputsLabel')}>
          <thead>
            <tr>
              <th scope="col">{t('colCoProduct')}</th>
              <th scope="col" style={{ textAlign: 'right' }}>{t('colExpectedYield')}</th>
              <th scope="col" style={{ textAlign: 'right' }}>{t('colAllocation')}</th>
              <th scope="col" style={{ textAlign: 'right' }}>{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pickerOpen = openPickerKey === row.key;
              return (
                <tr key={row.key} data-testid="disassembly-coproduct-row">
                  <td style={{ minWidth: 220 }}>
                    <button
                      type="button"
                      data-testid="disassembly-coproduct-picker"
                      className="form-input w-full text-left font-mono"
                      aria-haspopup="listbox"
                      aria-expanded={pickerOpen}
                      onClick={() => {
                        setOpenPickerKey(pickerOpen ? null : row.key);
                        setRowSearch('');
                      }}
                    >
                      {row.item ? (
                        <span>
                          <span className="mono">{row.item.itemCode}</span>
                          <span className="muted"> · {row.item.name}</span>
                        </span>
                      ) : (
                        <span className="muted">{t('coProductPlaceholder')}</span>
                      )}
                    </button>
                    {pickerOpen ? (
                      <div className="mt-1">
                        <input
                          autoFocus
                          aria-label={t('searchPlaceholder')}
                          placeholder={t('searchPlaceholder')}
                          className="form-input mb-1 w-full font-mono"
                          value={rowSearch}
                          onChange={(event) => setRowSearch(event.currentTarget.value)}
                        />
                        <ItemPicker
                          listState={listState}
                          filtered={rowFiltered}
                          pickedId={row.item?.id ?? null}
                          labelLoading={t('loadingItems')}
                          labelError={t('saveError')}
                          labelEmpty={t('noItems')}
                          onPick={(m) => {
                            patchRow(row.key, { item: m });
                            setOpenPickerKey(null);
                          }}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      data-testid="disassembly-yield-input"
                      aria-label={t('colExpectedYield')}
                      className="form-input tabular-nums text-right"
                      style={{ width: 110 }}
                      value={row.expectedYield}
                      onChange={(event) => patchRow(row.key, { expectedYield: event.currentTarget.value })}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      data-testid="disassembly-allocation-input"
                      aria-label={t('colAllocation')}
                      className="form-input tabular-nums text-right"
                      style={{ width: 110 }}
                      value={row.allocation}
                      onChange={(event) => patchRow(row.key, { allocation: event.currentTarget.value })}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      data-testid="disassembly-remove-output"
                      className="btn btn-secondary btn-sm"
                      aria-label={t('removeOutput')}
                      disabled={rows.length <= 1}
                      title={rows.length <= 1 ? t('inputRequired') : t('removeOutput')}
                      onClick={() => removeRow(row.key)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="muted" style={{ textAlign: 'right', fontWeight: 600 }}>
                {t('allocationSumLabel')}
              </td>
              <td />
              <td style={{ textAlign: 'right' }}>
                <span
                  data-testid="disassembly-allocation-sum"
                  className={`badge ${allocationValid ? 'badge-green' : 'badge-red'} tabular-nums`}
                >
                  {formatSum(allocationSum)}%
                </span>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2">
        <button type="button" data-testid="disassembly-add-output" className="btn btn-secondary btn-sm" onClick={addRow}>
          {t('addOutput')}
        </button>
      </div>

      {allocationValid ? (
        <p
          data-testid="disassembly-allocation-valid"
          role="status"
          style={{ fontSize: 12, color: 'var(--green-700)', marginTop: 8 }}
        >
          {t('allocationValid')}
        </p>
      ) : (
        <div data-testid="disassembly-allocation-error" role="alert" className="alert alert-red mt-2">
          <div className="alert-title">{t('allocationError')}</div>
        </div>
      )}

      {error ? (
        <div role="alert" className="alert alert-red mt-2" data-testid="disassembly-submit-error">
          <div className="alert-title">{error}</div>
        </div>
      ) : null}

      <div className="modal-foot" style={{ marginTop: 12 }}>
        <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          className="btn-primary btn-sm"
          data-testid="disassembly-submit"
          disabled={!submittable}
          title={!allocationValid ? t('allocationError') : pickedInput == null ? t('inputRequired') : undefined}
          onClick={onSubmit}
        >
          {pending ? t('creating') : t('submit')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Standalone type-aware create modal. Forward mode reproduces the FG-picker
 * route-to-detail behaviour; Disassembly mode embeds DisassemblyAuthoring. Used
 * by the dedicated E7 RTL suite; the production list screen embeds the toggle in
 * NewBomModal instead (so the forward-path tests stay untouched).
 */
export function DisassemblyBomCreate({
  open,
  onClose,
  detailHrefBase,
  itemsHref = '/technical/items',
  initialType = 'forward',
}: {
  open: boolean;
  onClose: () => void;
  detailHrefBase: string;
  itemsHref?: string;
  initialType?: BomType;
}) {
  const t = useTranslations('technical.bom.disassembly');
  const tNew = useTranslations('technical.bom.newBom');
  const router = useRouter();
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const [bomType, setBomType] = React.useState<BomType>(initialType);
  const [items, setItems] = React.useState<ItemListItem[] | null>(null);
  const [listState, setListState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fgSearch, setFgSearch] = React.useState('');
  const [pickedFg, setPickedFg] = React.useState<ItemListItem | null>(null);

  React.useEffect(() => {
    if (!open) {
      setBomType(initialType);
      setFgSearch('');
      setPickedFg(null);
      setListState('idle');
      setItems(null);
      return;
    }
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, initialType]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setListState('loading');
    void (async () => {
      try {
        const res = await listItems({ itemTypes: ['fg'] });
        if (cancelled) return;
        if (res.state === 'error') {
          setListState('error');
          return;
        }
        setItems(res.items.filter((m) => m.itemType === 'fg'));
        setListState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[technical/bom] DisassemblyBomCreate fg listItems failed', err);
        setListState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const fgFiltered = React.useMemo(() => {
    const list = items ?? [];
    const q = fgSearch.trim().toLowerCase();
    if (!q) return list.slice(0, 20);
    return list.filter((m) => m.itemCode.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 20);
  }, [items, fgSearch]);

  function onForwardContinue() {
    if (!pickedFg || !isEligibleFg(pickedFg)) return;
    onClose();
    router.push(`${detailHrefBase}/${encodeURIComponent(pickedFg.itemCode)}`);
  }

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
        className="modal-box wide outline-none"
        data-testid="disassembly-bom-modal"
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {bomType === 'disassembly' ? t('title') : tNew('title')}
            </h2>
            <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {bomType === 'disassembly' ? t('subtitle') : tNew('subtitle')}
            </p>
          </div>
          <button type="button" aria-label={t('cancel')} className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <BomTypeToggle bomType={bomType} onChange={setBomType} hintForward={tNew('subtitle')} />

          {bomType === 'disassembly' ? (
            <DisassemblyAuthoring detailHrefBase={detailHrefBase} onClose={onClose} />
          ) : (
            <>
              <input
                autoFocus
                aria-label={tNew('searchPlaceholder')}
                placeholder={tNew('searchPlaceholder')}
                className="form-input mb-2 w-full font-mono"
                value={fgSearch}
                onChange={(event) => setFgSearch(event.currentTarget.value)}
              />
              <div
                className="max-h-72 overflow-y-auto"
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                role="listbox"
                aria-label={tNew('title')}
              >
                {listState === 'loading' ? (
                  <div className="space-y-2 p-3">
                    <div className="h-6 animate-pulse rounded bg-slate-100" />
                    <div className="h-6 animate-pulse rounded bg-slate-100" />
                    <p className="sr-only">{tNew('loading')}</p>
                  </div>
                ) : listState === 'error' ? (
                  <p role="alert" className="p-5 text-center" style={{ color: 'var(--muted)' }}>
                    {tNew('error')}
                  </p>
                ) : fgFiltered.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">{tNew('noFgs')}</div>
                    <div className="empty-state-body">{tNew('emptyBody')}</div>
                    <div className="empty-state-action">
                      <Link href={itemsHref} className="btn btn-secondary btn-sm" onClick={onClose}>
                        {tNew('viewItems')}
                      </Link>
                    </div>
                  </div>
                ) : (
                  fgFiltered.map((m) => {
                    const eligible = isEligibleFg(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={pickedFg?.id === m.id}
                        aria-disabled={!eligible}
                        disabled={!eligible}
                        data-eligible={eligible ? 'true' : 'false'}
                        title={eligible ? undefined : tNew('blockedHint')}
                        onClick={() => {
                          if (eligible) setPickedFg(m);
                        }}
                        className="grid w-full grid-cols-[120px_1fr_auto] items-center gap-2 px-3 py-2 text-left text-[13px]"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: pickedFg?.id === m.id ? 'var(--blue-050)' : '#fff',
                          cursor: eligible ? 'pointer' : 'not-allowed',
                          opacity: eligible ? 1 : 0.6,
                        }}
                      >
                        <span className="mono">{m.itemCode}</span>
                        <span className="truncate">{m.name}</span>
                        <span className={`badge ${FG_STATUS_TONE[m.status] ?? 'badge-gray'}`}>{m.status}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="modal-foot" style={{ marginTop: 12 }}>
                <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                  {tNew('cancel')}
                </Button>
                <Button
                  type="button"
                  className="btn-primary btn-sm"
                  data-testid="disassembly-forward-confirm"
                  disabled={!pickedFg || !isEligibleFg(pickedFg)}
                  onClick={onForwardContinue}
                >
                  {tNew('confirm')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The [Forward | Disassembly] segmented toggle, shared by both create hosts. */
export function BomTypeToggle({
  bomType,
  onChange,
  hintForward,
}: {
  bomType: BomType;
  onChange: (next: BomType) => void;
  /** Copy shown under the toggle in Forward mode (the host's own subtitle). */
  hintForward: string;
}) {
  const t = useTranslations('technical.bom.disassembly');
  return (
    <div className="ff" style={{ marginBottom: 12 }}>
      <span className="ff-label" style={{ display: 'block', marginBottom: 4 }}>
        {t('typeLabel')}
      </span>
      <div
        className="seg"
        role="group"
        aria-label={t('typeLabel')}
        style={{
          display: 'inline-flex',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          data-testid="bom-type-forward"
          aria-pressed={bomType === 'forward'}
          onClick={() => onChange('forward')}
          className={`btn btn-sm ${bomType === 'forward' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 0 }}
        >
          {t('typeForward')}
        </button>
        <button
          type="button"
          data-testid="bom-type-disassembly"
          aria-pressed={bomType === 'disassembly'}
          onClick={() => onChange('disassembly')}
          className={`btn btn-sm ${bomType === 'disassembly' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 0 }}
        >
          {t('typeDisassembly')}
        </button>
      </div>
      <p className="ff-help" style={{ marginTop: 4 }}>
        {bomType === 'disassembly' ? t('typeHint') : hintForward}
      </p>
    </div>
  );
}

export default DisassemblyBomCreate;
