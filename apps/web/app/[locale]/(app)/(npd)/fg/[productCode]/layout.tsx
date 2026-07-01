/**
 * T-138 — FA detail layout (RSC): shell + tabs + persistent right panel + modal routing.
 *
 * Route: /[locale]/(app)/(npd)/fa/[productCode]  (wraps page.tsx + the tab `?tab=`
 * navigations; risks/docs sub-routes inherit the same shell, matching the
 * prototype's single two-column grid that hosts every tab body incl. Risks/Docs).
 *
 * WHY A LAYOUT (no remount across tab switch — acceptance #2):
 *   The dept tabs switch via a query-only `?tab=` navigation on the SAME page
 *   segment (T-136 FaTabs pushes `${pathname}?tab=…`). Next.js App Router
 *   re-renders the PAGE on a query change but PRESERVES the enclosing LAYOUT.
 *   By owning the right panel here (not in page.tsx) the FaRightPanel instance is
 *   kept mounted across Core → Technical → … switches — it never remounts.
 *
 * COMPOSITION (acceptance #1):
 *   Two-column shell (prototype `1fr 280px`, fa-screens.jsx:400): the tabbed main
 *   content (`children` = page.tsx) on the LEFT, the merged T-137 FaRightPanel
 *   STICKY on the RIGHT.
 *
 * MODAL ROUTING (acceptance #3):
 *   The right-panel quick actions push `?modal=deptClose|d365Build` (the
 *   established query-trigger pattern). The FaDetailModalHost — also mounted by
 *   this layout so it persists across tab switches — turns that URL state into
 *   the correct dialog and closes by stripping `?modal=`.
 *
 * REAL DATA (NO mocks):
 *   The FA core (code/name/status_overall) AND the RBAC gates (npd.fa.read /
 *   npd.fa.close / npd.fa.build) are read ONCE server-side inside `withOrgContext`
 *   — a single org-context transaction running as app_user with RLS pinned to
 *   app.current_org_id(). The client never re-queries and never trusts a
 *   client-side permission flag: the action buttons are disabled server-side when
 *   the caller lacks the permission (or the FA is not yet Complete for D365).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-452
 *   (fa_detail two-column grid + fa_right_panel sticky aside).
 */

import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { FaRightPanel } from './_components/fa-right-panel';
import {
  FaRightPanelActions,
  type FaRightPanelActionsLabels,
} from './_components/fa-right-panel-actions';
import {
  FaDetailModalHost,
  type FaDetailModalHostLabels,
} from './_components/fa-detail-modal-host';
import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.fa.read';
const CLOSE_PERMISSION = 'npd.fa.close';
const BUILD_PERMISSION = 'npd.fa.build';
const DELETE_PERMISSION = 'npd.core.write';

type FaCore = {
  productCode: string;
  productName: string | null;
  statusOverall: string | null;
  /** Gate progress: whether the FA is Complete (all 7 depts closed → D365 ready). */
  complete: boolean;
};

type LayoutData = {
  canRead: boolean;
  canClose: boolean;
  canBuild: boolean;
  canDelete: boolean;
  fa: FaCore | null;
};

async function readFaCore(ctx: OrgContextLike, productCode: string): Promise<FaCore | null> {
  // RLS pins org scope to app.current_org_id(); product_code is the PK. The gate
  // progress (Complete) is derived from status_overall — the same source the
  // prototype's "Build D365" enablement reads (fa-screens.jsx:347).
  const { rows } = await ctx.client.query<{
    product_code: string;
    product_name: string | null;
    status_overall: string | null;
  }>(
    `select product_code, product_name, status_overall
       from public.product
      where product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  const row = rows[0];
  if (!row) return null;
  const status = row.status_overall;
  return {
    productCode: row.product_code,
    productName: row.product_name,
    statusOverall: status,
    complete: status === 'Complete' || status === 'Built',
  };
}

async function loadLayout(productCode: string): Promise<LayoutData> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LayoutData> => {
      const ctx = rawCtx as OrgContextLike;
      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { canRead: false, canClose: false, canBuild: false, canDelete: false, fa: null };
      }
      const [canClose, canBuild, canDelete, fa] = await Promise.all([
        hasPermission(ctx, CLOSE_PERMISSION),
        hasPermission(ctx, BUILD_PERMISSION),
        hasPermission(ctx, DELETE_PERMISSION),
        readFaCore(ctx, productCode),
      ]);
      return { canRead, canClose, canBuild, canDelete, fa };
    });
  } catch (error) {
    console.error('[fa-detail-layout] org-scoped read failed:', error);
    return { canRead: false, canClose: false, canBuild: false, canDelete: false, fa: null };
  }
}

// ---------------------------------------------------------------------------
// i18n labels (npd.faRightPanel for the action labels; npd.faDetailModals for
// the deferred modal shells). All visible strings route through next-intl with a
// graceful English fallback — no inline literals leak into the tree.
// ---------------------------------------------------------------------------

const DEFAULT_ACTION_LABELS: FaRightPanelActionsLabels = {
  actions: 'Quick actions',
  deptClose: 'Dept Close',
  d365Build: 'D365 Build',
  deleteFa: 'Delete FG',
  deptCloseDisabledHint: 'You do not have permission to close departments.',
  d365DisabledHint: 'FG must be Complete first (all 7 departments closed).',
  deleteDisabledHint: 'You do not have permission to delete finished goods.',
};

const DEFAULT_MODAL_LABELS: FaDetailModalHostLabels = {
  deptCloseTitle: 'Close department',
  deptCloseDeferred: 'The department-close workflow opens here.',
  deptReopenTitle: 'Reopen {dept}?',
  deptReopenIntro:
    'Reopening {dept} clears its closed flag so the department can be edited again. The change is recorded in history.',
  deptReopenConfirm: 'Reopen department',
  deptReopenPending: 'Reopening…',
  deptReopenError: 'Unable to reopen this department.',
  d365BuildTitle: 'Build D365 output',
  d365BuildDeferred: 'The D365 build workflow opens here.',
  deleteTitle: 'Delete FG {productCode}?',
  deleteIntro: 'This soft-deletes the FG from active NPD views. The audit trail is retained.',
  deleteBlockedBuilt: 'Built or released FGs are refused by the server action.',
  deleteTypeToConfirm: 'Type {productCode} to confirm',
  deleteReason: 'Reason',
  deleteReasonPlaceholder: 'Explain why this FG should be deleted',
  deleteConfirm: 'Delete FG',
  deletePending: 'Deleting...',
  deleteError: 'Unable to delete FG.',
  close: 'Cancel',
};

async function buildActionLabels(locale: string): Promise<FaRightPanelActionsLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faRightPanel' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const d = DEFAULT_ACTION_LABELS;
    return {
      actions: pick('actions', d.actions),
      deptClose: pick('deptClose', d.deptClose),
      d365Build: pick('d365Build', d.d365Build),
      deleteFa: pick('deleteFa', d.deleteFa),
      deptCloseDisabledHint: pick('deptCloseDisabledHint', d.deptCloseDisabledHint),
      d365DisabledHint: pick('d365DisabledHint', d.d365DisabledHint),
      deleteDisabledHint: pick('deleteDisabledHint', d.deleteDisabledHint),
    };
  } catch {
    return DEFAULT_ACTION_LABELS;
  }
}

async function buildModalLabels(locale: string): Promise<FaDetailModalHostLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faDetailModals' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const d = DEFAULT_MODAL_LABELS;
    return {
      deptCloseTitle: pick('deptCloseTitle', d.deptCloseTitle),
      deptCloseDeferred: pick('deptCloseDeferred', d.deptCloseDeferred),
      deptReopenTitle: pick('deptReopenTitle', d.deptReopenTitle),
      deptReopenIntro: pick('deptReopenIntro', d.deptReopenIntro),
      deptReopenConfirm: pick('deptReopenConfirm', d.deptReopenConfirm),
      deptReopenPending: pick('deptReopenPending', d.deptReopenPending),
      deptReopenError: pick('deptReopenError', d.deptReopenError),
      d365BuildTitle: pick('d365BuildTitle', d.d365BuildTitle),
      d365BuildDeferred: pick('d365BuildDeferred', d.d365BuildDeferred),
      deleteTitle: pick('deleteTitle', d.deleteTitle),
      deleteIntro: pick('deleteIntro', d.deleteIntro),
      deleteBlockedBuilt: pick('deleteBlockedBuilt', d.deleteBlockedBuilt),
      deleteTypeToConfirm: pick('deleteTypeToConfirm', d.deleteTypeToConfirm),
      deleteReason: pick('deleteReason', d.deleteReason),
      deleteReasonPlaceholder: pick('deleteReasonPlaceholder', d.deleteReasonPlaceholder),
      deleteConfirm: pick('deleteConfirm', d.deleteConfirm),
      deletePending: pick('deletePending', d.deletePending),
      deleteError: pick('deleteError', d.deleteError),
      close: pick('close', d.close),
    };
  } catch {
    return DEFAULT_MODAL_LABELS;
  }
}

type FaDetailLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; productCode: string }>;
};

export default async function FaDetailLayout(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FaDetailLayoutProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const [data, actionLabels, modalLabels] = await Promise.all([
    loadLayout(productCode),
    buildActionLabels(locale),
    buildModalLabels(locale),
  ]);

  const faComplete = data.fa?.complete ?? false;
  const productName = data.fa?.productName ?? null;

  // RBAC + gate progress resolved SERVER-SIDE — the action buttons are disabled
  // here when the caller lacks the permission (never render-then-trust-client).
  const actionsSlot = (
    <FaRightPanelActions
      canDeptClose={data.canRead && data.canClose}
      canBuild={data.canRead && data.canBuild}
      canDelete={data.canRead && data.canDelete}
      faComplete={faComplete}
      labels={actionLabels}
    />
  );

  // FaRightPanel is an async RSC: await it here so the resolved element is part of
  // this layout's render tree (the panel still reads its own real summary via
  // withOrgContext inside its body; the layout only injects the wired actions).
  const rightPanel = await FaRightPanel({
    locale,
    productCode,
    actionsSlot,
  });

  return (
    <div
      data-testid="fa-detail-shell"
      className="mx-auto grid w-full max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      {/* LEFT — tabbed main content (page.tsx); re-renders on ?tab= navigation. */}
      <div className="min-w-0">{props.children}</div>

      {/* RIGHT — persistent sticky panel; owned by the LAYOUT so it survives
          every ?tab= switch (no remount). Wired quick actions route to modals. */}
      {rightPanel}

      {/* Modal host (also layout-owned → persists across tabs). The Dept Close
          gate is resolved SERVER-SIDE here (npd.fa.read && npd.fa.close) and
          threaded down — the modal renders its forbidden state when false and
          never client-trusts a permission flag. */}
      <FaDetailModalHost
        productCode={data.fa?.productCode ?? productCode}
        productName={productName}
        canClose={data.canRead && data.canClose}
        labels={modalLabels}
      />
    </div>
  );
}
