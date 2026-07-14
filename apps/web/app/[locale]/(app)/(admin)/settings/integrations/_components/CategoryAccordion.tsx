'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';

import type { IntegrationCategory } from '../_data/load-integrations';

type TranslationValues = Record<string, string | number>;
type Translator = (key: string, values?: TranslationValues) => string;

type CategoryAccordionLabels = {
  categorySummary: (connected: number, total: number) => string;
  connectedBadge: (connected: number) => string;
  noCategoryIntegrations: (category: string) => string;
  emptyCategoryBody: string;
  browseCatalog: string;
  statusConnected: string;
  statusAvailable: string;
  configure: string;
  connect: string;
  expand: string;
  collapse: string;
};

function interpolate(template: string, values: TranslationValues = {}) {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

// Mirror of the server page's translate(): try the next-intl key, fall back to
// the same default string. Resolves the SAME `settings.integrations_screen`
// namespace so the strings are identical whether built server- or client-side.
function translate(t: Translator, key: string, fallback: string, values?: TranslationValues) {
  try {
    const value = t(key, values);
    if (value && value !== key) return value;
  } catch {
    // Locale message files for this SET-110 namespace may be absent in some
    // environments; fall through to the inline default.
  }
  return interpolate(fallback, values);
}

/**
 * Builds the function-valued label object CLIENT-side. The members
 * `categorySummary` / `connectedBadge` / `noCategoryIntegrations` are functions
 * and therefore cannot cross the RSC server→client boundary as props — the
 * page must NOT pass them in. This island resolves them itself via
 * `useTranslations`, matching the yard-module label-builder pattern.
 */
function buildCategoryAccordionLabels(t: Translator): CategoryAccordionLabels {
  return {
    categorySummary: (connected, total) =>
      translate(t, 'categorySummary', '{connected} connected · {total} available', { connected, total }),
    connectedBadge: (connected) => translate(t, 'connectedBadge', '{connected} connected', { connected }),
    noCategoryIntegrations: (category) =>
      translate(t, 'states.emptyCategoryTitle', 'No {category} integrations yet', { category: category.toLowerCase() }),
    emptyCategoryBody: translate(
      t,
      'states.emptyCategoryBody',
      'Request a connector from the Monopilot team or browse the catalog for alternatives.',
    ),
    browseCatalog: translate(t, 'actions.browseCatalog', 'Browse catalog'),
    statusConnected: translate(t, 'status.connected', '● Connected'),
    statusAvailable: translate(t, 'status.available', '— Available'),
    configure: translate(t, 'actions.configure', 'Configure'),
    connect: translate(t, 'actions.connect', 'Connect'),
    expand: translate(t, 'actions.expand', 'Expand category'),
    collapse: translate(t, 'actions.collapse', 'Collapse category'),
  };
}

function integrationLogo(item: IntegrationCategory['items'][number]) {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold text-white"
      style={{ background: item.color }}
    >
      {item.logo}
    </div>
  );
}

/**
 * Interactive category accordion (SET-110). Mirrors the prototype's
 * `expanded` toggle: every category starts expanded; clicking a header
 * collapses just that category (and re-expands it on a second click).
 */
export function CategoryAccordion({
  category,
}: {
  category: IntegrationCategory;
}) {
  // Build the (function-valued) labels client-side from the live next-intl
  // namespace; they must NOT be passed across the RSC boundary as props.
  const t = useTranslations('settings.integrations_screen') as Translator;
  const labels = useMemo(() => buildCategoryAccordionLabels(t), [t]);
  const [expanded, setExpanded] = useState(true);
  const connected = category.items.filter((item) => item.status === 'connected').length;
  const slug = category.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const headingId = `settings-integrations-${slug}`;
  const panelId = `settings-integrations-panel-${slug}`;

  return (
    <section
      aria-labelledby={headingId}
      className="sg-section rounded-md border bg-white"
      data-testid="settings-integrations-category-section"
    >
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={category.category}
          onClick={() => setExpanded((current) => !current)}
          className="sg-section-head flex w-full cursor-pointer items-center justify-between gap-4 border-b px-4 py-3 text-left"
        >
          <span>
            <span className="sg-section-title block text-base font-semibold">{category.category}</span>
            <span className="sg-section-sub block text-xs text-muted-foreground">
              {labels.categorySummary(connected, category.items.length)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {connected > 0 ? <Badge variant="success">{labels.connectedBadge(connected)}</Badge> : null}
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              {expanded ? '▾' : '▸'}
            </span>
            <span className="sr-only">{expanded ? labels.collapse : labels.expand}</span>
          </span>
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={headingId} hidden={!expanded}>
        {category.items.length === 0 ? (
          <div className="px-4 py-3">
            <EmptyState
              icon="🔌"
              title={labels.noCategoryIntegrations(category.category)}
              body={labels.emptyCategoryBody}
              action={<Button type="button" disabled title="Coming soon">{labels.browseCatalog}</Button>}
            />
          </div>
        ) : (
          category.items.map((item) => {
            return (
              <div
                key={item.id}
                className="int-row grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0"
              >
                {integrationLogo(item)}
                <div>
                  <div className="int-name text-sm font-semibold">{item.name}</div>
                  <div className="int-desc text-xs text-muted-foreground">{item.description}</div>
                </div>
                <div>
                  {item.status === 'connected' ? (
                    <Badge variant="success">{labels.statusConnected}</Badge>
                  ) : (
                    <Badge variant="muted">{labels.statusAvailable}</Badge>
                  )}
                </div>
                {/* ponytail: catalog CTAs are stubs — D365 config lives under Admin → D365 connection */}
                {item.status === 'connected' ? (
                  <Button type="button" disabled title="Coming soon" className="btn-secondary btn-sm">
                    {labels.configure}
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Coming soon
                    </span>
                  </Button>
                ) : (
                  <Button type="button" disabled title="Coming soon" className="btn-primary btn-sm">
                    {labels.connect}
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Coming soon
                    </span>
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
