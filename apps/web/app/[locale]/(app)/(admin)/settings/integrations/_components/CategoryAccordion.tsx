'use client';

import { useState } from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';

import type { IntegrationCategory } from '../_data/load-integrations';

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
  labels,
}: {
  category: IntegrationCategory;
  labels: CategoryAccordionLabels;
}) {
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
              action={<Button type="button">{labels.browseCatalog}</Button>}
            />
          </div>
        ) : (
          category.items.map((item) => (
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
              {item.status === 'connected' ? (
                <Button type="button" className="btn-secondary btn-sm">
                  {labels.configure}
                </Button>
              ) : (
                <Button type="button" className="btn-primary btn-sm">
                  {labels.connect}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
