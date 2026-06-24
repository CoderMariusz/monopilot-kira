"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { TECHNICAL_NAV_GROUPS, isTechnicalNavItemActive } from "../../lib/navigation/technical-nav";

const NAV_I18N_NAMESPACE = "Navigation.technical";

type TechnicalSubNavProps = {
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
  if (pathname === localePrefix) return "/";
  if (pathname.startsWith(`${localePrefix}/`)) return pathname.slice(localePrefix.length) || "/";
  return pathname || "/";
}

export function TechnicalSubNav({ locale, pathnameOverride }: TechnicalSubNavProps): JSX.Element {
  const pathname = usePathname();
  const runtimeLocale = useLocale();
  const t = useTranslations(NAV_I18N_NAMESPACE);
  const activeLocale = locale ?? runtimeLocale ?? "en";
  const activePathname = pathnameOverride ?? pathname ?? localizedHref(activeLocale, "/technical");
  const routePath = stripLocalePrefix(activePathname, activeLocale);

  // Resolve a Navigation.technical key, falling back to the English source label
  // if the key is somehow absent (the i18n-parity test guards against gaps).
  const tr = (i18nKey: string, fallback: string): string => (t.has(i18nKey) ? t(i18nKey) : fallback);

  return (
    <nav
      data-testid="technical-subnav"
      role="navigation"
      aria-label={t.has("aria.nav") ? t("aria.nav") : "Technical"}
      className="w-subnav shrink-0 border-r border-shell-border bg-white px-4 py-5 text-shell-fg"
      style={{ width: "var(--shell-subnav-w)" }}
    >
      <div className="flex flex-col gap-5">
        {TECHNICAL_NAV_GROUPS.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <h2 className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-shell-muted">
              {tr(group.i18nKey, group.label)}
            </h2>

            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isTechnicalNavItemActive(item.route, routePath);

                return (
                  <Link
                    key={item.key}
                    href={localizedHref(activeLocale, item.route)}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    data-testid={`technical-subnav-item-${item.key}`}
                    className={cx(
                      "flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-active-fg focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                      active
                        ? "bg-shell-active text-shell-active-fg"
                        : "text-shell-fg hover:bg-shell-active hover:text-shell-active-fg",
                    )}
                  >
                    <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{tr(item.i18nKey, item.label)}</span>
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

export default TechnicalSubNav;
