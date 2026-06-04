/**
 * G-1 fix — FA create modal server host (wiring).
 *
 * Server Component that bridges the RSC boundary to the client `?modal=faCreate`
 * host (fa-create-modal-host.tsx). It:
 *   - builds the FaCreateModal labels (next-intl with graceful prototype
 *     fallback, all four locales), and
 *   - injects the real createFa Server Action (T-008,
 *     apps/web/app/(npd)/fa/actions/create-fa.ts — imported, never authored
 *     here) ONLY when the caller may create (RBAC `canCreate` is resolved
 *     server-side by fa/page.tsx and passed down; never render-then-disable, the
 *     action is simply absent when forbidden so the client form can never create
 *     what the server would reject).
 *
 * This wires the previously-orphaned FaCreateModal (G-1: the "+ Create FG"
 * button was dead) into the FG list page, mirroring the brief modals host
 * (apps/web/app/[locale]/(app)/(npd)/briefs/_components/brief-modals-host.tsx).
 *
 * Prototype parity source (1:1): modals.jsx:9-43 (FACreateModal / MODAL-01).
 */

import { getTranslations } from 'next-intl/server';

import { FaCreateModalHost } from './fa-create-modal-host';
import { type CreateFaAction, type FaCreateLabels } from './fa-create-modal';
import { createFa } from '../../../../../(npd)/fa/actions/create-fa';

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

async function buildLabels(locale: string): Promise<FaCreateLabels> {
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
const createFaAction: CreateFaAction = async (input) => {
  'use server';
  return createFa(input);
};

export type FaCreateHostProps = {
  locale: string;
  /** RBAC resolved server-side by fa/page.tsx (npd.fa.create / fg.create). */
  canCreate: boolean;
};

export async function FaCreateHost({ locale, canCreate }: FaCreateHostProps): Promise<React.ReactElement> {
  const labels = await buildLabels(locale);

  // RBAC: inject the Server Action ONLY when permitted.
  return <FaCreateModalHost labels={labels} createFaAction={canCreate ? createFaAction : undefined} />;
}

export default FaCreateHost;
