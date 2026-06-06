/**
 * Shared shape for the `label_templates.elements` jsonb blob owned by the
 * visual Label Editor (label-editor.client.tsx).
 *
 * The data layer (`label-templates.ts`) treats `elements` as an opaque
 * `JsonBlob`. This module is the single place that defines/normalizes the
 * concrete element model so the list + editor agree on what lives inside that
 * blob. It is intentionally pure (no 'use server' / no React) so both the
 * server page and the client islands can import it.
 *
 * Mirrors the prototype element model in
 * prototypes/design/Monopilot Design System/settings/editor-tweaks.jsx:43-50.
 */

export type LabelElementType = 'text' | 'barcode' | 'qr' | 'box';

export type LabelElement = {
  /** Stable id for select/move/update within the editor session. */
  id: string;
  type: LabelElementType;
  /** Position + size in millimetres (canvas is mm-scaled). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bound data field (text/barcode/qr); cosmetic boxes have none. */
  field?: string;
  /** Preview value rendered on the canvas. */
  value?: string;
  /** text-only typography. */
  fontSize?: number;
  bold?: boolean;
  mono?: boolean;
  /** barcode-only symbology. */
  symbology?: string;
};

/** Persisted template canvas settings, stored alongside the element list. */
export type LabelTemplateElementsBlob = {
  width_mm: number;
  height_mm: number;
  printer: string;
  elements: LabelElement[];
};

export const DEFAULT_LABEL_WIDTH_MM = 60;
export const DEFAULT_LABEL_HEIGHT_MM = 40;
export const DEFAULT_LABEL_PRINTER = 'zebra-zd420';

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeType(value: unknown): LabelElementType {
  return value === 'text' || value === 'barcode' || value === 'qr' || value === 'box' ? value : 'text';
}

let elementSeq = 0;

/** Mint a process-unique element id (editor session scope). */
export function nextElementId(prefix = 'el'): string {
  elementSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${elementSeq}`;
}

function normalizeElement(raw: unknown, index: number): LabelElement {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = normalizeType(record.type);
  const element: LabelElement = {
    id: typeof record.id === 'string' && record.id.length > 0 ? record.id : `el-${index}`,
    type,
    x: toFiniteNumber(record.x, 3),
    y: toFiniteNumber(record.y, 3),
    w: toFiniteNumber(record.w, type === 'qr' ? 12 : 30),
    h: toFiniteNumber(record.h, type === 'text' ? 5 : 12),
  };
  if (typeof record.field === 'string') element.field = record.field;
  if (record.value !== undefined && record.value !== null) element.value = String(record.value);
  if (record.fontSize !== undefined) element.fontSize = toFiniteNumber(record.fontSize, 10);
  if (typeof record.bold === 'boolean') element.bold = record.bold;
  if (typeof record.mono === 'boolean') element.mono = record.mono;
  if (typeof record.symbology === 'string') element.symbology = record.symbology;
  return element;
}

/**
 * Read a `label_templates.elements` jsonb blob (which may be a bare element
 * array, the structured `{ width_mm, ..., elements }` object, or an empty
 * default) into the editor's canonical shape.
 */
export function parseElementsBlob(blob: unknown): LabelTemplateElementsBlob {
  if (Array.isArray(blob)) {
    return {
      width_mm: DEFAULT_LABEL_WIDTH_MM,
      height_mm: DEFAULT_LABEL_HEIGHT_MM,
      printer: DEFAULT_LABEL_PRINTER,
      elements: blob.map(normalizeElement),
    };
  }
  if (blob && typeof blob === 'object') {
    const record = blob as Record<string, unknown>;
    const rawElements = Array.isArray(record.elements) ? record.elements : [];
    return {
      width_mm: toFiniteNumber(record.width_mm, DEFAULT_LABEL_WIDTH_MM),
      height_mm: toFiniteNumber(record.height_mm, DEFAULT_LABEL_HEIGHT_MM),
      printer: typeof record.printer === 'string' ? record.printer : DEFAULT_LABEL_PRINTER,
      elements: rawElements.map(normalizeElement),
    };
  }
  return {
    width_mm: DEFAULT_LABEL_WIDTH_MM,
    height_mm: DEFAULT_LABEL_HEIGHT_MM,
    printer: DEFAULT_LABEL_PRINTER,
    elements: [],
  };
}

/** Serialize the editor canvas back into the jsonb blob persisted by updateLabelTemplate. */
export function serializeElementsBlob(blob: LabelTemplateElementsBlob): LabelTemplateElementsBlob {
  return {
    width_mm: blob.width_mm,
    height_mm: blob.height_mm,
    printer: blob.printer,
    elements: blob.elements.map((element) => ({ ...element })),
  };
}

/** A fresh element of the requested type, positioned in the top-left of the canvas. */
export function createElement(type: LabelElementType): LabelElement {
  const id = nextElementId();
  switch (type) {
    case 'barcode':
      return { id, type, x: 5, y: 15, w: 30, h: 10, field: 'ean', value: '5900000000000', symbology: 'ean13' };
    case 'qr':
      return { id, type, x: 5, y: 15, w: 12, h: 12, field: 'url', value: 'https://monopilot.app' };
    case 'box':
      return { id, type, x: 5, y: 5, w: 20, h: 10 };
    case 'text':
    default:
      return { id, type: 'text', x: 5, y: 5, w: 20, h: 5, field: 'custom', value: 'New text', fontSize: 10, bold: false };
  }
}
