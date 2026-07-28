"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Content,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../../_components/scanner-session";
import type { ScannerLabels } from "../../../../_components/scanner-labels";
import { MiniPill, StateText, StatusChip, iconStyle, monoTitleStyle, rowStyle, subStyle } from "../../_components/receive-po-list-screen";
import { compareDecimal, receiptPercent } from "../../_components/scanner-po-decimal";
import type { ScannerPoDetail } from "../../_components/types";

type ScreenState = "loading" | "ready" | "already_received" | "error" | "denied" | "not_found";

type PoDetailResponse = {
  ok?: boolean;
  po?: ScannerPoDetail;
  alreadyReceived?: boolean;
  error?: string;
};

export function ReceivePoLinesScreen({
  locale,
  poId,
  labels,
}: {
  locale: string;
  poId: string;
  labels: ScannerLabels;
}) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const [po, setPo] = useState<ScannerPoDetail | null>(null);
  const [state, setState] = useState<ScreenState>("loading");
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
        const body = (await res.json()) as PoDetailResponse;
        if (res.status === 404 && body.error === "po_not_found") {
          setState("not_found");
          return;
        }
        if (!res.ok || !body.ok || !body.po) throw new Error("load_failed");
        setPo(body.po);
        setState(body.alreadyReceived ? "already_received" : "ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session, scannerFetch, poId]);

  const showLines = state === "ready" || state === "already_received";

  return (
    <ScannerScreen>
      <Topbar
        title={po?.poNumber ?? L.listTitle}
        onBack={() => router.push(`/${locale}/scanner/receive-po`)}
        labels={labels.topbar}
      />
      <Content>
        {state === "loading" && <StateText>{L.loadingLines}</StateText>}
        {state === "denied" && <Banner kind="err" title={L.permissionDenied}>{L.permissionDenied}</Banner>}
        {state === "not_found" && <Banner kind="err" title={L.poNotFound}>{L.poNotFound}</Banner>}
        {state === "error" && <Banner kind="err" title={L.errorLoad}>{L.errorLoad}</Banner>}
        {state === "already_received" && (
          <Banner kind="info" title={L.alreadyReceivedTitle}>{L.alreadyReceivedSub}</Banner>
        )}
        {showLines && po && (
          <>
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={monoTitleStyle}>{po.poNumber}</div>
                  <div style={{ ...subStyle, fontSize: 13 }}>{po.supplierName}</div>
                  <div style={{ marginTop: 8 }}><StatusChip label={L.status[po.status] ?? po.status} /></div>
                </div>
                <div style={{ textAlign: "right", color: T.hint, fontSize: 11 }}>
                  {L.expected}
                  <div style={{ marginTop: 3, color: T.txt2, fontWeight: 800 }}>{po.expectedDelivery ?? "-"}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <MiniPill>{L.lines}: {po.lines.length}</MiniPill>
                <MiniPill>{L.receivedLines}: {po.lines.filter((line) => compareDecimal(line.receivedQty, line.qty) >= 0).length}</MiniPill>
              </div>
            </div>
            <div style={sectionTitleStyle}>{L.linesTitle}</div>
            {po.lines.map((line) => {
              const pct = receiptPercent(line.receivedQty, line.qty);
              const done = compareDecimal(line.receivedQty, line.qty) >= 0;
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => router.push(`/${locale}/scanner/receive-po/${po.id}/${line.id}`)}
                  style={rowStyle}
                >
                  <div style={{ ...iconStyle, color: done ? T.green : line.receivedQty !== "0" ? T.amber : T.mute }}>
                    {done ? "✓" : line.receivedQty !== "0" ? `${pct}%` : "○"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div style={{ color: T.txt, fontWeight: 800 }}>{line.itemName}</div>
                    <div style={subStyle}>{line.itemCode}</div>
                    {state === "already_received" && line.receiptLpNumber ? (
                      <div style={{ ...subStyle, marginTop: 4, color: T.mute }}>{line.receiptLpNumber}</div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: done ? T.green : T.amber, fontWeight: 900 }}>{line.receivedQty}</div>
                    <div style={{ color: T.mute, fontSize: 11 }}>/ {line.qty} {line.uom}</div>
                  </div>
                  <span style={{ color: T.hint, fontSize: 24 }} aria-hidden="true">›</span>
                </button>
              );
            })}
          </>
        )}
      </Content>
    </ScannerScreen>
  );
}

const cardStyle = {
  margin: 16,
  padding: 14,
  borderRadius: 8,
  background: T.surf,
  border: `1px solid ${T.elev}`,
} as const;

const sectionTitleStyle = {
  padding: "4px 16px 8px",
  color: T.hint,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
} as const;
