"use client";

// ============================================================
// SCN-082 — Register output (finished goods)
// Parity: prototypes/scanner/flow-register.jsx:6-121 (OutputScreen) +
// 123-150 (OutputDoneScreen). UoM model: qty in the WO's output unit (from
// uomSnapshot — "box" / "each" / base), optional actual weight (kg), optional
// batch, conversion line "2 box = 2.000 kg" via lib/uom/convert. POST sends
// DECIMAL STRINGS (qtyUnits + unitsUom for each/box, qtyKg for base; plus
// actualWeightKg + batchNumber when present).
//
// Five states: loading, empty (n/a — single form), error, permission-denied
// (401 → login redirect), optimistic (submit disabled + "Saving…" while in
// flight; clientOpId held until success).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Banner,
  Btn,
  BottomActions,
  Content,
  ScannerScreen,
  Topbar,
  scannerTokens as T,
} from "../../../../../../../../components/shell/scanner-primitives";
import { QtyKeypadSheet } from "../../../../../_components/scanner-modals";
import { useScannerSession } from "../../../../../_components/scanner-session";
import type { ScannerLabels } from "../../../../../_components/scanner-labels";
import type { ScannerProdLabels } from "../../../../../_components/scanner-prod-labels";
import { useWoFetch } from "../../../_components/use-wo-fetch";
import type {
  MutationResult,
  OutputPayload,
  OutputUom,
  WoDetailResponse,
  WoHeader,
} from "../../../_components/wo-types";
import { toBaseQty, TypedError, type UomSnapshot } from "../../../../../../../../lib/uom/convert";

type Phase = "loading" | "form" | "done" | "error";

export function OutputScreen({
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
  const { session, ready } = useScannerSession();
  const { woFetch, woPost } = useWoFetch();
  const L = labels.output;

  const [phase, setPhase] = useState<Phase>("loading");
  const [header, setHeader] = useState<WoHeader | null>(null);
  // SOFT-warning (owner decision — warn, never block): TRUE when the WO has BOM
  // materials but none of them shows any recorded consumption yet. Derived from
  // the already-loaded detail `materials` (no extra round-trip / no API change);
  // registering an output now leaves the resulting LP with no genealogy parent.
  const [noConsumption, setNoConsumption] = useState(false);
  // Single-click acknowledgement for the non-blocking notice on the form.
  const [noConsumptionAck, setNoConsumptionAck] = useState(false);
  const [qty, setQty] = useState("");
  const [weight, setWeight] = useState("");
  const [batch, setBatch] = useState("");
  const [showQtyKeypad, setShowQtyKeypad] = useState(false);
  const [showWeightKeypad, setShowWeightKeypad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const load = useCallback(async () => {
    if (!ready) return;
    setPhase("loading");
    const res = await woFetch(`/api/production/scanner/wos/${woId}`);
    if (!res) return;
    if (!res.ok) {
      setPhase("error");
      return;
    }
    const data = (await res.json()) as WoDetailResponse;
    if (!data.ok) {
      setPhase("error");
      return;
    }
    setHeader(data.header);
    // Derive the no-consumption soft-warning state from the loaded BOM materials:
    // every material at 0 consumed ⇒ nothing recorded against this WO yet. With
    // no materials at all we can't assert it, so we stay silent (no false alarm).
    setNoConsumption(
      data.materials.length > 0 &&
        data.materials.every((m) => Number(m.consumedQty) <= 0),
    );
    setNoConsumptionAck(false);
    setPhase("form");
  }, [ready, woFetch, woId]);

  // Load the WO detail ONCE per mount (ref guard) so the GET can't re-fire and
  // wipe in-progress form input as the session token settles.
  const didLoad = useRef(false);
  useEffect(() => {
    if (!ready || didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [ready, load]);

  const snap = header?.uomSnapshot ?? null;
  // The output unit: from uomSnapshot — "box" / "each" / base.
  const outputUom: OutputUom = snap?.outputUom ?? "base";
  const unitLabel = unitLabelFor(outputUom, labels);

  // conversion line "2 box = 2.000 kg" — null when conversion unavailable.
  const conversion = useMemo(() => {
    if (!qty || Number(qty) <= 0) return null;
    if (outputUom === "base" || !snap) return null;
    try {
      const kg = toBaseQty(snap as UomSnapshot, Number(qty), outputUom);
      return L.conversion
        .replace("{qty}", qty)
        .replace("{unit}", unitLabel)
        .replace("{kg}", kg.toFixed(3));
    } catch (e) {
      if (e instanceof TypedError) return L.conversionUnavailable;
      return null;
    }
  }, [qty, outputUom, snap, unitLabel, L]);

  const confirm = async () => {
    if (!qty || Number(qty) <= 0 || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);

    // Build the payload with DECIMAL STRINGS. For each/box send qtyUnits +
    // unitsUom; for base send qtyKg. Optional actualWeightKg + batchNumber.
    const payload: OutputPayload = { clientOpId: opId };
    if (outputUom === "base") {
      payload.qtyKg = String(qty);
    } else {
      payload.qtyUnits = String(qty);
      payload.unitsUom = outputUom;
    }
    if (weight && Number(weight) > 0) payload.actualWeightKg = String(weight);
    if (batch.trim()) payload.batchNumber = batch.trim();

    try {
      const res = await woPost(`/api/production/scanner/wos/${woId}/output`, payload);
      if (!res) return;
      if (res.status === 422) {
        setSubmitErr(L.err422);
        return;
      }
      if (res.status === 409) {
        setSubmitErr(L.err409);
        return;
      }
      const data = (await res.json()) as MutationResult;
      if (!res.ok || !data.ok) {
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

  const registerNext = () => {
    setQty("");
    setWeight("");
    setBatch("");
    setSubmitErr(null);
    setClientOpId(null);
    setPhase("form");
    void load();
  };

  return (
    <ScannerScreen>
      <Topbar
        title={phase === "done" ? L.doneTitle : L.title}
        onBack={() => router.push(`/${locale}/scanner/wos/${woId}`)}
        syncState="online"
        labels={shellLabels.topbar}
      />

      {phase === "done" ? (
        <>
          <Content>
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div aria-hidden="true" style={{ fontSize: 56, color: T.green }}>
                ✅
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.txt, marginTop: 8 }}>
                {L.doneTitle}
              </div>
              <div style={{ fontSize: 13, color: T.mute, marginTop: 4 }}>{L.doneBody}</div>
              {noConsumption && (
                <div style={{ fontSize: 12, color: T.amber, marginTop: 8 }}>
                  ⚠ {L.noConsumptionDoneNote}
                </div>
              )}
            </div>
          </Content>
          <BottomActions>
            <Btn variant="p" onClick={registerNext}>
              {L.registerNext}
            </Btn>
            <Btn variant="sec" onClick={() => router.push(`/${locale}/scanner/wos/${woId}`)}>
              {L.backToWo}
            </Btn>
          </BottomActions>
        </>
      ) : (
        <>
          <Content>
            {phase === "loading" && (
              <div style={{ padding: 24, textAlign: "center", color: T.mute }}>{labels.loading}</div>
            )}

            {phase === "error" && (
              <>
                <Banner kind="err" title={L.errGeneric}>
                  {" "}
                </Banner>
                <div style={{ padding: "0 16px" }}>
                  <Btn variant="sec" onClick={() => void load()}>
                    {labels.list.retry}
                  </Btn>
                </div>
              </>
            )}

            {phase === "form" && header && (
              <>
                {noConsumption && (
                  <Banner kind="warn" title={L.noConsumptionTitle}>
                    <div>{L.noConsumptionBody}</div>
                    {!noConsumptionAck && (
                      <button
                        type="button"
                        onClick={() => setNoConsumptionAck(true)}
                        style={continueBtnStyle}
                      >
                        {L.noConsumptionContinue}
                      </button>
                    )}
                  </Banner>
                )}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={fieldLabelStyle}>
                    {L.qtyLabel} <span style={{ color: T.red }}>*</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQtyKeypad(true)}
                    aria-label={L.enterQty}
                    style={qtyFieldStyle}
                  >
                    <span>{qty || "0"}</span>
                    <span style={{ fontSize: 14, color: T.mute, fontWeight: 400 }}>{unitLabel}</span>
                  </button>
                  <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.qtyHint}</div>
                  {conversion && (
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: T.blue2 }}>
                      {conversion}
                    </div>
                  )}
                </div>

                <div style={{ padding: "12px 16px 0" }}>
                  <div style={fieldLabelStyle}>{L.weightLabel}</div>
                  <button
                    type="button"
                    onClick={() => setShowWeightKeypad(true)}
                    aria-label={L.enterWeight}
                    style={qtyFieldStyle}
                  >
                    <span>{weight || "0"}</span>
                    <span style={{ fontSize: 14, color: T.mute, fontWeight: 400 }}>{labels.output.unitBase}</span>
                  </button>
                  <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.weightHint}</div>
                </div>

                <div style={{ padding: "12px 16px 0" }}>
                  <div style={fieldLabelStyle}>{L.batchLabel}</div>
                  <input
                    aria-label={L.batchLabel}
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder={L.batchPlaceholder}
                    style={textFieldStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.batchHint}</div>
                </div>

                {submitErr && (
                  <Banner kind="err" title={submitErr}>
                    {" "}
                  </Banner>
                )}
              </>
            )}
          </Content>

          {phase === "form" && (
            <BottomActions>
              <Btn
                variant="p"
                disabled={
                  !qty ||
                  Number(qty) <= 0 ||
                  submitting ||
                  (noConsumption && !noConsumptionAck)
                }
                title={noConsumption && !noConsumptionAck ? L.noConsumptionContinue : undefined}
                onClick={confirm}
              >
                {submitting ? L.submitting : L.confirm}
              </Btn>
            </BottomActions>
          )}
        </>
      )}

      <QtyKeypadSheet
        open={showQtyKeypad}
        onClose={() => setShowQtyKeypad(false)}
        initial={qty}
        uom={unitLabel}
        onConfirm={(v) => setQty(v)}
        labels={shellLabels.qtyKeypad}
      />
      <QtyKeypadSheet
        open={showWeightKeypad}
        onClose={() => setShowWeightKeypad(false)}
        initial={weight}
        uom={labels.output.unitBase}
        onConfirm={(v) => setWeight(v)}
        labels={shellLabels.qtyKeypad}
      />
    </ScannerScreen>
  );
}

function unitLabelFor(uom: OutputUom, labels: ScannerProdLabels): string {
  if (uom === "each") return labels.output.unitEach;
  if (uom === "box") return labels.output.unitBox;
  return labels.output.unitBase;
}

const continueBtnStyle = {
  marginTop: 8,
  borderRadius: 8,
  border: `1px solid ${T.amber}`,
  background: "transparent",
  color: T.amber,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const fieldLabelStyle = {
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const qtyFieldStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  height: 56,
  borderRadius: 12,
  border: `2px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: "0 14px",
  fontSize: 22,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const textFieldStyle = {
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
