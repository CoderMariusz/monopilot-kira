"use client";

// ============================================================
// SCN-080 — WO list
// Parity: prototypes/scanner/flow-consume.jsx:8-53 (WoListScreen).
//
// Search bar + filter pills (All / My line / Active) + tappable WO rows
// (WO number monospace, product, status chip, qty in the WO's ENTERED unit
// when present else base kg, schedule). Tap → execute hub.
//
// Five states: loading, empty, error, permission-denied (401 → login redirect
// via scannerFetch), optimistic (n/a here — read-only list).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";
import type { ScannerProdLabels } from "../../../_components/scanner-prod-labels";
import { StatusChip, statusLabel } from "./status-chip";
import { useWoFetch } from "./use-wo-fetch";
import type { WoListItem, WoListResponse } from "./wo-types";

type Filter = "all" | "my_line" | "active";
type LoadState = "loading" | "ready" | "empty" | "error";

export function WoListScreen({
  locale,
  shellLabels,
  labels,
}: {
  locale: string;
  shellLabels: ScannerLabels;
  labels: ScannerProdLabels;
}) {
  const router = useRouter();
  const { session, ready } = useScannerSession();
  const { woFetch } = useWoFetch();
  const L = labels.list;

  const [state, setState] = useState<LoadState>("loading");
  const [wos, setWos] = useState<WoListItem[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("my_line");

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const load = useCallback(async () => {
    if (!ready) return;
    setState("loading");
    const res = await woFetch("/api/production/scanner/wos");
    if (!res) return; // 401 → redirect handled in woFetch
    if (!res.ok) {
      setState("error");
      return;
    }
    const data = (await res.json()) as WoListResponse;
    if (!data.ok) {
      setState("error");
      return;
    }
    setWos(data.wos);
    setState(data.wos.length === 0 ? "empty" : "ready");
  }, [ready, woFetch]);

  const didLoad = useRef(false);
  useEffect(() => {
    if (!ready || didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [ready, load]);

  const sessionLineId = session?.lineId ?? null;

  const visible = useMemo(() => {
    let rows = wos;
    // "My line" — only WOs assigned to the scanner session's production line.
    // The list API already scopes to session.line_id when one is set, so this is
    // the client-side guard for sessions with a line (and shows nothing when the
    // session has no line bound — there is no "my line" to match).
    if (filter === "my_line") {
      rows = sessionLineId
        ? rows.filter(
            (w) =>
              w.lineId === sessionLineId || (w.stationOperations?.length ?? 0) > 0,
          )
        : [];
    }
    if (filter === "active") rows = rows.filter((w) => w.status === "inprog");
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((w) =>
        `${w.woNumber} ${w.productName} ${w.itemCode}`.toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [wos, filter, q, sessionLineId]);

  return (
    <ScannerScreen>
      <Topbar
        title={L.title}
        onBack={() => router.push(`/${locale}/scanner/home`)}
        labels={shellLabels.topbar}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
        <div style={{ padding: "8px 16px" }}>
          <input
            aria-label={L.searchPlaceholder}
            placeholder={L.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={searchStyle}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div style={{ display: "flex", gap: 8, padding: "0 16px 4px" }}>
          {([
            ["all", L.filterAll],
            ["my_line", L.filterMyLine],
            ["active", L.filterActive],
          ] as Array<[Filter, string]>).map(([key, txt]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              style={pillStyle(filter === key)}
            >
              {txt}
            </button>
          ))}
        </div>

        {state === "loading" && (
          <div style={{ padding: 24, textAlign: "center", color: T.mute }}>{L.loading}</div>
        )}

        {state === "error" && (
          <>
            <Banner kind="err" title={L.error}>
              {" "}
            </Banner>
            <div style={{ padding: "0 16px" }}>
              <Btn variant="sec" onClick={() => void load()}>
                {L.retry}
              </Btn>
            </div>
          </>
        )}

        {state === "empty" && (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div aria-hidden="true" style={{ fontSize: 40, marginBottom: 8 }}>
              📭
            </div>
            <div style={{ fontWeight: 700, color: T.txt, marginBottom: 4 }}>{L.empty}</div>
            <div style={{ fontSize: 13, color: T.mute }}>{L.emptyBody}</div>
          </div>
        )}

        {state === "ready" &&
          visible.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => router.push(`/${locale}/scanner/wos/${w.id}`)}
              style={rowStyle}
            >
              <div style={rowIconStyle} aria-hidden="true">
                🏭
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={woNumStyle}>{w.woNumber}</div>
                <div style={{ fontSize: 12, color: T.mute }}>{w.productName}</div>
                <div style={{ marginTop: 4 }}>
                  <StatusChip status={w.status} label={statusLabel(w.status, labels)} />
                </div>
                {(w.stationOperations?.length ?? 0) > 0 ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: T.hint }}>
                    {w.stationOperations!.map((op) => op.operationName).join(" · ")}
                  </div>
                ) : null}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: T.green, fontWeight: 700 }}>{qtyText(w, labels)}</div>
                {w.scheduledStart && (
                  <div style={{ fontSize: 10, color: T.hint, marginTop: 4 }}>
                    {formatSchedule(w.scheduledStart)}
                  </div>
                )}
              </div>
              <span aria-hidden="true" style={{ color: T.hint, marginLeft: 6 }}>
                ›
              </span>
            </button>
          ))}
      </div>
    </ScannerScreen>
  );
}

// qty in the WO's ENTERED unit when present ("300 box") else base kg.
function qtyText(w: WoListItem, labels: ScannerProdLabels): string {
  if (w.qtyEntered != null && w.qtyEnteredUom) {
    return `${w.qtyEntered} ${w.qtyEnteredUom} / ${w.plannedQty}`;
  }
  return `${w.plannedQty} ${labels.output.unitBase}`;
}

function formatSchedule(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const searchStyle = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 14px",
  fontSize: 15,
  outline: "none",
} as const;

function pillStyle(on: boolean) {
  return {
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${on ? T.blue : T.elev}`,
    background: on ? "#0e2333" : "transparent",
    color: on ? T.blue2 : T.txt2,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  } as const;
}

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "calc(100% - 32px)",
  margin: "0 16px 8px",
  padding: 12,
  borderRadius: 14,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  cursor: "pointer",
} as const;

const rowIconStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: T.bg,
  fontSize: 20,
} as const;

const woNumStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 700,
  color: T.txt,
} as const;
