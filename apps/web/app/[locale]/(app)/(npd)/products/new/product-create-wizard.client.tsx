'use client';

/**
 * Product create wizard host (onboarding SET-004 "first product" entry point).
 *
 * The onboarding "first product" step (apps/web/app/onboarding/product/*) sends
 * the admin to `/products/new?returnTo=…` to create the org's first product.
 * Previously that route did not exist, so next-intl localized it to
 * `/{locale}/products/new` and Next.js rendered the 404 page — the user was
 * "thrown out" of onboarding. This host renders the real, Supabase-backed FG
 * create wizard (the same FaCreateModal + createFa Server Action used by the FA
 * list page) forced open, and on success/cancel returns to the `returnTo` path.
 *
 * returnTo is sanitized: only same-origin absolute paths ("/…", not "//" and not
 * a scheme) are honored. Anything else falls back to the FA detail / FA list.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import {
  FaCreateModal,
  type CreateFaAction,
  type FaCreateLabels,
} from '../../fa/_components/fa-create-modal';

/** Allow only same-origin absolute paths (open-redirect / locale-break guard). */
function safeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Must be a root-relative path and not protocol-relative ("//host").
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  return decoded;
}

export type ProductCreateWizardProps = {
  labels: FaCreateLabels;
  /** Injected only when the caller may create (RBAC resolved server-side). */
  createFaAction?: CreateFaAction;
  /** Current locale (used to prefix fallback navigation). */
  locale: string;
  /** Raw, still-encoded returnTo from the URL. */
  returnTo?: string;
};

export function ProductCreateWizard({
  labels,
  createFaAction,
  locale,
  returnTo,
}: ProductCreateWizardProps) {
  const router = useRouter();
  const fallbackBase = `/${locale}/fa`;
  const returnPath = React.useMemo(() => safeReturnTo(returnTo), [returnTo]);

  const onClose = React.useCallback(() => {
    router.push(returnPath ?? fallbackBase);
  }, [router, returnPath, fallbackBase]);

  const onCreated = React.useCallback(
    (productCode: string) => {
      // After creating the first product, return the user to the flow that sent
      // them here (onboarding). When there is no returnTo, land on the new FG.
      router.push(returnPath ?? `${fallbackBase}/${encodeURIComponent(productCode)}`);
    },
    [router, returnPath, fallbackBase],
  );

  return (
    <FaCreateModal
      open
      labels={labels}
      createFaAction={createFaAction}
      onCreated={onCreated}
      onClose={onClose}
    />
  );
}

export default ProductCreateWizard;
