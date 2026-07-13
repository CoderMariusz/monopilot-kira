'use client';

/**
 * G-1 fix — FA create modal query-trigger host (client island).
 *
 * Mirrors the brief pattern (apps/web/app/(npd)/_modals/brief-modals.tsx): the
 * FA list table's "+ Create FG" button pushes `?modal=faCreate`; this client
 * island reads that URL state and renders the (previously orphaned, T-021/T-008)
 * FaCreateModal. The real createFa Server Action is INJECTED by the server host
 * (fa-create-host.tsx) only when the caller may create — RBAC is never decided
 * here and never trusted from the client.
 *
 * On success the modal calls `onCreated(code)`; this host navigates to the
 * canonical FG detail route `/{locale}/fg/{productCode}` (NOT /npd/fg/… — the
 * modal's old comment about /npd/fg is stale; the consolidated detail route is
 * /[locale]/fg/[productCode]).
 *
 * Prototype parity source (1:1): modals.jsx:9-43 (FACreateModal / MODAL-01) via
 * the rendered FaCreateModal; the open-trigger mirrors fa-screens.jsx:204
 * `openModal("faCreate")`.
 */

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { FaCreateModal, type CreateFaAction, type FaCreateLabels } from '../../../../../(npd)/fa/_components/fa-create-modal';

const LOCALES = ['en', 'pl', 'ro', 'uk'];

function localePrefixFrom(pathname: string | null): string {
  const segment = (pathname ?? '/').split('/')[1] ?? '';
  return LOCALES.includes(segment) ? `/${segment}` : '';
}

export type FaCreateModalHostProps = {
  labels: FaCreateLabels;
  /** Injected only when the caller may create (RBAC resolved server-side). */
  createFaAction?: CreateFaAction;
  /** Test seam: force the modal open without driving the router. */
  forceOpen?: boolean;
};

export function FaCreateModalHost({ labels, createFaAction, forceOpen }: FaCreateModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = forceOpen ?? searchParams?.get('modal') === 'faCreate';

  const closeModal = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : (pathname ?? '/'));
  }, [pathname, router, searchParams]);

  const onCreated = React.useCallback(
    (productCode: string) => {
      // Canonical FG detail route: /[locale]/fg/[productCode].
      const localePrefix = localePrefixFrom(pathname);
      router.push(`${localePrefix}/fg/${productCode}`);
    },
    [pathname, router],
  );

  return (
    <FaCreateModal
      open={open}
      labels={labels}
      createFaAction={createFaAction}
      onCreated={onCreated}
      onClose={closeModal}
    />
  );
}

export default FaCreateModalHost;
