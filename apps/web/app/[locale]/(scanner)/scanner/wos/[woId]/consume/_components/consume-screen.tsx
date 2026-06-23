"use client";

// ============================================================
// SCN-080 — Consume material
// Parity: prototypes/scanner/flow-consume.jsx:215-422 (ConsumeScanScreen, LP +
// qty steps) + 425-443 (ConsumeDoneScreen). Flow: material-select → LP pick
// (FEFO candidates from GET …/lps?materialId=…, top = suggested; "manual / no
// LP" fallback so the flow never dead-ends) → qty (in the MATERIAL's uom,
// shown, never free-text units) → POST (lpId included when an LP was chosen)
// → done with a "consume next" loop + the LP's remaining qty when one was used.
//
// Five states: loading, empty (no materials), error, permission-denied
// (401 → login redirect), optimistic (submit button disabled + "Saving…" while
// the POST is in flight; clientOpId is held until success so a retry replays
// the same attempt).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  BottomActions,
  Content,
  ScannerScreen,
  StepsBar,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../../components/shell/scanner-primitives";
import { QtyKeypadSheet } from "../../../../../_components/scanner-modals";
import { useScannerSession } from "../../../../../_components/scanner-session";
import type { ScannerLabels } from "../../../../../_components/scanner-labels";
import type { ScannerProdLabels } from "../../../../../_components/scanner-prod-labels";
import { useWoFetch } from "../../../_components/use-wo-fetch";
import type {
  ConsumePayload,
  LpCandidate,
  MutationResult,
  WoDetailResponse,
  WoLpsResponse,
  WoMaterial,
} from "../../../_components/wo-types";

type Phase = "loading" | "pick" | "lp" | "qty" | "done" | "error" | "empty";
type LpState = "loading" | "ready" | "error";
type OverconsumeApproval = {
  requiredQty: number;
  consumedQty: number;
  attemptedQty: number;
  thresholdPct: number;
  overPct: number;
};
// Warn tier of the two-tier over-consumption gate: the consume SUCCEEDED but
// landed above overconsume_warn_pct (and ≤ the approval threshold) — the 200
// response carries this payload and the done screen shows an amber banner.
type OverconsumeWarning = {
  overconsumed: boolean;
  overPct: number;
  warnPct: number;
};

export function ConsumeScreen({
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
  const { session, ready } = useScannerSession();
  const { woFetch, woPost } = useWoFetch();
  const L = labels.consume;

  const [phase, setPhase] = useState<Phase>("loading");
  const [materials, setMaterials] = useState<WoMaterial[]>([]);
  const [selected, setSelected] = useState<WoMaterial | null>(null);
  // FEFO LP candidates for the selected material (top = suggested).
  const [lps, setLps] = useState<LpCandidate[]>([]);
  const [lpState, setLpState] = useState<LpState>("loading");
  const [selectedLp, setSelectedLp] = useState<LpCandidate | null>(null);
  const [qty, setQty] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [approval, setApproval] = useState<OverconsumeApproval | null>(null);
  const [doneWarning, setDoneWarning] = useState<OverconsumeWarning | null>(null);
  const [approverEmail, setApproverEmail] = useState("");
  const [approverPin, setApproverPin] = useState("");
  // clientOpId is created fresh per ATTEMPT and held until success so a retry
  // of the SAME attempt reuses it (idempotent replay).
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const load = useCallback(async () => {
    if (!ready) return;
    setPhase("loading");
    const res = await woFetch(`/api/production/scanner/wos/${woId}`);
    if (!res) return;
    if (!res.ok) {
      setPhase("error");
      return;
    }
    const data = (await res.json()) as WoDetailResponse;
    if (!data.ok) {
      setPhase("error");
      return;
    }
    const sorted = [...(data.materials ?? [])].sort((a, b) => a.sequence - b.sequence);
    setMaterials(sorted);
    setPhase(sorted.length === 0 ? "empty" : "pick");
  }, [ready, woFetch, woId]);

  // Auto-load the WO detail ONCE per mount (after the session hydrates). A ref
  // guard prevents the GET from re-firing — and clobbering an in-progress
  // selection — when `load`'s identity changes as the session token settles.
  const didLoad = useRef(false);
  useEffect(() => {
    if (!ready || didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [ready, load]);

  // FEFO LP candidates for a material — the route orders by expiry asc.
  const loadLps = useCallback(
    async (m: WoMaterial) => {
      setLpState("loading");
      setLps([]);
      const res = await woFetch(
        `/api/production/scanner/wos/${woId}/lps?materialId=${encodeURIComponent(m.id)}`,
      );
      if (!res) return; // 401 → redirect
      if (!res.ok) {
        setLpState("error");
        return;
      }
      const data = (await res.json()) as WoLpsResponse;
      if (!data.ok) {
        setLpState("error");
        return;
      }
      setLps(data.lps ?? []);
      setLpState("ready");
    },
    [woFetch, woId],
  );

  const pick = (m: WoMaterial) => {
    setSelected(m);
    const remaining = remainingQty(m);
    setQty(remaining > 0 ? String(remaining) : "");
    setSelectedLp(null);
    setReasonCode("");
    setSubmitErr(null);
    setApproval(null);
    setDoneWarning(null);
    setApproverEmail("");
    setApproverPin("");
    setClientOpId(null);
    setPhase("lp");
    void loadLps(m);
  };

  // LP chosen (or null = manual / no LP) → qty step. The manual fallback keeps
  // the flow alive when no LP candidates exist or the LP fetch failed.
  const chooseLp = (lp: LpCandidate | null) => {
    setSelectedLp(lp);
    setReasonCode("");
    setSubmitErr(null);
    setApproval(null);
    setClientOpId(null);
    setPhase("qty");
  };

  const confirm = async (approver?: { email: string; pin: string }) => {
    if (!selected || !qty || Number(qty) <= 0 || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    // reuse the attempt's clientOpId on retry; create one on first attempt.
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);
    const payload: ConsumePayload = {
      clientOpId: opId,
      materialId: selected.id,
      qty: String(qty),
    };
    if (selectedLp) payload.lpId = selectedLp.lpId;
    if (!selectedLp) payload.reasonCode = reasonCode.trim();
    if (approver) payload.approver = approver;
    try {
      const res = await woPost(`/api/production/scanner/wos/${woId}/consume`, payload);
      if (!res) return; // 401 → redirect
      if (res.status === 422) {
        const data = await res.json().catch(() => null);
        setSubmitErr(data?.error === "reason_required" ? L.reasonRequired : L.err422);
        return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        if (data?.error === "overconsume_approval_required") {
          setApproval({
            requiredQty: Number(data.requiredQty ?? 0),
            consumedQty: Number(data.consumedQty ?? 0),
            attemptedQty: Number(data.attemptedQty ?? 0),
            thresholdPct: Number(data.thresholdPct ?? 0),
            overPct: Number(data.overPct ?? 0),
          });
          setSubmitErr(null);
          return;
        }
        setSubmitErr(mapConsumeConflict(data?.error, L));
        return;
      }
      const data = (await res.json()) as MutationResult & { warning?: OverconsumeWarning };
      if (!res.ok || !data.ok) {
        setSubmitErr(L.errGeneric);
        return;
      }
      // success — release the attempt's clientOpId. A warn-tier success carries
      // a warning payload (over warn threshold, ≤ approval threshold) → amber.
      setDoneWarning(data.warning?.overconsumed ? data.warning : null);
      setClientOpId(null);
      setApproval(null);
      setApproverEmail("");
      setApproverPin("");
      setPhase("done");
    } catch {
      setSubmitErr(L.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const consumeNext = () => {
    setSelected(null);
    setSelectedLp(null);
    setLps([]);
    setQty("");
    setReasonCode("");
    setSubmitErr(null);
    setApproval(null);
    setDoneWarning(null);
    setApproverEmail("");
    setApproverPin("");
    setClientOpId(null);
    setPhase("pick");
    void load();
  };

  const title = phase === "done" ? L.doneTitle : L.title;
  const onBack =
    phase === "qty"
      ? () => setPhase("lp")
      : phase === "lp"
        ? () => setPhase("pick")
        : () => router.push(`/${locale}/scanner/wos/${woId}`);

  return (
    <ScannerScreen>
      <Topbar title={title} onBack={onBack} labels={shellLabels.topbar} />

      {phase === "done" ? (
        <>
          <Content>
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div aria-hidden="true" style={{ fontSize: 56, color: T.green }}>
                ✅
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.txt, marginTop: 8 }}>
                {L.doneTitle}
              </div>
              <div style={{ fontSize: 13, color: T.mute, marginTop: 4 }}>
                {selected ? `${selected.materialName} · ${qty} ${selected.uom}` : L.doneBody}
              </div>
              {selectedLp && (
                <div style={{ fontSize: 12, color: T.hint, marginTop: 6 }}>
                  {L.doneLpRemaining
                    .replace("{qty}", lpRemainingText(selectedLp, qty))
                    .replace("{uom}", selectedLp.uom)
                    .replace("{lp}", selectedLp.lpNumber)}
                </div>
              )}
            </div>
            {doneWarning && (
              <Banner kind="warn" title={L.warnOver.replace("{pct}", doneWarning.overPct.toFixed(2))}>
                {" "}
              </Banner>
            )}
            <Banner kind="success" title={L.bomUpdated}>
              {L.bomUpdatedBody}
            </Banner>
          </Content>
          <BottomActions>
            <Btn variant="p" onClick={consumeNext}>
              {L.consumeNext}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/wos/${woId}`)}>
              {L.backToWo}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <>
          <Content>
            {phase === "loading" && (
              <div style={{ padding: 24, textAlign: "center", color: T.mute }}>{labels.loading}</div>
            )}

            {phase === "error" && (
              <>
                <Banner kind="err" title={L.errGeneric}>
                  {" "}
                </Banner>
                <div style={{ padding: "0 16px" }}>
                  <Btn variant="sec" onClick={() => void load()}>
                    {labels.list.retry}
                  </Btn>
                </div>
              </>
            )}

            {phase === "empty" && (
              <div style={{ padding: "40px 24px", textAlign: "center", color: T.mute }}>{L.pickEmpty}</div>
            )}

            {phase === "pick" && (
              <>
                <div style={sectionTitleStyle}>{L.pickTitle}</div>
                {materials.map((m) => {
                  const remaining = remainingQty(m);
                  const done = remaining <= 0;
                  return (
                    <button key={m.id} type="button" onClick={() => pick(m)} style={materialBtnStyle(done)}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontWeight: 600, color: T.txt }}>{m.materialName}</div>
                        <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                          {done
                            ? `${m.consumedQty} / ${m.requiredQty} ${m.uom}`
                            : `${remaining} ${m.uom} ${L.needed}`}
                        </div>
                      </div>
                      <span aria-hidden="true" style={{ color: done ? T.green : T.hint }}>
                        {done ? "✓" : "›"}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {phase === "lp" && selected && (
              <>
                <StepsBar steps={[L.pickTitle, L.lpTitle, L.qtyLabel]} current={1} />
                <div style={{ padding: "0 16px", marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: T.hint }}>{L.lpTitle}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, marginTop: 2 }}>
                    {selected.materialName}
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {lpState === "loading" && (
                    <div style={{ padding: "16px 24px", textAlign: "center", color: T.mute }}>
                      {L.lpLoading}
                    </div>
                  )}
                  {lpState === "error" && (
                    <Banner kind="err" title={L.lpError}>
                      {" "}
                    </Banner>
                  )}
                  {lpState === "ready" && lps.length === 0 && (
                    <div style={{ padding: "16px 24px", textAlign: "center", color: T.mute }}>
                      {L.lpEmpty}
                    </div>
                  )}
                  {lpState === "ready" &&
                    lps.map((lp, i) => (
                      <button
                        key={lp.lpId}
                        type="button"
                        onClick={() => chooseLp(lp)}
                        style={lpBtnStyle(i === 0)}
                      >
                        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <div style={lpNumStyle}>{lp.lpNumber}</div>
                          <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                            {lp.qty} {lp.uom}
                            {lp.expiry ? ` · ${L.lpExpiry} ${lp.expiry}` : ""}
                          </div>
                        </div>
                        {i === 0 && <span style={suggestedChipStyle}>{L.lpSuggested}</span>}
                        <span aria-hidden="true" style={{ color: T.hint, marginLeft: 6 }}>
                          ›
                        </span>
                      </button>
                    ))}
                  {/* manual / no-LP fallback — the flow never dead-ends here */}
                  <button type="button" onClick={() => chooseLp(null)} style={manualBtnStyle}>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontWeight: 600, color: T.txt }}>{L.lpManual}</div>
                      <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{L.lpManualDesc}</div>
                    </div>
                    <span aria-hidden="true" style={{ color: T.hint }}>
                      ›
                    </span>
                  </button>
                </div>
              </>
            )}

            {phase === "qty" && selected && (
              <>
                <StepsBar steps={[L.pickTitle, L.lpTitle, L.qtyLabel]} current={2} />
                <div style={{ padding: "0 16px", marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: T.hint }}>{L.qtyLabel}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, marginTop: 2 }}>
                    {selected.materialName}
                  </div>
                  {selectedLp && (
                    <div style={{ fontSize: 12, color: T.hint, marginTop: 2 }}>
                      {selectedLp.lpNumber} · {selectedLp.qty} {selectedLp.uom}
                      {selectedLp.expiry ? ` · ${L.lpExpiry} ${selectedLp.expiry}` : ""}
                    </div>
                  )}
                  {!selectedLp && (
                    <div style={{ fontSize: 12, color: T.hint, marginTop: 2 }}>
                      {L.lpManual}
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 16px" }}>
                  <div style={fieldLabelStyle}>
                    {L.qtyLabel} <span style={{ color: T.red }}>*</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowKeypad(true)}
                    aria-label={L.enterQty}
                    style={qtyFieldStyle}
                  >
                    <span>{qty || "0"}</span>
                    <span style={{ fontSize: 14, color: T.mute, fontWeight: 400 }}>{selected.uom}</span>
                  </button>
                  <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>
                    {L.qtyHint} · {remainingQty(selected)} {selected.uom} {L.needed}
                  </div>
                </div>
                {!selectedLp && (
                  <div style={{ padding: "0 16px 12px" }}>
                    <label htmlFor="consume-reason-code" style={fieldLabelStyle}>
                      {L.reasonLabel} <span style={{ color: T.red }}>*</span>
                    </label>
                    <input
                      id="consume-reason-code"
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                      placeholder={L.reasonPlaceholder}
                      style={textFieldStyle}
                    />
                  </div>
                )}
                {submitErr && (
                  <Banner kind="err" title={submitErr}>
                    {" "}
                  </Banner>
                )}
                {approval && (
                  <div style={approvalSheetStyle}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.txt }}>
                      {L.approvalTitle}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: T.mute }}>
                      {L.approvalBody}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: T.amber }}>
                      {L.approvalOver.replace("{pct}", approval.overPct.toFixed(2))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <input
                        aria-label={L.approvalEmail}
                        value={approverEmail}
                        onChange={(e) => setApproverEmail(e.target.value)}
                        placeholder={L.approvalEmail}
                        style={textFieldStyle}
                        autoComplete="username"
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <input
                        aria-label={L.approvalPin}
                        value={approverPin}
                        onChange={(e) => setApproverPin(e.target.value)}
                        placeholder={L.approvalPin}
                        style={textFieldStyle}
                        type="password"
                        inputMode="numeric"
                        autoComplete="current-password"
                      />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <Btn
                        variant="p"
                        disabled={!approverEmail.trim() || !approverPin.trim() || submitting}
                        onClick={() =>
                          void confirm({
                            email: approverEmail.trim(),
                            pin: approverPin.trim(),
                          })
                        }
                      >
                        {submitting ? L.submitting : L.approvalSubmit}
                      </Btn>
                    </div>
                  </div>
                )}
              </>
            )}
          </Content>

          {phase === "qty" && selected && (
            <BottomActions>
              <Btn
                variant="p"
                disabled={!qty || Number(qty) <= 0 || submitting || (!selectedLp && !reasonCode.trim())}
                // confirm takes an optional approver arg — NEVER pass it the
                // click event (circular JSON → the POST silently dies).
                onClick={() => void confirm()}
              >
                {submitting ? L.submitting : L.confirm}
              </Btn>
            </BottomActions>
          )}
        </>
      )}

      <QtyKeypadSheet
        open={showKeypad}
        onClose={() => setShowKeypad(false)}
        initial={qty}
        uom={selected?.uom ?? labels.output.unitBase}
        onConfirm={(v) => setQty(v)}
        labels={shellLabels.qtyKeypad}
      />
    </ScannerScreen>
  );
}

// Decimal STRINGS on the wire; parse only for display/keypad math.
function remainingQty(m: WoMaterial): number {
  const required = parseFloat(m.requiredQty);
  const consumed = parseFloat(m.consumedQty);
  if (!Number.isFinite(required) || !Number.isFinite(consumed)) return 0;
  return Math.max(0, required - consumed);
}

// LP remaining after this consumption — display-only math on the wire strings.
function lpRemainingText(lp: LpCandidate, qty: string): string {
  const available = parseFloat(lp.qty);
  const consumed = parseFloat(qty);
  if (!Number.isFinite(available) || !Number.isFinite(consumed)) return lp.qty;
  const remaining = Math.max(0, available - consumed);
  // trim trailing zeros while keeping up to 3 decimals (qty precision on the wire)
  return String(Number(remaining.toFixed(3)));
}

function mapConsumeConflict(error: unknown, labels: ScannerProdLabels["consume"]): string {
  switch (error) {
    case "lp_not_released":
      return labels.lpNotReleased;
    case "lp_unavailable":
      return labels.lpUnavailable;
    case "lp_expired":
      return labels.lpExpired;
    case "lp_locked":
      return labels.lpLocked;
    case "quality_hold_active":
      return labels.lpOnHold;
    case "reason_required":
      return labels.reasonRequired;
    default:
      return labels.err409;
  }
}

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

function lpBtnStyle(suggested: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "calc(100% - 32px)",
    margin: "0 16px 8px",
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${suggested ? T.blue : T.elev}`,
    background: T.surf,
    cursor: "pointer",
  } as const;
}

const lpNumStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 700,
  color: T.txt,
} as const;

const suggestedChipStyle = {
  padding: "3px 8px",
  borderRadius: 999,
  background: "#0e2333",
  color: T.blue2,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
} as const;

const manualBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "calc(100% - 32px)",
  margin: "4px 16px 8px",
  padding: 14,
  borderRadius: 12,
  border: `1px dashed ${T.elev}`,
  background: "transparent",
  cursor: "pointer",
} as const;

function materialBtnStyle(done: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "calc(100% - 32px)",
    margin: "0 16px 8px",
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${done ? T.green : T.elev}`,
    background: T.surf,
    cursor: "pointer",
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

const qtyFieldStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  height: 56,
  borderRadius: 12,
  border: `2px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 14px",
  fontSize: 22,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const approvalSheetStyle = {
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
