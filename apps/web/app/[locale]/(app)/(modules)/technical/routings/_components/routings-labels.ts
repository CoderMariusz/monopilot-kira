/**
 * Routings i18n label contract + English defaults (W9-L5 FIX 3).
 *
 * Lives in a PLAIN (non-client) module on purpose: the routings page is a
 * Server Component that iterates Object.keys(ROUTINGS_DEFAULT_LABELS) to build
 * the translated label bundle. When this constant lived inside the
 * client-marked routings-manager module, the RSC import resolved to a client-
 * reference proxy — Object.keys() saw none of the real keys, so the manager
 * received an empty labels object and rendered blank labels plus
 * "undefined1 undefined" aria-labels (2026-06-11 clickthrough §2).
 */

export type RoutingsLabels = {
  itemLabel: string;
  selectItemPlaceholder: string;
  newRouting: string;
  selectItemPrompt: string;
  loadingRoutings: string;
  loadError: string;
  emptyTitle: string;
  emptyBody: string;
  emptyBodyCanWrite: string;
  permissionDenied: string;
  versionsTableLabel: string;
  colVersion: string;
  colOperations: string;
  colStatus: string;
  colEffectiveFrom: string;
  colEffectiveTo: string;
  colActions: string;
  statusDraft: string;
  statusApproved: string;
  statusActive: string;
  statusSuperseded: string;
  edit: string;
  approve: string;
  publish: string;
  // modal
  modalNewTitle: string;
  modalEditTitlePrefix: string; // "Edit routing v"
  modalIntro: string;
  operationLabel: string; // "Operation "
  remove: string;
  fOperationName: string;
  fOperationNamePlaceholder: string;
  fOpCode: string;
  fOpCodePlaceholder: string;
  fLine: string;
  fSelect: string;
  fNoneConfigured: string;
  fManufacturingOp: string;
  fSetup: string;
  fRun: string;
  fCostPerHour: string;
  addOperation: string;
  cancel: string;
  saveRouting: string;
  close: string;
  // cost preview
  costTitlePrefix: string; // "Cost preview · v"
  costFormula: string;
  volumeLabel: string;
  computeCost: string;
  computing: string;
  costColOp: string;
  costColOperation: string;
  costColSetup: string;
  costColRun: string;
  costColOpCost: string;
  costTotalPrefix: string; // "Total routing cost @ "
  costTotalSuffix: string; // " units"
  utilizationTitle: string;
  costPreviewTableLabelPrefix: string; // "Cost preview operations v"
  // errors
  errForbidden: string;
  errInvalidInput: string;
  errNotFound: string;
  errAlreadyExists: string;
  errInvalidState: string;
  errSequenceGap: string;
  errNoResource: string;
  errZeroRunTime: string;
  errUnknownOperation: string;
  errCrossSiteLines: string;
  errGeneric: string;
};

export const ROUTINGS_DEFAULT_LABELS: RoutingsLabels = {
  itemLabel: 'Item',
  selectItemPlaceholder: 'Select an item…',
  newRouting: '+ New routing',
  selectItemPrompt: 'Select an item to view its routings.',
  loadingRoutings: 'Loading routings…',
  loadError: 'Unable to load routings. Please try again.',
  emptyTitle: 'No routings yet',
  emptyBody: 'No routings yet for this item.',
  emptyBodyCanWrite: 'Create the first routing version to define its operations.',
  permissionDenied: 'You can view routings but do not have permission to author them (technical.bom.create).',
  versionsTableLabel: 'Routing versions',
  colVersion: 'Version',
  colOperations: 'Operations',
  colStatus: 'Status',
  colEffectiveFrom: 'Effective from',
  colEffectiveTo: 'Effective to',
  colActions: 'Actions',
  statusDraft: 'Draft',
  statusApproved: 'Approved',
  statusActive: 'Active',
  statusSuperseded: 'Superseded',
  edit: 'Edit',
  approve: 'Approve',
  publish: 'Publish',
  modalNewTitle: 'New routing',
  modalEditTitlePrefix: 'Edit routing v',
  modalIntro:
    'Operations run in order (op 1 → n). Each operation binds a production line (V-TEC-61) and a manufacturing-operation name from the reference (V-TEC-63).',
  operationLabel: 'Operation ',
  remove: 'Remove',
  fOperationName: 'Operation name',
  fOperationNamePlaceholder: 'e.g. Smoking — phase 2',
  fOpCode: 'Op code',
  fOpCodePlaceholder: 'auto',
  fLine: 'Line',
  fSelect: 'Select…',
  fNoneConfigured: 'None configured',
  fManufacturingOp: 'Manufacturing operation',
  fSetup: 'Setup (min)',
  fRun: 'Run (s/unit)',
  fCostPerHour: 'Cost/h',
  addOperation: '+ Add operation',
  cancel: 'Cancel',
  saveRouting: 'Save routing',
  close: 'Close',
  costTitlePrefix: 'Cost preview · v',
  costFormula: 'Cost = Σ (setup/60 + run·volume/3600) × rate. NUMERIC-exact.',
  volumeLabel: 'Volume (units)',
  computeCost: 'Compute cost',
  computing: 'Computing…',
  costColOp: 'Op',
  costColOperation: 'Operation',
  costColSetup: 'Setup cost',
  costColRun: 'Run cost',
  costColOpCost: 'Op cost',
  costTotalPrefix: 'Total routing cost @ ',
  costTotalSuffix: ' units',
  utilizationTitle: 'Resource utilization (cost share)',
  costPreviewTableLabelPrefix: 'Cost preview operations v',
  errForbidden: 'You do not have permission to author routings.',
  errInvalidInput: 'Please check the operation values and try again.',
  errNotFound: 'That item or routing no longer exists.',
  errAlreadyExists: 'A routing with that version already exists for this item.',
  errInvalidState: 'Only a draft routing may be edited or transitioned that way.',
  errSequenceGap: 'Operation numbers must be contiguous from 1 (V-TEC-60).',
  errNoResource: 'Every operation must bind a production line (V-TEC-61).',
  errZeroRunTime: 'Production operations need a run time greater than 0 (V-TEC-62).',
  errUnknownOperation: 'An operation name is not in the manufacturing-operations reference (V-TEC-63).',
  errCrossSiteLines:
    'Every operation must use production lines from the same site as the routing (V-TEC-64).',
  errGeneric: 'Could not save the routing. Please try again.',
};
