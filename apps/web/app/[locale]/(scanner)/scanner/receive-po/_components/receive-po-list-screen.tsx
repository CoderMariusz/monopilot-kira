"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Content,
  ScanInputArea,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";
import type { ScannerPoSummary } from "./types";

export function ReceivePoListScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<ScannerPoSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const L = labels.receivePo;

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  useEffect(() => {
    if (!ready || !session) return;
    let cancelled = false;
    setState("loading");
    scannerFetch("/api/warehouse/scanner/pos", undefined, { method: "GET", namespace: "absolute" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setState("denied");
          return;
        }
        const body = (await res.json()) as { ok?: boolean; pos?: ScannerPoSummary[] };
        if (!res.ok || !body.ok) throw new Error("load_failed");
        setPos(body.pos ?? []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session, scannerFetch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pos;
    return pos.filter((po) => `${po.poNumber} ${po.supplierCode ?? ""} ${po.supplierName}`.toLowerCase().includes(q));
  }, [pos, query]);

  // Enter on a scanned/typed PO code advances the flow: prefer an exact PO-number
  // match; otherwise, if the search narrows to a single PO, open it. No match
  // leaves the list filtered so the operator can pick from the rows.
  const onSubmit = (raw: string) => {
    const code = raw.trim().toLowerCase();
    if (!code) return;
    const exact = pos.find((po) => po.poNumber.toLowerCase() === code);
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) router.push(`/${locale}/scanner/receive-po/${target.id}`);
  };

  return (
    <ScannerScreen>
      <Topbar
        title={L.listTitle}
        onBack={() => router.push(`/${locale}/scanner/home`)}
        labels={labels.topbar}
      />
      <Content>
        <ScanInputArea
          label={L.scanLabel}
          placeholder={L.scanPlaceholder}
          hint={L.scanHint}
          value={query}
          onChange={setQuery}
          onSubmit={onSubmit}
          labels={labels.scanTools}
        />
        {state === "loading" && <StateText>{L.loadingPo}</StateText>}
        {state === "denied" && <Banner kind="err" title={L.permissionDenied}>{L.permissionDenied}</Banner>}
        {state === "error" && <Banner kind="err" title={L.errorLoad}>{L.errorLoad}</Banner>}
        {state === "ready" && filtered.length === 0 && (
          <Empty title={L.emptyTitle} body={query ? L.noMatchBody : L.emptyBody} />
        )}
        {state === "ready" &&
          filtered.map((po) => (
            <button
              key={po.id}
              type="button"
              onClick={() => router.push(`/${locale}/scanner/receive-po/${po.id}`)}
              style={rowStyle}
            >
              <div style={iconStyle} aria-hidden="true">📦</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ ...monoTitleStyle, overflow: "hidden", textOverflow: "ellipsis" }}>{po.poNumber}</div>
                <div style={subStyle}>{po.supplierName}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                  <StatusChip label={L.status[po.status] ?? po.status} />
                  <MiniPill>{L.lines}: {po.lineCount}</MiniPill>
                  <MiniPill>{L.receivedLines}: {po.receivedLineCount}</MiniPill>
                </div>
              </div>
              <div style={{ textAlign: "right", color: T.hint, fontSize: 11 }}>
                {L.expected}
                <div style={{ marginTop: 3, color: T.txt2, fontWeight: 700 }}>{po.expectedDelivery ?? "-"}</div>
              </div>
              <span style={{ color: T.hint, fontSize: 24 }} aria-hidden="true">›</span>
            </button>
          ))}
      </Content>
    </ScannerScreen>
  );
}

export function StatusChip({ label }: { label: string }) {
  return <span style={chipStyle}>{label}</span>;
}

export function MiniPill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>;
}

export function StateText({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 18, color: T.mute, fontSize: 13 }}>{children}</div>;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">📦</div>
      <div style={{ color: T.txt, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 6, color: T.mute, fontSize: 13 }}>{body}</div>
    </div>
  );
}

export const rowStyle = {
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

export const iconStyle = {
  width: 42,
  height: 42,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: T.surf,
  fontSize: 20,
} as const;

export const monoTitleStyle = {
  color: T.txt,
  fontFamily: "'Courier New', monospace",
  fontSize: 15,
  fontWeight: 800,
} as const;

export const subStyle = { marginTop: 3, color: T.mute, fontSize: 12 } as const;

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  borderRadius: 999,
  background: "#0e2a18",
  color: T.green,
  padding: "2px 8px",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
} as const;

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  borderRadius: 999,
  border: `1px solid ${T.elev}`,
  color: T.txt2,
  padding: "2px 8px",
  fontSize: 10,
  fontWeight: 700,
} as const;
