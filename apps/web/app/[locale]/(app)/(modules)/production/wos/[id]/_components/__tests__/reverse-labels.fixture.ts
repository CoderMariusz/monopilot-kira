/**
 * C-R3 — shared RTL fixture for the reverse-consumption modal labels.
 *
 * Mirrors the EN copy the RSC page resolves (page.tsx reverseConsumption.*),
 * incl. the bespoke lp_not_restorable + inconsistent_ledger error lines. Used by
 * the reverse-consumption modal suite + every WoDetailScreen render that now
 * requires the reverseConsumption labels prop.
 */
import type { ReverseModalLabels } from '../reverse-consumption-modal';

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
