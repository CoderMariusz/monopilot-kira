'use client';

/**
 * TW1-bom — "New BOM" entry modal (FG picker → route to detail).
 *
 * Prototype parity:
 *   `prototypes/design/Monopilot Design System/technical/bom-list.jsx:33`
 *     ("+ New BOM" primary CTA) — the prototype opens a create flow; the SSOT
 *     create path is per-FG (`bom_headers.product_id` = FG product_code), so the
 *     CTA first picks the target FG (search the real item master, FG only) and
 *     then routes to `/technical/bom/{code}` where the first draft version is
 *     authored via the real `createBomDraft` (Add component / Save version).
 *   Modal chrome follows `modals.jsx:192-243` (BOM Component Add picker):
 *     `.modal-overlay` + `.modal-box.wide` + `.modal-head/body/foot`, mono search
 *     `.form-input`, picker list, `.btn-secondary` / `.btn-primary` foot.
 *
 * Real data — NO mocks: the FG list comes from `listItems` (withOrgContext + RLS),
 * filtered to FG. The component picker / version save on the detail screen own the
 * actual write; this modal never free-texts an item — it binds the FG product_code.
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import { BomTypeToggle, DisassemblyAuthoring, type BomType } from './disassembly-bom-create';
import { listItems } from '../../items/_actions/list-items';
import { ITEM_CHOOSER_MAX_LIMIT } from '../../../../../../../lib/shared/pagination';
import type { ItemListItem, ItemStatus } from '../../items/_actions/shared';

// 5 semantic tones (MON-design-system rule 8) for the FG status badge shown
// next to each pickable item. Only `active` FGs are eligible to author a BOM
// against; the rest are shown DISABLED with their status so the user understands
// why they cannot be picked (rather than being silently hidden).
const FG_STATUS_TONE: Record<ItemStatus, string> = {
  draft: 'badge-gray',
  active: 'badge-green',
  deprecated: 'badge-amber',
  blocked: 'badge-red',
};

function isEligibleBomParent(item: ItemListItem): boolean {
  return item.status === 'active';
}

const BOM_PARENT_TYPES = new Set<ItemListItem['itemType']>(['fg', 'intermediate']);

export function NewBomModal({
  open,
  onClose,
  detailHrefBase,
  itemsHref = '/technical/items',
  prefillCode,
}: {
  open: boolean;
  onClose: () => void;
  detailHrefBase: string;
  /** Where the "create an FG first" empty-state link points. */
  itemsHref?: string;
  /** Preselect this FG code (deep-link from the item-detail BOM tab CTA). */
  prefillCode?: string;
}) {
  const t = useTranslations('technical.bom.newBom');
  const router = useRouter();
  const titleId = React.useId();

  // Graceful fallback for keys that may not yet exist in every locale bundle.
  // next-intl's default `getMessageFallback` returns the FULL dotted key path for
  // a missing key (and the RTL test mock does the same) — so a resolved value that
  // still ends with `.<key>` means "missing" and we substitute a readable default.
  const tt = React.useCallback(
    (key: string, fallback: string): string => {
      let resolved: string;
      try {
        resolved = t(key);
      } catch {
        return fallback;
      }
      return resolved === key || resolved.endsWith(`.${key}`) ? fallback : resolved;
    },
    [t],
  );
  const FG_STATUS_LABEL: Record<ItemStatus, string> = {
    draft: tt('status.draft', 'Draft'),
    active: tt('status.active', 'Active'),
    deprecated: tt('status.deprecated', 'Deprecated'),
    blocked: tt('status.blocked', 'Blocked'),
  };
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  // Wave E7 — type-aware create. Forward keeps the FG-picker route-to-detail flow
  // below 1:1; Disassembly swaps the body for the input + co-products authoring
  // form (DisassemblyAuthoring) which submits the real createDisassemblyBomDraft.
  const [bomType, setBomType] = React.useState<BomType>('forward');
  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<ItemListItem[] | null>(null);
  const [listState, setListState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [picked, setPicked] = React.useState<ItemListItem | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setPicked(null);
      setBomType('forward');
      // Re-arm the loader so re-opening the modal re-fetches a fresh FG list
      // (e.g. after the user created the missing FG item from the empty state).
      setListState('idle');
      setItems(null);
      return;
    }
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

  React.useEffect(() => {
    // Depend ONLY on `open`: with `listState` in the deps the setListState('loading')
    // below re-ran the effect, whose cleanup flipped `cancelled` and discarded every
    // resolved list — the permanent "Loading finished goods…" skeleton seen live.
    if (!open) return;
    let cancelled = false;
    setListState('loading');
    void (async () => {
      try {
        // Constrain the read to FG in SQL (under RLS); the action returns
        // state:'error' on a handled failure. A REJECTED promise (e.g. a Server
        // Action that throws at the RSC boundary) is caught below so the modal
        // can NEVER hang on the loading skeleton forever — the live failure mode.
        const res = await listItems({ itemTypes: ['fg', 'intermediate'], limit: ITEM_CHOOSER_MAX_LIMIT });
        if (cancelled) return;
        if (res.state === 'error') {
          setListState('error');
          return;
        }
        // Defensive: also filter client-side in case a caller widened the read.
        setItems(res.items.filter((m) => BOM_PARENT_TYPES.has(m.itemType)));
        setListState('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[technical/bom] NewBomModal listItems failed', err);
        setListState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Deep-link prefill: when opened from the item-detail BOM tab CTA
  // (`?new=<code>`), seed the search with the FG code and auto-select it once the
  // list resolves — but only if that FG is eligible (active).
  React.useEffect(() => {
    if (!open || !prefillCode || listState !== 'ready' || items === null) return;
    setSearch((prev) => (prev ? prev : prefillCode));
    const match = items.find((m) => m.itemCode === prefillCode);
    if (match && isEligibleBomParent(match)) setPicked((prev) => prev ?? match);
  }, [open, prefillCode, listState, items]);

  const filtered = React.useMemo(() => {
    const list = items ?? [];
    const qq = search.trim().toLowerCase();
    if (!qq) return list.slice(0, 20);
    return list
      .filter((m) => m.itemCode.toLowerCase().includes(qq) || m.name.toLowerCase().includes(qq))
      .slice(0, 20);
  }, [items, search]);

  function onConfirm() {
    if (!picked || !isEligibleBomParent(picked)) return;
    onClose();
    router.push(`${detailHrefBase}/${encodeURIComponent(picked.itemCode)}`);
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
        data-testid="new-bom-modal"
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {t('title')}
            </h2>
            <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {t('subtitle')}
            </p>
          </div>
          <button type="button" aria-label={t('cancel')} className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Wave E7 — [Forward | Disassembly] type toggle. The Forward branch
              below is unchanged (FG picker → route to detail); Disassembly swaps
              in the input + co-products authoring form. */}
          <BomTypeToggle bomType={bomType} onChange={setBomType} hintForward={t('subtitle')} />

          {bomType === 'disassembly' ? (
            <DisassemblyAuthoring detailHrefBase={detailHrefBase} onClose={onClose} />
          ) : (
            <>
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
            aria-label={t('title')}
          >
            {listState === 'loading' ? (
              <div className="space-y-2 p-3" data-testid="new-bom-loading">
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <p className="sr-only">{t('loading')}</p>
              </div>
            ) : listState === 'error' ? (
              <p role="alert" className="p-5 text-center" style={{ color: 'var(--muted)' }}>
                {t('error')}
              </p>
            ) : filtered.length === 0 ? (
              // No eligible/visible FG matched — proper empty-state (not a bare
              // line) explaining why, with a link to create an FG item first.
              <div className="empty-state" data-testid="new-bom-empty">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">{t('noFgs')}</div>
                <div className="empty-state-body">
                  {tt(
                    'emptyBody',
                    'A BOM is authored against an active finished good or manufactured WIP. Create or activate a parent item first, then return to add its components.',
                  )}
                </div>
                <div className="empty-state-action">
                  <Link href={itemsHref} className="btn btn-secondary btn-sm" onClick={onClose}>
                    {tt('viewItems', 'Go to items')}
                  </Link>
                </div>
              </div>
            ) : (
              filtered.map((m) => {
                const eligible = isEligibleBomParent(m);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={picked?.id === m.id}
                    aria-disabled={!eligible}
                    disabled={!eligible}
                    data-testid="new-bom-fg-option"
                    data-eligible={eligible ? 'true' : 'false'}
                    title={
                      eligible
                        ? undefined
                        : tt('blockedHint', 'Only active finished goods or manufactured WIPs can have a BOM authored against them.')
                    }
                    onClick={() => {
                      if (eligible) setPicked(m);
                    }}
                    className="grid w-full grid-cols-[120px_1fr_auto] items-center gap-2 px-3 py-2 text-left text-[13px]"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: picked?.id === m.id ? 'var(--blue-050)' : '#fff',
                      cursor: eligible ? 'pointer' : 'not-allowed',
                      opacity: eligible ? 1 : 0.6,
                    }}
                  >
                    <span className="mono">{m.itemCode}</span>
                    <span className="truncate">{m.name}</span>
                    <span className={`badge ${FG_STATUS_TONE[m.status] ?? 'badge-gray'}`}>
                      {FG_STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </button>
                );
              })
            )}
          </div>
            </>
          )}
        </div>

        {bomType === 'forward' ? (
          <div className="modal-foot">
            <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              className="btn-primary btn-sm"
              data-testid="new-bom-confirm"
              disabled={!picked || !isEligibleBomParent(picked)}
              onClick={onConfirm}
            >
              {t('confirm')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default NewBomModal;
