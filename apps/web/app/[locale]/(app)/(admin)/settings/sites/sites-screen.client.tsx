'use client';

import React from 'react';

import { PageHead, Section, SRow, Toggle } from '../_components';
import type { LineRow, SiteRow } from './_actions/sites';

/**
 * Sites & production lines settings screen.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/org-screens.jsx:103-189
 * (SitesScreen) — a two-pane (280px / 1fr) layout:
 *   LEFT  : a visual `.site-map` with location pins + a clickable site list
 *           (each card selects the site).
 *   RIGHT : the selected site's production-line table + a "Site settings"
 *           Section whose `SRow`s expose the Primary-site `Toggle`, operating
 *           hours and HACCP certification.
 *
 * Built from the shared settings primitives (`PageHead`, `Section`, `SRow`,
 * `Toggle`) so the `.sg-*` structure stays in parity with the prototype, and
 * the `.site-map` / `.site-pin` / `.dot` / `.pin-label` classes ported in
 * `apps/web/app/settings-design-system.css`. All data is real (Supabase rows
 * loaded server-side via `_actions/sites.ts`); no mocks. Selecting a site
 * lazily loads that site's lines through the injected `loadLines` server
 * action (the initial site's lines arrive pre-loaded from the server boundary).
 */

export type SitesScreenLabels = {
  title: string;
  subtitle: string;
  importLines: string;
  addSite: string;
  sitesTitle: string; // accepts a {count} placeholder
  mapRegionFallback: string;
  primaryBadge: string;
  siteMeta: string; // accepts {lines} and {workers} placeholders
  edit: string;
  addLine: string;
  emptySites: string;
  emptyLines: string;
  columns: {
    line: string;
    type: string;
    workers: string;
    status: string;
  };
  statusActive: string;
  statusMaintenance: string;
  siteSettingsTitle: string;
  primarySite: string;
  primarySiteHint: string;
  operatingHours: string;
  haccp: string;
  haccpValid: string;
  haccpDisabled: string;
  haccpExpires: string; // accepts a {date} placeholder
};

export type SitesScreenProps = {
  sites: SiteRow[];
  initialSelectedSiteId: string | null;
  initialLines: LineRow[];
  canEdit?: boolean;
  labels: SitesScreenLabels;
  /** Lazily loads the lines for a selected site (real Supabase query). */
  loadLines?: (siteId: string) => Promise<LineRow[]>;
  onImportLines?: () => void;
  onAddSite?: () => void;
};

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/org-screens.jsx:103-189';

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}

const MAP_BACKDROP: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(circle at 50% 40%, #fff, transparent 70%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 10px 10px',
  opacity: 0.3,
};

export default function SitesScreen({
  sites,
  initialSelectedSiteId,
  initialLines,
  canEdit = false,
  labels,
  loadLines,
  onImportLines,
  onAddSite,
}: SitesScreenProps) {
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(
    initialSelectedSiteId ?? sites[0]?.id ?? null,
  );
  // Lines cache keyed by site id; seeded with the server-loaded initial site.
  const [linesBySite, setLinesBySite] = React.useState<Record<string, LineRow[]>>(() =>
    initialSelectedSiteId ? { [initialSelectedSiteId]: initialLines } : {},
  );
  const [loadingLines, setLoadingLines] = React.useState(false);

  const selectedSite = React.useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const handleSelect = React.useCallback(
    (siteId: string) => {
      setSelectedSiteId(siteId);
      if (linesBySite[siteId] || !loadLines) return;
      setLoadingLines(true);
      void Promise.resolve(loadLines(siteId))
        .then((rows) => {
          setLinesBySite((current) => ({ ...current, [siteId]: rows }));
        })
        .catch(() => {
          // Surface as an empty line set rather than crashing the screen.
          setLinesBySite((current) => ({ ...current, [siteId]: [] }));
        })
        .finally(() => setLoadingLines(false));
    },
    [linesBySite, loadLines],
  );

  const selectedLines = selectedSiteId ? (linesBySite[selectedSiteId] ?? []) : [];

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-6xl gap-3 p-6"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!canEdit}
              onClick={() => onImportLines?.()}
            >
              {labels.importLines}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canEdit}
              onClick={() => onAddSite?.()}
            >
              {labels.addSite}
            </button>
          </>
        }
      />

      {sites.length === 0 ? (
        <Section title={fill(labels.sitesTitle, { count: 0 })}>
          <div className="muted" data-testid="sites-empty" role="status">
            {labels.emptySites}
          </div>
        </Section>
      ) : (
        <div
          data-testid="sites-two-pane"
          style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}
        >
          {/* LEFT — visual map + clickable site list */}
          <div className="sg-section">
            <div className="sg-section-head">
              <div className="sg-section-title">{fill(labels.sitesTitle, { count: sites.length })}</div>
            </div>
            <div style={{ padding: 12 }}>
              <div className="site-map" data-testid="sites-map">
                <div aria-hidden="true" style={MAP_BACKDROP} />
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    fontSize: 10,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {selectedSite?.country?.trim() || labels.mapRegionFallback}
                </div>
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    className="site-pin"
                    data-testid="sites-map-pin"
                    aria-pressed={selectedSiteId === site.id}
                    aria-label={site.name}
                    style={{
                      left: `${site.map_x}%`,
                      top: `${site.map_y}%`,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                    onClick={() => handleSelect(site.id)}
                  >
                    <div
                      className="dot"
                      style={{
                        background: selectedSiteId === site.id ? 'var(--blue)' : 'var(--gray-400, #94a3b8)',
                      }}
                    />
                    <div className="pin-label">{site.name}</div>
                  </button>
                ))}
              </div>
            </div>
            <ul data-testid="sites-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sites.map((site) => {
                const active = selectedSiteId === site.id;
                return (
                  <li key={site.id}>
                    <button
                      type="button"
                      data-testid="sites-list-item"
                      aria-pressed={active}
                      onClick={() => handleSelect(site.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 14px',
                        borderTop: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: active ? 'var(--blue-050)' : '#fff',
                        borderLeft: active ? '3px solid var(--blue)' : '3px solid transparent',
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {site.name}
                        {site.settings.primary ? (
                          <span className="badge badge-blue" style={{ marginLeft: 4 }}>
                            {labels.primaryBadge}
                          </span>
                        ) : null}
                      </div>
                      {site.address ? (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {site.address}
                        </div>
                      ) : null}
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {fill(labels.siteMeta, { lines: site.line_count, workers: site.worker_count })}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* RIGHT — selected site detail: line table + Site settings */}
          {selectedSite ? (
            <div data-testid="sites-detail">
              <div className="sg-section">
                <div className="sg-section-head">
                  <div>
                    <div className="sg-section-title">{selectedSite.name}</div>
                    {selectedSite.address ? (
                      <div className="sg-section-sub">{selectedSite.address}</div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" type="button" disabled={!canEdit}>
                      {labels.edit}
                    </button>
                    <button className="btn btn-secondary btn-sm" type="button" disabled={!canEdit}>
                      {labels.addLine}
                    </button>
                  </div>
                </div>
                <div className="sg-section-body" style={{ padding: 0 }}>
                  {selectedLines.length === 0 ? (
                    <div className="muted" data-testid="sites-lines-empty" role="status" style={{ padding: 14 }}>
                      {labels.emptyLines}
                    </div>
                  ) : (
                    <table data-testid="sites-lines-table" aria-busy={loadingLines || undefined}>
                      <thead>
                        <tr>
                          <th>{labels.columns.line}</th>
                          <th>{labels.columns.type}</th>
                          <th>{labels.columns.workers}</th>
                          <th>{labels.columns.status}</th>
                          <th aria-hidden="true" />
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLines.map((line) => (
                          <tr key={line.id}>
                            <td style={{ fontWeight: 500 }}>
                              <span className="mono muted" style={{ fontSize: 11, marginRight: 6 }}>
                                {line.code}
                              </span>
                              {line.name}
                            </td>
                            <td className="muted">{line.type}</td>
                            <td className="mono num">{line.workers}</td>
                            <td>
                              {line.status === 'active' ? (
                                <span className="badge badge-green">● {labels.statusActive}</span>
                              ) : (
                                <span className="badge badge-amber">⚒ {labels.statusMaintenance}</span>
                              )}
                            </td>
                            <td style={{ width: 30 }} className="muted" aria-hidden="true">
                              ⋮
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <Section title={labels.siteSettingsTitle}>
                <SRow label={labels.primarySite} hint={labels.primarySiteHint}>
                  <Toggle
                    aria-label={labels.primarySite}
                    checked={selectedSite.settings.primary}
                    disabled
                  />
                </SRow>
                <SRow label={labels.operatingHours}>
                  <div className="mono">{selectedSite.settings.operating_hours}</div>
                </SRow>
                <SRow label={labels.haccp}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedSite.settings.haccp_enabled ? (
                      <span className="badge badge-green">✓ {labels.haccpValid}</span>
                    ) : (
                      <span className="badge badge-amber">{labels.haccpDisabled}</span>
                    )}
                    {selectedSite.settings.haccp_enabled && selectedSite.settings.haccp_valid_until ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {fill(labels.haccpExpires, { date: selectedSite.settings.haccp_valid_until })}
                      </span>
                    ) : null}
                  </div>
                </SRow>
              </Section>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
