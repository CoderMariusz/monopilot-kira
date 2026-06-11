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
  const [showKeypad, setShowKeypad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
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
    setSubmitErr(null);
    setClientOpId(null);
    setPhase("lp");
    void loadLps(m);
  };

  // LP chosen (or null = manual / no LP) → qty step. The manual fallback keeps
  // the flow alive when no LP candidates exist or the LP fetch failed.
  const chooseLp = (lp: LpCandidate | null) => {
    setSelectedLp(lp);
    setSubmitErr(null);
    setClientOpId(null);
    setPhase("qty");
  };

  const confirm = async () => {
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
    try {
      const res = await woPost(`/api/production/scanner/wos/${woId}/consume`, payload);
      if (!res) return; // 401 → redirect
      if (res.status === 422) {
        setSubmitErr(L.err422);
        return;
      }
      if (res.status === 409) {
        setSubmitErr(L.err409);
        return;
      }
      const data = (await res.json()) as MutationResult;
      if (!res.ok || !data.ok) {
        setSubmitErr(L.errGeneric);
        return;
      }
      // success — release the attempt's clientOpId.
      setClientOpId(null);
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
    setSubmitErr(null);
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
      <Topbar title={title} onBack={onBack} syncState="online" labels={shellLabels.topbar} />

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
                {submitErr && (
                  <Banner kind="err" title={submitErr}>
                    {" "}
                  </Banner>
                )}
              </>
            )}
          </Content>

          {phase === "qty" && selected && (
            <BottomActions>
              <Btn
                variant="p"
                disabled={!qty || Number(qty) <= 0 || submitting}
                onClick={confirm}
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
        max={selected ? remainingQty(selected) : undefined}
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
