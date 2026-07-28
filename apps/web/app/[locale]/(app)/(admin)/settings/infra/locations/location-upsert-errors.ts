export type UpsertLocationErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | 'invalid_parent_location'
  | 'invalid_parent_level'
  | 'depth_exceeded'
  | 'duplicate_code'
  | 'has_active_children'
  | 'has_stock'
  | 'persistence_failed';

export type UpsertLocationFormLabels = {
  upsertError: string;
  duplicateCodeError: string;
  depthExceeded: string;
  hasActiveChildrenError: string;
  /** R08-01 — carries one `{count}` placeholder: the number of live LPs still parked here. */
  hasStockError: string;
};

export function mapUpsertLocationError(
  error: UpsertLocationErrorCode | string,
  labels: UpsertLocationFormLabels,
  lpCount?: number,
): string {
  if (error === 'duplicate_code') return labels.duplicateCodeError;
  if (error === 'depth_exceeded') return labels.depthExceeded;
  if (error === 'has_active_children') return labels.hasActiveChildrenError;
  // R08-01 — name the exact dependency count so the operator knows how much stock to move first.
  if (error === 'has_stock') return labels.hasStockError.replace('{count}', String(lpCount ?? 0));
  return labels.upsertError;
}
