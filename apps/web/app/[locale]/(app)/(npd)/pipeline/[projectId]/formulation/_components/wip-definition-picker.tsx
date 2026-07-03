'use client';

import React from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import type { WipDefinitionPickerOption } from '../../../../../../../(npd)/pipeline/[projectId]/formulation/_actions/search-wip-definitions';

export type WipDefinitionPickerLabels = {
  trigger: string;
  searchLabel: string;
  searchPlaceholder: string;
  loading: string;
  empty: string;
  cancel: string;
  error: string;
};

export type SearchWipDefinitionsFn = (input: { q?: string }) => Promise<
  | { ok: true; options: WipDefinitionPickerOption[] }
  | { ok: false; error: string }
>;

const SEARCH_DEBOUNCE_MS = 250;

const DEFAULT_LABELS: WipDefinitionPickerLabels = {
  trigger: '+ Add WIP',
  searchLabel: 'Search WIP definitions',
  searchPlaceholder: 'Search by name or item code…',
  loading: 'Searching…',
  empty: 'No matching WIP definitions',
  cancel: 'Cancel',
  error: 'WIP search failed',
};

export function WipDefinitionPicker({
  labels: labelsProp,
  onSelect,
  searchWipDefinitionsAction,
  disabled = false,
  triggerClassName,
}: {
  labels?: WipDefinitionPickerLabels;
  onSelect: (option: WipDefinitionPickerOption) => void;
  searchWipDefinitionsAction: SearchWipDefinitionsFn;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<WipDefinitionPickerOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = React.useRef(0);
  const [panelRect, setPanelRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const updatePanelPosition = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPanelRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
  }, []);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery('');
    setOptions([]);
    setError(false);
    setActiveIndex(0);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onScroll = () => updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePanelPosition]);

  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const reqId = ++reqRef.current;
      setLoading(true);
      setError(false);
      void searchWipDefinitionsAction({ q: query.trim() })
        .then((result) => {
          if (reqId !== reqRef.current) return;
          if (!result.ok) {
            setError(true);
            setOptions([]);
            return;
          }
          setOptions(result.options);
          setActiveIndex(0);
        })
        .catch(() => {
          if (reqId !== reqRef.current) return;
          setError(true);
          setOptions([]);
        })
        .finally(() => {
          if (reqId === reqRef.current) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, query, searchWipDefinitionsAction]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  function pick(option: WipDefinitionPickerOption) {
    onSelect(option);
    close();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) pick(option);
    }
  }

  const panel =
    open && panelRect && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={labels.searchLabel}
            data-testid="wip-definition-picker-panel"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              zIndex: 1200,
              pointerEvents: 'auto',
            }}
            className="rounded-md border border-slate-200 bg-white p-2 shadow-lg"
          >
            <Input
              ref={inputRef}
              aria-label={labels.searchLabel}
              placeholder={labels.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="form-input mb-2"
              data-testid="wip-definition-picker-search"
            />
            {loading ? (
              <p className="px-2 py-1 text-xs text-slate-500">{labels.loading}</p>
            ) : error ? (
              <p role="alert" className="px-2 py-1 text-xs text-red-600">
                {labels.error}
              </p>
            ) : options.length === 0 ? (
              <p className="px-2 py-1 text-xs text-slate-500">{labels.empty}</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {options.map((option, index) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      data-testid={`wip-definition-option-${option.id}`}
                      className={[
                        'flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm',
                        index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50',
                      ].join(' ')}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(option)}
                    >
                      <span className="font-medium text-slate-900">{option.name}</span>
                      <span className="mono text-[11px] text-slate-500">
                        {option.itemCode} · {option.baseUom}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex justify-end">
              <Button type="button" className="btn-ghost btn-sm" onClick={close}>
                {labels.cancel}
              </Button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        type="button"
        className={triggerClassName ?? 'btn-secondary btn-sm'}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="wip-definition-picker-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (!open) updatePanelPosition();
        }}
      >
        {labels.trigger}
      </Button>
      {panel}
    </div>
  );
}
