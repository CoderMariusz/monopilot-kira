"use client";

// ============================================================
// SCN reverse-consume — undo a recorded material consumption.
//
// Parity: prototypes/design/Monopilot Design System/scanner/flow-consume.jsx
//   :122-212 (WoExecuteScreen hub + row/tile grammar) and :215-443
//   (ConsumeScanScreen step flow + ConsumeDoneScreen). This screen reuses the
//   exact consume-screen.tsx component vocabulary (Topbar / Content / Banner /
//   row-buttons / BottomActions / done screen) adapted for the reverse op:
//   pick a reversible consumption → reason + note + operator PIN → (supervisor
//   email + PIN only when the org flag requires it) → POST → done.
//
// Auth mirror of consume-screen.tsx: the operator PIN is always captured; the
// supervisor section is revealed reactively when the POST replies
// `invalid_supervisor` (the org flag scanner_reverse_require_supervisor_pin is
// on) — same pattern as the consume overconsume-approval reveal. The flag is
// NEVER trusted client-side; the route reads it server-side and gates.
//
// Five states: loading, empty (no reversible consumptions), error (retry),
// permission-denied (403 forbidden banner; a true session-401 →
// missing_token/invalid_session → login redirect), optimistic (submit disabled
// + "Saving…"; clientOpId held until success so a retry replays the attempt).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  BottomActions,
  Content,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../../../_components/scanner-session";
import type { ScannerLabels } from "../../../../../_components/scanner-labels";
import type { ScannerProdLabels } from "../../../../../_components/scanner-prod-labels";
import type {
  ReverseConsumePayload,
  ReverseConsumeResult,
  ReverseReasonCode,
  ReversibleConsumption,
  WoConsumptionsResponse,
} from "../../../_components/wo-types";

type Phase = "loading" | "pick" | "form" | "done" | "error" | "empty";

// A true scanner-session failure (token gone / session expired) — only these
// must boot the operator to the login screen. Every other 401/403 is a business
// outcome rendered inline (the consume screen makes the same distinction for
// its 409 overconsume reveal — here the auth tiers are 401/403).
const SESSION_FAIL_CODES = new Set(["missing_token", "invalid_session"]);

export function ReverseConsumeScreen({
  locale,
  woId,
  shellLabels,
  labels,
}: {
  locale: string;
  woId: string;
  shellLabels: ScannerLabels;
  labels: ScannerProdLabels;
}) {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const routeLocale = (params?.locale as string) || locale;
  const { session, ready, clearSession } = useScannerSession();
  const L = labels.reverse;

  const [phase, setPhase] = useState<Phase>("loading");
  const [consumptions, setConsumptions] = useState<ReversibleConsumption[]>([]);
  const [selected, setSelected] = useState<ReversibleConsumption | null>(null);
  const [reasonCode, setReasonCode] = useState<ReverseReasonCode>("wrong_quantity");
  const [note, setNote] = useState("");
  const [operatorPin, setOperatorPin] = useState("");
  const [supervisorRequired, setSupervisorRequired] = useState(false);
  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [lpStatusAfter, setLpStatusAfter] = useState<string | null>(null);
  // clientOpId is created fresh per ATTEMPT and held until success so a retry of
  // the SAME attempt reuses it (idempotent replay against scanner_audit_log).
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  const handleSessionFail = useCallback(() => {
    clearSession();
    router.replace(`/${routeLocale}/scanner/login`);
  }, [clearSession, routeLocale, router]);

  useEffect(() => {
    if (ready && !session) router.replace(`/${routeLocale}/scanner/login`);
  }, [ready, session, routeLocale, router]);

  // GET reads — only a true session failure redirects; everything else surfaces.
  const reverseGet = useCallback(
    async (path: string): Promise<Response | null> => {
      const token = session?.token;
      if (!token) {
        handleSessionFail();
        return null;
      }
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        const data = await res
          .clone()
          .json()
          .catch(() => null);
        if (!data || SESSION_FAIL_CODES.has(String(data.error))) {
          handleSessionFail();
          return null;
        }
      }
      return res;
    },
    [session?.token, handleSessionFail],
  );

  const reversePost = useCallback(
    async (path: string, payload: unknown): Promise<Response | null> => {
      const token = session?.token;
      if (!token) {
        handleSessionFail();
        return null;
      }
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        const data = await res
          .clone()
          .json()
          .catch(() => null);
        if (!data || SESSION_FAIL_CODES.has(String(data.error))) {
          handleSessionFail();
          return null;
        }
      }
      return res;
    },
    [session?.token, handleSessionFail],
  );

  const load = useCallback(async () => {
    if (!ready) return;
    setPhase("loading");
    const res = await reverseGet(`/api/production/scanner/wos/${woId}/consumptions`);
    if (!res) return; // session redirect handled
    if (!res.ok) {
      setPhase("error");
      return;
    }
    const data = (await res.json()) as WoConsumptionsResponse;
    if (!data.ok) {
      setPhase("error");
      return;
    }
    const rows = data.consumptions ?? [];
    setConsumptions(rows);
    setPhase(rows.length === 0 ? "empty" : "pick");
  }, [ready, reverseGet, woId]);

  const didLoad = useRef(false);
  useEffect(() => {
    if (!ready || didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [ready, load]);

  const pick = (c: ReversibleConsumption) => {
    setSelected(c);
    setReasonCode("wrong_quantity");
    setNote("");
    setOperatorPin("");
    setSupervisorRequired(false);
    setSupervisorEmail("");
    setSupervisorPin("");
    setSubmitErr(null);
    setClientOpId(null);
    setLpStatusAfter(null);
    setPhase("form");
  };

  const confirm = async () => {
    if (!selected || !operatorPin.trim() || submitting) return;
    if (supervisorRequired && (!supervisorEmail.trim() || !supervisorPin.trim())) return;
    setSubmitting(true);
    setSubmitErr(null);
    // reuse the attempt's clientOpId on retry; create one on first attempt.
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);
    const payload: ReverseConsumePayload = {
      clientOpId: opId,
      consumptionId: selected.consumptionId,
      operatorPin: operatorPin.trim(),
      reasonCode,
    };
    if (note.trim()) payload.note = note.trim();
    if (supervisorRequired) {
      payload.supervisorEmail = supervisorEmail.trim();
      payload.supervisorPin = supervisorPin.trim();
    }
    try {
      const res = await reversePost(`/api/production/scanner/wos/${woId}/reverse-consume`, payload);
      if (!res) return; // session redirect handled
      if (res.ok) {
        const data = (await res.json()) as ReverseConsumeResult;
        if (!data.ok) {
          setSubmitErr(mapReverseError(data.error, L));
          return;
        }
        setLpStatusAfter(data.lp_status_after ?? null);
        setClientOpId(null);
        setPhase("done");
        return;
      }
      const data = await res.json().catch(() => null);
      const code = data?.error ? String(data.error) : null;
      // Supervisor-required reveal — same reactive pattern as the consume screen's
      // overconsume-approval reveal: the flag lives server-side, the route tells us.
      if (code === "invalid_supervisor" && !supervisorRequired) {
        setSupervisorRequired(true);
        setSubmitErr(null);
        return;
      }
      setSubmitErr(mapReverseError(code, L));
    } catch {
      setSubmitErr(L.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const reverseNext = () => {
    setSelected(null);
    setReasonCode("wrong_quantity");
    setNote("");
    setOperatorPin("");
    setSupervisorRequired(false);
    setSupervisorEmail("");
    setSupervisorPin("");
    setSubmitErr(null);
    setClientOpId(null);
    setLpStatusAfter(null);
    setPhase("pick");
    void load();
  };

  const title = phase === "done" ? L.doneTitle : L.title;
  const onBack =
    phase === "form"
      ? () => setPhase("pick")
      : () => router.push(`/${routeLocale}/scanner/wos/${woId}`);

  const reasonOptions: Array<{ code: ReverseReasonCode; label: string }> = [
    { code: "entry_error", label: L.reasonEntryError },
    { code: "wrong_quantity", label: L.reasonWrongQuantity },
    { code: "wrong_batch", label: L.reasonWrongBatch },
    { code: "wrong_product", label: L.reasonWrongProduct },
    { code: "other", label: L.reasonOther },
  ];

  return (
    <ScannerScreen>
      <Topbar title={title} onBack={onBack} labels={shellLabels.topbar} />

      {phase === "done" ? (
        <>
          <Content>
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div aria-hidden="true" style={{ fontSize: 56, color: T.green }}>
                ↩
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.txt, marginTop: 8 }}>
                {L.doneTitle}
              </div>
              <div style={{ fontSize: 13, color: T.mute, marginTop: 4 }}>
                {selected ? `${selected.materialName} · ${selected.qty} ${selected.uom}` : L.doneBody}
              </div>
              {lpStatusAfter && (
                <div style={{ fontSize: 12, color: T.hint, marginTop: 6 }}>
                  {L.lpRestored.replace("{status}", lpStatusAfter)}
                </div>
              )}
            </div>
            <Banner kind="success" title={L.doneTitle}>
              {L.doneBody}
            </Banner>
          </Content>
          <BottomActions>
            <Btn variant="p" onClick={reverseNext}>
              {L.reverseNext}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${routeLocale}/scanner/wos/${woId}`)}>
              {L.backToWo}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <>
          <Content>
            {phase === "loading" && (
              <div style={{ padding: 24, textAlign: "center", color: T.mute }}>{L.loading}</div>
            )}

            {phase === "error" && (
              <>
                <Banner kind="err" title={L.error}>
                  {" "}
                </Banner>
                <div style={{ padding: "0 16px" }}>
                  <Btn variant="sec" onClick={() => void load()}>
                    {L.retry}
                  </Btn>
                </div>
              </>
            )}

            {phase === "empty" && (
              <div style={{ padding: "40px 24px", textAlign: "center", color: T.mute }}>{L.empty}</div>
            )}

            {phase === "pick" && (
              <>
                <div style={sectionTitleStyle}>{L.listTitle}</div>
                {consumptions.map((c) => (
                  <button
                    key={c.consumptionId}
                    type="button"
                    onClick={() => pick(c)}
                    style={rowBtnStyle}
                  >
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontWeight: 600, color: T.txt }}>{c.materialName}</div>
                      <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                        {c.qty} {c.uom} · {c.lpNumber ?? L.manualLp}
                      </div>
                      {c.consumedAt && (
                        <div style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>
                          {L.consumedAt} {formatTime(c.consumedAt, routeLocale)}
                        </div>
                      )}
                    </div>
                    <span aria-hidden="true" style={{ color: T.hint }}>
                      ›
                    </span>
                  </button>
                ))}
              </>
            )}

            {phase === "form" && selected && (
              <>
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ fontSize: 12, color: T.hint }}>{L.title}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, marginTop: 2 }}>
                    {selected.materialName}
                  </div>
                  <div style={{ fontSize: 12, color: T.hint, marginTop: 2 }}>
                    {selected.qty} {selected.uom} · {selected.lpNumber ?? L.manualLp}
                  </div>
                </div>

                <div style={{ padding: "12px 16px 0" }}>
                  <div style={fieldLabelStyle}>{L.reasonLabel}</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {reasonOptions.map((opt) => {
                      const active = reasonCode === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => setReasonCode(opt.code)}
                          aria-pressed={active}
                          style={reasonBtnStyle(active)}
                        >
                          <span>{opt.label}</span>
                          {active && (
                            <span aria-hidden="true" style={{ color: T.blue2 }}>
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ padding: "12px 16px 0" }}>
                  <label htmlFor="reverse-note" style={fieldLabelStyle}>
                    {L.noteLabel}
                  </label>
                  <input
                    id="reverse-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={L.notePlaceholder}
                    style={textFieldStyle}
                  />
                </div>

                <div style={{ padding: "12px 16px 0" }}>
                  <label htmlFor="reverse-operator-pin" style={fieldLabelStyle}>
                    {L.operatorPinLabel} <span style={{ color: T.red }}>*</span>
                  </label>
                  <input
                    id="reverse-operator-pin"
                    value={operatorPin}
                    onChange={(e) => setOperatorPin(e.target.value)}
                    placeholder={L.operatorPinPlaceholder}
                    style={textFieldStyle}
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                  />
                </div>

                {supervisorRequired && (
                  <div style={supervisorSheetStyle}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.txt }}>{L.supervisorTitle}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: T.mute }}>{L.supervisorBody}</div>
                    <div style={{ marginTop: 10 }}>
                      <input
                        aria-label={L.supervisorEmail}
                        value={supervisorEmail}
                        onChange={(e) => setSupervisorEmail(e.target.value)}
                        placeholder={L.supervisorEmail}
                        style={textFieldStyle}
                        autoComplete="username"
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <input
                        aria-label={L.supervisorPin}
                        value={supervisorPin}
                        onChange={(e) => setSupervisorPin(e.target.value)}
                        placeholder={L.supervisorPin}
                        style={textFieldStyle}
                        type="password"
                        inputMode="numeric"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                )}

                {submitErr && (
                  <Banner kind="err" title={submitErr}>
                    {" "}
                  </Banner>
                )}
              </>
            )}
          </Content>

          {phase === "form" && selected && (
            <BottomActions>
              <Btn
                variant="p"
                disabled={
                  !operatorPin.trim() ||
                  submitting ||
                  (supervisorRequired && (!supervisorEmail.trim() || !supervisorPin.trim()))
                }
                // confirm takes no args — NEVER pass it the click event.
                onClick={() => void confirm()}
              >
                {submitting ? L.submitting : L.confirm}
              </Btn>
            </BottomActions>
          )}
        </>
      )}
    </ScannerScreen>
  );
}

function mapReverseError(error: unknown, L: ScannerProdLabels["reverse"]): string {
  switch (error) {
    case "invalid_pin":
      return L.errInvalidPin;
    case "pin_locked":
      return L.errPinLocked;
    case "invalid_supervisor":
      return L.errInvalidSupervisor;
    case "supervisor_forbidden":
      return L.errSupervisorForbidden;
    case "pin_not_enrolled":
      return L.errPinNotEnrolled;
    case "forbidden":
      return L.errForbidden;
    case "not_found":
      return L.errNotFound;
    case "already_corrected":
      return L.errAlreadyCorrected;
    case "lp_not_restorable":
      return L.errLpNotRestorable;
    case "closed_wo_correction_forbidden":
      return L.errClosedWo;
    case "inconsistent_ledger":
      return L.errInconsistent;
    default:
      return L.errGeneric;
  }
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const rowBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "calc(100% - 32px)",
  margin: "0 16px 8px",
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  cursor: "pointer",
} as const;

function reasonBtnStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${active ? T.blue : T.elev}`,
    background: active ? "#0e2333" : T.surf,
    color: T.txt,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  } as const;
}

const fieldLabelStyle = {
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const supervisorSheetStyle = {
  margin: "12px 16px 0",
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${T.amber}`,
  background: "#241d08",
} as const;

const textFieldStyle = {
  width: "100%",
  height: 46,
  borderRadius: 10,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
} as const;
