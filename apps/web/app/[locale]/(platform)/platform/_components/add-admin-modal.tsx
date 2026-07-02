"use client";

/**
 * "Add platform admin" control + modal.
 *
 * Visual parity anchors (prototypes/design/Monopilot Design System/platform/
 * platform-console-and-org-shell.html):
 *   - trigger button = .btn.btn-primary (proto lines 37-39, 221) — the exact
 *     inline treatment already used by the console page's primary button.
 *   - modal card radius/shadow = --radius-lg (8px) / --shadow-modal
 *     (colors_and_type.css lines 74, 78); overlay dims the console.
 *   - primary/secondary modal buttons mirror .btn-primary / .btn-secondary
 *     (proto 37-41); the mono email echo uses --font-mono (JetBrains Mono).
 *
 * RBAC: the action is server-resolved (assertPlatformAdmin inside
 * addPlatformAdminAction). This component never trusts client state for
 * authorization — it only invokes the server action and renders its result.
 * The action is passed in as a prop (a Server Action reference is serializable;
 * a plain formatter function would NOT be — that crashed the shell before).
 */

import type { JSX } from "react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { AddPlatformAdminResult } from "../../../../../lib/platform/actions-types";

export type AddAdminLabels = {
  trigger: string;
  title: string;
  subtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  successAdded: string;
  successRevived: string;
  successAlready: string;
  successSelf: string;
  errorNotFound: string;
  errorInvalidEmail: string;
  errorForbidden: string;
  errorUnknown: string;
};

export type AddAdminModalProps = {
  labels: AddAdminLabels;
  addPlatformAdminAction: (email: string) => Promise<AddPlatformAdminResult>;
};

type Feedback = { tone: "ok" | "error"; text: string } | null;

const PALETTE = {
  blue: "#1976D2",
  border: "#e2e8f0",
  text: "#1e293b",
  muted: "#64748b",
  green050: "#dcfce7",
  green700: "#166534",
  red050: "#fee2e2",
  red700: "#991b1b",
} as const;

export function AddAdminModal({ labels, addPlatformAdminAction }: AddAdminModalProps): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

  // Focus the email field when the modal opens. Depends on [open] ONLY — never
  // on an unstable callback — so a keystroke can't steal focus (see the
  // app-wide modal focus-loss fix).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes. The handler uses only stable state setters, so the effect
  // depends on [open] alone and needs no dependency-lint suppression.
  const close = () => {
    setOpen(false);
    setEmail("");
    setFeedback(null);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setEmail("");
        setFeedback(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function resolveFeedback(result: AddPlatformAdminResult): Feedback {
    if (result.ok) {
      switch (result.outcome) {
        case "added":
          return { tone: "ok", text: labels.successAdded.replace("{email}", result.email) };
        case "revived":
          return { tone: "ok", text: labels.successRevived.replace("{email}", result.email) };
        case "already_admin":
          return { tone: "ok", text: labels.successAlready.replace("{email}", result.email) };
        case "self":
          return { tone: "ok", text: labels.successSelf };
        default:
          return { tone: "ok", text: labels.successAdded.replace("{email}", result.email) };
      }
    }
    switch (result.error) {
      case "not_found":
        return { tone: "error", text: labels.errorNotFound };
      case "invalid_email":
        return { tone: "error", text: labels.errorInvalidEmail };
      case "forbidden":
        return { tone: "error", text: labels.errorForbidden };
      default:
        return { tone: "error", text: labels.errorUnknown };
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      let result: AddPlatformAdminResult;
      try {
        result = await addPlatformAdminAction(email.trim());
      } catch {
        setFeedback({ tone: "error", text: labels.errorUnknown });
        return;
      }
      const fb = resolveFeedback(result);
      setFeedback(fb);
      if (fb?.tone === "ok") {
        setEmail("");
        // Refresh the console so the new admin shows in the audit trail.
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        data-testid="platform-add-admin"
        onClick={() => setOpen(true)}
        style={primaryBtn}
      >
        + {labels.trigger}
      </button>

      {open ? (
        <div
          data-testid="platform-add-admin-overlay"
          role="presentation"
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 120,
            zIndex: 400,
          }}
        >
          <div
            data-testid="platform-add-admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              width: 440,
              maxWidth: "calc(100vw - 32px)",
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
              border: `1px solid ${PALETTE.border}`,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 18px 4px" }}>
              <div id={titleId} style={{ fontSize: 15, fontWeight: 700, color: PALETTE.text }}>
                {labels.title}
              </div>
              <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 2 }}>{labels.subtitle}</div>
            </div>

            {/* noValidate: the server action is the single source of truth for
                email validity — the client never gates authorization/validation. */}
            <form onSubmit={submit} noValidate style={{ padding: "10px 18px 18px" }}>
              <label
                htmlFor={`${titleId}-email`}
                style={{ fontSize: 12, fontWeight: 500, color: "#374151", display: "block", marginBottom: 5 }}
              >
                {labels.emailLabel}
              </label>
              <input
                id={`${titleId}-email`}
                ref={inputRef}
                data-testid="platform-add-admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={labels.emailPlaceholder}
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "var(--font-mono, monospace)",
                  background: "#f8fafc",
                  color: PALETTE.text,
                }}
              />

              {feedback ? (
                <div
                  data-testid={feedback.tone === "ok" ? "platform-add-admin-success" : "platform-add-admin-error"}
                  role={feedback.tone === "error" ? "alert" : "status"}
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    background: feedback.tone === "ok" ? PALETTE.green050 : PALETTE.red050,
                    color: feedback.tone === "ok" ? PALETTE.green700 : PALETTE.red700,
                  }}
                >
                  {feedback.text}
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  data-testid="platform-add-admin-cancel"
                  onClick={close}
                  style={secondaryBtn}
                  disabled={isPending}
                >
                  {labels.cancel}
                </button>
                <button
                  type="submit"
                  data-testid="platform-add-admin-submit"
                  style={{ ...primaryBtn, opacity: isPending ? 0.7 : 1 }}
                  disabled={isPending}
                >
                  {isPending ? labels.submitting : labels.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid transparent",
  fontFamily: "inherit",
  background: PALETTE.blue,
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  border: `1px solid ${PALETTE.border}`,
  fontFamily: "inherit",
  background: "#fff",
  color: PALETTE.text,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
};

export default AddAdminModal;
