"use client";

import React from "react";
import { Button } from "@monopilot/ui/Button";

import {
  PageHead,
  Section,
  SelectField,
  SettingField,
  SRow,
} from "../../../[locale]/(app)/(admin)/settings/_components";

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

type MyProfileRole = {
  code: string;
  name: string;
};

type SaveProfileInput = Pick<MyProfileUser, "fullName" | "displayName" | "phone"> & UserPreferences;

type MyProfileMfaState = {
  enabled: boolean;
  deviceLabel: string;
  addedAt: string;
  enrollmentAvailable: boolean;
};

export type MyProfileMfaLabels = {
  reconfigureTitle: string;
  backupCodesTitle: string;
  enrollInstructions: string;
  backupCodesInstructions: string;
  backupCodesRotateWarning: string;
  secretLabel: string;
  verificationCodeLabel: string;
  backupCodesListLabel: string;
  confirm: string;
  close: string;
  generating: string;
  verifying: string;
  invalidCode: string;
  unavailableTitle: string;
  unavailableBody: string;
  copyCodes: string;
};

type BeginMfaReconfigure = () => Promise<
  | { ok: true; secret: string; provisioningUri: string }
  | { ok: false; error?: string }
>;

type ConfirmMfaReconfigure = (input: { code: string }) => Promise<
  | { ok: true; backupCodes: string[] }
  | { ok: false; error?: string }
>;

type RegenerateBackupCodes = (input: { code: string }) => Promise<
  | { ok: true; backupCodes: string[] }
  | { ok: false; error?: string }
>;

type MyProfilePageProps = {
  user?: MyProfileUser;
  /** Role(s) assigned to the signed-in user; rendered read-only in Profile. */
  roles?: MyProfileRole[];
  /** Localized label for the role row (resolved server-side via next-intl). */
  roleLabel?: string;
  preferences?: UserPreferences;
  sessions?: UserSession[];
  mfa?: MyProfileMfaState;
  mfaLabels?: MyProfileMfaLabels;
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
  beginMfaReconfigure?: BeginMfaReconfigure;
  confirmMfaReconfigure?: ConfirmMfaReconfigure;
  regenerateBackupCodes?: RegenerateBackupCodes;
  onMfaEnrollmentComplete?: () => void;
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

const timezoneOptions: Array<{ value: UserPreferences["timezone"]; label: string }> = [
  { value: "Europe/Warsaw", label: "Europe/Warsaw" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/London", label: "Europe/London" },
];

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

const defaultMfaLabels: MyProfileMfaLabels = {
  reconfigureTitle: "Reconfigure authenticator",
  backupCodesTitle: "Backup codes",
  enrollInstructions: "Add this secret to your authenticator app, then enter the six-digit code to confirm.",
  backupCodesInstructions: "Backup codes are shown once. Store them in a secure password manager.",
  backupCodesRotateWarning: "Generating new codes invalidates any previous backup codes.",
  secretLabel: "Authenticator secret",
  verificationCodeLabel: "Verification code",
  backupCodesListLabel: "Your backup codes",
  confirm: "Confirm",
  close: "Close",
  generating: "Preparing enrollment…",
  verifying: "Verifying…",
  invalidCode: "Enter a valid six-digit code.",
  unavailableTitle: "MFA enrollment unavailable",
  unavailableBody: "TOTP enrollment is not configured on this deployment (MFA_MASTER_KEY missing).",
  copyCodes: "Copy codes",
};

function MfaDialog({
  modalId,
  labels,
  enrollmentAvailable,
  mfaEnabled,
  beginMfaReconfigure,
  confirmMfaReconfigure,
  regenerateBackupCodes,
  onEnrollmentComplete,
  onClose,
}: {
  modalId: "SM-MFA-ENROLL" | "SM-BACKUP-CODES";
  labels: MyProfileMfaLabels;
  enrollmentAvailable: boolean;
  mfaEnabled: boolean;
  beginMfaReconfigure?: BeginMfaReconfigure;
  confirmMfaReconfigure?: ConfirmMfaReconfigure;
  regenerateBackupCodes?: RegenerateBackupCodes;
  onEnrollmentComplete?: () => void;
  onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const outerTitleId = React.useId();
  const helperTitleId = React.useId();
  const title = modalId === "SM-MFA-ENROLL" ? labels.reconfigureTitle : labels.backupCodesTitle;
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [provisioningUri, setProvisioningUri] = React.useState<string | null>(null);
  const [verificationCode, setVerificationCode] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!enrollmentAvailable) return;
    if (modalId !== "SM-MFA-ENROLL" || !beginMfaReconfigure) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    void beginMfaReconfigure()
      .then((result) => {
        if (cancelled) return;
        if (result.ok === true) {
          setSecret(result.secret);
          setProvisioningUri(result.provisioningUri);
          return;
        }
        setError(labels.unavailableBody);
      })
      .catch(() => {
        if (!cancelled) setError(labels.unavailableBody);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [beginMfaReconfigure, enrollmentAvailable, labels.unavailableBody, modalId]);

  React.useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
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
  }, []);

  async function handleConfirmEnrollment() {
    if (!confirmMfaReconfigure) return;
    setLoading(true);
    setError(null);
    try {
      const result = await confirmMfaReconfigure({ code: verificationCode });
      if (result.ok === true) {
        setBackupCodes(result.backupCodes);
        onEnrollmentComplete?.();
        return;
      }
      setError(result.error === "invalid_code" ? labels.invalidCode : labels.unavailableBody);
    } catch {
      setError(labels.unavailableBody);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateBackupCodes() {
    if (!regenerateBackupCodes) return;
    setLoading(true);
    setError(null);
    try {
      const result = await regenerateBackupCodes({ code: verificationCode });
      if (result.ok === true) {
        setBackupCodes(result.backupCodes);
        return;
      }
      if (result.error === "not_enrolled") {
        setError(labels.unavailableBody);
        return;
      }
      setError(result.error === "invalid_code" ? labels.invalidCode : labels.unavailableBody);
    } catch {
      setError(labels.unavailableBody);
    } finally {
      setLoading(false);
    }
  }

  function copyBackupCodes() {
    if (!backupCodes?.length) return;
    void navigator.clipboard.writeText(backupCodes.join("\n"));
  }

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
          data-mfa-available={enrollmentAvailable ? "true" : "false"}
          className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 id={outerTitleId} className="text-base font-semibold text-slate-950">
              {title}
            </h3>
          </div>
          <div className="grid gap-3 px-5 py-4 text-sm text-slate-700">
            {!enrollmentAvailable ? (
              <>
                <p className="font-medium text-slate-900">{labels.unavailableTitle}</p>
                <p>{labels.unavailableBody}</p>
              </>
            ) : modalId === "SM-MFA-ENROLL" ? (
              <>
                <p>{labels.enrollInstructions}</p>
                {loading && !secret ? <p role="status">{labels.generating}</p> : null}
                {secret ? (
                  <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labels.secretLabel}</div>
                      <code className="mt-1 block break-all font-mono text-sm" data-testid="mfa-enroll-secret">
                        {secret}
                      </code>
                    </div>
                    {provisioningUri ? (
                      <code className="block break-all font-mono text-[11px] text-slate-500" data-testid="mfa-enroll-uri">
                        {provisioningUri}
                      </code>
                    ) : null}
                  </div>
                ) : null}
                {backupCodes ? (
                  <div>
                    <div className="mb-2 font-medium">{labels.backupCodesListLabel}</div>
                    <ul className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="mfa-backup-codes-list">
                      {backupCodes.map((code) => (
                        <li key={code}>{code}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-900">{labels.verificationCodeLabel}</span>
                    <input
                      id="mfa-verification-code"
                      className="max-w-[420px] rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.currentTarget.value)}
                      disabled={loading || !secret}
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <p>{labels.backupCodesInstructions}</p>
                <p className="text-amber-800">{labels.backupCodesRotateWarning}</p>
                {backupCodes ? (
                  <div>
                    <div className="mb-2 font-medium">{labels.backupCodesListLabel}</div>
                    <ul className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="mfa-backup-codes-list">
                      {backupCodes.map((code) => (
                        <li key={code}>{code}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-900">{labels.verificationCodeLabel}</span>
                    <input
                      id="mfa-backup-verification-code"
                      className="max-w-[420px] rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.currentTarget.value)}
                      disabled={loading || !mfaEnabled}
                    />
                  </label>
                )}
              </>
            )}
            {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
            <div hidden role="dialog" aria-modal="true" aria-labelledby={helperTitleId} data-focus-trap="radix-dialog">
              <span id={helperTitleId}>Modal accessibility probe</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-4">
            {backupCodes ? (
              <Button type="button" className="btn-secondary" onClick={copyBackupCodes}>
                {labels.copyCodes}
              </Button>
            ) : enrollmentAvailable && modalId === "SM-MFA-ENROLL" && secret && !backupCodes ? (
              <Button type="button" className="btn-primary" disabled={loading} onClick={() => void handleConfirmEnrollment()}>
                {loading ? labels.verifying : labels.confirm}
              </Button>
            ) : enrollmentAvailable && modalId === "SM-BACKUP-CODES" && !backupCodes ? (
              <Button
                type="button"
                className="btn-primary"
                disabled={loading || !mfaEnabled}
                onClick={() => void handleRegenerateBackupCodes()}
              >
                {loading ? labels.verifying : labels.confirm}
              </Button>
            ) : null}
            <Button type="button" onClick={onClose}>
              {labels.close}
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
  roles = [],
  roleLabel = "Role",
  preferences = fallbackPreferences,
  sessions = [],
  mfa = { enabled: false, deviceLabel: "Authenticator app", addedAt: "", enrollmentAvailable: false },
  mfaLabels = defaultMfaLabels,
  canEditProfile = false,
  state = "ready",
  saveProfile,
  updatePassword,
  updateLanguagePreference,
  revokeSession,
  logoutEverywhere,
  beginMfaReconfigure,
  confirmMfaReconfigure,
  regenerateBackupCodes,
  onMfaEnrollmentComplete,
}: MyProfilePageProps) {
  const normalizedUser = { ...fallbackUser, ...user };
  const normalizedPreferences = { ...fallbackPreferences, ...preferences };
  const [mfaState, setMfaState] = React.useState(mfa);
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
    setMfaState(mfa);
    setMessage(null);
    setError(null);
    setPasswordDraft({ currentPassword: "", newPassword: "", confirmNew: "" });
  }, [user, preferences, sessions, mfa]);

  if (state === "loading") {
    return (
      <main aria-labelledby="my-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6" data-prototype-source="prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75">
        <div data-testid="my-profile-loading" role="status" className="sg-section">
          <div className="sg-section-body">Loading my profile…</div>
        </div>
      </main>
    );
  }

  if (state === "empty" || !normalizedUser.id) {
    return (
      <main aria-labelledby="my-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6" data-prototype-source="prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75">
        <PageHead title="My profile" sub="Your personal info — only visible to admins and you." />
        <p role="status">No profile data is available for the current user.</p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main aria-labelledby="my-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6" data-prototype-source="prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75">
        <PageHead title="My profile" sub="Your personal info — only visible to admins and you." />
        <p role="alert">My profile could not be loaded.</p>
      </main>
    );
  }

  if (state === "permission-denied" || !canEditProfile) {
    return (
      <main aria-labelledby="my-profile-heading" className="mx-auto grid max-w-5xl gap-3 p-6" data-prototype-source="prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75">
        <PageHead title="My profile" sub="Your personal info — only visible to admins and you." />
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

  // Per-session revoke intentionally has no client handler: there is no
  // sessions backend (revokeSessionAction returns SESSIONS_BACKEND_UNAVAILABLE),
  // so the per-row Revoke control is rendered disabled rather than wired to a
  // call that always fails. The working "Log out everywhere" action below ends
  // every session globally.

  return (
    <main
      aria-labelledby="my-profile-heading"
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75"
    >
      <PageHead title="My profile" sub="Your personal info — only visible to admins and you." />

      {message ? (
        <div className="alert alert-green" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-red" role="alert">
          {error}
        </div>
      ) : null}

      <Section
        title="Profile"
        foot={
          <>
            <Button className="btn-ghost" type="button" onClick={() => setDraft(saved)} disabled={!isDirty || controlsDisabled}>
              Cancel
            </Button>
            <Button className="btn-primary" type="button" onClick={() => void handleSave()} disabled={!isDirty || controlsDisabled}>
              Save changes
            </Button>
          </>
        }
      >
        <SRow label="Avatar">
          <div className="flex items-center gap-3">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-xl font-semibold text-white"
            >
              {normalizedUser.initials}
            </div>
            <div>
              <Button className="btn-secondary btn-sm" type="button">
                Upload
              </Button>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                PNG or JPG · 200×200px
              </div>
            </div>
          </div>
        </SRow>
        <SRow label={roleLabel}>
          {roles.length > 0 ? (
            <div className="flex flex-wrap gap-2" data-testid="my-profile-roles">
              {roles.map((role) => (
                <span key={role.code} className="badge badge-blue" data-role-code={role.code}>
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted" data-testid="my-profile-roles-empty">
              —
            </span>
          )}
        </SRow>
        <SettingField
          id="my-profile-full-name"
          label="Full name"
          value={draft.fullName}
          disabled={controlsDisabled}
          onChange={(value) => updateDraft("fullName", value)}
        />
        <SettingField
          id="my-profile-display-name"
          label="Display name"
          hint="Shown in the UI."
          value={draft.displayName}
          disabled={controlsDisabled}
          onChange={(value) => updateDraft("displayName", value)}
        />
        <SettingField id="my-profile-email" label="Email" type="email" value={normalizedUser.email} disabled />
        <SettingField
          id="my-profile-phone"
          label="Phone"
          hint="Phone number storage is not yet available — this field cannot be saved."
          value={draft.phone}
          disabled
        />
        <SelectField
          id="my-profile-language"
          label="Language"
          options={languageOptions}
          value={draft.language}
          disabled={controlsDisabled}
          onChange={(value) => updateDraft("language", value as UserPreferences["language"])}
        />
        <SelectField
          id="my-profile-timezone"
          label="Timezone"
          options={timezoneOptions}
          value={draft.timezone}
          disabled={controlsDisabled}
          onChange={(value) => updateDraft("timezone", value as UserPreferences["timezone"])}
        />
      </Section>

      <Section
        title="Password"
        foot={
          <Button className="btn-primary" type="button" onClick={() => void handlePasswordUpdate()}>
            Update password
          </Button>
        }
      >
        <SettingField
          id="my-profile-current-password"
          label="Current password"
          type="password"
          placeholder="••••••••"
          value={passwordDraft.currentPassword}
          onChange={(value) => setPasswordDraft((current) => ({ ...current, currentPassword: value }))}
        />
        <SettingField
          id="my-profile-new-password"
          label="New password"
          type="password"
          placeholder="Min. 12 characters"
          value={passwordDraft.newPassword}
          onChange={(value) => setPasswordDraft((current) => ({ ...current, newPassword: value }))}
        />
        <SettingField
          id="my-profile-confirm-new"
          label="Confirm new"
          type="password"
          value={passwordDraft.confirmNew}
          onChange={(value) => setPasswordDraft((current) => ({ ...current, confirmNew: value }))}
        />
      </Section>

      <Section
        title="Two-factor authentication"
        action={<span className="badge badge-green">● {mfaState.enabled ? "Enabled" : "Disabled"}</span>}
      >
        <SRow
          label="Authenticator app"
          hint={
            mfaState.enrollmentAvailable
              ? `${mfaState.deviceLabel}${mfaState.addedAt ? `. Added ${mfaState.addedAt}` : ""}`
              : mfaLabels.unavailableBody
          }
        >
          <Button
            className="btn-secondary btn-sm"
            type="button"
            data-modal-id="SM-MFA-ENROLL"
            disabled={!mfaState.enrollmentAvailable}
            title={mfaState.enrollmentAvailable ? undefined : mfaLabels.unavailableBody}
            onClick={() => setOpenModalId("SM-MFA-ENROLL")}
          >
            Reconfigure
          </Button>
        </SRow>
        <SRow label="Backup codes" hint="Use these if you lose access to your authenticator.">
          <Button
            className="btn-ghost btn-sm"
            type="button"
            data-modal-id="SM-BACKUP-CODES"
            disabled={!mfaState.enrollmentAvailable}
            title={mfaState.enrollmentAvailable ? undefined : mfaLabels.unavailableBody}
            onClick={() => setOpenModalId("SM-BACKUP-CODES")}
          >
            Show codes
          </Button>
        </SRow>
      </Section>

      <Section title="Active sessions">
        <table aria-label="Active sessions">
          <thead>
            <tr>
              <th scope="col" style={{ width: 30 }}></th>
              <th scope="col">Device</th>
              <th scope="col">Location</th>
              <th scope="col">Last active</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {visibleSessions.map((session) => (
              <tr key={session.id}>
                <td>{session.deviceIcon === "desktop" ? "💻" : "📱"}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{session.device}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {session.fingerprint}
                  </div>
                </td>
                <td>{session.location}</td>
                <td>
                  {session.current ? (
                    <span className="badge badge-green">{session.lastActive}</span>
                  ) : (
                    <span className="mono">{session.lastActive}</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {session.current ? null : (
                    <Button
                      className="btn-ghost btn-sm"
                      type="button"
                      data-session-id={session.id}
                      disabled
                      title="Per-session revoke is coming soon — use “Log out everywhere” to end every session."
                      style={{ color: "var(--red)" }}
                    >
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
        <SRow label="Log out of all devices">
          <Button className="btn-danger btn-sm" type="button" onClick={() => void logoutEverywhere?.()}>
            Log out everywhere
          </Button>
        </SRow>
      </Section>

      {openModalId ? (
        <MfaDialog
          modalId={openModalId}
          labels={mfaLabels}
          enrollmentAvailable={mfaState.enrollmentAvailable}
          mfaEnabled={mfaState.enabled}
          beginMfaReconfigure={beginMfaReconfigure}
          confirmMfaReconfigure={confirmMfaReconfigure}
          regenerateBackupCodes={regenerateBackupCodes}
          onEnrollmentComplete={() => {
            setMfaState((current) => ({
              ...current,
              enabled: true,
              addedAt: new Date().toISOString().slice(0, 10),
            }));
            onMfaEnrollmentComplete?.();
          }}
          onClose={() => setOpenModalId(null)}
        />
      ) : null}
    </main>
  );
}
