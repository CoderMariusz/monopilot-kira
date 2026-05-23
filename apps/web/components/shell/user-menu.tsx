"use client";

import React from "react";
import { useTranslations } from "next-intl";

import UserMenuLanguagePicker from "../../app/_components/user-menu-language-picker";
import type { UserMenuLanguagePickerProps } from "../../app/_components/user-menu-language-picker";

type ShellUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
};

type UserMenuProps = {
  user: ShellUser;
  orgId: string;
  locale: "en" | "pl" | "uk" | "ro";
  userLanguage: UserMenuLanguagePickerProps["userLanguage"];
  effectiveLanguage: UserMenuLanguagePickerProps["effectiveLanguage"];
  organizationLanguage: UserMenuLanguagePickerProps["organizationLanguage"];
  onSelectLanguage: UserMenuLanguagePickerProps["onSelectLanguage"];
  switchNextIntlLocale: UserMenuLanguagePickerProps["switchNextIntlLocale"];
  signOutAction: (formData: FormData) => Promise<never> | never;
};

function initialsFor(user: ShellUser) {
  return user.initials || user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || user.email[0]?.toUpperCase() || "U";
}

export function UserMenu({
  user,
  orgId,
  locale,
  userLanguage,
  effectiveLanguage,
  organizationLanguage,
  onSelectLanguage,
  switchNextIntlLocale,
  signOutAction,
}: UserMenuProps) {
  const t = useTranslations("Topbar");
  const [open, setOpen] = React.useState(false);
  const LanguagePicker = UserMenuLanguagePicker as React.ComponentType<UserMenuLanguagePickerProps>;
  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"], [role="menuitem"], button:not([disabled])');
    firstItem?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggleFromKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "Space" || event.key === "Spacebar") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        ref={triggerRef}
        data-testid="app-topbar-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("openUserMenu", { name: user.name })}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={toggleFromKeyboard}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-shell-border bg-shell-active text-sm font-semibold text-shell-active-fg shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-active-fg focus-visible:ring-offset-2 focus-visible:ring-offset-shell-bg"
      >
        {initialsFor(user)}
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-shell-border bg-shell-surface p-3 text-sm text-shell-fg shadow-xl"
        >
          <div className="mb-3 border-b border-shell-border pb-3">
            <div className="font-semibold">{user.name}</div>
            <div className="truncate text-xs text-shell-muted">{user.email}</div>
          </div>

          {LanguagePicker ? (
            <LanguagePicker
              userId={user.id}
              orgId={orgId}
              userLanguage={userLanguage}
              effectiveLanguage={effectiveLanguage}
              organizationLanguage={organizationLanguage}
              onSelectLanguage={onSelectLanguage}
              switchNextIntlLocale={switchNextIntlLocale}
            />
          ) : null}

          <form action={signOutAction} data-testid="app-topbar-sign-out-form" className="mt-3 border-t border-shell-border pt-3">
            <input type="hidden" name="locale" value={locale} readOnly />
            <button
              type="submit"
              data-testid="app-topbar-sign-out"
              className="w-full rounded-lg px-3 py-2 text-left font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default UserMenu;
export type { UserMenuProps };
