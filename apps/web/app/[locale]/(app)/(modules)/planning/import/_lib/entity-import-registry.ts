/**
 * Client-safe registry for Planning bulk-import entity specs and preview-column
 * value helpers. RSC pages pass only serializable spec ids + column descriptors;
 * EntityImportCard resolves coerce/cells/groupKey/preview value fns here.
 */

import type { PreviewColumn } from '../_components/entity-import-wizard.client';
import type { ToImportRow } from '../../transfer-orders/_actions/import-to.types';
import type { WoImportRow } from '../../work-orders/_actions/import-wo';
import { type EntityCsvSpec } from './parse-entity-csv';
import { TO_IMPORT_SPEC } from './to-spec';
import { WO_IMPORT_SPEC } from './wo-spec';

export type EntityImportSpecId = 'to' | 'wo';

export type PreviewColumnFormatId =
  | 'external_ref'
  | 'from_warehouse'
  | 'to_warehouse'
  | 'fg_code'
  | 'qty_uom';

/** Serializable preview-column descriptor (no value fns — resolved via formatId). */
export type PreviewColumnDescriptor = {
  key: string;
  label: string;
  formatId: PreviewColumnFormatId;
  mono?: boolean;
};

const PREVIEW_FORMATS: Record<
  PreviewColumnFormatId,
  (row: ToImportRow | WoImportRow) => string
> = {
  external_ref: (row) => row.external_ref ?? '',
  from_warehouse: (row) => (row as ToImportRow).from_warehouse_code ?? '',
  to_warehouse: (row) => (row as ToImportRow).to_warehouse_code ?? '',
  fg_code: (row) => (row as WoImportRow).fg_code ?? '',
  qty_uom: (row) => {
    const wo = row as WoImportRow;
    return `${wo.qty} ${wo.uom ?? ''}`.trim();
  },
};

export function resolveEntityImportSpec(specId: 'to'): EntityCsvSpec<ToImportRow>;
export function resolveEntityImportSpec(specId: 'wo'): EntityCsvSpec<WoImportRow>;
export function resolveEntityImportSpec(
  specId: EntityImportSpecId,
): EntityCsvSpec<ToImportRow> | EntityCsvSpec<WoImportRow> {
  return specId === 'to' ? TO_IMPORT_SPEC : WO_IMPORT_SPEC;
}

export function resolvePreviewColumns<TRow extends ToImportRow | WoImportRow>(
  descriptors: PreviewColumnDescriptor[],
): PreviewColumn<TRow>[] {
  return descriptors.map((descriptor) => ({
    key: descriptor.key,
    label: descriptor.label,
    mono: descriptor.mono,
    value: (row: TRow) => PREVIEW_FORMATS[descriptor.formatId](row),
  }));
}
