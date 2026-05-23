"use client";

import type { CSSProperties, JSX } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Badge } from "@monopilot/ui/Badge";

import { SETTINGS_NAV_GROUPS } from "../../lib/navigation/settings-nav";
import type { SettingsNavItem } from "../../lib/navigation/types";

type SettingsSubNavProps = {
  locale?: string;
  pathnameOverride?: string;
};

const NAV_I18N_NAMESPACE = "Navigation.settings";
const RBAC_TODO_ID = "rbac/02-settings/T-130";
const ACTIVE_ROUTE_ALIASES: Record<string, string> = {
  "/settings": "profile",
  "/settings/company": "profile",
  "/settings/roles": "users",
  "/settings/authorization": "security",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function localizedHref(locale: string, route: string) {
  return `/${locale}${route}`;
}

function navI18nKey(i18nKey: string) {
  const prefix = `${NAV_I18N_NAMESPACE}.`;
  return i18nKey.startsWith(prefix) ? i18nKey.slice(prefix.length) : i18nKey;
}

function stripLocalePrefix(pathname: string, locale: string) {
  const localePrefix = `/${locale}`;

  if (pathname === localePrefix) {
    return "/";
  }

  if (pathname.startsWith(`${localePrefix}/`)) {
    return pathname.slice(localePrefix.length) || "/";
  }

  return pathname || "/";
}

function isItemActive(item: SettingsNavItem, pathname: string, locale: string) {
  const routePath = stripLocalePrefix(pathname, locale);
  const aliasKey = ACTIVE_ROUTE_ALIASES[routePath];

  if (aliasKey) {
    return item.key === aliasKey;
  }

  return routePath === item.route || routePath.startsWith(`${item.route}/`);
}

function iconStyle(iconToken: string) {
  return { "--settings-subnav-icon": JSON.stringify(iconToken) } as CSSProperties;
}

export function SettingsSubNav({ locale, pathnameOverride }: SettingsSubNavProps): JSX.Element {
  const pathname = usePathname();
  const runtimeLocale = useLocale();
  const t = useTranslations(NAV_I18N_NAMESPACE);
  const activeLocale = locale ?? runtimeLocale ?? "en";
  const activePathname = pathnameOverride ?? pathname ?? localizedHref(activeLocale, "/settings");

  return (
    <nav
      data-testid="settings-subnav"
      role="navigation"
      aria-label="Settings"
      className="w-subnav shrink-0 border-r border-shell-border bg-white px-4 py-5 text-shell-fg"
      style={{ width: "var(--shell-subnav-w)" }}
    >
      <div className="flex flex-col gap-5">
        {SETTINGS_NAV_GROUPS.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <h2 className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-shell-muted">
              {t(navI18nKey(group.i18n_key))}
            </h2>

            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isItemActive(item, activePathname, activeLocale);

                return (
                  <Link
                    key={item.key}
                    href={localizedHref(activeLocale, item.route)}
                    aria-current={active ? "page" : undefined}
                    data-testid={`settings-subnav-item-${item.key}`}
                    data-todo={RBAC_TODO_ID}
                    className={cx(
                      "flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-active-fg focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                      active
                        ? "bg-shell-active text-shell-active-fg"
                        : "text-shell-fg hover:bg-shell-active hover:text-shell-active-fg",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs before:content-[var(--settings-subnav-icon)]"
                      style={iconStyle(item.icon_token)}
                    />
                    <span className="min-w-0 flex-1 truncate">{t(navI18nKey(item.i18n_key))}</span>
                    {item.highlight ? (
                      <Badge variant="info" className="ml-auto shrink-0 px-1.5 py-0 text-[0.62rem] leading-4">
                        Hero
                      </Badge>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}

export default SettingsSubNav;
