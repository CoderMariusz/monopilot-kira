'use client';

import React from 'react';

import { PageHead, Section } from '../_components';
import LabelEditor, { type LabelEditorLabels, type UpdateLabelTemplateAction } from './label-editor.client';
import type {
  LabelTemplate,
  LabelTemplateMutationResult,
  LabelTemplateRow,
  LabelTemplateStatus,
} from './_actions/label-templates';

/**
 * Label templates list screen + entry point into the visual Label Editor.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:3-257
 * (LabelTemplatesScreen list + LabelEditor). The list is the
 * ID/Name/Size/Used-on/Updated/Status table with Import ZPL + New template
 * actions and a per-row Duplicate; clicking a row opens the editor.
 *
 * Real data: rows come from public.label_templates (getLabelTemplates via the
 * server loader). New / Duplicate go through the real create/duplicate server
 * actions; opening the editor fetches the full template (incl. elements jsonb)
 * through the injected loader so the editor edits real persisted geometry.
 *
 * TODO(labels): Import ZPL parses an uploaded .zpl into elements — wired to the
 * onImportZpl hook but the ZPL parser itself is not built yet (button is
 * present + disabled when no handler is supplied).
 */

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:3-257';

export type LabelsScreenLabels = {
  title: string;
  subtitle: string;
  importZpl: string;
  newTemplate: string;
  tableTitle: string;
  duplicate: string;
  open: string;
  emptyTitle: string;
  emptyBody: string;
  loadError: string;
  permissionDenied: string;
  actionError: string;
  columns: {
    id: string;
    name: string;
    size: string;
    usedOn: string;
    updated: string;
    status: string;
  };
  statusActive: string;
  statusDraft: string;
  statusArchived: string;
  newTemplateName: string;
  newTemplateSize: string;
  editor: LabelEditorLabels;
};

export type CreateLabelTemplateAction = (input: {
  name: string;
  size: string;
}) => Promise<LabelTemplateMutationResult>;

export type DuplicateLabelTemplateAction = (id: string) => Promise<LabelTemplateMutationResult>;

export type GetLabelTemplateAction = (id: string) => Promise<LabelTemplate | null>;

export type LabelsScreenProps = {
  rows: LabelTemplateRow[];
  state: 'ready' | 'empty' | 'error';
  canEdit: boolean;
  labels: LabelsScreenLabels;
  /** Real server actions; absent in injected/permission-denied modes. */
  createTemplate?: CreateLabelTemplateAction;
  duplicateTemplate?: DuplicateLabelTemplateAction;
  updateTemplate?: UpdateLabelTemplateAction;
  /** Loads the full template (incl. elements jsonb) when opening the editor. */
  getTemplate?: GetLabelTemplateAction;
  onImportZpl?: () => void;
};

function StatusBadge({ status, labels }: { status: LabelTemplateStatus; labels: LabelsScreenLabels }) {
  if (status === 'active') {
    return <span className="badge badge-green">✓ {labels.statusActive}</span>;
  }
  if (status === 'archived') {
    return <span className="badge badge-gray">✕ {labels.statusArchived}</span>;
  }
  return <span className="badge badge-gray">{labels.statusDraft}</span>;
}

export default function LabelsScreen({
  rows,
  state,
  canEdit,
  labels,
  createTemplate,
  duplicateTemplate,
  updateTemplate,
  getTemplate,
  onImportZpl,
}: LabelsScreenProps) {
  const [visibleRows, setVisibleRows] = React.useState(rows);
  const [editing, setEditing] = React.useState<LabelTemplate | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setVisibleRows(rows);
  }, [rows]);

  function rowFromTemplate(template: LabelTemplate): LabelTemplateRow {
    return {
      id: template.id,
      name: template.name,
      size: template.size,
      used_on: template.used_on,
      updated_at: template.updated_at,
      status: template.status,
    };
  }

  function openEditor(id: string) {
    if (!getTemplate) return;
    setActionError(null);
    startTransition(async () => {
      const template = await getTemplate(id);
      if (template) {
        setEditing(template);
      } else {
        setActionError(labels.actionError);
      }
    });
  }

  function handleNew() {
    if (!createTemplate) return;
    setActionError(null);
    startTransition(async () => {
      const result = await createTemplate({ name: labels.newTemplateName, size: labels.newTemplateSize });
      if (result.ok) {
        setVisibleRows((current) => [rowFromTemplate(result.template), ...current]);
        setEditing(result.template);
      } else {
        setActionError(result.error === 'forbidden' ? labels.permissionDenied : labels.actionError);
      }
    });
  }

  function handleDuplicate(id: string) {
    if (!duplicateTemplate) return;
    setActionError(null);
    startTransition(async () => {
      const result = await duplicateTemplate(id);
      if (result.ok) {
        setVisibleRows((current) => [rowFromTemplate(result.template), ...current]);
      } else {
        setActionError(result.error === 'forbidden' ? labels.permissionDenied : labels.actionError);
      }
    });
  }

  function handleSaved(template: LabelTemplate) {
    setVisibleRows((current) =>
      current.map((row) => (row.id === template.id ? rowFromTemplate(template) : row)),
    );
    setEditing(template);
  }

  if (editing) {
    return (
      <LabelEditor
        template={editing}
        labels={labels.editor}
        canEdit={canEdit && typeof updateTemplate === 'function'}
        onBack={() => setEditing(null)}
        onSave={updateTemplate}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <main
      aria-label={labels.title}
      className="grid gap-3 p-6"
      data-testid="label-templates-screen"
      data-screen="label_templates_screen"
      data-route="/settings/labels"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => onImportZpl?.()} disabled={!onImportZpl}>
              {labels.importZpl}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNew}
              disabled={!canEdit || !createTemplate || isPending}
              data-testid="label-templates-new"
            >
              {labels.newTemplate}
            </button>
          </div>
        }
      />

      {state === 'error' ? (
        <div className="alert alert-red" role="alert" data-testid="label-templates-load-error">
          {labels.loadError}
        </div>
      ) : null}

      {actionError ? (
        <div className="alert alert-red" role="alert" data-testid="label-templates-action-error">
          {actionError}
        </div>
      ) : null}

      <Section title={labels.tableTitle}>
        {visibleRows.length === 0 ? (
          <div className="empty-state" role="status" data-testid="label-templates-empty">
            <div className="empty-state-icon" aria-hidden="true">
              ▭
            </div>
            <div className="empty-state-title">{labels.emptyTitle}</div>
            <div className="empty-state-body">{labels.emptyBody}</div>
            <div className="empty-state-action">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNew}
                disabled={!canEdit || !createTemplate || isPending}
              >
                {labels.newTemplate}
              </button>
            </div>
          </div>
        ) : (
          <table data-testid="label-templates-table">
            <thead>
              <tr>
                <th scope="col">{labels.columns.id}</th>
                <th scope="col">{labels.columns.name}</th>
                <th scope="col">{labels.columns.size}</th>
                <th scope="col">{labels.columns.usedOn}</th>
                <th scope="col">{labels.columns.updated}</th>
                <th scope="col">{labels.columns.status}</th>
                <th scope="col" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} data-testid="label-templates-row">
                  <td className="mono">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEditor(row.id)}
                      disabled={!getTemplate || isPending}
                      aria-label={`${labels.open} ${row.name}`}
                      data-testid="label-templates-open"
                    >
                      {row.id.slice(0, 8)}
                    </button>
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  <td className="mono">{row.size}</td>
                  <td className="mono muted">{row.used_on || '—'}</td>
                  <td className="mono muted">{row.updated_at.slice(0, 10)}</td>
                  <td>
                    <StatusBadge status={row.status} labels={labels} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDuplicate(row.id)}
                      disabled={!canEdit || !duplicateTemplate || isPending}
                      data-testid="label-templates-duplicate"
                    >
                      {labels.duplicate}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}
