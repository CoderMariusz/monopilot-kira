import type { PoImportResult } from './import-po.types';

/** Thrown inside the write txn so withOrgContext rolls back on all_or_nothing failure. */
export class PoImportAllOrNothingError extends Error {
  readonly failed: PoImportResult['failed'];

  constructor(failed: PoImportResult['failed']) {
    super('purchase order import aborted (all_or_nothing)');
    this.name = 'PoImportAllOrNothingError';
    this.failed = failed;
  }
}
