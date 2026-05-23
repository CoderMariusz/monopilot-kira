import type { JSX } from "react";

type SiteCrumbProps = {
  orgName: string;
};

export function SiteCrumb({ orgName }: SiteCrumbProps): JSX.Element {
  return (
    <span
      data-testid="app-topbar-sitecrumb"
      data-slot="site-switcher"
      data-todo="multi-site-T-020"
      aria-label="Current organization"
      className="inline-flex min-h-9 items-center rounded-full border border-shell-border bg-shell-surface px-3 text-sm font-medium text-shell-fg"
    >
      {/* TODO(multi-site/T-020): replace text-only orgName host with live SiteSwitcher. */}
      {orgName}
    </span>
  );
}

export default SiteCrumb;
