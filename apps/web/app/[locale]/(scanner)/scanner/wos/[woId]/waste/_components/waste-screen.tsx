"use client";

// ============================================================
// SCN-084 — Record waste
// Parity: prototypes/scanner/flow-register.jsx:226-315 (WasteScreen +
// WasteDoneScreen). Category list + qty (kg) + reason → POST.
//
// Categories: P1 static code list (SCANNER_WASTE_CATEGORIES). The scanner runs
// on a Bearer session that is not compatible with the desktop org-context
// server actions, and the waste API accepts free category codes — so a small
// static, localized list is the P1 source (deviation logged).
//
// Five states: loading (header), error, permission-denied (401 → login
// redirect), optimistic (submit disabled + "Saving…"; clientOpId held until
// success). No empty state — the category list is static.
// ============================================================

import { useEffect, useState } from "react";
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
import {
  SCANNER_WASTE_CATEGORIES,
  type ScannerProdLabels,
} from "../../../../../_components/scanner-prod-labels";
import { useWoFetch } from "../../../_components/use-wo-fetch";
import type { MutationResult, WastePayload } from "../../../_components/wo-types";

type Phase = "form" | "done";

export function WasteScreen({
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
  const { woPost } = useWoFetch();
  const L = labels.waste;

  const [phase, setPhase] = useState<Phase>("form");
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [clientOpId, setClientOpId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${locale}/scanner/login`);
  }, [ready, session, locale, router]);

  const canSubmit = !!categoryCode && !!qty && Number(qty) > 0 && !submitting;

  const confirm = async () => {
    if (!canSubmit || !categoryCode) return;
    setSubmitting(true);
    setSubmitErr(null);
    const opId = clientOpId ?? crypto.randomUUID();
    setClientOpId(opId);
    const payload: WastePayload = {
      clientOpId: opId,
      categoryCode,
      qtyKg: String(qty),
    };
    if (reason.trim()) payload.reason = reason.trim();
    try {
      const res = await woPost(`/api/production/scanner/wos/${woId}/waste`, payload);
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

  const recordNext = () => {
    setCategoryCode(null);
    setQty("");
    setReason("");
    setSubmitErr(null);
    setClientOpId(null);
    setPhase("form");
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
            </div>
          </Content>
          <BottomActions>
            <Btn variant="w" onClick={recordNext}>
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
            <Banner kind="info" title={L.banner}>
              {L.bannerBody}
            </Banner>

            <div style={sectionTitleStyle}>
              {L.categoryTitle} <span style={{ color: T.red }}>*</span>
            </div>
            <div style={{ display: "grid", gap: 8, padding: "0 16px" }}>
              {SCANNER_WASTE_CATEGORIES.map((c) => {
                const on = categoryCode === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCategoryCode(c.code)}
                    aria-pressed={on}
                    style={catBtnStyle(on)}
                  >
                    <span aria-hidden="true" style={{ fontSize: 20 }}>
                      {c.icon}
                    </span>
                    <span style={{ flex: 1, textAlign: "left" }}>{L[c.labelKey]}</span>
                    <span aria-hidden="true">{on ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ padding: "16px 16px 0" }}>
              <div style={fieldLabelStyle}>
                {L.qtyLabel} <span style={{ color: T.red }}>*</span>
              </div>
              <button
                type="button"
                onClick={() => setShowKeypad(true)}
                aria-label={L.enterQty}
                style={qtyFieldStyle}
              >
                <span>{qty || "0"}</span>
                <span style={{ fontSize: 14, color: T.mute, fontWeight: 400 }}>{labels.output.unitBase}</span>
              </button>
              <div style={{ marginTop: 6, fontSize: 11, color: T.hint }}>{L.qtyHint}</div>
            </div>

            <div style={{ padding: "16px 16px 0" }}>
              <div style={fieldLabelStyle}>{L.reasonLabel}</div>
              <textarea
                aria-label={L.reasonLabel}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={L.reasonPlaceholder}
                style={textareaStyle}
              />
            </div>

            {submitErr && (
              <Banner kind="err" title={submitErr}>
                {" "}
              </Banner>
            )}
          </Content>
          <BottomActions>
            <Btn variant="w" disabled={!canSubmit} onClick={confirm}>
              {submitting ? L.submitting : L.confirm}
            </Btn>
          </BottomActions>
        </>
      )}

      <QtyKeypadSheet
        open={showKeypad}
        onClose={() => setShowKeypad(false)}
        initial={qty}
        uom={labels.output.unitBase}
        onConfirm={(v) => setQty(v)}
        labels={shellLabels.qtyKeypad}
      />
    </ScannerScreen>
  );
}

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

function catBtnStyle(on: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "14px 14px",
    borderRadius: 12,
    border: `1px solid ${on ? T.amber : T.elev}`,
    background: on ? "#3b2f0b" : T.surf,
    color: on ? T.amber : T.txt2,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  } as const;
}

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

const textareaStyle = {
  width: "100%",
  minHeight: 72,
  borderRadius: 12,
  border: `1px solid ${T.elev}`,
  background: T.surf,
  color: T.txt,
  padding: 12,
  fontSize: 14,
  resize: "vertical",
  outline: "none",
} as const;
