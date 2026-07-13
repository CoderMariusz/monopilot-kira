"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import {
  NPD_NAV_TOP_TABS,
  isNpdNavItemActive,
} from "../../lib/navigation/npd-nav";

type NpdSubNavProps = {
  locale?: string;
  pathnameOverride?: string;
};

const NAV_I18N_NAMESPACE = "Navigation.npd";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function localizedHref(locale: string, route: string) {
  return `/${locale}${route}`;
}

function stripLocalePrefix(pathname: string, locale: string) {
  const localePrefix = `/${locale}`;
  if (pathname === localePrefix) return "/";
  if (pathname.startsWith(`${localePrefix}/`)) return pathname.slice(localePrefix.length) || "/";
  return pathname || "/";
}

// Design SSOT: prototypes/design/Monopilot Design System/npd/chrome.jsx:76-121 +
// npd.css `.subnav` — horizontal tab bar, blue text + 2px blue bottom-border when
// active, muted otherwise.
const TAB_BASE =
  "inline-flex items-center border-b-2 px-3.5 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const TAB_ACTIVE = "border-[var(--blue)] font-medium text-[var(--blue)]";
const TAB_INACTIVE = "border-transparent text-shell-muted hover:text-shell-fg";

export function NpdSubNav({ locale, pathnameOverride }: NpdSubNavProps): JSX.Element {
  const pathname = usePathname();
  const runtimeLocale = useLocale();
  const t = useTranslations(NAV_I18N_NAMESPACE);
  const activeLocale = locale ?? runtimeLocale ?? "en";
  const activePathname = pathnameOverride ?? pathname ?? localizedHref(activeLocale, "/pipeline");
  const routePath = stripLocalePrefix(activePathname, activeLocale);

  // C7b — mark only the single MOST-SPECIFIC matching tab active. Several tabs
  // prefix-match the same path (e.g. /pipeline/workload matches both Projects
  // '/pipeline' and Workload '/pipeline/workload'); pick the longest match so
  // exactly one tab lights up.
  const activeRoute = NPD_NAV_TOP_TABS.filter((tab) =>
    isNpdNavItemActive(tab.route, routePath),
  ).reduce<string | null>(
    (best, tab) => (best && best.length >= tab.route.length ? best : tab.route),
    null,
  );

  return (
    <nav
      data-testid="npd-subnav"
      role="navigation"
      aria-label="NPD"
      className="flex flex-wrap items-end gap-0 border-b border-shell-border bg-white px-5 text-shell-fg"
    >
      {NPD_NAV_TOP_TABS.map((tab) => {
        const active = tab.route === activeRoute;
        return (
          <Link
            key={tab.key}
            href={localizedHref(activeLocale, tab.route)}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            data-testid={`npd-subnav-item-${tab.key}`}
            className={cx(TAB_BASE, active ? TAB_ACTIVE : TAB_INACTIVE)}
          >
            {t(tab.i18nKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export default NpdSubNav;
