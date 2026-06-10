"use client";

// ============================================================
// SCN-012 — Site / Line / Shift selection (start of shift)
// Port of prototypes/scanner/login.jsx:128-194 (SiteSelectScreen).
// Loads sites/lines via GET /api/scanner/bootstrap (Bearer), then commits
// context via POST /api/scanner/context, then routes to ../../home.
//
// Five states: loading, empty, error, permission-denied (401→login redirect),
// optimistic (saving spinner on the start button).
// ============================================================

import { useCallback, useEffect, useState } from "react";
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

type Site = { id: string; name: string };
type Line = { id: string; name: string; siteId: string };
type Bootstrap = { sites: Site[]; lines: Line[] };

type LoadState = "loading" | "ready" | "empty" | "error";

export function SiteSelectScreen({ locale, labels }: { locale: string; labels: ScannerLabels }) {
  const router = useRouter();
  const { session, patchSession, clearSession } = useScannerSession();
  const L = labels.site;

  const [state, setState] = useState<LoadState>("loading");
  const [sites, setSites] = useState<Site[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [shift, setShift] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const shifts = [
    { code: "morning", name: L.shiftMorning, hours: "06:00–14:00" },
    { code: "afternoon", name: L.shiftAfternoon, hours: "14:00–22:00" },
    { code: "night", name: L.shiftNight, hours: "22:00–06:00" },
  ];

  const load = useCallback(async () => {
    setState("loading");
    const token = session?.token;
    if (!token) {
      router.replace(`/${locale}/scanner/login`);
      return;
    }
    try {
      const res = await fetch("/api/scanner/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearSession();
        router.replace(`/${locale}/scanner/login`);
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as Bootstrap;
      const nextSites = data.sites ?? [];
      setSites(nextSites);
      setLines(data.lines ?? []);
      if (nextSites.length === 0) {
        setState("empty");
        return;
      }
      setSiteId((cur) => cur ?? nextSites[0]?.id ?? null);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [clearSession, locale, router, session?.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const siteLines = lines.filter((l) => l.siteId === siteId);
  const canGo = !!siteId && !!shift && !saving;

  const start = async () => {
    if (!canGo || !session) return;
    setSaving(true);
    setSaveErr(null);
    // optimistic: patch local session immediately, roll back on failure
    const previous = { siteId: session.siteId, lineId: session.lineId, shift: session.shift };
    patchSession({ siteId, lineId, shift });
    try {
      const res = await fetch("/api/scanner/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.token, siteId, lineId, shift }),
      });
      if (res.status === 401) {
        clearSession();
        router.replace(`/${locale}/scanner/login`);
        return;
      }
      if (!res.ok) {
        patchSession(previous);
        setSaveErr(L.errLoad);
        return;
      }
      router.replace(`/${locale}/scanner/home`);
    } catch {
      patchSession(previous);
      setSaveErr(L.errLoad);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScannerScreen>
      <Topbar
        title={L.title}
        onBack={() => router.push(`/${locale}/scanner/login`)}
        syncState="online"
        labels={labels.topbar}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
        {state === "loading" && (
          <div style={{ padding: 24, textAlign: "center", color: T.mute }}>{L.loading}</div>
        )}

        {state === "empty" && (
          <Banner kind="info" title={L.empty}>
            {" "}
          </Banner>
        )}

        {state === "error" && (
          <>
            <Banner kind="err" title={L.errLoad}>
              {" "}
            </Banner>
            <div style={{ padding: "0 16px" }}>
              <Btn variant="sec" onClick={() => void load()}>
                {L.retry}
              </Btn>
            </div>
          </>
        )}

        {state === "ready" && (
          <>
            {session && (
              <div style={ctxStyle}>
                <div style={avatarStyle} aria-hidden="true">
                  {initials(session.user.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.txt }}>{session.user.name}</div>
                </div>
                <span style={badgeStyle}>{L.loggedIn}</span>
              </div>
            )}

            <div style={sectionTitleStyle}>{L.siteSection}</div>
            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSiteId(s.id);
                  setLineId(null);
                }}
                style={optCardStyle(siteId === s.id)}
              >
                <span aria-hidden="true">🏭</span>
                <span style={{ flex: 1, textAlign: "left", color: T.txt }}>{s.name}</span>
                {siteId === s.id && <span style={{ color: T.blue2 }}>✓</span>}
              </button>
            ))}

            {siteLines.length > 0 && (
              <>
                <div style={sectionTitleStyle}>{L.lineSection}</div>
                <div style={gridStyle}>
                  {siteLines.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLineId(l.id)}
                      style={optMiniStyle(lineId === l.id)}
                    >
                      <div style={{ fontWeight: 600, color: T.txt }}>{l.name}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={sectionTitleStyle}>{L.shiftSection}</div>
            <div style={gridStyle}>
              {shifts.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setShift(s.code)}
                  style={optMiniStyle(shift === s.code)}
                >
                  <div style={{ fontWeight: 600, color: T.txt }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: T.hint }}>{s.hours}</div>
                </button>
              ))}
            </div>

            {saveErr && (
              <Banner kind="err" title={saveErr}>
                {" "}
              </Banner>
            )}
          </>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          flexShrink: 0,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${T.elev}`,
        }}
      >
        <div style={{ fontSize: 11, color: T.mute, textAlign: "center" }}>
          {canGo ? summaryText(sites, siteId, lines, lineId, shifts, shift) : L.pickPrompt}
        </div>
        <Btn variant="p" disabled={!canGo || state !== "ready"} onClick={start}>
          {saving ? L.saving : L.start}
        </Btn>
      </div>
    </ScannerScreen>
  );
}

function summaryText(
  sites: Site[],
  siteId: string | null,
  lines: Line[],
  lineId: string | null,
  shifts: Array<{ code: string; name: string; hours: string }>,
  shift: string | null,
) {
  const site = sites.find((s) => s.id === siteId)?.name ?? "";
  const line = lines.find((l) => l.id === lineId)?.name;
  const sh = shifts.find((s) => s.code === shift);
  return [site, line, sh ? `${sh.name} · ${sh.hours}` : null].filter(Boolean).join(" · ");
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ctxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "4px 16px 8px",
  padding: 12,
  borderRadius: 12,
  background: T.surf,
} as const;

const avatarStyle = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: T.elev,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  color: T.txt,
} as const;

const badgeStyle = {
  padding: "3px 8px",
  borderRadius: 999,
  background: "#0e2a18",
  color: T.green,
  fontSize: 10,
  fontWeight: 700,
} as const;

const sectionTitleStyle = {
  padding: "12px 16px 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.hint,
} as const;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  padding: "0 16px",
} as const;

function optCardStyle(on: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "calc(100% - 32px)",
    margin: "0 16px 8px",
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${on ? T.blue : T.elev}`,
    background: on ? "#0e2333" : T.surf,
    cursor: "pointer",
  } as const;
}

function optMiniStyle(on: boolean) {
  return {
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${on ? T.blue : T.elev}`,
    background: on ? "#0e2333" : T.surf,
    textAlign: "left",
    cursor: "pointer",
  } as const;
}
