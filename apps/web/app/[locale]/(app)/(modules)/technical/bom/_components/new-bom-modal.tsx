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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';

import { listItems } from '../../items/_actions/list-items';
import type { ItemListItem } from '../../items/_actions/shared';

export function NewBomModal({
  open,
  onClose,
  detailHrefBase,
}: {
  open: boolean;
  onClose: () => void;
  detailHrefBase: string;
}) {
  const t = useTranslations('technical.bom.newBom');
  const router = useRouter();
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<ItemListItem[] | null>(null);
  const [listState, setListState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [picked, setPicked] = React.useState<ItemListItem | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setPicked(null);
      return;
    }
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || listState !== 'idle') return;
    let cancelled = false;
    setListState('loading');
    void (async () => {
      const res = await listItems();
      if (cancelled) return;
      if (res.state === 'error') {
        setListState('error');
      } else {
        setItems(res.items.filter((m) => m.itemType === 'fg'));
        setListState('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listState]);

  const filtered = React.useMemo(() => {
    const list = items ?? [];
    const qq = search.trim().toLowerCase();
    if (!qq) return list.slice(0, 20);
    return list
      .filter((m) => m.itemCode.toLowerCase().includes(qq) || m.name.toLowerCase().includes(qq))
      .slice(0, 20);
  }, [items, search]);

  function onConfirm() {
    if (!picked) return;
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
              <div className="space-y-2 p-3">
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <p className="sr-only">{t('loading')}</p>
              </div>
            ) : listState === 'error' ? (
              <p role="alert" className="p-5 text-center" style={{ color: 'var(--muted)' }}>
                {t('error')}
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-5 text-center" style={{ color: 'var(--muted)' }}>
                {t('noFgs')}
              </p>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={picked?.id === m.id}
                  data-testid="new-bom-fg-option"
                  onClick={() => setPicked(m)}
                  className="grid w-full grid-cols-[120px_1fr] items-center gap-2 px-3 py-2 text-left text-[13px]"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: picked?.id === m.id ? 'var(--blue-050)' : '#fff',
                  }}
                >
                  <span className="mono">{m.itemCode}</span>
                  <span className="truncate">{m.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="modal-foot">
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className="btn-primary btn-sm"
            data-testid="new-bom-confirm"
            disabled={!picked}
            onClick={onConfirm}
          >
            {t('confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NewBomModal;
