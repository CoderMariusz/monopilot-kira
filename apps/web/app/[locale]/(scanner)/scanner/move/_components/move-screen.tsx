"use client";

// ============================================================
// SCN-031 Move LP — scan LP → LP card → destination + optional reason → confirm.
// Parity: prototypes/scanner/flow-other.jsx:26-143
//   (MoveScreen scan + LP card + destination + quick-locs, MoveDoneScreen
//    success + from→to). The prototype's mock LP-lock gate is a backend concern
//    surfaced as the 409 lp_not_movable banner here (no client-trusted lock).
//
// Real data only — no mocks. scannerFetch (Bearer; 401 → ../login):
//   GET  /api/warehouse/scanner/lp?code=
//   POST /api/warehouse/scanner/move { clientOpId, lpId, toLocationId, reason? }
// Move is free-form, so we also offer putaway/suggest results labelled
// "Suggestions" as tappable shortcuts (the operator may still scan a code).
//
// Five states: loading (lookup / suggest), empty (no suggestions — manual scan
// still works), error (lp_not_found inline, 409 lp_not_movable banner),
// permission-denied (401/403 → login), optimistic (Confirm disabled + "Saving…"
// while POST in flight; clientOpId held until success for replay-safe retry).
//
// Manual destination (lane K1b): the free-form field now resolves a typed/scanned
// location code into a toLocationId via
//   GET /api/warehouse/scanner/location?code=<locationCode|uuid>
//     200 { location: { id, code, name, … } } → enables Confirm with that id
//     404 { error: 'location_not_found' }      → inline "Location not found"
// Suggestions remain tappable shortcuts; either source populates the same
// `chosen` destination and the same confirm/POST path.
// ============================================================

import { useCallback, useEffect, useState } from "react";
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
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";
import type {
  LocationLookupResponse,
  LpLookupResponse,
  MoveResult,
  PutawaySuggestion,
  ScannerLp,
  SuggestResponse,
} from "../../putaway/_components/types";

type Phase = "scan" | "done";
type SuggestState = "idle" | "loading" | "ready" | "error";
type ReasonId = "relocation" | "consolidation" | "damage" | "other";

const REASONS: ReasonId[] = ["relocation", "consolidation", "damage", "other"];

export function MoveScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const L = labels.moveScreen;

  const [phase, setPhase] = useState<Phase>("scan");
  const [scanVal, setScanVal] = useState("");
  const [lp, setLp] = useState<ScannerLp | null>(null);
  const [scanState, setScanState] = useState<"idle" | "err" | "ok">("idle");
  const [lookingUp, setLookingUp] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);

  const [destInput, setDestInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PutawaySuggestion[]>([]);
  const [suggestState, setSuggestState] = useState<SuggestState>("idle");
  const [chosen, setChosen] = useState<PutawaySuggestion | null>(null);
  const [reason, setReason] = useState<ReasonId | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

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
        const body = (await res.json()) as LocationLookupResponse;
        if (!res.ok || !body.location) {
          setResolveErr(L.locationNotFound);
          return;
        }
        // resolved location flows into the SAME `chosen` destination + confirm path.
        setChosen({
          locationId: body.location.id,
          locationCode: body.location.code,
          locationName: body.location.name,
          reason: "default",
        });
        setSubmitErr(null);
      } catch {
        setResolveErr(L.errGeneric);
      } finally {
        setResolving(false);
      }
    },
    [scannerFetch, L],
  );

  const lookupLp = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) {
        setScanState("err");
        setScanErr(L.lpNotFound);
        return;
      }
      setLookingUp(true);
      setScanErr(null);
      setChosen(null);
      setDestInput("");
      setResolving(false);
      setResolveErr(null);
      setReason(null);
      setSubmitErr(null);
      setClientOpId(null);
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
        void loadSuggestions(body.lp.id);
      } catch {
        setScanState("err");
        setScanErr(L.errGeneric);
      } finally {
        setLookingUp(false);
      }
    },
    [scannerFetch, loadSuggestions, L],
  );

  const sameLocation = Boolean(chosen && lp && chosen.locationId === lp.locationId);

  const confirm = async () => {
    if (!lp || !chosen || sameLocation || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);
    try {
      const res = await scannerFetch(
        "/api/warehouse/scanner/move",
        {
          clientOpId: opId,
          lpId: lp.id,
          toLocationId: chosen.locationId,
          ...(reason ? { reason } : {}),
        },
        { namespace: "absolute" },
      );
      if (res.status === 409) {
        setSubmitErr(L.errNotMovable);
        return;
      }
      if (res.status === 422) {
        setSubmitErr(L.errInvalid);
        return;
      }
      const body = (await res.json()) as MoveResult;
      if (!res.ok || !body.ok) {
        setSubmitErr(L.errGeneric);
        return;
      }
      setClientOpId(null);
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
    setDestInput("");
    setResolving(false);
    setResolveErr(null);
    setSuggestions([]);
    setSuggestState("idle");
    setChosen(null);
    setReason(null);
    setSubmitErr(null);
    setClientOpId(null);
  };

  const title = phase === "done" ? L.doneTitle : L.title;

  return (
    <ScannerScreen>
      <Topbar
        title={title}
        onBack={() => router.push(`/${locale}/scanner/home`)}
        initials={session ? initials(session.user.name) : "JK"}
        labels={labels.topbar}
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
              <div style={pillStyle}>
                <div style={pillLabel}>{L.successFrom}</div>
                <div style={pillCode}>{lp.locationCode || L.noLocation}</div>
              </div>
              <div style={{ color: T.hint, fontSize: 22 }} aria-hidden="true">
                →
              </div>
              <div style={pillStyle}>
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
            />
            {lookingUp && <StateText>{L.lookingUp}</StateText>}
            {scanErr && (
              <Banner kind="err" title={scanErr}>
                {" "}
              </Banner>
            )}

            {lp && !lookingUp && (
              <>
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

                {/* free-form destination scan field (parity flow-other.jsx:90-100) */}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={fieldLabel}>{L.destLabel}</div>
                  <input
                    value={destInput}
                    onChange={(e) => {
                      setDestInput(e.target.value);
                      // editing invalidates any prior resolved/suggested choice
                      if (chosen) setChosen(null);
                      if (resolveErr) setResolveErr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void resolveLocation(destInput);
                    }}
                    placeholder={L.destPlaceholder}
                    aria-label={L.destLabel}
                    style={destInputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.destHint}</div>
                  {resolving && <StateText>{L.resolving}</StateText>}
                  {resolveErr && (
                    <Banner kind="err" title={resolveErr}>
                      {" "}
                    </Banner>
                  )}
                  {chosen && !resolving && (
                    <div style={resolvedChip}>
                      <div style={pillLabel}>{L.resolvedLabel}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                        <span style={monoLocStyle}>{chosen.locationCode}</span>
                        <span style={{ fontSize: 12, color: T.mute }}>{chosen.locationName}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* suggestions act as tappable destination shortcuts */}
                <div style={sectionTitle}>{L.suggestionsTitle}</div>
                {suggestState === "loading" && <StateText>{L.suggestionsLoading}</StateText>}
                {suggestState === "ready" &&
                  suggestions.map((s) => {
                    const active = chosen?.locationId === s.locationId;
                    return (
                      <button
                        key={s.locationId}
                        type="button"
                        onClick={() => {
                          setChosen(s);
                          setDestInput(s.locationCode);
                          setResolveErr(null);
                          setSubmitErr(null);
                        }}
                        style={locBtnStyle(active)}
                      >
                        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <div style={monoLocStyle}>{s.locationCode}</div>
                          <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{s.locationName}</div>
                        </div>
                        {active && (
                          <span aria-hidden="true" style={{ color: T.green, fontWeight: 900 }}>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}

                {/* optional reason — preset list (parity uses SCN_REASONS) */}
                <div style={sectionTitle}>{L.reasonLabel}</div>
                <div style={reasonRow}>
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(reason === r ? null : r)}
                      style={reasonBtn(reason === r)}
                    >
                      {reasonLabel(r, L)}
                    </button>
                  ))}
                </div>

                {sameLocation && (
                  <Banner kind="warn" title={L.sameLocation}>
                    {" "}
                  </Banner>
                )}
                {submitErr && (
                  <Banner kind="err" title={submitErr}>
                    {" "}
                  </Banner>
                )}
              </>
            )}
          </Content>
          <BottomActions>
            <Btn
              variant="p"
              disabled={!lp || !chosen || sameLocation || submitting}
              onClick={confirm}
            >
              {submitting ? L.confirming : L.confirm}
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

function reasonLabel(r: ReasonId, L: ScannerLabels["moveScreen"]) {
  if (r === "relocation") return L.reasonRelocation;
  if (r === "consolidation") return L.reasonConsolidation;
  if (r === "damage") return L.reasonDamage;
  return L.reasonOther;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
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

const destInputStyle = {
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

const resolvedChip = {
  margin: "10px 0 0",
  borderRadius: 12,
  border: `1px solid ${T.blue}`,
  background: "#0e2333",
  padding: 12,
} as const;

const reasonRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  padding: "0 16px 8px",
} as const;

function reasonBtn(active: boolean) {
  return {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${active ? T.blue : T.elev}`,
    background: active ? "#0e2333" : "transparent",
    color: active ? T.blue2 : T.txt2,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
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

const pillStyle = {
  flex: 1,
  minWidth: 0,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  padding: 12,
  textAlign: "center",
} as const;

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
