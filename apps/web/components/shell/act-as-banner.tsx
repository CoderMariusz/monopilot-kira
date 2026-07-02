"use client";

/**
 * Platform act-as banner — the strong-red control strip shown across the org
 * shell whenever a platform admin is acting inside a non-home org (ctx.actAsOrg
 * true). Exiting calls exitActAsAction() then refreshes so the shell drops back
 * to the admin's home org.
 *
 * Visual parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   .actas-banner (#b42318 background, .role / .who / .oc / .exit) — lines 152-160,
 *   328-337. The exit control uses the translucent-white pill from the prototype.
 */

import type { JSX } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export type ActAsBannerLabels = {
  role: string;
  actingAs: string;
  exit: string;
};

export type ActAsBannerProps = {
  orgName: string;
  orgCode: string;
  actorEmail: string;
  labels: ActAsBannerLabels;
  exitActAsAction: () => Promise<{ ok: boolean } | { ok: false; error: string }>;
};

export function ActAsBanner({
  orgName,
  orgCode,
  actorEmail,
  labels,
  exitActAsAction,
}: ActAsBannerProps): JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="status"
      data-testid="act-as-banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 20px",
        background: "#b42318",
        color: "#fff",
        fontSize: 12.5,
        borderBottom: "1px solid #7f1d1d",
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        ⚑
      </span>
      <span style={{ fontWeight: 700, letterSpacing: "0.03em" }}>{labels.role}</span>
      <span>· {labels.actingAs}</span>
      <span data-testid="act-as-banner-org" style={{ fontWeight: 600 }}>
        {orgName}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          background: "rgba(255,255,255,.16)",
          padding: "1px 7px",
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        {orgCode}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11, opacity: 0.85 }}>{actorEmail}</span>
      <button
        type="button"
        data-testid="act-as-banner-exit"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await exitActAsAction();
            router.refresh();
          })
        }
        style={{
          background: "rgba(255,255,255,.14)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,.35)",
          padding: "4px 12px",
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "inherit",
          cursor: isPending ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        ← {labels.exit}
      </button>
    </div>
  );
}

export default ActAsBanner;
