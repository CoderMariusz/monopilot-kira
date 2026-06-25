"use client";

// ============================================================
// SCN-ship — Pack FG license plates into a Sales Order's shipment.
// FEAT-2 / map dead-end #13: the scanner could pick for WOs but never pack
// finished goods into a Sales Order. Two phases:
//   list → GET  /api/warehouse/scanner/ship/shipments  (open 'packing' shipments)
//   scan → POST /api/warehouse/scanner/ship { shipmentId, lpId }  (pack one LP)
// The pack POST reuses packLpIntoBoxCore — same allocation + food-safety guard
// (hold / QA / expiry) as the desktop pack — so a held/expired/unreleased or
// not-allocated LP is rejected with a clear banner, no client-trusted gate.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  BottomActions,
  Btn,
  Content,
  ScanInputArea,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { CameraScannerOverlay } from "../../../../../../components/shell/camera-scanner-overlay";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";

type ShipmentOption = {
  id: string;
  shipmentNumber: string;
  salesOrderNumber: string | null;
  customerName: string | null;
  boxCount: number;
  packedLpCount: number;
};

type ListState = "loading" | "ready" | "empty" | "error";
type Phase = "list" | "scan";

const PACK_ERROR_KEYS: Record<string, keyof ScannerLabels["shipScreen"]> = {
  lp_blocked_for_pack: "errBlocked",
  lp_not_allocated: "errNotAllocated",
  lp_not_found: "errLpNotFound",
  already_packed: "errAlreadyPacked",
  invalid_state: "errInvalidState",
  forbidden: "permissionDenied",
};

export function ShipScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const L = labels.shipScreen;

  const [phase, setPhase] = useState<Phase>("list");
  const [listState, setListState] = useState<ListState>("loading");
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);
  const [selected, setSelected] = useState<ShipmentOption | null>(null);

  const [scanVal, setScanVal] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanState, setScanState] = useState<"idle" | "err" | "ok">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [packedCount, setPackedCount] = useState(0);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const loadShipments = useCallback(async () => {
    setListState("loading");
    try {
      const res = await scannerFetch("/api/warehouse/scanner/ship/shipments", undefined, {
        method: "GET",
        namespace: "absolute",
      });
      if (res.status === 401 || res.status === 403) {
        setListState("error");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { shipments?: ShipmentOption[] };
      const list = body.shipments ?? [];
      setShipments(list);
      setListState(list.length ? "ready" : "empty");
    } catch {
      setListState("error");
    }
  }, [scannerFetch]);

  useEffect(() => {
    if (ready && session && phase === "list") void loadShipments();
  }, [ready, session, phase, loadShipments]);

  const selectShipment = (s: ShipmentOption) => {
    setSelected(s);
    setPackedCount(0);
    setLastError(null);
    setLastSuccess(null);
    setScanVal("");
    setScanState("idle");
    setPhase("scan");
  };

  const backToList = () => {
    setSelected(null);
    setPhase("list");
  };

  const packLp = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !selected || submitting) return;
      setSubmitting(true);
      setLastError(null);
      setLastSuccess(null);
      try {
        const res = await scannerFetch(
          "/api/warehouse/scanner/ship",
          { clientOpId: crypto.randomUUID(), shipmentId: selected.id, lpId: code },
          { namespace: "absolute" },
        );
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || body.ok === false) {
          const key = (body.error && PACK_ERROR_KEYS[body.error]) || "errGeneric";
          setLastError(L[key]);
          setScanState("err");
          setScanVal("");
          return;
        }
        setPackedCount((n) => n + 1);
        setLastSuccess(`${L.packed}: ${code}`);
        setScanState("ok");
        setScanVal("");
      } catch {
        setLastError(L.errGeneric);
        setScanState("err");
      } finally {
        setSubmitting(false);
      }
    },
    [scannerFetch, selected, submitting, L],
  );

  return (
    <ScannerScreen>
      <Topbar
        title={phase === "scan" ? L.title : L.listTitle}
        onBack={phase === "scan" ? backToList : () => router.push(`/${locale}/scanner/home`)}
        labels={labels.topbar}
      />
      <CameraScannerOverlay
        open={cameraOpen}
        onDecode={(scanned) => {
          setCameraOpen(false);
          setScanVal(scanned);
          void packLp(scanned);
        }}
        onCancel={() => setCameraOpen(false)}
        labels={labels.cameraScanner}
      />

      {phase === "list" ? (
        <>
          <Content>
            <div style={promptStyle}>{L.selectPrompt}</div>
            {listState === "loading" && <StateText>{L.loadingList}</StateText>}
            {listState === "error" && (
              <Banner kind="err" title={L.errorLoad}>
                {" "}
              </Banner>
            )}
            {listState === "empty" && (
              <div style={emptyWrap}>
                <div style={{ fontSize: 40 }} aria-hidden="true">
                  📭
                </div>
                <div style={{ color: T.txt, fontWeight: 800, marginTop: 6 }}>{L.emptyTitle}</div>
                <div style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>{L.emptyBody}</div>
              </div>
            )}
            {listState === "ready" &&
              shipments.map((s) => (
                <button key={s.id} type="button" onClick={() => selectShipment(s)} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontWeight: 800, color: T.txt }}>{s.shipmentNumber}</div>
                    <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                      {L.soLabel}: {s.salesOrderNumber || "—"} · {s.customerName || L.noCustomer}
                    </div>
                    <div style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>
                      {L.boxes}: {s.boxCount} · {L.packedSoFar}: {s.packedLpCount}
                    </div>
                  </div>
                  <span style={{ color: T.hint }} aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
          </Content>
          <BottomActions>
            <Btn variant="sec" onClick={() => void loadShipments()}>
              {L.retry}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <>
          <Content>
            {selected && (
              <div style={headerCard}>
                <div style={{ fontWeight: 800, color: T.txt }}>{selected.shipmentNumber}</div>
                <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                  {L.soLabel}: {selected.salesOrderNumber || "—"} · {selected.customerName || L.noCustomer}
                </div>
                <div style={{ fontSize: 12, color: T.hint, marginTop: 6 }}>
                  {L.packedCountLabel}: <span style={{ color: T.green, fontWeight: 800 }}>{packedCount}</span>
                </div>
              </div>
            )}

            <ScanInputArea
              label={L.scanLabel}
              placeholder={L.scanPlaceholder}
              hint={L.scanHint}
              value={scanVal}
              onChange={(v) => {
                setScanVal(v);
                if (scanState === "err") {
                  setScanState("idle");
                  setLastError(null);
                }
              }}
              onSubmit={(v) => void packLp(v)}
              state={scanState}
              labels={labels.scanTools}
              onOpenCamera={() => setCameraOpen(true)}
            />

            {submitting && <StateText>{L.packed}…</StateText>}
            {lastError && (
              <Banner kind="err" title={lastError}>
                {" "}
              </Banner>
            )}
            {lastSuccess && !lastError && (
              <Banner kind="success" title={lastSuccess}>
                {" "}
              </Banner>
            )}
          </Content>
          <BottomActions>
            <Btn variant="sec" onClick={backToList}>
              {L.backToList}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/home`)}>
              {L.backToMenu}
            </Btn>
          </BottomActions>
        </>
      )}
    </ScannerScreen>
  );
}

function StateText({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 18, color: T.mute, fontSize: 13 }}>{children}</div>;
}

const promptStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "calc(100% - 32px)",
  margin: "0 16px 8px",
  padding: 14,
  borderRadius: 14,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  cursor: "pointer",
} as const;

const headerCard = {
  margin: "12px 16px 4px",
  padding: 14,
  borderRadius: 14,
  border: `1px solid ${T.elev}`,
  background: T.surf,
} as const;

const emptyWrap = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 2,
  padding: "32px 24px",
} as const;
