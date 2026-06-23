"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  BottomActions,
  Btn,
  Content,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../../../_components/scanner-session";
import type { ScannerLabels } from "../../../../../_components/scanner-labels";
import { StateText } from "../../../_components/receive-po-list-screen";
import type {
  LocationLookupResponse,
  ReceiveResponse,
  ScannerLocation,
  ScannerPoDetail,
  ScannerPoLine,
} from "../../../_components/types";

export function ReceivePoItemScreen({
  locale,
  poId,
  lineId,
  labels,
}: {
  locale: string;
  poId: string;
  lineId: string;
  labels: ScannerLabels;
}) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const [po, setPo] = useState<ScannerPoDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [batchNumber, setBatchNumber] = useState("");
  const [bestBefore, setBestBefore] = useState("");
  const [qty, setQty] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReceiveResponse | null>(null);
  const [printState, setPrintState] = useState<"idle" | "printing" | "printed" | "error">("idle");
  // Lane W9-L8: optional destination — scan/type a location code, resolve it
  // via GET /api/warehouse/scanner/location (same manual-location pattern as
  // the putaway screen). Empty = default location (the hint says so).
  const [destVal, setDestVal] = useState("");
  const [destResolving, setDestResolving] = useState(false);
  const [destErr, setDestErr] = useState<string | null>(null);
  const [destLocation, setDestLocation] = useState<ScannerLocation | null>(null);
  const L = labels.receivePo;

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  useEffect(() => {
    if (!ready || !session) return;
    let cancelled = false;
    setState("loading");
    scannerFetch(`/api/warehouse/scanner/pos/${poId}`, undefined, { method: "GET", namespace: "absolute" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setState("denied");
          return;
        }
        const body = (await res.json()) as { ok?: boolean; po?: ScannerPoDetail };
        if (!res.ok || !body.ok || !body.po) throw new Error("load_failed");
        setPo(body.po);
        const line = body.po.lines.find((candidate) => candidate.id === lineId);
        if (line) setQty(remainingQty(line));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session, scannerFetch, poId, lineId]);

  const line = useMemo(() => po?.lines.find((candidate) => candidate.id === lineId) ?? null, [po, lineId]);
  const remaining = line ? remainingQty(line) : "0";
  const overReceive = line ? Number(qty || "0") > Number(remaining) : false;
  // Typed-but-unresolved destination blocks Receive — never silently fall back
  // to the default location when the operator clearly asked for one.
  const destPending = destVal.trim() !== "" && (!destLocation || destResolving);

  const resolveDestination = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      setDestResolving(true);
      setDestErr(null);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/location?code=${encodeURIComponent(code)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (res.status === 404) {
          setDestLocation(null);
          setDestErr(L.locationNotFound);
          return;
        }
        const body = (await res.json()) as LocationLookupResponse;
        if (!res.ok || !body.location) {
          setDestLocation(null);
          setDestErr(L.locationNotFound);
          return;
        }
        setDestLocation(body.location);
      } catch {
        setDestLocation(null);
        setDestErr(L.errorLoad);
      } finally {
        setDestResolving(false);
      }
    },
    [scannerFetch, L],
  );

  async function submit() {
    if (!line || submitting || destPending) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      clientOpId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      poLineId: line.id,
      qty,
      batchNumber: batchNumber.trim() || undefined,
      bestBefore: bestBefore || undefined,
      toLocationId: destLocation?.id,
    };
    try {
      const res = await scannerFetch("/api/warehouse/scanner/receive-line", payload, { namespace: "absolute" });
      const body = (await res.json()) as ReceiveResponse;
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP_${res.status}`);
      setDone(body);
      setPrintState("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "receive_failed";
      setError(message === "invalid_location" ? L.locationNotFound : message);
    } finally {
      setSubmitting(false);
    }
  }

  async function printLabel() {
    if (!done?.lpId || printState === "printing") return;
    setPrintState("printing");
    try {
      const res = await scannerFetch("print-label", { lpId: done.lpId });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP_${res.status}`);
      setPrintState("printed");
    } catch {
      setPrintState("error");
    }
  }

  return (
    <ScannerScreen>
      <Topbar
        title={done ? L.doneTitle : line ? `${L.qtyTitle}: ${line.itemCode}` : L.qtyTitle}
        onBack={() => router.push(`/${locale}/scanner/receive-po/${poId}`)}
        initials={session ? initials(session.user.name) : "JK"}
        labels={labels.topbar}
      />
      <Content>
        {state === "loading" && <StateText>{L.loadingLines}</StateText>}
        {state === "denied" && <Banner kind="err" title={L.permissionDenied}>{L.permissionDenied}</Banner>}
        {state === "error" && <Banner kind="err" title={L.errorLoad}>{L.errorLoad}</Banner>}
        {state === "ready" && !line && <Banner kind="err" title={L.errorLoad}>{L.errorLoad}</Banner>}
        {state === "ready" && line && !done && (
          <div style={{ padding: 16 }}>
            <div style={productStyle}>
              <div style={{ color: T.txt, fontWeight: 900 }}>{line.itemName}</div>
              <div style={{ color: T.mute, fontSize: 12, marginTop: 4 }}>{line.itemCode}</div>
              <div style={metricsStyle}>
                <Metric label={L.ordered} value={`${line.qty} ${line.uom}`} />
                <Metric label={L.received} value={`${line.receivedQty} ${line.uom}`} />
                <Metric label={L.remaining} value={`${remaining} ${line.uom}`} />
              </div>
            </div>
            <Field label={L.batch}>
              <input
                value={batchNumber}
                onChange={(event) => setBatchNumber(event.target.value)}
                placeholder={L.batchPlaceholder}
                style={inputStyle}
              />
            </Field>
            <Field label={L.bestBefore}>
              <input value={bestBefore} onChange={(event) => setBestBefore(event.target.value)} type="date" style={inputStyle} />
            </Field>
            {/* Lane W9-L8: optional destination — same manual-location UX as putaway. */}
            <Field label={L.destinationLabel}>
              <input
                value={destVal}
                onChange={(event) => {
                  setDestVal(event.target.value);
                  setDestErr(null);
                  setDestLocation(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void resolveDestination(destVal);
                  }
                }}
                placeholder={L.destinationPlaceholder}
                aria-label={L.destinationLabel}
                style={destInputStyle}
                autoComplete="off"
                spellCheck={false}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.destinationHint}</div>
              {destResolving && <div style={{ padding: "8px 0", color: T.mute, fontSize: 13 }}>{L.resolving}</div>}
              {destErr && <Banner kind="err" title={destErr}>{" "}</Banner>}
              {destLocation && !destResolving && (
                <div style={resolvedChipStyle}>
                  <div style={resolvedChipLabel}>{L.resolvedLabel}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                    <span style={monoLocStyle}>{destLocation.code}</span>
                    <span style={{ fontSize: 12, color: T.mute }}>{destLocation.name}</span>
                  </div>
                </div>
              )}
            </Field>
            <Field label={`${L.qty} (${line.uom})`}>
              <div style={qtyDisplayStyle} data-testid="receive-po-uom-label">
                <span>{qty || "0"}</span>
                <span style={{ color: T.blue2, fontSize: 18 }}>{line.uom}</span>
              </div>
              <Keypad value={qty} onChange={setQty} />
            </Field>
            {overReceive && <Banner kind="warn" title={L.overTitle}>{L.overBody}</Banner>}
            {error && <Banner kind="err" title={error}>{error}</Banner>}
          </div>
        )}
        {done && line && (
          <div style={{ padding: 16 }}>
            <div style={successStyle}>
              <div style={{ fontSize: 42 }} aria-hidden="true">✓</div>
              <div style={{ color: T.txt, fontSize: 22, fontWeight: 900 }}>{L.doneTitle}</div>
              <div style={{ color: T.mute, marginTop: 4 }}>{L.doneSub}</div>
            </div>
            <div style={lpCardStyle}>
              <div style={{ fontFamily: "'Courier New', monospace", color: T.txt, fontSize: 20, fontWeight: 900 }}>
                {done.lpNumber}
              </div>
              <div style={{ marginTop: 8, color: T.mute, fontSize: 12 }}>
                {L.newLp} · {done.qty} {done.uom} · {batchNumber || "-"} · {bestBefore || "-"}
              </div>
            </div>
            {done.overReceived && <Banner kind="warn" title={L.overTitle}>{L.overBody}</Banner>}
            {done.qcInspectionRequired && (
              <Banner kind="info" title={L.qcHoldTitle}>{L.qcHoldBody}</Banner>
            )}
            {printState === "printed" && <Banner kind="success" title={L.scannerPrinted}>{L.scannerPrinted}</Banner>}
            {printState === "error" && <Banner kind="err" title={L.scannerPrintError}>{L.scannerPrintError}</Banner>}
          </div>
        )}
      </Content>
      <BottomActions>
        {!done && (
          <Btn onClick={submit} disabled={!line || !qty || submitting || destPending}>
            {submitting ? L.receiving : L.receive}
          </Btn>
        )}
        {done && (
          <>
            <Btn
              onClick={printLabel}
              disabled={!done.lpId || printState === "printing"}
              style={{ minHeight: 56 }}
            >
              {printState === "printing" ? L.scannerPrinting : L.scannerPrintLabel}
            </Btn>
            <Btn onClick={() => router.push(`/${locale}/scanner/receive-po/${poId}`)}>{L.nextLine}</Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/receive-po`)}>{L.backToList}</Btn>
          </>
        )}
      </BottomActions>
    </ScannerScreen>
  );
}

export function Keypad({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
  return (
    <div style={keypadStyle}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          style={keyStyle}
          onClick={() => {
            if (key === "⌫") onChange(value.slice(0, -1));
            else if (key === "." && value.includes(".")) return;
            else onChange(`${value}${key}`.replace(/^0(?=\d)/, ""));
          }}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: 14 }}>
      <div style={{ color: T.hint, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <div style={{ color: T.hint, fontSize: 10, fontWeight: 800 }}>{label}</div>
      <div style={{ color: T.txt, fontSize: 13, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function remainingQty(line: ScannerPoLine): string {
  const remaining = Math.max(0, Number(line.qty) - Number(line.receivedQty));
  return Number.isInteger(remaining) ? String(remaining) : String(Number(remaining.toFixed(6)));
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const productStyle = {
  padding: 14,
  borderRadius: 8,
  background: T.surf,
  border: `1px solid ${T.elev}`,
} as const;

const metricsStyle = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 14 } as const;
const metricStyle = { minWidth: 0, borderRadius: 8, background: T.bg, padding: 9 } as const;

const inputStyle = {
  width: "100%",
  height: 48,
  borderRadius: 8,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 12px",
  fontSize: 16,
  outline: "none",
} as const;

// Lane W9-L8: destination-location field — mirrors the putaway manual-location
// input/chip styling (putaway-screen.tsx manualInputStyle / resolvedChip).
const destInputStyle = {
  width: "100%",
  height: 48,
  borderRadius: 8,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 12px",
  fontSize: 16,
  outline: "none",
  fontFamily: "'Courier New', monospace",
  fontWeight: 600,
} as const;

const resolvedChipStyle = {
  marginTop: 10,
  borderRadius: 12,
  border: `1px solid ${T.blue}`,
  background: "#0e2333",
  padding: 12,
} as const;

const resolvedChipLabel = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: T.hint,
  fontWeight: 700,
} as const;

const monoLocStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 800,
  color: T.txt,
} as const;

const qtyDisplayStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  minHeight: 64,
  borderRadius: 8,
  border: `1px solid ${T.blue}`,
  background: T.surf,
  color: T.txt,
  padding: "10px 14px",
  fontSize: 32,
  fontWeight: 900,
} as const;

const keypadStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  marginTop: 10,
} as const;

const keyStyle = {
  height: 48,
  borderRadius: 8,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
} as const;

const successStyle = {
  display: "grid",
  justifyItems: "center",
  gap: 4,
  padding: "34px 12px 24px",
} as const;

const lpCardStyle = {
  borderRadius: 8,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  padding: 16,
  textAlign: "center",
} as const;
