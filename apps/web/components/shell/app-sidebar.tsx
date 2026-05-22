"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { APP_NAV_GROUPS } from "../../lib/navigation/app-nav";
import type { AppSidebarNavItem } from "../../lib/navigation/types";

type AppSidebarProps = {
  locale?: string;
  pathnameOverride?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function localizedHref(locale: string, route: string) {
  return `/${locale}${route}`;
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

function isItemActive(item: AppSidebarNavItem, pathname: string, locale: string) {
  const routePath = stripLocalePrefix(pathname, locale);

  return routePath === item.route || routePath.startsWith(`${item.route}/`);
}

function iconStyle(iconToken: string) {
  return { "--app-sidebar-icon": JSON.stringify(iconToken) } as CSSProperties;
}

export function AppSidebar({ locale: localeOverride, pathnameOverride }: AppSidebarProps) {
  const detectedLocale = useLocale();
  const pathname = usePathname();
  const t = useTranslations();
  const locale = localeOverride ?? detectedLocale;
  const activePathname = pathnameOverride ?? pathname ?? localizedHref(locale, "/dashboard");

  return (
    <aside
      data-testid="app-sidebar"
      className="w-sidebar shrink-0 border-r border-shell-border bg-shell-bg px-4 py-5 text-shell-fg"
    >
      <nav className="flex flex-col gap-5">
        {APP_NAV_GROUPS.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <h2
              data-slot="group"
              className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-shell-muted"
            >
              {t(group.i18n_key)}
            </h2>

            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isItemActive(item, activePathname, locale);

                return (
                  <Link
                    key={item.key}
                    href={localizedHref(locale, item.route)}
                    aria-current={active ? "page" : undefined}
                    data-testid={`app-sidebar-item-${item.key}`}
                    className={cx(
                      "flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-active-fg focus-visible:ring-offset-2 focus-visible:ring-offset-shell-bg",
                      active
                        ? "bg-shell-active text-shell-active-fg"
                        : "text-shell-fg hover:bg-shell-active hover:text-shell-active-fg",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-flex h-4 w-4 items-center justify-center text-xs before:content-[var(--app-sidebar-icon)]"
                      style={iconStyle(item.icon_token)}
                    />
                    <span>{t(item.i18n_key)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

export default AppSidebar;
