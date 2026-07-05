/**
 * Item status-transition labels — PLAIN module (NO 'use client').
 *
 * Wave 8b Lane IA (audit finding #8). Lives outside the modal component for the
 * same reason as item-wizard-labels.ts: the items list + detail server pages
 * dereference the defaults/builder, and importing a non-component export from a
 * 'use client' module turns it into a client reference proxy under the Vercel
 * turbopack build (live crash digests 2219404667 / 1606090766).
 */
import type { TransitionItemStatusError, TransitionTarget } from '../_actions/shared';

export type StatusTransitionLabels = {
  /** Trigger labels per lifecycle position. */
  activate: string;
  deprecate: string;
  reactivate: string;
  /** Confirm-dialog copy per transition. */
  activateTitle: string;
  activateBody: string;
  deprecateTitle: string;
  deprecateBody: string;
  reactivateTitle: string;
  reactivateBody: string;
  cancel: string;
  confirm: string;
  working: string;
  actionErrors: Record<TransitionItemStatusError, string>;
};

export const DEFAULT_TRANSITION_LABELS: StatusTransitionLabels = {
  activate: 'Activate',
  deprecate: 'Deprecate',
  reactivate: 'Reactivate',
  activateTitle: 'Activate item',
  activateBody: 'Activate this item? It becomes available for BOMs, purchasing and production.',
  deprecateTitle: 'Deprecate item',
  deprecateBody:
    'Deprecate this item? Existing BOMs and stock remain, but it should no longer be used in new BOMs, purchases or production.',
  reactivateTitle: 'Reactivate item',
  reactivateBody: 'Reactivate this item? It becomes available again for BOMs, purchasing and production.',
  cancel: 'Cancel',
  confirm: 'Confirm',
  working: 'Saving…',
  actionErrors: {
    already_exists: 'An item with that code already exists in this organization.',
    forbidden: 'You do not have permission to perform this action.',
    invalid_input: 'Please check the values and try again.',
    not_found: 'That item no longer exists.',
    persistence_failed: 'Could not save. Please try again.',
    invalid_category: 'Choose an active product category or leave blank.',
    invalid_transition: "This status change is not allowed from the item's current status.",
    activation_gate_failed:
      'This item cannot be activated yet — its base unit is not one of the canonical units. Edit the item first.',
  },
};

/** The transition offered for each current status ('blocked' offers none). */
export function transitionForStatus(
  status: string,
  labels: StatusTransitionLabels,
): { toStatus: TransitionTarget; label: string; title: string; body: string; primary: boolean } | null {
  switch (status) {
    case 'draft':
      return {
        toStatus: 'active',
        label: labels.activate,
        title: labels.activateTitle,
        body: labels.activateBody,
        primary: true,
      };
    case 'active':
      return {
        toStatus: 'deprecated',
        label: labels.deprecate,
        title: labels.deprecateTitle,
        body: labels.deprecateBody,
        primary: false,
      };
    case 'deprecated':
      return {
        toStatus: 'active',
        label: labels.reactivate,
        title: labels.reactivateTitle,
        body: labels.reactivateBody,
        primary: false,
      };
    default:
      return null;
  }
}

type Translator = {
  (key: string): string;
  has(key: string): boolean;
};

/**
 * Resolves the technical.items.transition.* i18n bundle server-side, falling
 * back to the English defaults key-by-key so a not-yet-deployed catalog never
 * leaks a raw key path. Shared error labels reuse technical.items.errors.*.
 */
export function buildTransitionLabels(t: Translator): StatusTransitionLabels {
  const get = (key: string, fallback: string): string => {
    try {
      return t.has(key) ? t(key) : fallback;
    } catch {
      return fallback;
    }
  };
  const d = DEFAULT_TRANSITION_LABELS;
  return {
    activate: get('transition.activate', d.activate),
    deprecate: get('transition.deprecate', d.deprecate),
    reactivate: get('transition.reactivate', d.reactivate),
    activateTitle: get('transition.activateTitle', d.activateTitle),
    activateBody: get('transition.activateBody', d.activateBody),
    deprecateTitle: get('transition.deprecateTitle', d.deprecateTitle),
    deprecateBody: get('transition.deprecateBody', d.deprecateBody),
    reactivateTitle: get('transition.reactivateTitle', d.reactivateTitle),
    reactivateBody: get('transition.reactivateBody', d.reactivateBody),
    cancel: get('transition.cancel', d.cancel),
    confirm: get('transition.confirm', d.confirm),
    working: get('transition.working', d.working),
    actionErrors: {
      already_exists: get('errors.already_exists', d.actionErrors.already_exists),
      forbidden: get('errors.forbidden', d.actionErrors.forbidden),
      invalid_input: get('errors.invalid_input', d.actionErrors.invalid_input),
      not_found: get('errors.not_found', d.actionErrors.not_found),
      persistence_failed: get('errors.persistence_failed', d.actionErrors.persistence_failed),
      invalid_category: get('errors.invalid_category', d.actionErrors.invalid_category),
      invalid_transition: get('transition.errors.invalid_transition', d.actionErrors.invalid_transition),
      activation_gate_failed: get('transition.errors.activation_gate_failed', d.actionErrors.activation_gate_failed),
    },
  };
}
