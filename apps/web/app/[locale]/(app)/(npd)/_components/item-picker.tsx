'use client';

/**
 * Lane-B — ItemPicker (combobox over the REAL items master).
 *
 * A "component"/"ingredient" must be a real item from public.items, never free
 * text and never a hardcoded list. This combobox searches the items master via
 * the org-scoped `searchItems` Server Action (RLS-pinned) and, on select, returns
 * the item's id + code (+ name / type / cost) so the caller can wire a
 * prod_detail.item_id / formulation_ingredients.item_id row.
 *
 * No raw <select> (red line): the picker is a search Input + a filtered listbox
 * (role="combobox"/role="listbox"), keyboard-navigable, built on @monopilot/ui
 * primitives. There is no Radix Popover in @monopilot/ui, so the dropdown is a
 * self-contained absolutely-positioned panel.
 *
 * Prototype parity: the "ingredient library" picker (recipe.jsx:194 "+ Add
 * ingredient" with real `code`) + the brief Components real `code` column
 * (brief-screens.jsx:96-190). Each option shows the real item code (mono) + name.
 */

import React from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import type { ItemPickerOption } from '../../../../(npd)/fa/actions/search-items';

export type ItemPickerLabels = {
  /** Trigger button text (e.g. "+ Add production component"). */
  trigger: string;
  /** Accessible label for the search input. */
  searchLabel: string;
  searchPlaceholder: string;
  loading: string;
  empty: string;
  /** Hint shown under an option's code (item type). */
  cancel: string;
  /** Error toast text when the search action throws. */
  error: string;
};

export type SearchableItemType = 'fg' | 'rm' | 'ingredient' | 'intermediate' | 'co_product' | 'byproduct' | 'packaging';
export type ComponentItemType = Exclude<SearchableItemType, 'fg'>;

export type ItemSearchFn<TItemType extends SearchableItemType = ComponentItemType> = (input: {
  query?: string;
  itemTypes?: TItemType[];
  limit?: number;
}) => Promise<ItemPickerOption[]>;

const SEARCH_DEBOUNCE_MS = 250;

/** English fallbacks so a partial/absent label bundle never crashes the picker. */
const DEFAULT_PICKER_LABELS: ItemPickerLabels = {
  trigger: '+ Add item',
  searchLabel: 'Search items',
  searchPlaceholder: 'Search by code or name…',
  loading: 'Searching…',
  empty: 'No matching items',
  cancel: 'Cancel',
  error: 'Item search failed',
};

export function ItemPicker<TItemType extends SearchableItemType = ComponentItemType>({
  labels: labelsProp,
  onSelect,
  searchItemsAction,
  itemTypes,
  disabled = false,
  triggerClassName,
}: {
  labels?: ItemPickerLabels;
  /** Called with the chosen real item; the caller persists item_id + code. */
  onSelect: (item: ItemPickerOption) => void;
  /** Server Action seam (defaults to the org-scoped searchItems action). */
  searchItemsAction: ItemSearchFn<TItemType>;
  itemTypes?: TItemType[];
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const labels: ItemPickerLabels = { ...DEFAULT_PICKER_LABELS, ...labelsProp };

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<ItemPickerOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = React.useRef(0);

  // The dropdown is portaled to <body> with fixed positioning so it is never
  // clipped by a modal's overflow / out-stacked by a modal's z-index (the picker
  // lives inside PO/TO/WO create modals). Anchor it to the trigger's rect.
  const [panelRect, setPanelRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const updatePanelPosition = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(420, Math.max(320, r.width, window.innerWidth - 24));
    // Keep the panel within the viewport horizontally.
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setPanelRect({ top: r.bottom + 4, left, width });
  }, []);

  const runSearch = React.useCallback(
    (term: string) => {
      const seq = ++reqRef.current;
      setLoading(true);
      setError(false);
      void (async () => {
        try {
          const result = await searchItemsAction({ query: term, itemTypes });
          // Ignore out-of-order responses (a later keystroke already fired).
          if (seq !== reqRef.current) return;
          setOptions(result);
          setActiveIndex(0);
        } catch {
          if (seq !== reqRef.current) return;
          setOptions([]);
          setError(true);
        } finally {
          if (seq === reqRef.current) setLoading(false);
        }
      })();
    },
    [itemTypes, searchItemsAction],
  );

  // Initial + debounced search whenever the popover is open and the term changes.
  React.useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, query, runSearch]);

  // Focus the search input when opening; reset state on close. Position + keep
  // the portaled panel anchored to the trigger on open / scroll / resize.
  React.useEffect(() => {
    if (open) {
      updatePanelPosition();
      inputRef.current?.focus();
      const reposition = () => updatePanelPosition();
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      return () => {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      };
    }
    setQuery('');
    setOptions([]);
    setError(false);
    setPanelRect(null);
    return undefined;
  }, [open, updatePanelPosition]);

  // The portaled input mounts only once panelRect is set — focus it then.
  React.useEffect(() => {
    if (open && panelRect) inputRef.current?.focus();
  }, [open, panelRect]);

  // Close on outside click / Escape. The panel is portaled, so a click inside it
  // is NOT inside containerRef — exclude panelRef too or selecting an option closes
  // before its onClick fires.
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(item: ItemPickerOption) {
    onSelect(item);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = options[activeIndex];
      if (item) choose(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const listId = React.useId();

  return (
    <div ref={containerRef} className="relative inline-block" data-testid="item-picker">
      <Button
        type="button"
        className={triggerClassName ?? 'btn--secondary'}
        disabled={disabled}
        aria-label={labels.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="item-picker-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {labels.trigger}
      </Button>

      {open && panelRect && typeof document !== 'undefined' ? (
        createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={labels.searchLabel}
          style={{
            position: 'fixed',
            top: panelRect.top,
            left: panelRect.left,
            width: panelRect.width,
            zIndex: 1000,
            // The panel is portaled to <body> so it escapes a create-modal's
            // overflow/z-index. But the modals make the background inert by
            // setting `pointer-events: none` on an ancestor (overlay/body), which
            // an absolutely-portaled <body> child INHERITS — leaving every option
            // visible but un-clickable by mouse (clicks fall through to the modal
            // field behind). Explicitly re-enable pointer events on the panel
            // (z-1000 already stacks it above the modal). Without this, picking a
            // product in the WO/SO/PO/TO create modals is impossible by mouse.
            pointerEvents: 'auto',
          }}
          className="rounded-md border border-slate-200 bg-white p-2 shadow-xl"
          data-testid="item-picker-panel"
        >
          <Input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={labels.searchLabel}
            value={query}
            placeholder={labels.searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />

          <ul
            id={listId}
            role="listbox"
            aria-label={labels.searchLabel}
            className="mt-1 max-h-56 overflow-auto"
            data-testid="item-picker-options"
          >
            {loading ? (
              <li role="status" className="px-2 py-2 text-xs text-slate-500">
                {labels.loading}
              </li>
            ) : error ? (
              <li role="alert" className="px-2 py-2 text-xs text-red-600">
                {labels.error}
              </li>
            ) : options.length === 0 ? (
              <li className="px-2 py-2 text-xs text-slate-500" data-testid="item-picker-empty">
                {labels.empty}
              </li>
            ) : (
              options.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === activeIndex}
                  data-testid="item-picker-option"
                  data-item-id={item.id}
                  className={[
                    'cursor-pointer rounded px-2 py-1.5 text-sm',
                    idx === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50',
                  ].join(' ')}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => choose(item)}
                >
                  <span className="font-mono text-xs font-semibold text-blue-700">
                    {item.itemCode}
                  </span>
                  <span className="ml-2 text-slate-800">{item.name}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                    {item.itemType}
                  </span>
                  <span className="ml-2 text-[10px] tabular-nums text-slate-500">
                    {item.costPerKgEur ? `€${item.costPerKgEur}/${item.uomBase}` : `—/${item.uomBase}`}
                  </span>
                </li>
              ))
            )}
          </ul>

          <div className="mt-1 flex justify-end">
            <Button
              type="button"
              className="btn--ghost"
              data-testid="item-picker-cancel"
              onClick={() => setOpen(false)}
            >
              {labels.cancel}
            </Button>
          </div>
        </div>,
        document.body,
        )
      ) : null}
    </div>
  );
}

export default ItemPicker;
