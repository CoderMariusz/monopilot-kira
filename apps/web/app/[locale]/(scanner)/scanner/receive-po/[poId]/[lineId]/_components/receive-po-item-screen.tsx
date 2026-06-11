"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ReceiveResponse, ScannerPoDetail, ScannerPoLine } from "../../../_components/types";

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

  async function submit() {
    if (!line || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      clientOpId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      poLineId: line.id,
      qty,
      batchNumber: batchNumber.trim() || undefined,
      bestBefore: bestBefore || undefined,
    };
    try {
      const res = await scannerFetch("/api/warehouse/scanner/receive-line", payload, { namespace: "absolute" });
      const body = (await res.json()) as ReceiveResponse;
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP_${res.status}`);
      setDone(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "receive_failed");
    } finally {
      setSubmitting(false);
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
          </div>
        )}
      </Content>
      <BottomActions>
        {!done && (
          <Btn onClick={submit} disabled={!line || !qty || submitting}>
            {submitting ? L.receiving : L.receive}
          </Btn>
        )}
        {done && (
          <>
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
