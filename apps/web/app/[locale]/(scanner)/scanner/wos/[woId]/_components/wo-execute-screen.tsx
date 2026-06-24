"use client";

// ============================================================
// SCN-081 — WO Execute hub
// Parity: prototypes/scanner/flow-consume.jsx:122-212 (WoExecuteScreen) +
// the header/meta block of WoDetailScreen:55-120.
//
// Header (WO, product, status, progress produced/planned in the entered unit
// + base kg), big action tiles (Consume / Register output / Waste), materials
// list with required/consumed/uom + per-material progress bar.
//
// Five states: loading, empty (no materials), error, permission-denied
// (401 → login redirect), optimistic (n/a — read hub; mutations live on the
// sub-screens). Allergen gate banner when the API flags it.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../components/shell/scanner-primitives";
import { useScannerSession } from "../../../../_components/scanner-session";
import type { ScannerLabels } from "../../../../_components/scanner-labels";
import type { ScannerProdLabels } from "../../../../_components/scanner-prod-labels";
import { StatusChip, statusLabel } from "../../_components/status-chip";
import { useWoFetch } from "../../_components/use-wo-fetch";
import type { ApiError, WoDetailResponse, WoHeader, WoMaterial } from "../../_components/wo-types";
import { toBaseQty, type OutputUom } from "../../../../../../../lib/uom/convert";

type LoadState = "loading" | "ready" | "error" | "notfound";
type LaborState = "clocked_in" | "clocked_out";
type LaborAction = "in" | "out";
type LaborResponse = { ok?: true; state: LaborState; since?: string } | { ok: false; error: string };

export function WoExecuteScreen({
  locale,
  woId,
  shellLabels,
  labels,
}: {
  locale: string;
  woId: string;
  shellLabels: ScannerLabels;
  labels: ScannerProdLabels;
}) {
  const router = useRouter();
  const { session, ready, scannerFetch } = useScannerSession();
  const { woFetch, woPost } = useWoFetch();
  const L = labels.execute;
  const laborLabels = shellLabels.labor;

  const [state, setState] = useState<LoadState>("loading");
  const [header, setHeader] = useState<WoHeader | null>(null);
  const [materials, setMaterials] = useState<WoMaterial[]>([]);
  const [allergenGate, setAllergenGate] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [laborState, setLaborState] = useState<LaborState>("clocked_out");
  const [laborSince, setLaborSince] = useState<string | null>(null);
  const [laborKnown, setLaborKnown] = useState(false);
  const [laborLoading, setLaborLoading] = useState(true);
  const [laborBusy, setLaborBusy] = useState<LaborAction | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const load = useCallback(async () => {
    if (!ready) return;
    setState("loading");
    const res = await woFetch(`/api/production/scanner/wos/${woId}`);
    if (!res) return;
    if (res.status === 404) {
      setState("notfound");
      return;
    }
    if (!res.ok) {
      setState("error");
      return;
    }
    const data = (await res.json()) as WoDetailResponse;
    if (!data.ok) {
      setState("error");
      return;
    }
    setHeader(data.header);
    setMaterials([...(data.materials ?? [])].sort((a, b) => a.sequence - b.sequence));
    setAllergenGate(!!data.allergenGate);
    setState("ready");
  }, [ready, woFetch, woId]);

  const didLoad = useRef(false);
  useEffect(() => {
    if (!ready || didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [ready, load]);

  useEffect(() => {
    if (!ready || !session) return;
    let cancelled = false;

    const hydrateLabor = async () => {
      setLaborKnown(false);
      setLaborLoading(true);
      setLaborSince(null);
      try {
        const query = new URLSearchParams({ woId }).toString();
        const res = await scannerFetch(`labor?${query}`, undefined, { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as LaborResponse;
        if ("ok" in data && data.ok === false) return;
        if (data.state !== "clocked_in" && data.state !== "clocked_out") return;
        if (cancelled) return;
        setLaborState(data.state);
        setLaborSince(data.state === "clocked_in" ? data.since ?? null : null);
        setLaborKnown(true);
      } catch {
        /* keep labor controls disabled until state can be confirmed */
      } finally {
        if (!cancelled) setLaborLoading(false);
      }
    };

    void hydrateLabor();
    return () => {
      cancelled = true;
    };
  }, [ready, session, scannerFetch, woId]);

  const go = (sub: string) => router.push(`/${locale}/scanner/wos/${woId}/${sub}`);

  // released/planned = no execution yet: Consume/Output/Waste stay locked until
  // the operator starts the WO (POST …/start wraps lib/production/start-wo).
  const notStarted = header?.status === "released" || header?.status === "planned";

  const clockLabor = async (action: LaborAction) => {
    if (laborBusy || !laborKnown) return;
    const previous = laborState;
    const previousSince = laborSince;
    const optimistic: LaborState = action === "in" ? "clocked_in" : "clocked_out";
    const optimisticSince = action === "in" ? new Date().toISOString() : null;
    setLaborState(optimistic);
    setLaborSince(optimisticSince);
    setLaborBusy(action);
    try {
      const res = await scannerFetch("labor", { action, woId, lineId: session?.lineId ?? undefined });
      if (!res.ok) {
        setLaborState(previous);
        setLaborSince(previousSince);
        return;
      }
      const data = (await res.json()) as LaborResponse;
      if (data.ok) {
        setLaborState(data.state);
        setLaborSince(data.state === "clocked_in" ? data.since ?? optimisticSince ?? previousSince : null);
      } else {
        setLaborState(previous);
        setLaborSince(previousSince);
      }
    } catch {
      setLaborState(previous);
      setLaborSince(previousSince);
    } finally {
      setLaborBusy(null);
    }
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setStartErr(null);
    try {
      const res = await woPost(`/api/production/scanner/wos/${woId}/start`, {
        clientOpId: crypto.randomUUID(),
      });
      if (!res) return; // 401 → redirect handled in woPost
      if (res.ok) {
        await load();
        return;
      }
      let code: string | null = null;
      try {
        const data = (await res.json()) as ApiError | { ok: true };
        code = !data.ok ? data.error : null;
      } catch {
        /* non-JSON error body */
      }
      setStartErr(
        code === "wo_not_recordable"
          ? labels.errors.wo_not_recordable
          : code === "changeover_signoff_required"
            ? labels.errors.changeover_signoff_required
            : L.startError,
      );
    } catch {
      setStartErr(L.startError);
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScannerScreen>
      <Topbar
        title={header ? `${header.woNumber} · ${L.titleSuffix}` : L.titleSuffix}
        onBack={() => router.push(`/${locale}/scanner/wos`)}
        labels={shellLabels.topbar}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
        {state === "loading" && (
          <div style={{ padding: 24, textAlign: "center", color: T.mute }}>{L.loading}</div>
        )}

        {state === "notfound" && (
          <Banner kind="err" title={L.notFound}>
            {" "}
          </Banner>
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

        {state === "ready" && header && (
          <>
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={woNumStyle}>{header.woNumber}</div>
                  <div style={{ fontSize: 13, color: T.txt2, marginTop: 2 }}>{header.productName}</div>
                  <div style={{ marginTop: 8 }}>
                    <StatusChip status={header.status} label={statusLabel(header.status, labels)} />
                  </div>
                </div>
              </div>
              <div style={metaGridStyle}>
                <Meta label={L.target} value={`${header.plannedQty} ${enteredUom(header, labels)}`} color={T.blue2} />
                <Meta label={L.produced} value={producedText(header, labels)} color={T.green} />
              </div>
            </div>

            <div style={{ padding: "4px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.mute }}>
                <span>{L.progress}</span>
                <span style={{ color: T.green, fontWeight: 700 }}>{progressPct(header)}%</span>
              </div>
            </div>
            <div style={{ margin: "4px 16px 12px", height: 6, borderRadius: 999, background: T.elev }}>
              <div
                style={{
                  width: `${progressPct(header)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: T.green,
                }}
              />
            </div>

            {allergenGate && (
              <Banner kind="warn" title={L.allergenTitle}>
                {L.allergenBody}
              </Banner>
            )}

            <div style={laborPanelStyle}>
              <div style={laborStatusStyle(laborState, laborKnown)} aria-busy={laborLoading}>
                {laborLoading
                  ? shellLabels.loading
                  : laborKnown
                    ? laborStatusText(laborState, laborSince, laborLabels, locale)
                    : L.error}
              </div>
              <div style={laborButtonGridStyle}>
                <Btn
                  variant="p"
                  onClick={() => void clockLabor("in")}
                  disabled={!laborKnown || laborBusy !== null || laborState === "clocked_in"}
                  style={{ minHeight: 56, fontSize: 16 }}
                >
                  {laborLabels.clockIn}
                </Btn>
                <Btn
                  variant="sec"
                  onClick={() => void clockLabor("out")}
                  disabled={!laborKnown || laborBusy !== null || laborState === "clocked_out"}
                  style={{ minHeight: 56, fontSize: 16 }}
                >
                  {laborLabels.clockOut}
                </Btn>
              </div>
            </div>

            {notStarted && (
              <div style={{ display: "grid", gap: 6, padding: "4px 16px 8px" }}>
                <Btn
                  variant="p"
                  onClick={() => void start()}
                  disabled={starting}
                  style={{ minHeight: 56, fontSize: 16 }}
                >
                  {L.startButton}
                </Btn>
                <div style={{ fontSize: 12, color: T.mute, textAlign: "center" }}>{L.startHint}</div>
              </div>
            )}

            {startErr && (
              <Banner kind="err" title={startErr}>
                {" "}
              </Banner>
            )}

            <div style={{ display: "grid", gap: 8, padding: "4px 16px" }}>
              <ActionTile icon="📥" title={L.tileConsume} desc={L.tileConsumeDesc} onClick={() => go("consume")} disabled={notStarted} />
              <ActionTile icon="📤" title={L.tileOutput} desc={L.tileOutputDesc} onClick={() => go("output")} variant="green" disabled={notStarted} />
              <ActionTile icon="🗑" title={L.tileWaste} desc={L.tileWasteDesc} onClick={() => go("waste")} variant="amber" disabled={notStarted} />
              {/* SCN reverse-consume — undo a recorded material consumption (operator PIN
                  always + supervisor PIN when the org flag requires it). Same start gate
                  as Consume: a consumption can only exist after the WO is running. */}
              <ActionTile icon="↩" title={L.tileReverse} desc={L.tileReverseDesc} onClick={() => go("reverse-consume")} variant="amber" disabled={notStarted} />
            </div>

            <div style={sectionTitleStyle}>{L.materialsTitle}</div>
            {materials.length === 0 && (
              <div style={{ padding: "8px 16px", color: T.mute, fontSize: 13 }}>{L.materialsEmpty}</div>
            )}
            {materials.map((m) => {
              // decimal strings on the wire; parse only for display math.
              const required = parseFloat(m.requiredQty);
              const consumed = parseFloat(m.consumedQty);
              const pct =
                Number.isFinite(required) && required > 0 && Number.isFinite(consumed)
                  ? Math.min(100, (consumed / required) * 100)
                  : 0;
              const done = Number.isFinite(consumed) && Number.isFinite(required) && consumed >= required;
              return (
                <div key={m.id} style={materialRowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: T.txt }}>{m.materialName}</div>
                    <div style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>
                      {m.consumedQty} {L.consumed} · {m.requiredQty} {m.uom} {L.required}
                    </div>
                    <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: T.elev }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: done ? T.green : T.blue,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: done ? T.green : T.elev }}>{m.consumedQty}</div>
                    <div style={{ fontSize: 10, color: T.hint }}>
                      / {m.requiredQty} {m.uom}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </ScannerScreen>
  );
}

function Meta({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: T.hint }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ActionTile({
  icon,
  title,
  desc,
  onClick,
  variant = "blue",
  disabled = false,
}: {
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
  variant?: "blue" | "green" | "amber";
  disabled?: boolean;
}) {
  const accent = variant === "green" ? T.green : variant === "amber" ? T.amber : T.blue;
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={tileStyle(accent, disabled)}>
      <div style={{ ...tileIconStyle, color: accent }} aria-hidden="true">
        {icon}
      </div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontWeight: 700, color: T.txt }}>{title}</div>
        <div style={{ fontSize: 12, color: T.mute }}>{desc}</div>
      </div>
      <span aria-hidden="true" style={{ color: T.hint }}>
        ›
      </span>
    </button>
  );
}

function enteredUom(h: WoHeader, labels: ScannerProdLabels): string {
  return h.qtyEnteredUom ?? labels.output.unitBase;
}

// HONEST produced: what wo_outputs actually recorded — units in the entered
// unit when tracked ("0 box · 0 kg"), else base kg only. Decimal STRINGS are
// rendered as-is; no display rounding of the wire values.
function producedText(h: WoHeader, labels: ScannerProdLabels): string {
  if (h.qtyEnteredUom && h.producedUnits != null) {
    return `${h.producedUnits} ${h.qtyEnteredUom} · ${h.producedBaseKg} ${labels.output.unitBase}`;
  }
  return `${h.producedBaseKg} ${labels.output.unitBase}`;
}

// HONEST progress = produced/planned (never planned/planned):
//   1. base-kg produced vs base-kg planned when the uom snapshot can convert
//      the entered qty to kg;
//   2. else producedUnits vs qtyEntered (same entered unit);
//   3. else base-kg produced vs plannedQty (base-unit WOs).
// 0 when nothing was produced or no positive denominator exists.
function progressPct(h: WoHeader): number {
  const producedKg = parseFloat(h.producedBaseKg);

  if (h.qtyEntered != null && h.qtyEnteredUom && h.qtyEnteredUom !== "base") {
    const entered = parseFloat(h.qtyEntered);
    if (h.uomSnapshot && Number.isFinite(entered)) {
      try {
        const plannedKg = toBaseQty(h.uomSnapshot, entered, h.qtyEnteredUom as OutputUom);
        if (Number.isFinite(producedKg) && plannedKg > 0) {
          return clampPct(producedKg / plannedKg);
        }
      } catch {
        /* conversion unavailable → fall back to units */
      }
    }
    const producedUnits = h.producedUnits != null ? parseFloat(h.producedUnits) : NaN;
    if (Number.isFinite(producedUnits) && Number.isFinite(entered) && entered > 0) {
      return clampPct(producedUnits / entered);
    }
    return 0;
  }

  const plannedKg = parseFloat(h.plannedQty);
  if (!Number.isFinite(producedKg) || !Number.isFinite(plannedKg) || plannedKg <= 0) return 0;
  return clampPct(producedKg / plannedKg);
}

function clampPct(ratio: number): number {
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

function laborStatusText(
  state: LaborState,
  since: string | null,
  labels: ScannerLabels["labor"],
  locale: string,
): string {
  const base = state === "clocked_in" ? labels.clockedIn : labels.clockedOut;
  if (state !== "clocked_in" || !since) return base;
  const started = new Date(since);
  if (Number.isNaN(started.getTime())) return base;
  return `${base} · ${started.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

const cardStyle = {
  margin: "8px 16px",
  padding: 14,
  borderRadius: 14,
  border: `1px solid ${T.elev}`,
  background: T.surf,
} as const;

const woNumStyle = {
  fontFamily: "'Courier New', monospace",
  letterSpacing: 0.5,
  fontWeight: 700,
  fontSize: 16,
  color: T.txt,
} as const;

const metaGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 12,
} as const;

const laborPanelStyle = {
  display: "grid",
  gap: 8,
  margin: "4px 16px 8px",
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${T.sep}`,
  background: T.surf,
} as const;

const laborButtonGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
} as const;

function laborStatusStyle(state: LaborState, known: boolean) {
  const active = known && state === "clocked_in";
  return {
    justifySelf: "start",
    borderRadius: 999,
    padding: "5px 10px",
    background: active ? "rgba(34, 197, 94, 0.16)" : T.bg,
    color: active ? T.green : T.mute,
    fontSize: 12,
    fontWeight: 800,
  } as const;
}

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const materialRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "0 16px 8px",
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${T.sep}`,
  background: T.surf,
} as const;

function tileStyle(accent: string, disabled = false) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${disabled ? T.elev : accent}`,
    background: T.surf,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  } as const;
}

const tileIconStyle = {
  width: 44,
  height: 44,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: T.bg,
  fontSize: 22,
} as const;
