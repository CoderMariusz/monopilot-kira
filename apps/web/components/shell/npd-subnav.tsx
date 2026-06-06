"use client";

import type { JSX } from "react";
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import {
  NPD_NAV_APEX_GROUP,
  NPD_NAV_TOP_TABS,
  isNpdApexActive,
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

  const apexActive = isNpdApexActive(routePath);
  // Apex defaults open, and stays open whenever one of its children is active.
  const [apexOpen, setApexOpen] = useState(true);
  const apexExpanded = apexOpen || apexActive;

  return (
    <nav
      data-testid="npd-subnav"
      role="navigation"
      aria-label="NPD"
      className="flex flex-wrap items-end gap-0 border-b border-shell-border bg-white px-5 text-shell-fg"
    >
      {NPD_NAV_TOP_TABS.map((tab) => {
        const active = isNpdNavItemActive(tab.route, routePath);
        return (
          <Link
            key={tab.key}
            href={localizedHref(activeLocale, tab.route)}
            aria-current={active ? "page" : undefined}
            data-testid={`npd-subnav-item-${tab.key}`}
            className={cx(TAB_BASE, active ? TAB_ACTIVE : TAB_INACTIVE)}
          >
            {t(tab.i18nKey)}
          </Link>
        );
      })}

      {/* Apex collapsible group — chevron ▲ open / ▼ closed (chrome.jsx:104-117). */}
      <button
        type="button"
        onClick={() => setApexOpen((open) => !open)}
        aria-expanded={apexExpanded}
        aria-current={apexActive ? "page" : undefined}
        data-testid="npd-subnav-apex-toggle"
        className={cx(TAB_BASE, "gap-1.5", apexActive ? TAB_ACTIVE : TAB_INACTIVE)}
      >
        {t(NPD_NAV_APEX_GROUP.i18nKey)}
        <span aria-hidden="true" className="text-[9px] opacity-60">
          {apexExpanded ? "▲" : "▼"}
        </span>
      </button>

      {apexExpanded
        ? NPD_NAV_APEX_GROUP.items.map((item) => {
            const active = isNpdNavItemActive(item.route, routePath);
            return (
              <Link
                key={item.key}
                href={localizedHref(activeLocale, item.route)}
                aria-current={active ? "page" : undefined}
                data-testid={`npd-subnav-item-${item.key}`}
                className={cx(TAB_BASE, "pl-5 opacity-90", active ? TAB_ACTIVE : TAB_INACTIVE)}
              >
                {t(item.i18nKey)}
              </Link>
            );
          })
        : null}
    </nav>
  );
}

export default NpdSubNav;
