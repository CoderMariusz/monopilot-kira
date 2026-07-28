export type UpsertLocationErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | 'invalid_parent_location'
  | 'invalid_parent_level'
  | 'depth_exceeded'
  | 'duplicate_code'
  | 'has_active_children'
  | 'persistence_failed';

export type UpsertLocationFormLabels = {
  upsertError: string;
  duplicateCodeError: string;
  depthExceeded: string;
  hasActiveChildrenError: string;
};

export function mapUpsertLocationError(
  error: UpsertLocationErrorCode | string,
  labels: UpsertLocationFormLabels,
): string {
  if (error === 'duplicate_code') return labels.duplicateCodeError;
  if (error === 'depth_exceeded') return labels.depthExceeded;
  if (error === 'has_active_children') return labels.hasActiveChildrenError;
  return labels.upsertError;
}
