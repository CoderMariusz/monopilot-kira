/**
 * C-R3 — shared RTL fixture for the reverse-consumption modal labels.
 *
 * Mirrors the EN copy the RSC page resolves (page.tsx reverseConsumption.*),
 * incl. the bespoke lp_not_restorable + inconsistent_ledger error lines. Used by
 * the reverse-consumption modal suite + every WoDetailScreen render that now
 * requires the reverseConsumption labels prop.
 */
import type { ReverseModalLabels } from '../reverse-consumption-modal';
import type { WoLaborTabLabels } from '../wo-detail-screen';

/**
 * E4B — shared Labor-tab labels fixture. Every WoDetailScreen render now requires
 * the `labor` labels (the tab content reads them eagerly via Radix TabsContent),
 * so the sibling modal suites reuse this constant.
 */
export const LABOR_TAB_LABELS: WoLaborTabLabels = {
  title: 'Labor',
  empty: 'No labor recorded for this work order yet.',
  loading: 'Loading labor…',
  error: 'Labor could not be loaded. Please retry shortly.',
  forbidden: 'You do not have permission to view labor for this work order.',
  clockIn: 'Clock in operator',
  clockOut: 'Clock out',
  clockingIn: 'Clocking in…',
  clockingOut: 'Clocking out…',
  clockInDenied: 'You do not have permission to clock in to this work order.',
  clockOutDenied: 'You do not have permission to clock out of this work order.',
  totalHours: 'Total hours',
  totalCost: 'Total labor cost',
  noRate: 'No rate',
  noRateTooltip: 'No labor rate is configured for this operator’s role.',
  disabledTooltip: 'You do not have permission to record labor (production.consumption.write).',
  col: { operator: 'Operator', hours: 'Hours', rate: 'Rate / h', cost: 'Cost' },
};

export const REVERSE_LABELS: ReverseModalLabels = {
  title: 'Reverse consumption of {lp}',
  intro: 'Reversing records a counter consumption entry that restores the consumed pallet.',
  reasonCode: 'Reason',
  reasonPlaceholder: 'Select a reason',
  reasonOptions: {
    entry_error: 'Entry error',
    wrong_quantity: 'Wrong quantity',
    wrong_batch: 'Wrong batch / lot',
    wrong_product: 'Wrong product',
    other: 'Other',
  },
  note: 'Note',
  noteOptional: 'optional',
  notePlaceholder: 'Add context for the reversal',
  closedWarning: 'Reversing consumption on a closed order requires supervisor authorization.',
  esign: {
    title: 'Electronic signature',
    meaning: 'Re-enter your password.',
    password: 'Password',
    passwordPlaceholder: 'Account password',
    passwordHelp: 'Account password, not a PIN.',
  },
  cancel: 'Cancel',
  submit: 'Reverse',
  submitting: 'Reversing…',
  errors: {
    forbidden: 'No permission to reverse.',
    not_found: 'Entry gone — refresh.',
    already_corrected: 'This consumption has already been reversed.',
    lp_not_restorable:
      'The consumed pallet has already been shipped or destroyed — this entry can no longer be reversed.',
    inconsistent_ledger:
      'The stock ledger for this pallet is inconsistent — reversing was blocked to protect inventory. Ask a supervisor to review before retrying.',
    invalid_input: 'Check the fields and try again.',
    esign_failed: 'Signature failed — check your password.',
    persistence_failed: 'Unable to reverse this consumption.',
    generic: 'Unable to reverse this consumption.',
  },
};
