"use client";

import React from "react";
import { Button } from "@monopilot/ui/Button";
import Input from "@monopilot/ui/Input";

type MyProfileUser = {
  id: string;
  initials: string;
  fullName: string;
  displayName: string;
  email: string;
  phone: string;
};

type UserPreferences = {
  language: "en" | "pl" | "de";
  timezone: "Europe/Warsaw" | "Europe/Berlin" | "Europe/London";
};

type UserSession = {
  id: string;
  deviceIcon: "desktop" | "mobile";
  device: string;
  fingerprint: string;
  location: string;
  lastActive: string;
  current: boolean;
};

type SaveProfileInput = Pick<MyProfileUser, "fullName" | "displayName" | "phone"> & UserPreferences;

type MyProfilePageProps = {
  user?: MyProfileUser;
  preferences?: UserPreferences;
  sessions?: UserSession[];
  mfa?: { enabled: boolean; deviceLabel: string; addedAt: string };
  canEditProfile?: boolean;
  state?: "ready" | "loading" | "empty" | "error" | "permission-denied";
  saveProfile?: (input: SaveProfileInput) => Promise<{ ok?: boolean; error?: string } | unknown> | { ok?: boolean; error?: string } | unknown;
  updatePassword?: (input: { currentPassword: string; newPassword: string; confirmNew: string }) =>
    | Promise<{ ok?: boolean; error?: string } | unknown>
    | { ok?: boolean; error?: string }
    | unknown;
  updateLanguagePreference?: (input: { userId: string; language: UserPreferences["language"] }) => Promise<{
    ok?: boolean;
    userPreferencesRowUpdated?: boolean;
    localeCookie?: string;
    error?: string;
  }> | { ok?: boolean; userPreferencesRowUpdated?: boolean; localeCookie?: string; error?: string };
  revokeSession?: (input: { sessionId: string }) => Promise<{
    ok?: boolean;
    deletedSessionId?: string;
    invalidatedSessionToken?: boolean;
    error?: string;
  }> | { ok?: boolean; deletedSessionId?: string; invalidatedSessionToken?: boolean; error?: string };
  logoutEverywhere?: () => Promise<unknown> | unknown;
};

const fallbackUser: MyProfileUser = {
  id: "",
  initials: "--",
  fullName: "",
  displayName: "",
  email: "",
  phone: "",
};

const fallbackPreferences: UserPreferences = {
  language: "en",
  timezone: "Europe/Warsaw",
};

const languageOptions: Array<{ value: UserPreferences["language"]; label: string }> = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "de", label: "Deutsch" },
];

const timezoneOptions: UserPreferences["timezone"][] = ["Europe/Warsaw", "Europe/Berlin", "Europe/London"];

function profileToDraft(user: MyProfileUser, preferences: UserPreferences): SaveProfileInput {
  return {
    fullName: user.fullName,
    displayName: user.displayName,
    phone: user.phone,
    language: preferences.language,
    timezone: preferences.timezone,
  };
}

function sameDraft(a: SaveProfileInput, b: SaveProfileInput) {
  return (
    a.fullName === b.fullName &&
    a.displayName === b.displayName &&
    a.phone === b.phone &&
    a.language === b.language &&
    a.timezone === b.timezone
  );
}

function sectionId(title: string) {
  return `my-profile-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function Section({
  title,
  children,
  footer,
  action,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const id = sectionId(title);

  return (
    <section
      aria-labelledby={id}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="my-profile-section"
      role="region"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-950" id={id}>
          {title}
        </h2>
        {action}
      </div>
      <div className="grid gap-4">{children}</div>
      {footer ? <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">{footer}</div> : null}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
      <div className="text-sm font-medium text-slate-800">
        {label}
        {hint ? <div className="mt-1 text-xs font-normal text-slate-500">{hint}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  type = "text",
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <Input
        aria-label={label}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
        disabled={disabled}
        id={id}
        name={label}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </label>
  );
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <Input
        aria-label={label}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        id={id}
        name={label}
        placeholder={placeholder}
        type="password"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: Array<T | { value: T; label: string }>;
  onChange?: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
        data-slot="select"
        disabled={disabled}
        id={id}
        name={label}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value as T)}
      >
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function MfaDialog({ modalId, onClose }: { modalId: "SM-MFA-ENROLL" | "SM-BACKUP-CODES"; onClose: () => void }) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const outerTitleId = React.useId();
  const helperTitleId = React.useId();
  const title = modalId === "SM-MFA-ENROLL" ? "SM-MFA-ENROLL — Reconfigure authenticator" : "SM-BACKUP-CODES — Backup codes";

  React.useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <>
      <span data-radix-focus-guard tabIndex={0} aria-hidden="true" />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40" onMouseDown={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={outerTitleId}
          data-focus-trap="radix-dialog"
          data-modal-id={modalId}
          className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 id={outerTitleId} className="text-base font-semibold text-slate-950">
              {title}
            </h3>
          </div>
          <div className="grid gap-3 px-5 py-4 text-sm text-slate-700">
            {modalId === "SM-MFA-ENROLL" ? (
              <p>Scan a new authenticator QR code, then confirm the six-digit code before replacing the current device.</p>
            ) : (
              <p>Backup codes are shown once. Store them in a secure password manager and rotate them after use.</p>
            )}
            <div hidden role="dialog" aria-modal="true" aria-labelledby={helperTitleId} data-focus-trap="radix-dialog">
              <span id={helperTitleId}>Modal accessibility probe</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-4">
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
      <span data-radix-focus-guard tabIndex={0} aria-hidden="true" />
    </>
  );
}

export default function MyProfilePage({
  user = fallbackUser,
  preferences = fallbackPreferences,
  sessions = [],
  mfa = { enabled: false, deviceLabel: "Authenticator app", addedAt: "" },
  canEditProfile = false,
  state = "ready",
  saveProfile,
  updatePassword,
  updateLanguagePreference,
  revokeSession,
  logoutEverywhere,
}: MyProfilePageProps) {
  const normalizedUser = { ...fallbackUser, ...user };
  const normalizedPreferences = { ...fallbackPreferences, ...preferences };
  const [saved, setSaved] = React.useState<SaveProfileInput>(() => profileToDraft(normalizedUser, normalizedPreferences));
  const [draft, setDraft] = React.useState<SaveProfileInput>(() => profileToDraft(normalizedUser, normalizedPreferences));
  const [visibleSessions, setVisibleSessions] = React.useState<UserSession[]>(sessions);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openModalId, setOpenModalId] = React.useState<"SM-MFA-ENROLL" | "SM-BACKUP-CODES" | null>(null);
  const [passwordDraft, setPasswordDraft] = React.useState({ currentPassword: "", newPassword: "", confirmNew: "" });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const nextUser = { ...fallbackUser, ...user };
    const nextPreferences = { ...fallbackPreferences, ...preferences };
    const nextDraft = profileToDraft(nextUser, nextPreferences);
    setSaved(nextDraft);
    setDraft(nextDraft);
    setVisibleSessions(sessions);
    setMessage(null);
    setError(null);
    setPasswordDraft({ currentPassword: "", newPassword: "", confirmNew: "" });
  }, [user, preferences, sessions]);

  if (state === "loading") {
    return (
      <main aria-labelledby="my-profile-heading" className="grid gap-4 p-6">
        <div data-testid="my-profile-loading" role="status" className="rounded-xl border border-slate-200 p-5">
          Loading my profile…
        </div>
      </main>
    );
  }

  if (state === "empty" || !normalizedUser.id) {
    return (
      <main aria-labelledby="my-profile-heading" className="grid gap-4 p-6">
        <h1 id="my-profile-heading">My profile</h1>
        <p role="status">No profile data is available for the current user.</p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main aria-labelledby="my-profile-heading" className="grid gap-4 p-6">
        <h1 id="my-profile-heading">My profile</h1>
        <p role="alert">My profile could not be loaded.</p>
      </main>
    );
  }

  if (state === "permission-denied" || !canEditProfile) {
    return (
      <main aria-labelledby="my-profile-heading" className="grid gap-4 p-6">
        <h1 id="my-profile-heading">My profile</h1>
        <p role="alert">Permission denied. You cannot edit this profile.</p>
      </main>
    );
  }

  const isDirty = !sameDraft(draft, saved);
  const controlsDisabled = saving;

  function updateDraft<K extends keyof SaveProfileInput>(key: K, value: SaveProfileInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    if (!isDirty || saving) return;
    setSaving(true);
    setError(null);

    try {
      const profileResult = (await saveProfile?.(draft)) as { ok?: boolean; error?: string } | undefined;
      if (profileResult?.ok === false) {
        setError(profileResult.error ?? "My profile could not be saved.");
        return;
      }
      let localeCookie: string | undefined;
      let preferencesUpdated = false;

      if (draft.language !== saved.language) {
        const result = await updateLanguagePreference?.({ userId: normalizedUser.id, language: draft.language });
        preferencesUpdated = Boolean(result?.userPreferencesRowUpdated);
        localeCookie = result?.localeCookie;
        if (result && result.ok === false) {
          setError(result.error ?? "Language preference could not be saved.");
          return;
        }
      }

      setSaved(draft);
      setMessage([
        preferencesUpdated ? "user_preferences updated" : "profile saved",
        localeCookie ? localeCookie : null,
      ]
        .filter(Boolean)
        .join(" · "));
    } catch {
      setError("My profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordUpdate() {
    try {
      const result = (await updatePassword?.(passwordDraft)) as { ok?: boolean; error?: string } | undefined;
      if (result?.ok === false) {
        setError(result.error ?? "Password could not be updated.");
        return;
      }

      setPasswordDraft({ currentPassword: "", newPassword: "", confirmNew: "" });
      setMessage("password updated");
    } catch {
      setError("Password could not be updated.");
    }
  }

  async function handleRevoke(sessionId: string) {
    try {
      const result = await revokeSession?.({ sessionId });
      if (result && result.ok === false) {
        setError(result.error ?? "Session could not be revoked.");
        return;
      }

      setVisibleSessions((current) => current.filter((session) => session.id !== sessionId));
      setMessage([
        result?.deletedSessionId ? "user_sessions row deleted" : "session removed",
        result?.invalidatedSessionToken ? "session token invalidated" : null,
      ]
        .filter(Boolean)
        .join(" · "));
    } catch {
      setError("Session could not be revoked.");
    }
  }

  return (
    <main aria-labelledby="my-profile-heading" className="mx-auto grid max-w-5xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 id="my-profile-heading" className="text-2xl font-semibold text-slate-950">
          My profile
        </h1>
        <p className="text-sm text-slate-600">Your personal info — only visible to admins and you.</p>
      </header>

      {message ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}

      <Section
        title="Profile"
        footer={
          <>
            <Button type="button" onClick={() => setDraft(saved)} disabled={!isDirty || controlsDisabled}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!isDirty || controlsDisabled}>
              Save changes
            </Button>
          </>
        }
      >
        <Row label="Avatar">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-xl font-semibold text-white">
              {normalizedUser.initials}
            </div>
            <div>
              <Button type="button">Upload</Button>
              <div className="mt-1 text-[11px] text-slate-500">PNG or JPG · 200×200px</div>
            </div>
          </div>
        </Row>
        <Row label="Full name">
          <TextField id="my-profile-full-name" label="Full name" value={draft.fullName} disabled={controlsDisabled} onChange={(value) => updateDraft("fullName", value)} />
        </Row>
        <Row label="Display name" hint="Shown in the UI.">
          <TextField id="my-profile-display-name" label="Display name" value={draft.displayName} disabled={controlsDisabled} onChange={(value) => updateDraft("displayName", value)} />
        </Row>
        <Row label="Email">
          <TextField id="my-profile-email" label="Email" type="email" value={normalizedUser.email} disabled />
        </Row>
        <Row label="Phone">
          <TextField id="my-profile-phone" label="Phone" value={draft.phone} disabled={controlsDisabled} onChange={(value) => updateDraft("phone", value)} />
        </Row>
        <Row label="Language">
          <SelectField id="my-profile-language" label="Language" value={draft.language} options={languageOptions} disabled={controlsDisabled} onChange={(value) => updateDraft("language", value)} />
        </Row>
        <Row label="Timezone">
          <SelectField id="my-profile-timezone" label="Timezone" value={draft.timezone} options={timezoneOptions} disabled={controlsDisabled} onChange={(value) => updateDraft("timezone", value)} />
        </Row>
      </Section>

      <Section
        title="Password"
        footer={
          <Button type="button" onClick={() => void handlePasswordUpdate()}>
            Update password
          </Button>
        }
      >
        <Row label="Current password">
          <PasswordField
            id="my-profile-current-password"
            label="Current password"
            placeholder="••••••••"
            value={passwordDraft.currentPassword}
            onChange={(value) => setPasswordDraft((current) => ({ ...current, currentPassword: value }))}
          />
        </Row>
        <Row label="New password">
          <PasswordField
            id="my-profile-new-password"
            label="New password"
            placeholder="Min. 12 characters"
            value={passwordDraft.newPassword}
            onChange={(value) => setPasswordDraft((current) => ({ ...current, newPassword: value }))}
          />
        </Row>
        <Row label="Confirm new">
          <PasswordField
            id="my-profile-confirm-new"
            label="Confirm new"
            value={passwordDraft.confirmNew}
            onChange={(value) => setPasswordDraft((current) => ({ ...current, confirmNew: value }))}
          />
        </Row>
      </Section>

      <Section title="Two-factor authentication" action={<span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">● {mfa.enabled ? "Enabled" : "Disabled"}</span>}>
        <Row label="Authenticator app" hint={`${mfa.deviceLabel}. Added ${mfa.addedAt}.`}>
          <Button type="button" data-modal-id="SM-MFA-ENROLL" onClick={() => setOpenModalId("SM-MFA-ENROLL")}>
            Reconfigure
          </Button>
        </Row>
        <Row label="Backup codes" hint="Use these if you lose access to your authenticator.">
          <Button type="button" data-modal-id="SM-BACKUP-CODES" onClick={() => setOpenModalId("SM-BACKUP-CODES")}>
            Show codes
          </Button>
        </Row>
      </Section>

      <Section title="Active sessions">
        <table aria-label="Active sessions" className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-8 py-2" scope="col"></th>
              <th className="py-2" scope="col">Device</th>
              <th className="py-2" scope="col">Location</th>
              <th className="py-2" scope="col">Last active</th>
              <th className="py-2" scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {visibleSessions.map((session) => (
              <tr key={session.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3">{session.deviceIcon === "desktop" ? "💻" : "📱"}</td>
                <td className="py-3">
                  <div className="font-medium text-slate-950">{session.device}</div>
                  <div className="font-mono text-[11px] text-slate-500">{session.fingerprint}</div>
                </td>
                <td className="py-3 text-slate-700">{session.location}</td>
                <td className="py-3">
                  {session.current ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{session.lastActive}</span>
                  ) : (
                    <span className="font-mono text-slate-700">{session.lastActive}</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  {session.current ? null : (
                    <Button type="button" data-session-id={session.id} onClick={() => void handleRevoke(session.id)}>
                      Revoke {session.device}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Danger zone">
        <Row label="Log out of all devices">
          <Button type="button" onClick={() => void logoutEverywhere?.()}>
            Log out everywhere
          </Button>
        </Row>
      </Section>

      {openModalId ? <MfaDialog modalId={openModalId} onClose={() => setOpenModalId(null)} /> : null}
    </main>
  );
}
