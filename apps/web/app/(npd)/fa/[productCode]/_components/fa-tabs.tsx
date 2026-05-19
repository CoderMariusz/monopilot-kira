'use client';

import { type KeyboardEvent, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const FA_TABS = [
  { slug: 'core', label: 'Core' },
  { slug: 'planning', label: 'Planning' },
  { slug: 'commercial', label: 'Commercial' },
  { slug: 'production', label: 'Production' },
  { slug: 'technical', label: 'Technical' },
  { slug: 'mrp', label: 'MRP' },
  { slug: 'procurement', label: 'Procurement' },
  { slug: 'history', label: 'History' },
] as const;

type FaTabSlug = (typeof FA_TABS)[number]['slug'];

type FaTabsProps = {
  productCode: string;
};

function isFaTabSlug(value: string | null): value is FaTabSlug {
  return FA_TABS.some((tab) => tab.slug === value);
}

export function FaTabs({ productCode }: FaTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab: FaTabSlug = isFaTabSlug(urlTab) ? urlTab : 'core';

  const tabPanels = useMemo(
    () => FA_TABS.map((tab) => ({ ...tab, tabId: `fa-tab-${tab.slug}`, panelId: `fa-panel-${tab.slug}` })),
    [],
  );

  function persistTab(nextTab: FaTabSlug) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  function focusAndPersistTab(nextTab: FaTabSlug) {
    persistTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`fa-tab-${nextTab}`)?.focus());
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: FaTabSlug) {
    const currentIndex = FA_TABS.findIndex((tab) => tab.slug === currentTab);
    const lastIndex = FA_TABS.length - 1;
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    focusAndPersistTab(FA_TABS[nextIndex].slug);
  }

  return (
    <section aria-label={`Factory Article ${productCode} departments`} className="space-y-3">
      <div data-slot="tabs" data-value={activeTab} className="w-full">
        <div
          aria-label="FA detail departments"
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
          data-slot="tabs-list"
          role="tablist"
        >
          {tabPanels.map((tab) => {
            const selected = activeTab === tab.slug;

            return (
              <button
                aria-controls={tab.panelId}
                aria-selected={selected}
                className={
                  selected
                    ? 'rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white'
                    : 'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
                }
                data-slot="tabs-trigger"
                data-state={selected ? 'active' : 'inactive'}
                data-value={tab.slug}
                id={tab.tabId}
                key={tab.slug}
                onClick={() => persistTab(tab.slug)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.slug)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {tabPanels.map((tab) => {
          const selected = activeTab === tab.slug;

          return (
            <div
              aria-labelledby={tab.tabId}
              data-slot="tabs-content"
              data-state={selected ? 'active' : 'inactive'}
              data-value={tab.slug}
              hidden={!selected}
              id={tab.panelId}
              key={tab.slug}
              role="tabpanel"
              tabIndex={0}
            >
              {selected ? (
                <div
                  className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
                  data-slot="card"
                >
                  <div data-slot="card-header" className="font-semibold text-slate-900">
                    {tab.label}
                  </div>
                  <div data-slot="card-content" className="mt-1">
                    deferred-empty — tab content deferred for {productCode}.
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FaTabs;
