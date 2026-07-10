import type { ToImportResult } from './import-to.types';

/** Thrown inside the write txn so withOrgContext rolls back on all_or_nothing failure. */
export class ToImportAllOrNothingError extends Error {
  readonly failed: ToImportResult['failed'];

  constructor(failed: ToImportResult['failed']) {
    super('transfer order import aborted (all_or_nothing)');
    this.name = 'ToImportAllOrNothingError';
    this.failed = failed;
  }
}
