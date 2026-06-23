"use client";

// ============================================================
// SCN-inquiry — LP info (Lane K2)
//
// Parity: prototypes/scanner/flow-other.jsx:448-495 (InquiryScreen)
//   scan/enter LP code → MiniGrid LP card (product, qty, batch, expiry,
//   location, status, QA) + a genealogy section + back-to-menu. The prototype
//   stubbed history as a P2 placeholder; the lane-C3 contract now returns full
//   fields incl. reserved/available split, warehouse, lastMoveAt and real
//   parent/child genealogy — surfaced as plain LP-number lists per the task.
//
// Five states: loading (lookup in flight), empty (initial prompt — nothing
// scanned yet), error (network/500), permission-denied (401/403 → ../login),
// not-found (404 inline error). "Scan next" resets to the prompt.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  BottomActions,
  Content,
  MiniGrid,
  ScanInputArea,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../_components/scanner-session";
import type { ScannerLabels } from "../../../_components/scanner-labels";
import type { LpInfo, LpInfoResponse } from "./types";

type Phase = "prompt" | "loading" | "ready" | "notfound" | "error" | "denied";

export function LpInfoScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const L = labels.lpInfoScreen;

  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("prompt");
  const [lp, setLp] = useState<LpInfo | null>(null);

  // session gate — redirect once hydrated with no session
  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const lookup = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      setPhase("loading");
      setLp(null);
      try {
        const res = await scannerFetch(
          `/api/warehouse/scanner/lp?code=${encodeURIComponent(value)}`,
          undefined,
          { method: "GET", namespace: "absolute" },
        );
        if (res.status === 401 || res.status === 403) {
          setPhase("denied");
          return;
        }
        if (res.status === 404) {
          setPhase("notfound");
          return;
        }
        const body = (await res.json()) as LpInfoResponse;
        if (!res.ok || !body.lp) {
          setPhase("error");
          return;
        }
        setLp(body.lp);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    },
    [scannerFetch],
  );

  const scanNext = () => {
    setCode("");
    setLp(null);
    setPhase("prompt");
  };

  const expired = lp?.expiryDate ? isPast(lp.expiryDate) : false;

  return (
    <ScannerScreen>
      <Topbar
        title={L.title}
        onBack={() => router.push(`/${locale}/scanner/home`)}
        labels={labels.topbar}
      />
      <Content>
        <ScanInputArea
          label={L.scanLabel}
          placeholder={L.scanPlaceholder}
          hint={L.scanHint}
          value={code}
          onChange={setCode}
          onSubmit={(v) => void lookup(v)}
          state={phase === "notfound" || phase === "error" ? "err" : "idle"}
          labels={labels.scanTools}
        />

        {phase === "prompt" && (
          <div style={{ padding: "30px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">
              🏷️
            </div>
            <div style={{ color: T.txt, fontWeight: 800 }}>{L.promptTitle}</div>
            <div style={{ marginTop: 6, color: T.mute, fontSize: 13 }}>{L.promptBody}</div>
          </div>
        )}

        {phase === "loading" && (
          <div style={{ padding: 18, color: T.mute, fontSize: 13 }}>{L.loading}</div>
        )}

        {phase === "notfound" && (
          <Banner kind="err" title={L.notFound}>
            {L.notFound}
          </Banner>
        )}

        {phase === "error" && (
          <Banner kind="err" title={L.errorLoad}>
            {L.errorLoad}
          </Banner>
        )}

        {phase === "denied" && (
          <Banner kind="err" title={L.permissionDenied}>
            {L.permissionDenied}
          </Banner>
        )}

        {phase === "ready" && lp && (
          <>
            <div style={{ padding: "14px 16px 6px" }}>
              <div style={lpNumStyle}>{lp.lpNumber}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <Badge kind="status" label={L.statusValues[lp.status] ?? lp.status} />
                <Badge kind="qa" label={L.qaValues[lp.qaStatus] ?? lp.qaStatus} />
                {expired && <Badge kind="expired" label={L.expiryPast} />}
              </div>
            </div>

            <MiniGrid
              rows={[
                [
                  { label: L.product, value: `${lp.productCode} · ${lp.productName}` },
                ],
                [
                  { label: L.quantity, value: `${lp.quantity} ${lp.uom}` },
                  { label: L.batch, value: lp.batchNumber || "—" },
                ],
                [
                  { label: L.reserved, value: `${lp.reservedQty} ${lp.uom}` },
                  { label: L.available, value: `${lp.availableQty} ${lp.uom}` },
                ],
                [
                  {
                    label: L.expiry,
                    value: lp.expiryDate ? (
                      <span style={{ color: expired ? T.red : T.txt }}>{lp.expiryDate}</span>
                    ) : (
                      "—"
                    ),
                  },
                  { label: L.lastMove, value: lp.lastMoveAt ? formatDateTime(lp.lastMoveAt) : "—" },
                ],
                [
                  { label: L.location, value: lp.locationCode || "—" },
                  { label: L.warehouse, value: lp.warehouseCode || "—" },
                ],
              ]}
            />

            <div style={sectionTitleStyle}>{L.genealogyTitle}</div>
            <div style={{ padding: "0 16px 8px" }}>
              <div style={genLabelStyle}>{L.parents}</div>
              {lp.parents.length === 0 ? (
                <div style={genEmptyStyle}>{L.noParents}</div>
              ) : (
                lp.parents.map((p) => (
                  <div key={p.id} style={genItemStyle}>
                    <span aria-hidden="true" style={{ color: T.hint }}>
                      ↑
                    </span>{" "}
                    {p.lpNumber}
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "0 16px 12px" }}>
              <div style={genLabelStyle}>{L.children}</div>
              {lp.children.length === 0 ? (
                <div style={genEmptyStyle}>{L.noChildren}</div>
              ) : (
                lp.children.map((c) => (
                  <div key={c.id} style={genItemStyle}>
                    <span aria-hidden="true" style={{ color: T.hint }}>
                      ↓
                    </span>{" "}
                    {c.lpNumber}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Content>
      <BottomActions>
        {phase === "ready" || phase === "notfound" || phase === "error" ? (
          <Btn variant="p" onClick={scanNext}>
            {L.scanNext}
          </Btn>
        ) : null}
        <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/home`)}>
          {L.backToMenu}
        </Btn>
      </BottomActions>
    </ScannerScreen>
  );
}

// --- helpers ---
function isPast(dateStr: string): boolean {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return false;
  // compare at day granularity to avoid clock-of-day false positives
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return t < today.getTime();
}

function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toISOString().slice(0, 16).replace("T", " ");
}

function Badge({ kind, label }: { kind: "status" | "qa" | "expired"; label: string }) {
  const palette =
    kind === "expired"
      ? { bg: "#3b1212", fg: T.red }
      : kind === "qa"
        ? { bg: "#3b2f0b", fg: T.amber }
        : { bg: "#0e2333", fg: T.blue2 };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
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

const lpNumStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontSize: 20,
  fontWeight: 800,
  color: T.txt,
} as const;

const sectionTitleStyle = {
  padding: "14px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const genLabelStyle = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: T.hint,
  marginBottom: 4,
} as const;

const genItemStyle = {
  fontFamily: "'Courier New', monospace",
  fontSize: 13,
  fontWeight: 700,
  color: T.txt2,
  padding: "3px 0",
} as const;

const genEmptyStyle = { fontSize: 12, color: T.mute, padding: "2px 0" } as const;
