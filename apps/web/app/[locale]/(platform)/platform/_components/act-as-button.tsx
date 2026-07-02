"use client";

/**
 * Per-org "⚑ Act as" button in the platform console organizations table.
 *
 * Visual parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   .act-btn (lines 100-102) + the per-row button (lines 261/270/279/288). The
 *   admin's home row shows the muted "You are here" label instead (rendered by
 *   the server page, not here).
 *
 * On click: actAsOrgAction(orgId) writes the audited cookie + audit rows, then
 * we navigate into that org's dashboard so the admin immediately operates inside
 * it (the act-as banner then renders across the org shell).
 */

import type { JSX } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export type ActAsButtonProps = {
  orgId: string;
  label: string;
  /** Where to land after entering act-as (the org shell dashboard). */
  dashboardHref: string;
  actAsOrgAction: (orgId: string) => Promise<{ ok: boolean } | { ok: false; error: string }>;
};

export function ActAsButton({
  orgId,
  label,
  dashboardHref,
  actAsOrgAction,
}: ActAsButtonProps): JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      data-testid={`act-as-btn-${orgId}`}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await actAsOrgAction(orgId);
          if (result.ok) {
            router.push(dashboardHref);
            router.refresh();
          }
        })
      }
      style={{
        padding: "4px 12px",
        border: "1px solid #e2e8f0",
        background: "#fff",
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "inherit",
        cursor: isPending ? "wait" : "pointer",
        color: "#1e293b",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontWeight: 500,
      }}
    >
      <span aria-hidden style={{ color: "#ef4444" }}>
        ⚑
      </span>
      {label}
    </button>
  );
}

export default ActAsButton;
