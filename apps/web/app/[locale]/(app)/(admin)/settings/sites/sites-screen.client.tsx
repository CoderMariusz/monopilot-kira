'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { PageHead, Section, SRow, Toggle } from '../_components';
import {
  getLineFormOptions,
  type CreateLineInput,
  type CreateSiteInput,
  type CreateSiteResult,
  type LineFormOptions,
  type LineMutationResult,
  type LineRow,
  type SiteRow,
  type UpdateLineInput,
} from './_actions/sites';
import { AddLineModal } from './_components/AddLineModal';
import { AddSiteModal } from './_components/AddSiteModal';
import { EditLineModal } from './_components/EditLineModal';
import { EditSiteSettingsModal, type UpdateSiteSettingsAction } from './_components/EditSiteSettingsModal';

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
 *
 * Parity deviation (sanctioned): the prototype head action row carries an
 * "Import lines" button (org-screens.jsx:112) that is itself a non-functional
 * stub — it had no wired handler in the prototype and no lines-import server
 * action exists in the codebase. To honour the production rule against dead
 * controls, the button is intentionally NOT translated here; only the wired
 * "+ Add site" action remains. Re-introduce it together with a real import
 * action if/when bulk line import lands.
 */

export type SitesScreenLabels = {
  title: string;
  subtitle: string;
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

/**
 * Labels for the create/edit modals. Defaulted in-component (English) so the
 * server boundary does not need new i18n keys; a caller MAY override them.
 */
export type SitesModalLabels = {
  addSiteTitle: string;
  addLineTitle: string;
  editLineTitle: string;
  editSiteSettingsTitle: string;
  fieldSiteCode: string;
  fieldName: string;
  fieldTimezone: string;
  fieldCountry: string;
  fieldLegalEntity: string;
  fieldPrimary: string;
  fieldOperatingHours: string;
  fieldHaccpEnabled: string;
  fieldHaccpValidUntil: string;
  fieldLineCode: string;
  fieldStatus: string;
  statusActive: string;
  statusMaintenance: string;
  statusInactive: string;
  required: string;
  cancel: string;
  save: string;
  saving: string;
  errorRequired: string;
  errorDuplicate: string;
  errorForbidden: string;
  errorGeneric: string;
};

export const DEFAULT_SITES_MODAL_LABELS: SitesModalLabels = {
  addSiteTitle: 'Add site',
  addLineTitle: 'Add production line',
  editLineTitle: 'Edit production line',
  editSiteSettingsTitle: 'Edit site settings',
  fieldSiteCode: 'Site code',
  fieldName: 'Name',
  fieldTimezone: 'Timezone',
  fieldCountry: 'Country',
  fieldLegalEntity: 'Legal entity',
  fieldPrimary: 'Primary site',
  fieldOperatingHours: 'Operating hours',
  fieldHaccpEnabled: 'HACCP certified',
  fieldHaccpValidUntil: 'HACCP valid until',
  fieldLineCode: 'Line code',
  fieldStatus: 'Status',
  statusActive: 'Active',
  statusMaintenance: 'Maintenance',
  statusInactive: 'Inactive',
  required: 'required',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving…',
  errorRequired: 'This field is required.',
  errorDuplicate: 'That code is already in use at this site. Choose a different one.',
  errorForbidden: 'You do not have permission to update site settings.',
  errorGeneric: 'Something went wrong. Please try again.',
};

export type CreateSiteAction = (input: CreateSiteInput) => Promise<CreateSiteResult>;
export type CreateLineAction = (input: CreateLineInput) => Promise<LineMutationResult>;
export type UpdateLineAction = (input: UpdateLineInput) => Promise<LineMutationResult>;

export type SitesScreenProps = {
  sites: SiteRow[];
  initialSelectedSiteId: string | null;
  initialLines: LineRow[];
  canEdit?: boolean;
  labels: SitesScreenLabels;
  modalLabels?: SitesModalLabels;
  /** Lazily loads the lines for a selected site (real Supabase query). */
  loadLines?: (siteId: string) => Promise<LineRow[]>;
  /** Server actions (injected by the page). */
  createSiteAction?: CreateSiteAction;
  createLineAction?: CreateLineAction;
  updateLineAction?: UpdateLineAction;
  updateSiteSettingsAction?: UpdateSiteSettingsAction;
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

type ActiveModal =
  | { kind: 'addSite' }
  | { kind: 'addLine'; siteId: string }
  | { kind: 'editLine'; siteId: string; line: LineRow }
  | { kind: 'editSiteSettings'; site: SiteRow }
  | null;

export default function SitesScreen({
  sites,
  initialSelectedSiteId,
  initialLines,
  canEdit = false,
  labels,
  modalLabels = DEFAULT_SITES_MODAL_LABELS,
  loadLines,
  createSiteAction,
  createLineAction,
  updateLineAction,
  updateSiteSettingsAction,
}: SitesScreenProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = React.useState<ActiveModal>(null);
  const [siteRows, setSiteRows] = React.useState<SiteRow[]>(sites);
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(
    initialSelectedSiteId ?? sites[0]?.id ?? null,
  );
  // Lines cache keyed by site id; seeded with the server-loaded initial site.
  const [linesBySite, setLinesBySite] = React.useState<Record<string, LineRow[]>>(() =>
    initialSelectedSiteId ? { [initialSelectedSiteId]: initialLines } : {},
  );
  const [loadingLines, setLoadingLines] = React.useState(false);
  const [lineFormOptions, setLineFormOptions] = React.useState<LineFormOptions>({
    sites: siteRows.map((site) => ({ id: site.id, code: site.code, name: site.name, isDefault: site.settings.primary })),
    warehouses: [],
    locations: [],
  });
  const [lineFormOptionsLoaded, setLineFormOptionsLoaded] = React.useState(false);

  const selectedSite = React.useMemo(
    () => siteRows.find((site) => site.id === selectedSiteId) ?? null,
    [siteRows, selectedSiteId],
  );

  React.useEffect(() => {
    setSiteRows(sites);
  }, [sites]);

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

  // On a successful mutation: re-fetch the affected site's lines SYNCHRONOUSLY so
  // the new/edited row appears immediately. `linesBySite` is client state seeded
  // from props once on mount — router.refresh() re-renders the RSC tree but does
  // NOT re-derive this client cache, so merely busting the entry left the list
  // empty (the "No production lines are assigned" ghost) until a full remount.
  // Still refresh the RSC tree for server-rendered counts, and close the modal.
  const handleMutated = React.useCallback(
    (siteId: string | null) => {
      setActiveModal(null);
      if (siteId && loadLines) {
        setLoadingLines(true);
        void Promise.resolve(loadLines(siteId))
          .then((rows) => setLinesBySite((current) => ({ ...current, [siteId]: rows })))
          .catch(() => setLinesBySite((current) => ({ ...current, [siteId]: [] })))
          .finally(() => setLoadingLines(false));
      } else if (siteId) {
        setLinesBySite((current) => {
          const next = { ...current };
          delete next[siteId];
          return next;
        });
      }
      router.refresh();
    },
    [router, loadLines],
  );

  React.useEffect(() => {
    if (activeModal?.kind !== 'addLine' || lineFormOptionsLoaded) return;
    let cancelled = false;
    void getLineFormOptions()
      .then((options) => {
        if (!cancelled) {
          setLineFormOptions(options);
          setLineFormOptionsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLineFormOptionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeModal, lineFormOptionsLoaded]);

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
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canEdit}
            onClick={() => setActiveModal({ kind: 'addSite' })}
          >
            {labels.addSite}
          </button>
        }
      />

      {siteRows.length === 0 ? (
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
              <div className="sg-section-title">{fill(labels.sitesTitle, { count: siteRows.length })}</div>
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
                {siteRows.map((site) => (
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
              {siteRows.map((site) => {
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
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      disabled={!canEdit}
                      data-testid="sites-add-line"
                      onClick={() => setActiveModal({ kind: 'addLine', siteId: selectedSite.id })}
                    >
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
                            <td style={{ width: 60 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                disabled={!canEdit}
                                data-testid="sites-edit-line"
                                aria-label={`${labels.edit} ${line.name}`}
                                onClick={() =>
                                  setActiveModal({ kind: 'editLine', siteId: selectedSite.id, line })
                                }
                              >
                                {labels.edit}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <Section
                title={labels.siteSettingsTitle}
                action={
                  canEdit ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      data-testid="sites-edit-settings"
                      onClick={() => setActiveModal({ kind: 'editSiteSettings', site: selectedSite })}
                    >
                      {labels.edit}
                    </button>
                  ) : undefined
                }
              >
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

      {activeModal?.kind === 'addSite' ? (
        <AddSiteModal
          labels={modalLabels}
          action={createSiteAction}
          onClose={() => setActiveModal(null)}
          onSuccess={() => handleMutated(selectedSiteId)}
        />
      ) : null}

      {activeModal?.kind === 'addLine' ? (
        <AddLineModal
          labels={modalLabels}
          siteId={activeModal.siteId}
          siteLabel={selectedSite?.name ?? activeModal.siteId}
          options={lineFormOptions}
          action={createLineAction}
          onClose={() => setActiveModal(null)}
          onSuccess={() => handleMutated(activeModal.siteId)}
        />
      ) : null}

      {activeModal?.kind === 'editLine' ? (
        <EditLineModal
          labels={modalLabels}
          siteId={activeModal.siteId}
          siteLabel={selectedSite?.name ?? activeModal.siteId}
          line={activeModal.line}
          action={updateLineAction}
          onClose={() => setActiveModal(null)}
          onSuccess={() => handleMutated(activeModal.siteId)}
        />
      ) : null}

      {activeModal?.kind === 'editSiteSettings' ? (
        <EditSiteSettingsModal
          site={activeModal.site}
          labels={modalLabels}
          action={updateSiteSettingsAction}
          onClose={() => setActiveModal(null)}
          onSuccess={(updated) => {
            setActiveModal(null);
            setSiteRows((current) =>
              current.map((site) => {
                if (updated.settings.primary) {
                  return {
                    ...site,
                    settings: {
                      ...site.settings,
                      primary: site.id === updated.id,
                      ...(site.id === updated.id ? updated.settings : {}),
                    },
                  };
                }
                return site.id === updated.id ? { ...site, ...updated } : site;
              }),
            );
            router.refresh();
          }}
        />
      ) : null}
    </main>
  );
}
