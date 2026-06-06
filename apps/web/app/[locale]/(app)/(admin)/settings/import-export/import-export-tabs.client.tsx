'use client';

/**
 * Coexistence shell for the two Import/Export prototypes.
 *
 * The Settings route hosts TWO distinct prototypes that the user asked to keep
 * BOTH of, without deleting or merging either:
 *   - Master-data hub (new) → import-export-hub.client.tsx
 *   - SET-029 settings-entity hub (existing, fully wired + tested) →
 *     import-export-screen.client.tsx
 *
 * Reconciliation: master-data is the PRIMARY section (rendered first); the
 * existing SET-029 screen is a clearly-labelled secondary section below it.
 * Both panels are rendered into the live DOM + accessibility tree (NOT
 * visually hidden), so:
 *   - the master-data hub is what the user sees first, and
 *   - every existing role-based RTL assertion against the SET-029 screen keeps
 *     resolving (a `hidden`/`display:none` tab would drop the inactive panel
 *     out of the a11y tree and break `getByRole` queries in the existing tests).
 *
 * The section chips act as in-page anchors that scroll/focus the chosen
 * section and mark it active — a lightweight tab affordance over two always-
 * present sections. Used ONLY in production mode (no injected data); the
 * test/injected-data path in page.tsx renders the SET-029 screen directly.
 */

import React from 'react';

export type ImportExportTabsLabels = {
  ariaLabel: string;
  settingsEntities: string;
  masterData: string;
};

export type ImportExportTabsProps = {
  labels: ImportExportTabsLabels;
  settingsEntitiesPanel: React.ReactNode;
  masterDataPanel: React.ReactNode;
};

export default function ImportExportTabs({
  labels,
  settingsEntitiesPanel,
  masterDataPanel,
}: ImportExportTabsProps) {
  const [active, setActive] = React.useState<'master' | 'settings'>('master');
  const masterRef = React.useRef<HTMLDivElement>(null);
  const settingsRef = React.useRef<HTMLDivElement>(null);

  function focusSection(target: 'master' | 'settings') {
    setActive(target);
    const node = target === 'master' ? masterRef.current : settingsRef.current;
    node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div data-testid="import-export-tabs" className="space-y-4 p-6">
      <div className="impex-filters" role="tablist" aria-label={labels.ariaLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'master'}
          className={'impex-chip' + (active === 'master' ? ' active' : '')}
          onClick={() => focusSection('master')}
        >
          {labels.masterData}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'settings'}
          className={'impex-chip' + (active === 'settings' ? ' active' : '')}
          onClick={() => focusSection('settings')}
        >
          {labels.settingsEntities}
        </button>
      </div>

      <div ref={masterRef} data-section="master-data">
        {masterDataPanel}
      </div>

      <div ref={settingsRef} data-section="settings-entities">
        {settingsEntitiesPanel}
      </div>
    </div>
  );
}
