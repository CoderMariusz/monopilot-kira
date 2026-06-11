"use client";

/**
 * 14-multi-site — topbar site picker (CL4 first honest vertical; replaces the
 * SiteCrumb placeholder host marked data-todo="multi-site-T-020" when the org
 * has sites).
 *
 * Honesty contract: selecting a site only filters the screens that are
 * explicitly site-wired (production WO list, warehouse LP list, OEE) — the
 * tooltip says exactly that. Everything else stays org-wide until the
 * withSiteContext RLS layer (14-multi-site backlog) lands.
 *
 * The selection is persisted via the `setSiteAction` server action (cookie
 * write seam) and the route tree is re-rendered with `router.refresh()` so the
 * wired Server Components re-read with the new filter.
 */

import type { JSX } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export type SiteSwitcherOption = {
  id: string;
  siteCode: string;
  name: string;
  isDefault: boolean;
};

export type SiteSwitcherLabels = {
  /** Accessible name for the select. */
  label: string;
  /** The "All sites" (no filter) option. */
  allSites: string;
  /** Honest tooltip — names the screens the filter actually reaches. */
  tooltip: string;
};

export type SiteSwitcherProps = {
  sites: SiteSwitcherOption[];
  /** Active site id from the mp_site_id cookie; null = All sites. */
  activeSiteId: string | null;
  labels: SiteSwitcherLabels;
  /** Server action persisting the choice (lib/site/site-actions.setActiveSite). */
  setSiteAction: (siteId: string | null) => Promise<{ ok: boolean }>;
};

export function SiteSwitcher({
  sites,
  activeSiteId,
  labels,
  setSiteAction,
}: SiteSwitcherProps): JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // An id that no longer resolves to an org site renders as "All sites".
  const value = activeSiteId && sites.some((s) => s.id === activeSiteId) ? activeSiteId : "";

  return (
    <label
      data-testid="app-topbar-site-switcher"
      data-slot="site-switcher"
      title={labels.tooltip}
      className="inline-flex min-h-9 items-center rounded-full border border-shell-border bg-shell-surface px-3 text-sm font-medium text-shell-fg"
    >
      <span className="sr-only">{labels.label}</span>
      <select
        data-testid="app-topbar-site-switcher-select"
        aria-label={labels.label}
        value={value}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value === "" ? null : event.target.value;
          startTransition(async () => {
            await setSiteAction(next);
            router.refresh();
          });
        }}
        className="max-w-44 cursor-pointer truncate bg-transparent text-sm font-medium text-shell-fg focus:outline-none"
      >
        <option value="">{labels.allSites}</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default SiteSwitcher;
