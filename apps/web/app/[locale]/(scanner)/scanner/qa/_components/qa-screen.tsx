"use client";

// ============================================================
// SCN-QC — Scanner QC inspection
// Parity: prototypes/design/Monopilot Design System/quality/inspection-screens.jsx
//   (QaInspectionDetail decision intent — PASS/FAIL/HOLD e-decision) rendered in the
//   scanner visual language (reference scanner/receive-po + consume screens), NOT the
//   desktop layout.
//
// Flow: scan LP code → GET /api/warehouse/scanner/lp?code=… (200 { lp } / 404
// lp_not_found) → big PASS / FAIL / HOLD buttons + optional note → POST
// /api/quality/scanner/inspect { clientOpId, lpId, decision, note? } →
// { ok, inspectionId, qaStatus } → success banner showing the new qaStatus +
// "Scan next".
//
// Five states: loading (LP lookup in flight), empty/not-found (404 lp_not_found),
// error (non-401 failure → banner + retry), permission-denied (401 → login
// redirect), optimistic (decision button row disabled + "Recording…" while the POST
// is in flight; clientOpId is held per attempt so a retry replays the same op).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  BottomActions,
  Content,
  ScanInputArea,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";

type Phase = "scan" | "loadingLp" | "lp" | "notFound" | "error" | "submitting" | "done";

type Lp = {
  id: string;
  lpNumber: string;
  productCode?: string;
  productName?: string;
  quantity?: string | number;
  uom?: string;
  qaStatus?: string;
  expiryDate?: string | null;
  locationCode?: string | null;
};

type LpResponse = { lp?: Lp; error?: string };
type InspectResponse = { ok?: boolean; inspectionId?: string; qaStatus?: string; error?: string };

type Decision = "pass" | "fail" | "hold";

export function QaScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const L = labels.qaScreen;

  const [phase, setPhase] = useState<Phase>("scan");
  const [code, setCode] = useState("");
  const [lp, setLp] = useState<Lp | null>(null);
  const [newQaStatus, setNewQaStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  // clientOpId per ATTEMPT, held until success so a retry replays the same op.
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  // Unauthenticated → login.
  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const lookup = useCallback(
    async (raw: string) => {
      const c = raw.trim();
      if (!c) return;
      setPhase("loadingLp");
      setLp(null);
      setSubmitErr(null);
      const res = await scannerFetch(
        `/api/warehouse/scanner/lp?code=${encodeURIComponent(c)}`,
        undefined,
        { method: "GET" },
      );
      if (!res) return; // 401 → redirect handled in scannerFetch
      if (res.status === 404) {
        setPhase("notFound");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as LpResponse;
      if (!data.lp) {
        setPhase("notFound");
        return;
      }
      setLp(data.lp);
      setNote("");
      setClientOpId(null);
      setPhase("lp");
    },
    [scannerFetch],
  );

  const decide = async (decision: Decision) => {
    if (!lp || phase === "submitting") return;
    setPhase("submitting");
    setSubmitErr(null);
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);
    const res = await scannerFetch("/api/quality/scanner/inspect", {
      clientOpId: opId,
      lpId: lp.id,
      decision,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!res) return; // 401 → redirect
    if (!res.ok) {
      setSubmitErr(L.errGeneric);
      setPhase("lp");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as InspectResponse;
    if (!data.ok) {
      setSubmitErr(L.errGeneric);
      setPhase("lp");
      return;
    }
    // success — release the attempt's clientOpId.
    setClientOpId(null);
    setNewQaStatus(data.qaStatus ?? null);
    setPhase("done");
  };

  const scanNext = () => {
    setCode("");
    setLp(null);
    setNote("");
    setNewQaStatus(null);
    setSubmitErr(null);
    setClientOpId(null);
    setPhase("scan");
  };

  const qaStatusText = (s?: string | null) =>
    (s && L.statusValues[s]) || s || L.statusValues.none;

  const onBack =
    phase === "lp" || phase === "notFound" || phase === "error"
      ? scanNext
      : () => router.push(`/${locale}/scanner/home`);

  return (
    <ScannerScreen>
      <Topbar
        title={phase === "done" ? L.doneTitle : L.title}
        onBack={onBack}
        labels={labels.topbar}
      />

      {phase === "done" ? (
        <>
          <Content>
            <div data-testid="qa-done" style={{ padding: "32px 24px", textAlign: "center" }}>
              <div aria-hidden="true" style={{ fontSize: 56, color: T.green }}>
                ✅
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.txt, marginTop: 8 }}>
                {L.doneTitle}
              </div>
              <div style={{ fontSize: 13, color: T.mute, marginTop: 4 }}>{L.doneBody}</div>
              {lp && (
                <div style={{ fontSize: 12, color: T.hint, marginTop: 6 }}>{lp.lpNumber}</div>
              )}
            </div>
            <div data-testid="qa-new-status">
              <Banner kind="success" title={L.newQaStatus}>
                {qaStatusText(newQaStatus)}
              </Banner>
            </div>
          </Content>
          <BottomActions>
            <Btn variant="p" onClick={scanNext}>
              {L.scanNext}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/home`)}>
              {L.backToMenu}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <>
          <Content>
            {(phase === "scan" ||
              phase === "loadingLp" ||
              phase === "notFound" ||
              phase === "error") && (
              <>
                <ScanInputArea
                  label={L.scanLabel}
                  placeholder={L.scanPlaceholder}
                  hint={L.scanHint}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    // editing after a failed scan clears the error ring + banner.
                    if (phase === "notFound" || phase === "error") setPhase("scan");
                  }}
                  onSubmit={(v) => void lookup(v)}
                  state={phase === "notFound" || phase === "error" ? "err" : "idle"}
                  labels={labels.scanTools}
                />
                {phase === "loadingLp" && (
                  <div data-testid="qa-loading-lp" style={{ padding: "24px", textAlign: "center", color: T.mute }}>
                    {L.loadingLp}
                  </div>
                )}
                {phase === "scan" && (
                  <div data-testid="qa-prompt" style={{ padding: "24px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.txt }}>{L.promptTitle}</div>
                    <div style={{ fontSize: 12, color: T.mute, marginTop: 6 }}>{L.promptBody}</div>
                  </div>
                )}
                {phase === "notFound" && (
                  <div data-testid="qa-not-found">
                    <Banner kind="warn" title={L.notFoundTitle}>
                      {L.notFoundBody}
                    </Banner>
                    <div style={{ padding: "0 16px" }}>
                      <Btn variant="sec" onClick={scanNext}>
                        {L.retry}
                      </Btn>
                    </div>
                  </div>
                )}
                {phase === "error" && (
                  <div data-testid="qa-error">
                    <Banner kind="err" title={L.errorLoad}>
                      {" "}
                    </Banner>
                    <div style={{ padding: "0 16px" }}>
                      <Btn variant="sec" onClick={() => void lookup(code)}>
                        {L.retry}
                      </Btn>
                    </div>
                  </div>
                )}
              </>
            )}

            {(phase === "lp" || phase === "submitting") && lp && (
              <div data-testid="qa-lp-summary">
                <div style={{ padding: "16px 16px 8px" }}>
                  <div style={lpNumStyle}>{lp.lpNumber}</div>
                </div>
                <div style={{ padding: "0 16px" }}>
                  <Field label={L.product} value={lp.productName ?? lp.productCode ?? "—"} />
                  <Field
                    label={L.quantity}
                    value={
                      lp.quantity != null ? `${lp.quantity}${lp.uom ? ` ${lp.uom}` : ""}` : "—"
                    }
                  />
                  <Field label={L.location} value={lp.locationCode ?? "—"} />
                  <Field label={L.expiry} value={lp.expiryDate ? lp.expiryDate.slice(0, 10) : "—"} />
                  <Field label={L.qaStatus} value={qaStatusText(lp.qaStatus)} />
                </div>

                <div style={{ padding: "12px 16px 4px" }}>
                  <div style={sectionTitleStyle}>{L.decisionPrompt}</div>
                </div>
                <div style={{ padding: "0 16px" }}>
                  <label style={fieldLabelStyle as React.CSSProperties}>{L.noteLabel}</label>
                  <textarea
                    aria-label={L.noteLabel}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={L.notePlaceholder}
                    rows={2}
                    disabled={phase === "submitting"}
                    style={textareaStyle}
                  />
                </div>

                {submitErr && (
                  <div data-testid="qa-submit-error">
                    <Banner kind="err" title={submitErr}>
                      {" "}
                    </Banner>
                  </div>
                )}
              </div>
            )}
          </Content>

          {(phase === "lp" || phase === "submitting") && lp && (
            <BottomActions tall>
              <Btn variant="p" data-testid="qa-decide-pass" disabled={phase === "submitting"} onClick={() => void decide("pass")}>
                {phase === "submitting" ? L.submitting : `✓ ${L.pass}`}
              </Btn>
              <Btn variant="d" data-testid="qa-decide-fail" disabled={phase === "submitting"} onClick={() => void decide("fail")}>
                {`✗ ${L.fail}`}
              </Btn>
              <Btn variant="w" data-testid="qa-decide-hold" disabled={phase === "submitting"} onClick={() => void decide("hold")}>
                {`⏸ ${L.hold}`}
              </Btn>
            </BottomActions>
          )}
        </>
      )}
    </ScannerScreen>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${T.sep}`,
      }}
    >
      <span style={{ fontSize: 12, color: T.hint }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.txt, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const lpNumStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 700,
  fontSize: 18,
  color: T.txt,
} as const;

const sectionTitleStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const fieldLabelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const textareaStyle = {
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  resize: "vertical",
} as const;
