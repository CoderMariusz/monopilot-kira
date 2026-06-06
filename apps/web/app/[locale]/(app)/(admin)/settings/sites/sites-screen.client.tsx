'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';

import { PageHead, Section, SRow, Toggle } from '../_components';
import type {
  CreateLineInput,
  CreateSiteInput,
  CreateSiteResult,
  LineMutationResult,
  LineRow,
  SiteMutationError,
  SiteRow,
  UpdateLineInput,
} from './_actions/sites';

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

/**
 * Labels for the create/edit modals. Defaulted in-component (English) so the
 * server boundary does not need new i18n keys; a caller MAY override them.
 */
export type SitesModalLabels = {
  addSiteTitle: string;
  addLineTitle: string;
  editLineTitle: string;
  fieldSiteCode: string;
  fieldName: string;
  fieldTimezone: string;
  fieldCountry: string;
  fieldLegalEntity: string;
  fieldPrimary: string;
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
  errorGeneric: string;
};

export const DEFAULT_SITES_MODAL_LABELS: SitesModalLabels = {
  addSiteTitle: 'Add site',
  addLineTitle: 'Add production line',
  editLineTitle: 'Edit production line',
  fieldSiteCode: 'Site code',
  fieldName: 'Name',
  fieldTimezone: 'Timezone',
  fieldCountry: 'Country',
  fieldLegalEntity: 'Legal entity',
  fieldPrimary: 'Primary site',
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
  errorDuplicate: 'That code is already in use. Choose a different one.',
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
  onImportLines?: () => void;
  /** Server actions (injected by the page). */
  createSiteAction?: CreateSiteAction;
  createLineAction?: CreateLineAction;
  updateLineAction?: UpdateLineAction;
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
  | null;

export default function SitesScreen({
  sites,
  initialSelectedSiteId,
  initialLines,
  canEdit = false,
  labels,
  modalLabels = DEFAULT_SITES_MODAL_LABELS,
  loadLines,
  onImportLines,
  createSiteAction,
  createLineAction,
  updateLineAction,
}: SitesScreenProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = React.useState<ActiveModal>(null);
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

  // On a successful mutation: drop the affected site's cached lines so the next
  // selection re-fetches, refresh the RSC tree (server re-queries Supabase), and
  // close the modal.
  const handleMutated = React.useCallback(
    (siteId: string | null) => {
      if (siteId) {
        setLinesBySite((current) => {
          const next = { ...current };
          delete next[siteId];
          return next;
        });
      }
      router.refresh();
      setActiveModal(null);
    },
    [router],
  );

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
              onClick={() => setActiveModal({ kind: 'addSite' })}
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
          action={createLineAction}
          onClose={() => setActiveModal(null)}
          onSuccess={() => handleMutated(activeModal.siteId)}
        />
      ) : null}

      {activeModal?.kind === 'editLine' ? (
        <EditLineModal
          labels={modalLabels}
          siteId={activeModal.siteId}
          line={activeModal.line}
          action={updateLineAction}
          onClose={() => setActiveModal(null)}
          onSuccess={() => handleMutated(activeModal.siteId)}
        />
      ) : null}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modals — built on the shared @monopilot/ui/Modal (Radix dialog) + the
// design-system `.ff` / `.form-input` form chrome (mirrors fa-create-modal).
// Each validates required fields client-side, submits to the injected server
// action, shows pending/error, and calls onSuccess (router.refresh + close).
// ────────────────────────────────────────────────────────────────────────────

function mapError(error: SiteMutationError, labels: SitesModalLabels): string {
  if (error === 'duplicate_code') return labels.errorDuplicate;
  if (error === 'invalid_input') return labels.errorRequired;
  return labels.errorGeneric;
}

function Field({
  id,
  label,
  required,
  children,
  requiredLabel,
}: {
  id: string;
  label: string;
  required?: boolean;
  requiredLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ff">
      <label htmlFor={id}>
        {label}{' '}
        {required ? (
          <span className="req" aria-label={requiredLabel}>
            *
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

const STATUS_OPTIONS = (labels: SitesModalLabels) => [
  { value: 'active', label: labels.statusActive },
  { value: 'maintenance', label: labels.statusMaintenance },
  { value: 'inactive', label: labels.statusInactive },
];

function AddSiteModal({
  labels,
  action,
  onClose,
  onSuccess,
}: {
  labels: SitesModalLabels;
  action?: CreateSiteAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState('UTC');
  const [country, setCountry] = React.useState('');
  const [legalEntity, setLegalEntity] = React.useState('');
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = code.trim().length > 0 && name.trim().length > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !action) return;
    setError(null);
    setPending(true);
    try {
      const result = await action({
        site_code: code.trim(),
        name: name.trim(),
        timezone: timezone.trim() || 'UTC',
        country: country.trim() || null,
        legal_entity: legalEntity.trim() || null,
        is_default: isPrimary,
      });
      if (result.ok) {
        onSuccess();
      } else {
        setError(mapError(result.error, labels));
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="sitesAddSite">
      <Modal.Header title={labels.addSiteTitle} />
      <form onSubmit={onSubmit} noValidate data-testid="sites-add-site-form">
        <Modal.Body>
          <Field id="site-code" label={labels.fieldSiteCode} required requiredLabel={labels.required}>
            <input
              id="site-code"
              className="form-input mono"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-name" label={labels.fieldName} required requiredLabel={labels.required}>
            <input
              id="site-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-timezone" label={labels.fieldTimezone} requiredLabel={labels.required}>
            <input
              id="site-timezone"
              className="form-input"
              value={timezone}
              onChange={(e) => setTimezone(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-country" label={labels.fieldCountry} requiredLabel={labels.required}>
            <input
              id="site-country"
              className="form-input"
              value={country}
              onChange={(e) => setCountry(e.currentTarget.value)}
            />
          </Field>
          <Field id="site-legal-entity" label={labels.fieldLegalEntity} requiredLabel={labels.required}>
            <input
              id="site-legal-entity"
              className="form-input"
              value={legalEntity}
              onChange={(e) => setLegalEntity(e.currentTarget.value)}
            />
          </Field>
          <div className="ff">
            <label htmlFor="site-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="site-primary"
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.currentTarget.checked)}
              />
              {labels.fieldPrimary}
            </label>
          </div>
          {error ? (
            <div role="alert" className="alert alert-red" data-testid="sites-modal-error">
              {error}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!valid || pending || !action}>
            {pending ? labels.saving : labels.save}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function LineFormModal({
  title,
  labels,
  modalId,
  testId,
  initial,
  onClose,
  onSuccess,
  submit,
}: {
  title: string;
  labels: SitesModalLabels;
  modalId: string;
  testId: string;
  initial: { code: string; name: string; status: string };
  onClose: () => void;
  onSuccess: () => void;
  submit: (values: { code: string; name: string; status: string }) => Promise<LineMutationResult>;
}) {
  const [code, setCode] = React.useState(initial.code);
  const [name, setName] = React.useState(initial.name);
  const [status, setStatus] = React.useState(initial.status);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = code.trim().length > 0 && name.trim().length > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    setPending(true);
    try {
      const result = await submit({ code: code.trim(), name: name.trim(), status });
      if (result.ok) {
        onSuccess();
      } else {
        setError(mapError(result.error, labels));
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId={modalId}>
      <Modal.Header title={title} />
      <form onSubmit={onSubmit} noValidate data-testid={testId}>
        <Modal.Body>
          <Field id="line-code" label={labels.fieldLineCode} required requiredLabel={labels.required}>
            <input
              id="line-code"
              className="form-input mono"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
          </Field>
          <Field id="line-name" label={labels.fieldName} required requiredLabel={labels.required}>
            <input
              id="line-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <Field id="line-status" label={labels.fieldStatus} requiredLabel={labels.required}>
            <select
              id="line-status"
              className="form-input"
              value={status}
              onChange={(e) => setStatus(e.currentTarget.value)}
            >
              {STATUS_OPTIONS(labels).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {error ? (
            <div role="alert" className="alert alert-red" data-testid="sites-modal-error">
              {error}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={pending}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!valid || pending}>
            {pending ? labels.saving : labels.save}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AddLineModal({
  labels,
  siteId,
  action,
  onClose,
  onSuccess,
}: {
  labels: SitesModalLabels;
  siteId: string;
  action?: CreateLineAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <LineFormModal
      title={labels.addLineTitle}
      labels={labels}
      modalId="sitesAddLine"
      testId="sites-add-line-form"
      initial={{ code: '', name: '', status: 'active' }}
      onClose={onClose}
      onSuccess={onSuccess}
      submit={async (values) => {
        if (!action) return { ok: false, error: 'persistence_failed' };
        return action({ site_id: siteId, code: values.code, name: values.name, status: values.status });
      }}
    />
  );
}

function EditLineModal({
  labels,
  siteId,
  line,
  action,
  onClose,
  onSuccess,
}: {
  labels: SitesModalLabels;
  siteId: string;
  line: LineRow;
  action?: UpdateLineAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <LineFormModal
      title={labels.editLineTitle}
      labels={labels}
      modalId="sitesEditLine"
      testId="sites-edit-line-form"
      initial={{ code: line.code, name: line.name, status: line.status }}
      onClose={onClose}
      onSuccess={onSuccess}
      submit={async (values) => {
        if (!action) return { ok: false, error: 'persistence_failed' };
        return action({
          id: line.id,
          site_id: siteId,
          code: values.code,
          name: values.name,
          status: values.status,
        });
      }}
    />
  );
}
