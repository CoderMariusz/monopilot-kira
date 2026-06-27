/**
 * NF fix — FA create modal server wiring (labels + Server Action provider).
 *
 * Server-only helper (no JSX island of its own anymore). It:
 *   - builds the FaCreateModal labels (next-intl with graceful prototype
 *     fallback, all four locales), and
 *   - exposes the real createFa Server Action (T-008,
 *     apps/web/app/(npd)/fa/actions/create-fa.ts — imported, never authored
 *     here).
 *
 * The page (fa/page.tsx) calls `buildFaCreateModalProps(locale)` and passes the
 * result into FaListTable, which renders the FaCreateModal INLINE in the same
 * client island as the "+ Create FG" button. This is the NF root-cause fix:
 * the previous design mounted the modal in a SEPARATE `?modal=` client island,
 * so the button was dead on a fresh hard load (it only worked after an SPA nav,
 * once both islands had hydrated and the router round-trip could reach the other
 * island). Collapsing trigger + modal into one island makes the button robust on
 * first paint.
 *
 * RBAC is still enforced server-side: page.tsx injects the Server Action ONLY
 * when `canCreate` is true (resolved server-side); the client form can never
 * create what the server would reject.
 *
 * Prototype parity source (1:1): modals.jsx:9-43 (FACreateModal / MODAL-01).
 */

import { getTranslations } from 'next-intl/server';

import { type CreateFaAction, type FaCreateLabels } from './fa-create-modal';
import { createFa } from '../../../../../(npd)/fa/actions/create-fa';
import { DuplicateError } from '../../../../../(npd)/fa/actions/errors';

// FG terminology (Create FG) + the prototype copy translated 1:1.
const DEFAULT_LABELS: FaCreateLabels = {
  title: 'Create Finished Good',
  subtitle: 'V01 · FG Code format validated on blur. V02 · Product Name required.',
  fieldProductCode: 'FG Code',
  fieldProductCodeHint: "Must start with 'FA' followed by uppercase letters/digits (e.g. FA5609).",
  fieldProductName: 'Product Name',
  fieldProductNameHint: 'Max 200 chars',
  rangeHint: 'Ranges: FA5600+ is reserved for the 2026 NPD pipeline.',
  cancel: 'Cancel',
  create: 'Create FG',
  creating: 'Creating…',
  errorV01: "FG Code must start with 'FA' followed by uppercase letters/digits (e.g. FA5609).",
  errorV02: 'Product Name is required (max 200 chars).',
  errorDuplicate: 'FG Code already exists. Choose a different code.',
  errorGeneric: 'Could not create the Finished Good. Try again.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FaCreateLabels>;

function translateLabel(t: (key: string) => string, key: keyof FaCreateLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

export async function buildFaCreateLabels(locale: string): Promise<FaCreateLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faCreateModal' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as FaCreateLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

// Server Action adapter (RHF input → T-008 createFa). Keeps the client modal a
// pure form; the action is a server reference passed across the boundary.
//
// Duplicate handling: createFa THROWS DuplicateError on a 23505, but a custom
// error thrown from a Server Action is flattened to a generic, message-stripped
// Error at the RSC→client boundary — so the modal could never distinguish a
// duplicate from a generic failure (it showed "Try again" live). We catch the
// DuplicateError HERE (server-side, before the boundary) and return it as a
// serializable result the modal maps to the friendly "already exists" copy. Every
// other error keeps throwing (generic fallback). createFa's own throw contract is
// unchanged — only this UI-facing seam differs.
export const createFaAction: CreateFaAction = async (input) => {
  'use server';
  try {
    return await createFa(input);
  } catch (error) {
    if (
      error instanceof DuplicateError ||
      (typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'DUPLICATE_PRODUCT_CODE')
    ) {
      return { ok: false, error: 'already_exists' };
    }
    throw error;
  }
};

export type FaCreateModalProps = {
  labels: FaCreateLabels;
  /** Provided only when the caller may create (RBAC resolved server-side). */
  action: CreateFaAction | undefined;
};

/**
 * Build the props FaListTable needs to render the create modal inline.
 * RBAC: the Server Action is provided ONLY when `canCreate` is true.
 */
export async function buildFaCreateModalProps(
  locale: string,
  canCreate: boolean,
): Promise<FaCreateModalProps> {
  const labels = await buildFaCreateLabels(locale);
  return { labels, action: canCreate ? createFaAction : undefined };
}
