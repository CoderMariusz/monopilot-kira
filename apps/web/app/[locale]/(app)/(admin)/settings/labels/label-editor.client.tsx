'use client';

import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';

import {
  createElement,
  parseElementsBlob,
  serializeElementsBlob,
  type LabelElement,
  type LabelElementType,
  type LabelTemplateElementsBlob,
} from './_actions/label-elements';
import type {
  LabelTemplate,
  LabelTemplateDeleteResult,
  LabelTemplateMutationResult,
} from './_actions/label-templates';

/**
 * Visual Label Editor — 3-column layout (element palette LEFT / mm-scaled
 * canvas CENTER / property inspector RIGHT) built on the ported `.le-*`
 * label-editor classes.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:39-257
 * (LabelEditor). Renders the template's `elements` jsonb on an mm-scaled canvas
 * (grid + text/barcode/QR/box), supports add/select/move/edit of elements, and
 * persists the whole canvas (size + printer + elements) back into the jsonb
 * blob via `updateLabelTemplate`.
 *
 * Real data: the template + its `elements` blob come from
 * public.label_templates (withOrgContext / RLS). Save writes through the real
 * `updateLabelTemplate` server action.
 *
 * TODO(label-editor): live ZPL export (Preview / Test print are wired to the
 * onPreview/onTestPrint hooks but the ZPL render itself is not built yet);
 * pixel-precise pointer drag uses a coarse step (drag moves in whole mm) — fine
 * drag + resize handles are flagged for a later pass.
 */

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:3-257';
const SCALE = 10; // px per mm

export type LabelEditorLabels = {
  breadcrumbSettings: string;
  breadcrumbList: string;
  breadcrumbEdit: string;
  back: string;
  preview: string;
  testPrint: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
  permissionDenied: string;
  addElement: string;
  paletteText: string;
  paletteBarcode: string;
  paletteQr: string;
  paletteBox: string;
  dataFields: string;
  canvas: string;
  canvasHint: string;
  elementText: string;
  elementBarcode: string;
  elementQr: string;
  elementBox: string;
  delete: string;
  posX: string;
  posY: string;
  width: string;
  height: string;
  dataField: string;
  previewValue: string;
  fontSize: string;
  weight: string;
  weightRegular: string;
  weightBold: string;
  monospace: string;
  symbology: string;
  templateSettings: string;
  widthMm: string;
  heightMm: string;
  targetPrinter: string;
  usedOn: string;
  inspectorEmptyHint: string;
  lastSaved: string;
  deleteTemplate: string;
  deleting: string;
  deleteError: string;
  deleteConfirmTitle: string;
  deleteConfirmBody: string;
  deleteConfirmCancel: string;
  deleteConfirmConfirm: string;
};

export type UpdateLabelTemplateAction = (
  id: string,
  input: { elements: LabelTemplateElementsBlob },
) => Promise<LabelTemplateMutationResult>;

export type DeleteLabelTemplateAction = (id: string) => Promise<LabelTemplateDeleteResult>;

export type LabelEditorProps = {
  template: LabelTemplate;
  labels: LabelEditorLabels;
  canEdit: boolean;
  onBack: () => void;
  onSave?: UpdateLabelTemplateAction;
  onSaved?: (template: LabelTemplate) => void;
  onDelete?: DeleteLabelTemplateAction;
  onDeleted?: (id: string) => void;
  onPreview?: () => void;
  onTestPrint?: () => void;
};

const TEXT_FIELDS = ['product_name', 'sku', 'ean', 'lot', 'weight', 'best_before', 'batch', 'custom'];
const BARCODE_FIELDS = ['ean', 'sku', 'lot', 'sscc'];
const PALETTE_FIELDS = [
  'product_name',
  'sku',
  'ean',
  'lot',
  'weight',
  'best_before',
  'batch',
  'site',
  'line',
  'producer',
];
const SYMBOLOGY_OPTIONS = ['ean13', 'Code 128', 'GS1-128'];
const PRINTER_OPTIONS = [
  { value: 'zebra-zd420', label: 'Zebra ZD420 — 203dpi' },
  { value: 'zebra-zt230', label: 'Zebra ZT230 — 300dpi' },
  { value: 'honeywell-pm43', label: 'Honeywell PM43 — 203dpi' },
];

type SaveState = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

export default function LabelEditor({
  template,
  labels,
  canEdit,
  onBack,
  onSave,
  onSaved,
  onDelete,
  onDeleted,
  onPreview,
  onTestPrint,
}: LabelEditorProps) {
  const initial = React.useMemo(() => parseElementsBlob(template.elements), [template.elements]);
  const [canvas, setCanvas] = React.useState<LabelTemplateElementsBlob>(initial);
  const [selId, setSelId] = React.useState<string | null>(initial.elements[0]?.id ?? null);
  const [saveState, setSaveState] = React.useState<SaveState>({ kind: 'idle' });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeleting, startDeleteTransition] = React.useTransition();

  React.useEffect(() => {
    setCanvas(initial);
    setSelId(initial.elements[0]?.id ?? null);
  }, [initial]);

  const selected = canvas.elements.find((element) => element.id === selId) ?? null;

  const updateElement = React.useCallback((id: string, patch: Partial<LabelElement>) => {
    setCanvas((current) => ({
      ...current,
      elements: current.elements.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    }));
  }, []);

  const deleteElement = React.useCallback((id: string) => {
    setCanvas((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== id) }));
    setSelId(null);
  }, []);

  const addElement = React.useCallback(
    (type: LabelElementType) => {
      const element = createElement(type);
      setCanvas((current) => ({ ...current, elements: [...current.elements, element] }));
      setSelId(element.id);
    },
    [],
  );

  function handleSave() {
    if (!onSave || !canEdit) return;
    setSaveState({ kind: 'idle' });
    startTransition(async () => {
      const result = await onSave(template.id, { elements: serializeElementsBlob(canvas) });
      if (result.ok) {
        setSaveState({ kind: 'saved' });
        onSaved?.(result.template);
      } else {
        setSaveState({
          kind: 'error',
          message: result.error === 'forbidden' ? labels.permissionDenied : labels.saveError,
        });
      }
    });
  }

  function handleDelete() {
    if (!onDelete || !canEdit) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await onDelete(template.id);
      if (result.ok) {
        setConfirmDelete(false);
        onDeleted?.(template.id);
      } else {
        setDeleteError(result.error === 'forbidden' ? labels.permissionDenied : labels.deleteError);
      }
    });
  }

  function elementTitle(element: LabelElement): string {
    if (element.type === 'text') return labels.elementText;
    if (element.type === 'barcode') return labels.elementBarcode;
    if (element.type === 'qr') return labels.elementQr;
    return labels.elementBox;
  }

  return (
    <main
      aria-label={template.name}
      className="grid gap-3 p-6"
      data-testid="label-editor-screen"
      data-screen="label_editor"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          {labels.breadcrumbSettings}
        </button>
        {' / '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          {labels.breadcrumbList}
        </button>
        {` / ${labels.breadcrumbEdit}`}
      </nav>

      <div className="sg-head">
        <div>
          <div className="sg-title">{template.name}</div>
          <div className="sg-sub">
            <span className="mono">{template.id}</span>
            {` · ${labels.lastSaved} ${template.updated_at.slice(0, 10)}`}
            {template.used_on ? ` · ${template.used_on}` : ''}
          </div>
        </div>
        <div className="sg-head-actions" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            {labels.back}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setDeleteError(null);
              setConfirmDelete(true);
            }}
            disabled={!canEdit || !onDelete || isDeleting}
            data-testid="label-editor-delete"
          >
            {isDeleting ? labels.deleting : labels.deleteTemplate}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onPreview?.()} disabled={!onPreview}>
            {labels.preview}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onTestPrint?.()} disabled={!onTestPrint}>
            {labels.testPrint}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canEdit || !onSave || isPending}
            data-testid="label-editor-save"
          >
            {isPending ? labels.saving : labels.save}
          </button>
        </div>
      </div>

      {saveState.kind === 'saved' ? (
        <div className="alert alert-green" role="status" data-testid="label-editor-saved">
          {labels.saved}
        </div>
      ) : null}
      {saveState.kind === 'error' ? (
        <div className="alert alert-red" role="alert" data-testid="label-editor-error">
          {saveState.message}
        </div>
      ) : null}

      <Modal
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!isDeleting) setConfirmDelete(open);
        }}
        size="sm"
        dismissible={!isDeleting}
        modalId="delete_label_template_modal"
      >
        <Modal.Header title={labels.deleteConfirmTitle} />
        <Modal.Body>
          <p className="muted" style={{ fontSize: 13 }} data-testid="label-editor-delete-confirm-body">
            {labels.deleteConfirmBody.replace('{name}', template.name)}
          </p>
          {deleteError ? (
            <div className="alert alert-red" role="alert" data-testid="label-editor-delete-error" style={{ marginTop: 12 }}>
              {deleteError}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            className="btn-secondary btn-sm"
            disabled={isDeleting}
            onClick={() => setConfirmDelete(false)}
            data-testid="label-editor-delete-cancel"
          >
            {labels.deleteConfirmCancel}
          </Button>
          <Button
            type="button"
            className="btn-danger btn-sm"
            disabled={!canEdit || !onDelete || isDeleting}
            onClick={handleDelete}
            data-testid="label-editor-delete-confirm"
          >
            {isDeleting ? labels.deleting : labels.deleteConfirmConfirm}
          </Button>
        </Modal.Footer>
      </Modal>

      <div className="le-wrap">
        {/* LEFT: element palette */}
        <aside className="le-panel" aria-label={labels.addElement}>
          <h4>{labels.addElement}</h4>
          <button type="button" className="le-palette-item" onClick={() => addElement('text')} disabled={!canEdit}>
            <span aria-hidden="true">T</span> {labels.paletteText}
          </button>
          <button type="button" className="le-palette-item" onClick={() => addElement('barcode')} disabled={!canEdit}>
            <span aria-hidden="true">▥</span> {labels.paletteBarcode}
          </button>
          <button type="button" className="le-palette-item" onClick={() => addElement('qr')} disabled={!canEdit}>
            <span aria-hidden="true">▦</span> {labels.paletteQr}
          </button>
          <button type="button" className="le-palette-item" onClick={() => addElement('box')} disabled={!canEdit}>
            <span aria-hidden="true">□</span> {labels.paletteBox}
          </button>

          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <h4>{labels.dataFields}</h4>
            {PALETTE_FIELDS.map((field) => (
              <div key={field} className="mono" style={{ padding: '3px 6px', fontSize: 11, color: 'var(--muted)' }}>
                {`{${field}}`}
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER: mm-scaled canvas */}
        <section className="le-panel" aria-label={labels.canvas}>
          <div className="sg-section-head" style={{ border: 0, padding: 0, marginBottom: 8 }}>
            <div>
              <h4 style={{ margin: 0 }}>{labels.canvas}</h4>
              <div className="sg-section-sub">
                {`${canvas.width_mm}×${canvas.height_mm}mm · ${labels.canvasHint}`}
              </div>
            </div>
          </div>
          <div className="le-canvas-wrap">
            <div
              className="le-canvas"
              data-testid="label-editor-canvas"
              role="group"
              aria-label={labels.canvas}
              style={{
                width: canvas.width_mm * SCALE,
                height: canvas.height_mm * SCALE,
                backgroundImage:
                  'linear-gradient(to right, var(--gray-100) 1px, transparent 1px), linear-gradient(to bottom, var(--gray-100) 1px, transparent 1px)',
                backgroundSize: `${SCALE * 5}px ${SCALE * 5}px`,
              }}
              onClick={() => setSelId(null)}
            >
              {canvas.elements.map((element) => (
                <CanvasElement
                  key={element.id}
                  element={element}
                  selected={element.id === selId}
                  onSelect={() => setSelId(element.id)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT: property inspector / template settings */}
        <aside style={{ display: 'grid', gap: 0 }}>
          {selected ? (
            <div className="le-panel" data-testid="label-editor-inspector">
              <div className="sg-section-head" style={{ border: 0, padding: 0, marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>{elementTitle(selected)}</h4>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => deleteElement(selected.id)}
                  disabled={!canEdit}
                >
                  {labels.delete}
                </button>
              </div>

              <div className="le-prop-row">
                <label htmlFor="le-prop-x">{labels.posX}</label>
                <input
                  id="le-prop-x"
                  type="number"
                  value={selected.x}
                  disabled={!canEdit}
                  onChange={(event) => updateElement(selected.id, { x: Number(event.currentTarget.value) })}
                />
              </div>
              <div className="le-prop-row">
                <label htmlFor="le-prop-y">{labels.posY}</label>
                <input
                  id="le-prop-y"
                  type="number"
                  value={selected.y}
                  disabled={!canEdit}
                  onChange={(event) => updateElement(selected.id, { y: Number(event.currentTarget.value) })}
                />
              </div>
              <div className="le-prop-row">
                <label htmlFor="le-prop-w">{labels.width}</label>
                <input
                  id="le-prop-w"
                  type="number"
                  value={selected.w}
                  disabled={!canEdit}
                  onChange={(event) => updateElement(selected.id, { w: Number(event.currentTarget.value) })}
                />
              </div>
              <div className="le-prop-row">
                <label htmlFor="le-prop-h">{labels.height}</label>
                <input
                  id="le-prop-h"
                  type="number"
                  value={selected.h}
                  disabled={!canEdit}
                  onChange={(event) => updateElement(selected.id, { h: Number(event.currentTarget.value) })}
                />
              </div>

              {selected.type === 'text' ? (
                <>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-field">{labels.dataField}</label>
                    <select
                      id="le-prop-field"
                      value={selected.field ?? 'custom'}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { field: event.currentTarget.value })}
                    >
                      {TEXT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-value">{labels.previewValue}</label>
                    <input
                      id="le-prop-value"
                      type="text"
                      value={selected.value ?? ''}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { value: event.currentTarget.value })}
                    />
                  </div>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-fontsize">{labels.fontSize}</label>
                    <input
                      id="le-prop-fontsize"
                      type="number"
                      value={selected.fontSize ?? 10}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { fontSize: Number(event.currentTarget.value) })}
                    />
                  </div>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-weight">{labels.weight}</label>
                    <select
                      id="le-prop-weight"
                      value={selected.bold ? 'bold' : 'regular'}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { bold: event.currentTarget.value === 'bold' })}
                    >
                      <option value="regular">{labels.weightRegular}</option>
                      <option value="bold">{labels.weightBold}</option>
                    </select>
                  </div>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-mono">{labels.monospace}</label>
                    <input
                      id="le-prop-mono"
                      type="checkbox"
                      checked={!!selected.mono}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { mono: event.currentTarget.checked })}
                    />
                  </div>
                </>
              ) : null}

              {selected.type === 'barcode' ? (
                <>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-symbology">{labels.symbology}</label>
                    <select
                      id="le-prop-symbology"
                      value={selected.symbology ?? 'ean13'}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { symbology: event.currentTarget.value })}
                    >
                      {SYMBOLOGY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-bc-field">{labels.dataField}</label>
                    <select
                      id="le-prop-bc-field"
                      value={selected.field ?? 'ean'}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { field: event.currentTarget.value })}
                    >
                      {BARCODE_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="le-prop-row">
                    <label htmlFor="le-prop-bc-value">{labels.previewValue}</label>
                    <input
                      id="le-prop-bc-value"
                      type="text"
                      value={selected.value ?? ''}
                      disabled={!canEdit}
                      onChange={(event) => updateElement(selected.id, { value: event.currentTarget.value })}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="le-panel" data-testid="label-editor-template-settings">
              <h4>{labels.templateSettings}</h4>
              <div className="le-prop-row">
                <label htmlFor="le-tpl-width">{labels.widthMm}</label>
                <input
                  id="le-tpl-width"
                  type="number"
                  value={canvas.width_mm}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCanvas((current) => ({ ...current, width_mm: Number(event.currentTarget.value) }))
                  }
                />
              </div>
              <div className="le-prop-row">
                <label htmlFor="le-tpl-height">{labels.heightMm}</label>
                <input
                  id="le-tpl-height"
                  type="number"
                  value={canvas.height_mm}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCanvas((current) => ({ ...current, height_mm: Number(event.currentTarget.value) }))
                  }
                />
              </div>
              <div className="le-prop-row">
                <label htmlFor="le-tpl-printer">{labels.targetPrinter}</label>
                <select
                  id="le-tpl-printer"
                  value={canvas.printer}
                  disabled={!canEdit}
                  onChange={(event) => setCanvas((current) => ({ ...current, printer: event.currentTarget.value }))}
                >
                  {PRINTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="le-prop-row">
                <label>{labels.usedOn}</label>
                <span className="mono" style={{ fontSize: 12 }}>
                  {template.used_on || '—'}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11, paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 10 }}>
                {labels.inspectorEmptyHint}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function CanvasElement({
  element,
  selected,
  onSelect,
}: {
  element: LabelElement;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`le-el${selected ? ' selected' : ''}`}
      data-testid="label-editor-element"
      data-element-type={element.type}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{
        left: element.x * SCALE,
        top: element.y * SCALE,
        width: element.w * SCALE,
        height: element.h * SCALE,
        display: 'flex',
        alignItems: 'center',
        background: 'transparent',
      }}
    >
      {element.type === 'text' ? (
        <span
          style={{
            fontSize: element.fontSize ?? 10,
            fontWeight: element.bold ? 700 : 400,
            fontFamily: element.mono ? 'var(--font-mono)' : 'inherit',
            lineHeight: 1.1,
            overflow: 'hidden',
          }}
        >
          {element.value}
        </span>
      ) : null}
      {element.type === 'barcode' ? (
        <span style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ flex: 1, display: 'flex', alignItems: 'stretch' }} aria-hidden="true">
            {Array.from({ length: 45 }).map((_, index) => (
              <span
                key={index}
                style={{ flex: (index * 7) % 3 === 0 ? 2 : 1, background: (index * 3) % 2 === 0 ? '#0f172a' : 'transparent' }}
              />
            ))}
          </span>
          <span className="mono" style={{ fontSize: 7, textAlign: 'center', letterSpacing: 1 }}>
            {element.value}
          </span>
        </span>
      ) : null}
      {element.type === 'qr' ? (
        <svg viewBox="0 0 20 20" style={{ width: '100%', height: '100%' }} aria-hidden="true">
          {Array.from({ length: 400 }).map((_, index) => {
            const x = index % 20;
            const y = Math.floor(index / 20);
            const isCorner = (x < 4 && y < 4) || (x > 15 && y < 4) || (x < 4 && y > 15);
            // Deterministic dither so SSR/CSR markup matches (no Math.random()).
            const filled = isCorner || (x * 7 + y * 13) % 5 < 2;
            return <rect key={index} x={x} y={y} width="1" height="1" fill={filled ? '#0f172a' : '#fff'} />;
          })}
        </svg>
      ) : null}
      {element.type === 'box' ? (
        <span style={{ width: '100%', height: '100%', border: '1px solid #0f172a' }} aria-hidden="true" />
      ) : null}
    </button>
  );
}
