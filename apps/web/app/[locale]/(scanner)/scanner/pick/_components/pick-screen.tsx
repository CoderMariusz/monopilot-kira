"use client";

// ============================================================
// SCN-050 — Pick for WO (Lane K2)
//
// Parity: prototypes/scanner/flow-pick.jsx:5-278
//   PickWoListScreen (5-44)   → step "wos": WO list w/ progress chip + search
//   PickListScreen   (46-98)  → step "materials": BOM list w/ consumed/required
//                               progress + done-state, FEFO suggestion hint
//   PickScanScreen   (100-242)→ step "lp": FEFO LP candidate list (top = suggested,
//                               highlighted like the consume screen) + confirm
//   PickDoneScreen   (244-278)→ step "done": success banner + pick-next loop
//
// DEVIATION from prototype: the prototype's PickScanScreen scanned the
// location (step 0) THEN the LP (step 1) THEN a qty keypad (step 2). The
// lane-C3 contract makes pick a PHYSICAL STAGING MOVE of a whole LP (no
// consumption, no qty) selected from a FEFO candidate list returned by
// GET …/pick/lps — mirroring the consume screen's LP-list UX. A destination
// (staging) location is only collected when the POST returns 422 demanding
// one (kept one-tap otherwise; toLocationId omitted by default). Documented
// here as the source-of-truth contract supersedes the demo-only scan steps.
//
// Five states: loading, empty (no WOs / no materials / no LPs), error,
// permission-denied (401/403 → ../login redirect via scannerFetch), optimistic
// (confirm disabled + "Saving…" while POST in flight; clientOpId held until
// success so a retry replays the same attempt).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  BottomActions,
  Content,
  ScanInputArea,
  ScannerScreen,
  StepsBar,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";
import type { LocationLookupResponse, ScannerLocation } from "../../putaway/_components/types";
import type {
  PickLp,
  PickLpsResponse,
  PickMaterial,
  PickPayload,
  PickResult,
  PickWo,
  PickWosResponse,
} from "./types";

type Phase = "loading" | "wos" | "materials" | "lp" | "done" | "error" | "denied" | "empty";
type LpState = "loading" | "ready" | "error";

export function PickScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const L = labels.pickScreen;

  const [phase, setPhase] = useState<Phase>("loading");
  const [wos, setWos] = useState<PickWo[]>([]);
  const [query, setQuery] = useState("");
  const [wo, setWo] = useState<PickWo | null>(null);
  const [material, setMaterial] = useState<PickMaterial | null>(null);

  // FEFO LP candidates for the selected material (top = suggested).
  const [lps, setLps] = useState<PickLp[]>([]);
  const [lpState, setLpState] = useState<LpState>("loading");

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  // destination only requested when the POST returns 422 demanding one.
  const [destNeeded, setDestNeeded] = useState(false);
  // free-form typed location CODE; resolved into a UUID before it ships as
  // toLocationId (parity with putaway/move — never send raw text on the wire).
  const [dest, setDest] = useState("");
  const [destLocation, setDestLocation] = useState<ScannerLocation | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [pendingLp, setPendingLp] = useState<PickLp | null>(null);
  // clientOpId is held per attempt until success so a retry replays it.
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const loadWos = useCallback(async () => {
    if (!ready || !session) return;
    setPhase("loading");
    try {
      const res = await scannerFetch("/api/warehouse/scanner/pick/wos", undefined, {
        method: "GET",
        namespace: "absolute",
      });
      if (res.status === 401 || res.status === 403) {
        setPhase("denied");
        return;
      }
      const body = (await res.json()) as PickWosResponse;
      if (!res.ok || !body.ok) {
        setPhase("error");
        return;
      }
      const list = body.wos ?? [];
      setWos(list);
      setPhase(list.length === 0 ? "empty" : "wos");
    } catch {
      setPhase("error");
    }
  }, [ready, session, scannerFetch]);

  // Auto-load WO list ONCE per mount after the session hydrates.
  const didLoad = useRef(false);
  useEffect(() => {
    if (!ready || !session || didLoad.current) return;
    didLoad.current = true;
    void loadWos();
  }, [ready, session, loadWos]);

  const filteredWos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return wos;
    return wos.filter((w) =>
      `${w.woNumber} ${w.productCode} ${w.productName}`.toLowerCase().includes(q),
    );
  }, [wos, query]);

  const openWo = (w: PickWo) => {
    setWo(w);
    setMaterial(null);
    setSubmitErr(null);
    setPhase(w.materials.length === 0 ? "materials" : "materials");
  };

  const loadLps = useCallback(
    async (m: PickMaterial) => {
      setLpState("loading");
      setLps([]);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/pick/lps?productId=${encodeURIComponent(m.productId)}&uom=${encodeURIComponent(m.uom)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (res.status === 401 || res.status === 403) return; // redirect handled
        const body = (await res.json()) as PickLpsResponse;
        if (!res.ok || !body.ok) {
          setLpState("error");
          return;
        }
        setLps(body.lps ?? []);
        setLpState("ready");
      } catch {
        setLpState("error");
      }
    },
    [scannerFetch],
  );

  const openMaterial = (m: PickMaterial) => {
    setMaterial(m);
    setSubmitErr(null);
    setDestNeeded(false);
    setDest("");
    setDestLocation(null);
    setResolveErr(null);
    setPendingLp(null);
    setClientOpId(null);
    setPhase("lp");
    void loadLps(m);
  };

  // Resolve a typed/scanned staging-location CODE into a UUID (exactly like
  // putaway/move). The resolved location's id — never the raw text — is what
  // ships as toLocationId. On 404 keep the field open so the loop continues.
  const resolveLocation = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      setResolving(true);
      setResolveErr(null);
      setDestLocation(null);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/location?code=${encodeURIComponent(code)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (res.status === 401 || res.status === 403) return; // redirect handled
        if (res.status === 404) {
          setResolveErr(L.destNotFound);
          return;
        }
        const body = (await res.json().catch(() => null)) as LocationLookupResponse | null;
        if (!res.ok || !body || !body.location) {
          setResolveErr(L.destNotFound);
          return;
        }
        setDestLocation(body.location);
        setSubmitErr(null);
      } catch {
        setResolveErr(L.errGeneric);
      } finally {
        setResolving(false);
      }
    },
    [scannerFetch, L],
  );

  const confirmPick = useCallback(
    async (lp: PickLp) => {
      if (!wo || !material || submitting) return;
      // a destination was demanded by a prior 422 — require a RESOLVED location
      // (a resolved UUID, not raw typed text) before re-POST.
      if (destNeeded && !destLocation) {
        setSubmitErr(L.destinationRequired);
        return;
      }
      setSubmitting(true);
      setSubmitErr(null);
      setPendingLp(lp);
      const opId = clientOpId ?? crypto.randomUUID();
      setClientOpId(opId);
      const payload: PickPayload = {
        clientOpId: opId,
        woId: wo.id,
        materialId: material.id,
        lpId: lp.id,
      };
      // ship the RESOLVED location's UUID — never the raw typed code.
      if (destNeeded && destLocation) payload.toLocationId = destLocation.id;
      try {
        const res = await scannerFetch("/api/warehouse/scanner/pick", payload, {
          method: "POST",
          namespace: "absolute",
        });
        if (res.status === 401 || res.status === 403) return; // redirect handled
        if (res.status === 422) {
          // Branch on the BODY error code, not the bare status (review fix F4):
          // only destination_required reveals the destination field; any other
          // 422 (invalid_material, invalid_location…) is a generic error.
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          if (errBody?.error === "destination_required") {
            setDestNeeded(true);
            setSubmitErr(L.destinationRequired);
          } else {
            setSubmitErr(L.errGeneric);
          }
          return;
        }
        if (res.status === 409) {
          // lp_not_released = pick-only QA gate (review fix F3) — distinct copy.
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          setSubmitErr(errBody?.error === "lp_not_released" ? L.lpNotReleased : L.err409);
          return;
        }
        const body = (await res.json()) as PickResult;
        if (!res.ok || !body.ok) {
          setSubmitErr(L.errGeneric);
          return;
        }
        // success — release the attempt's clientOpId, refresh the WO materials.
        setClientOpId(null);
        setPhase("done");
        void refreshWo();
      } catch {
        setSubmitErr(L.errGeneric);
      } finally {
        setSubmitting(false);
      }
    },
    [wo, material, submitting, destNeeded, destLocation, clientOpId, scannerFetch, L],
  );

  // Re-fetch the WO list and re-bind the open WO so progress reflects the move.
  const refreshWo = useCallback(async () => {
    if (!wo) return;
    try {
      const res = await scannerFetch("/api/warehouse/scanner/pick/wos", undefined, {
        method: "GET",
        namespace: "absolute",
      });
      if (!res.ok) return;
      const body = (await res.json()) as PickWosResponse;
      if (!body.ok) return;
      const list = body.wos ?? [];
      setWos(list);
      const fresh = list.find((w) => w.id === wo.id);
      if (fresh) setWo(fresh);
    } catch {
      /* non-fatal: the done screen still shows */
    }
  }, [wo, scannerFetch]);

  const pickNext = () => {
    setMaterial(null);
    setLps([]);
    setSubmitErr(null);
    setDestNeeded(false);
    setDest("");
    setDestLocation(null);
    setResolveErr(null);
    setPendingLp(null);
    setClientOpId(null);
    setPhase("materials");
  };

  const title =
    phase === "done"
      ? L.doneTitle
      : phase === "materials" && wo
        ? wo.woNumber
        : phase === "lp" && material
          ? material.productName
          : L.title;

  const onBack =
    phase === "lp"
      ? () => setPhase("materials")
      : phase === "materials"
        ? () => {
            setWo(null);
            setPhase(wos.length === 0 ? "empty" : "wos");
          }
        : () => router.push(`/${locale}/scanner/home`);

  return (
    <ScannerScreen>
      <Topbar
        title={title}
        onBack={onBack}
        labels={labels.topbar}
      />

      {phase === "done" && wo ? (
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
                {material && pendingLp
                  ? `${material.productName} · ${pendingLp.lpNumber}`
                  : L.doneBody}
              </div>
            </div>
            <Banner kind="success" title={L.doneTitle}>
              {L.doneBody}
            </Banner>
          </Content>
          <BottomActions>
            <Btn variant="p" onClick={pickNext}>
              {L.pickNext}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/home`)}>
              {L.backToWo}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <Content>
          {phase === "loading" && <StateText>{L.loadingWos}</StateText>}

          {phase === "denied" && (
            <Banner kind="err" title={L.permissionDenied}>
              {L.permissionDenied}
            </Banner>
          )}

          {phase === "error" && (
            <>
              <Banner kind="err" title={L.errorLoad}>
                {L.errorLoad}
              </Banner>
              <div style={{ padding: "0 16px" }}>
                <Btn variant="sec" onClick={() => void loadWos()}>
                  {L.retry}
                </Btn>
              </div>
            </>
          )}

          {/* ---------- step: WO list ---------- */}
          {(phase === "wos" || phase === "empty") && (
            <>
              <ScanInputArea
                label={L.searchLabel}
                placeholder={L.searchPlaceholder}
                hint={L.searchHint}
                value={query}
                onChange={setQuery}
                labels={labels.scanTools}
              />
              {phase === "empty" || filteredWos.length === 0 ? (
                <Empty title={L.emptyTitle} body={query ? L.noMatchBody : L.emptyBody} />
              ) : (
                filteredWos.map((w) => {
                  const picked = w.materials.filter((m) => isDone(m)).length;
                  const total = w.materials.length;
                  return (
                    <button key={w.id} type="button" onClick={() => openWo(w)} style={rowStyle}>
                      <div style={iconStyle} aria-hidden="true">
                        🧺
                      </div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={monoTitleStyle}>{w.woNumber}</div>
                        <div style={subStyle}>
                          {w.productCode} · {w.productName}
                          {w.lineCode ? ` · ${L.line} ${w.lineCode}` : ""}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                          <StatusChip
                            label={L.status[w.status] ?? w.status}
                            done={total > 0 && picked >= total}
                          />
                          <MiniPill>
                            {picked} / {total} {L.done.toLowerCase()}
                          </MiniPill>
                        </div>
                      </div>
                      <span style={{ color: T.hint, fontSize: 24 }} aria-hidden="true">
                        ›
                      </span>
                    </button>
                  );
                })
              )}
            </>
          )}

          {/* ---------- step: BOM materials ---------- */}
          {phase === "materials" && wo && (
            <>
              <div style={sectionTitleStyle}>{L.materialsTitle}</div>
              {wo.materials.length === 0 ? (
                <Empty title={L.materialsTitle} body={L.materialsEmpty} />
              ) : (
                wo.materials.map((m) => {
                  const done = isDone(m);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openMaterial(m)}
                      style={materialBtnStyle(done)}
                    >
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontWeight: 600, color: T.txt }}>
                          {m.productCode} · {m.productName}
                        </div>
                        <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                          {done
                            ? `${m.consumedQty} / ${m.requiredQty} ${m.uom} · ${L.done}`
                            : `${remaining(m)} ${m.uom} ${L.needed}`}
                        </div>
                      </div>
                      <span aria-hidden="true" style={{ color: done ? T.green : T.hint }}>
                        {done ? "✓" : "›"}
                      </span>
                    </button>
                  );
                })
              )}
            </>
          )}

          {/* ---------- step: FEFO LP candidates ---------- */}
          {phase === "lp" && material && (
            <>
              <StepsBar steps={[L.stepMaterial, L.stepLp, L.stepConfirm]} current={1} />
              <div style={{ padding: "0 16px", marginTop: 8 }}>
                <div style={{ fontSize: 12, color: T.hint }}>{L.lpTitle}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, marginTop: 2 }}>
                  {material.productCode} · {material.productName}
                </div>
                <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                  {remaining(material)} {material.uom} {L.needed}
                </div>
              </div>

              {destNeeded && (
                <div style={{ marginTop: 8 }}>
                  <ScanInputArea
                    label={L.destinationLabel}
                    placeholder={L.destinationPlaceholder}
                    hint={L.destinationHint}
                    value={dest}
                    onChange={(v) => {
                      setDest(v);
                      // editing invalidates any prior resolved choice / error
                      if (destLocation) setDestLocation(null);
                      if (resolveErr) setResolveErr(null);
                    }}
                    onSubmit={(v) => void resolveLocation(v)}
                    state={resolveErr ? "err" : destLocation ? "ok" : "idle"}
                    labels={labels.scanTools}
                  />
                  {resolving && <StateText>{L.destResolving}</StateText>}
                  {resolveErr && (
                    <Banner kind="err" title={resolveErr}>
                      {" "}
                    </Banner>
                  )}
                  {destLocation && !resolving && (
                    <div style={resolvedChipStyle}>
                      <div style={resolvedChipLabel}>{L.destResolvedLabel}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                        <span style={resolvedChipCode}>{destLocation.code}</span>
                        <span style={{ fontSize: 12, color: T.mute }}>{destLocation.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                {lpState === "loading" && <StateText>{L.lpLoading}</StateText>}
                {lpState === "error" && (
                  <Banner kind="err" title={L.lpError}>
                    {L.lpError}
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
                      key={lp.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => void confirmPick(lp)}
                      style={lpBtnStyle(i === 0, submitting)}
                    >
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={lpNumStyle}>{lp.lpNumber}</div>
                        <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                          {lp.availableQty} {lp.uom}
                          {lp.expiryDate ? ` · ${L.lpExpiry} ${lp.expiryDate}` : ""}
                          {lp.locationCode ? ` · ${L.lpLocation} ${lp.locationCode}` : ""}
                        </div>
                      </div>
                      {i === 0 && <span style={suggestedChipStyle}>{L.lpSuggested}</span>}
                      <span aria-hidden="true" style={{ color: T.hint, marginLeft: 6 }}>
                        {submitting && pendingLp?.id === lp.id ? "…" : "›"}
                      </span>
                    </button>
                  ))}
              </div>

              {submitErr && (
                <Banner kind="err" title={submitErr}>
                  {" "}
                </Banner>
              )}
              {submitting && (
                <div style={{ padding: "0 16px 12px", color: T.mute, fontSize: 12 }}>
                  {L.confirming}
                </div>
              )}
            </>
          )}
        </Content>
      )}
    </ScannerScreen>
  );
}

// --- helpers (decimal STRINGS on the wire; parse for display only) ---
function remaining(m: PickMaterial): number {
  const req = parseFloat(m.requiredQty);
  const con = parseFloat(m.consumedQty);
  if (!Number.isFinite(req) || !Number.isFinite(con)) return 0;
  return Math.max(0, Number((req - con).toFixed(3)));
}

function isDone(m: PickMaterial): boolean {
  return remaining(m) <= 0;
}

function StatusChip({ label, done }: { label: string; done?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        borderRadius: 999,
        background: done ? "#0e2a18" : "#0e2333",
        color: done ? T.green : T.blue2,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function MiniPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        borderRadius: 999,
        border: `1px solid ${T.elev}`,
        color: T.txt2,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function StateText({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 18, color: T.mute, fontSize: 13 }}>{children}</div>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">
        🧺
      </div>
      <div style={{ color: T.txt, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 6, color: T.mute, fontSize: 13 }}>{body}</div>
    </div>
  );
}

const rowStyle = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: 12,
  border: "none",
  borderBottom: `1px solid ${T.sep}`,
  background: "transparent",
  padding: "14px 16px",
  color: T.txt,
  cursor: "pointer",
} as const;

const iconStyle = {
  width: 42,
  height: 42,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: T.surf,
  fontSize: 20,
} as const;

const monoTitleStyle = {
  color: T.txt,
  fontFamily: "'Courier New', monospace",
  fontSize: 15,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const subStyle = { marginTop: 3, color: T.mute, fontSize: 12 } as const;

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
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

function lpBtnStyle(suggested: boolean, disabled: boolean) {
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
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
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

// resolved-location confirmation chip (parity with putaway/move resolve UX).
const resolvedChipStyle = {
  margin: "8px 16px 0",
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${T.green}`,
  background: T.surf,
} as const;

const resolvedChipLabel = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const resolvedChipCode = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 800,
  color: T.txt,
} as const;
