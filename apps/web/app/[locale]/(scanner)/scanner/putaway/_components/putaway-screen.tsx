"use client";

// ============================================================
// SCN-040 Putaway — scan LP → suggest location → confirm.
// Parity: prototypes/scanner/flow-putaway.jsx:5-178
//   (PutawayScanScreen scan + LP card, PutawaySuggestScreen suggestions,
//    PutawayDoneScreen success + from→to).
//
// Real data only — no mocks. Talks to the lane-C3 warehouse scanner routes
// via scannerFetch (Bearer token; 401 → ../login):
//   GET  /api/warehouse/scanner/lp?code=
//   GET  /api/warehouse/scanner/putaway/suggest?lpId=
//   POST /api/warehouse/scanner/putaway { clientOpId, lpId, toLocationId }
//
// Five states: loading (LP lookup / suggest spinner), empty (no suggestions),
// error (lp_not_found inline, suggest error, 409 lp_not_movable banner),
// permission-denied (401/403 → login redirect), optimistic (Confirm disabled +
// "Saving…" while the POST is in flight; clientOpId held until success so a
// network-retry replays the SAME attempt).
//
// Manual destination (lane K1b): suggestions stay the primary path, but the
// operator may also scan/type a location code which is resolved via
//   GET /api/warehouse/scanner/location?code=<locationCode|uuid>
//     200 { location: { id, code, name, … } } → becomes the selected destination
//     404 { error: 'location_not_found' }      → inline "Location not found"
// A resolved location flows into the SAME `chosen` state + confirm path as a
// suggestion (modelled as a default-reason PutawaySuggestion).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  BottomActions,
  Btn,
  Content,
  MiniGrid,
  ScanInputArea,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { CameraScannerOverlay } from "../../../../../../components/shell/camera-scanner-overlay";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";
import type {
  LocationLookupResponse,
  LpLookupResponse,
  PutawaySuggestion,
  PutawaySuggestionReason,
  ScannerLp,
  SuggestResponse,
  MoveResult,
} from "./types";

type Phase = "scan" | "suggest" | "done";
type SuggestState = "loading" | "ready" | "error";

export function PutawayScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const L = labels.putawayScreen;

  const [phase, setPhase] = useState<Phase>("scan");
  const [scanVal, setScanVal] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lp, setLp] = useState<ScannerLp | null>(null);
  const [scanState, setScanState] = useState<"idle" | "err" | "ok">("idle");
  const [lookingUp, setLookingUp] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<PutawaySuggestion[]>([]);
  const [suggestState, setSuggestState] = useState<SuggestState>("loading");
  const [chosen, setChosen] = useState<PutawaySuggestion | null>(null);

  // manual destination: scan/type a location code → resolve → becomes `chosen`.
  const [manualVal, setManualVal] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  // true when `chosen` came from the manual resolver (vs. a tapped suggestion).
  const [manualChosen, setManualChosen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  // held until success so a retry of the SAME attempt replays idempotently.
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const lookupLp = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) {
        setScanErr(L.scanInvalid);
        setScanState("err");
        return;
      }
      setLookingUp(true);
      setScanErr(null);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/lp?code=${encodeURIComponent(code)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (res.status === 404) {
          setLp(null);
          setScanState("err");
          setScanErr(L.lpNotFound);
          return;
        }
        const body = (await res.json()) as LpLookupResponse;
        if (!res.ok || !body.lp) {
          setLp(null);
          setScanState("err");
          setScanErr(L.lpNotFound);
          return;
        }
        setLp(body.lp);
        setScanState("ok");
      } catch {
        setScanState("err");
        setScanErr(L.errGeneric);
      } finally {
        setLookingUp(false);
      }
    },
    [scannerFetch, L],
  );

  const loadSuggestions = useCallback(
    async (lpId: string) => {
      setSuggestState("loading");
      setSuggestions([]);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/putaway/suggest?lpId=${encodeURIComponent(lpId)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (!res.ok) {
          setSuggestState("error");
          return;
        }
        const body = (await res.json()) as SuggestResponse;
        setSuggestions(body.suggestions ?? []);
        setSuggestState("ready");
      } catch {
        setSuggestState("error");
      }
    },
    [scannerFetch],
  );

  const resolveLocation = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      setResolving(true);
      setResolveErr(null);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/location?code=${encodeURIComponent(code)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (res.status === 404) {
          setResolveErr(L.locationNotFound);
          return;
        }
        const body = (await res.json()) as LocationLookupResponse & { error?: string };
        if (res.status === 422 && body.error === "location_inactive") {
          setResolveErr(L.locationInactive);
          return;
        }
        if (!res.ok || !body.location) {
          setResolveErr(L.locationNotFound);
          return;
        }
        // A resolved location confirms via the SAME path as a suggestion.
        setChosen({
          locationId: body.location.id,
          locationCode: body.location.code,
          locationName: body.location.name,
          reason: "default",
        });
        setManualChosen(true);
        setSubmitErr(null);
      } catch {
        setResolveErr(L.errGeneric);
      } finally {
        setResolving(false);
      }
    },
    [scannerFetch, L],
  );

  const goSuggest = () => {
    if (!lp) return;
    setChosen(null);
    setManualChosen(false);
    setManualVal("");
    setResolveErr(null);
    setSubmitErr(null);
    setClientOpId(null);
    setPhase("suggest");
    void loadSuggestions(lp.id);
  };

  const confirm = async () => {
    if (!lp || !chosen || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);
    try {
      const res = await scannerFetch(
        "/api/warehouse/scanner/putaway",
        { clientOpId: opId, lpId: lp.id, toLocationId: chosen.locationId },
        { namespace: "absolute" },
      );
      if (res.status === 409) {
        setSubmitErr(L.errNotMovable);
        return;
      }
      const body = (await res.json()) as MoveResult & { error?: string };
      if (res.status === 422) {
        setSubmitErr(body.error === "location_inactive" ? L.locationInactive : L.errInvalid);
        return;
      }
      if (!res.ok || !body.ok) {
        setSubmitErr(L.errGeneric);
        return;
      }
      setClientOpId(null); // success → release attempt id
      setPhase("done");
    } catch {
      setSubmitErr(L.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setPhase("scan");
    setScanVal("");
    setLp(null);
    setScanState("idle");
    setScanErr(null);
    setSuggestions([]);
    setSuggestState("loading");
    setChosen(null);
    setManualChosen(false);
    setManualVal("");
    setResolving(false);
    setResolveErr(null);
    setSubmitErr(null);
    setClientOpId(null);
  };

  const title = phase === "done" ? L.doneTitle : L.title;
  const onBack =
    phase === "suggest"
      ? () => setPhase("scan")
      : () => router.push(`/${locale}/scanner/home`);

  return (
    <ScannerScreen>
      <Topbar
        title={title}
        onBack={onBack}
        labels={labels.topbar}
      />
      <CameraScannerOverlay
        open={cameraOpen}
        onDecode={(scanned) => {
          setCameraOpen(false);
          setScanVal(scanned);
          void lookupLp(scanned);
        }}
        onCancel={() => setCameraOpen(false)}
        labels={labels.cameraScanner}
      />

      {phase === "done" && lp && chosen ? (
        <>
          <Content>
            <div style={successWrap}>
              <div style={{ fontSize: 52 }} aria-hidden="true">
                ✅
              </div>
              <div style={{ color: T.txt, fontSize: 20, fontWeight: 900 }}>{L.successTitle}</div>
              <div style={{ color: T.mute, marginTop: 4, fontSize: 13 }}>
                {lp.lpNumber} · {lp.productName}
              </div>
            </div>
            <div style={fromToStyle}>
              <div style={pillStyle("from")}>
                <div style={pillLabel}>{L.cardCurrentLoc}</div>
                <div style={pillCode}>{lp.locationCode || L.noLocation}</div>
              </div>
              <div style={{ color: T.hint, fontSize: 22 }} aria-hidden="true">
                →
              </div>
              <div style={pillStyle("to")}>
                <div style={pillLabel}>{L.successTo}</div>
                <div style={pillCode}>{chosen.locationCode}</div>
              </div>
            </div>
          </Content>
          <BottomActions>
            <Btn variant="p" onClick={reset}>
              {L.nextLp}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/home`)}>
              {L.backToMenu}
            </Btn>
          </BottomActions>
        </>
      ) : phase === "suggest" && lp ? (
        <>
          <Content>
            <div style={sectionTitle}>{L.suggestTitle}</div>
            {suggestState === "loading" && <StateText>{L.suggestLoading}</StateText>}
            {suggestState === "error" && (
              <>
                <Banner kind="err" title={L.suggestError}>
                  {" "}
                </Banner>
                <div style={{ padding: "0 16px" }}>
                  <Btn variant="sec" onClick={() => void loadSuggestions(lp.id)}>
                    {L.retry}
                  </Btn>
                </div>
              </>
            )}
            {suggestState === "ready" && suggestions.length === 0 && (
              <StateText>{L.suggestEmpty}</StateText>
            )}
            {suggestState === "ready" &&
              suggestions.map((s) => {
                const active = chosen?.locationId === s.locationId;
                return (
                  <button
                    key={s.locationId}
                    type="button"
                    onClick={() => {
                      setChosen(s);
                      setManualChosen(false);
                      setResolveErr(null);
                      setSubmitErr(null);
                    }}
                    style={locBtnStyle(active)}
                  >
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={monoLocStyle}>{s.locationCode}</div>
                      <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{s.locationName}</div>
                    </div>
                    <span style={reasonChip(s.reason)}>{reasonLabel(s.reason, L)}</span>
                  </button>
                );
              })}
            {/* Manual destination: scan/type a location → resolve → select. */}
            <div style={{ padding: "12px 16px 0" }}>
              <div style={fieldLabel}>{L.manualLabel}</div>
              <input
                value={manualVal}
                onChange={(e) => {
                  setManualVal(e.target.value);
                  if (resolveErr) setResolveErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void resolveLocation(manualVal);
                }}
                placeholder={L.manualPlaceholder}
                aria-label={L.manualLabel}
                style={manualInputStyle}
                autoComplete="off"
                spellCheck={false}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.manualHint}</div>
              {resolving && <StateText>{L.resolving}</StateText>}
              {resolveErr && (
                <Banner kind="err" title={resolveErr}>
                  {" "}
                </Banner>
              )}
              {manualChosen && chosen && !resolving && (
                <div style={resolvedChip}>
                  <div style={pillLabel}>{L.resolvedLabel}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                    <span style={monoLocStyle}>{chosen.locationCode}</span>
                    <span style={{ fontSize: 12, color: T.mute }}>{chosen.locationName}</span>
                  </div>
                </div>
              )}
            </div>
            {submitErr && (
              <Banner kind="err" title={submitErr}>
                {" "}
              </Banner>
            )}
          </Content>
          <BottomActions>
            <Btn variant="p" disabled={!chosen || submitting} onClick={confirm}>
              {submitting ? L.confirming : L.confirm}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <>
          <Content>
            <ScanInputArea
              label={L.scanLabel}
              placeholder={L.scanPlaceholder}
              hint={L.scanHint}
              value={scanVal}
              onChange={(v) => {
                setScanVal(v);
                if (scanState === "err") {
                  setScanState("idle");
                  setScanErr(null);
                }
              }}
              onSubmit={(v) => void lookupLp(v)}
              state={scanState}
              labels={labels.scanTools}
              onOpenCamera={() => setCameraOpen(true)}
            />
            {lookingUp && <StateText>{L.lookingUp}</StateText>}
            {scanErr && (
              <Banner kind="err" title={scanErr}>
                {" "}
              </Banner>
            )}
            {lp && !lookingUp && (
              <MiniGrid
                rows={[
                  [
                    { label: L.cardProduct, value: lp.productName },
                    { label: L.cardQty, value: `${lp.quantity} ${lp.uom}` },
                  ],
                  [
                    { label: L.cardBatch, value: lp.batchNumber || "—" },
                    { label: L.cardExpiry, value: lp.expiryDate || "—" },
                  ],
                  [
                    { label: L.cardCurrentLoc, value: lp.locationCode || L.noLocation },
                    { label: L.cardQa, value: <QaBadge status={lp.qaStatus} /> },
                  ],
                ]}
              />
            )}
          </Content>
          <BottomActions>
            <Btn variant="p" disabled={!lp || lookingUp} onClick={goSuggest}>
              {L.chooseSuggestion}
            </Btn>
          </BottomActions>
        </>
      )}
    </ScannerScreen>
  );
}

function QaBadge({ status }: { status: string }) {
  const isHold = status === "hold";
  const isPass = status === "pass" || status === "released" || status === "available";
  const bg = isHold ? "#3b1212" : isPass ? "#0e2a18" : "#3b2f0b";
  const fg = isHold ? T.red : isPass ? T.green : T.amber;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 20,
        borderRadius: 999,
        background: bg,
        color: fg,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function StateText({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 18, color: T.mute, fontSize: 13 }}>{children}</div>;
}

function reasonLabel(reason: PutawaySuggestionReason, L: ScannerLabels["putawayScreen"]) {
  if (reason === "same_product") return L.reasonSameProduct;
  if (reason === "empty") return L.reasonEmpty;
  return L.reasonDefault;
}

const sectionTitle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const fieldLabel = {
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const manualInputStyle = {
  width: "100%",
  height: 52,
  borderRadius: 12,
  border: `2px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 14px",
  fontSize: 17,
  fontWeight: 600,
  fontFamily: "'Courier New', monospace",
  outline: "none",
} as const;

const resolvedChip = {
  marginTop: 10,
  borderRadius: 12,
  border: `1px solid ${T.blue}`,
  background: "#0e2333",
  padding: 12,
} as const;

function locBtnStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "calc(100% - 32px)",
    margin: "0 16px 8px",
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${active ? T.blue : T.elev}`,
    background: T.surf,
    cursor: "pointer",
  } as const;
}

const monoLocStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 800,
  color: T.txt,
} as const;

function reasonChip(reason: PutawaySuggestionReason) {
  const fg = reason === "same_product" ? T.blue2 : reason === "empty" ? T.green : T.mute;
  return {
    padding: "3px 8px",
    borderRadius: 999,
    background: "#0e2333",
    color: fg,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  } as const;
}

const successWrap = {
  display: "grid",
  justifyItems: "center",
  gap: 4,
  padding: "32px 12px 20px",
} as const;

const fromToStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "0 16px 12px",
} as const;

function pillStyle(_kind: "from" | "to") {
  return {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    border: `1px solid ${T.elev}`,
    background: T.surf,
    padding: 12,
    textAlign: "center",
  } as const;
}

const pillLabel = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: T.hint,
  fontWeight: 700,
} as const;

const pillCode = {
  marginTop: 4,
  fontFamily: "'Courier New', monospace",
  fontWeight: 800,
  color: T.txt,
  fontSize: 14,
} as const;
