"use client";

// ============================================================
// Scanner — client session context (Lane B)
//
// Mirrors prototypes/scanner/app.jsx:7-25 (the prototype kept screen
// state in localStorage). Here we keep the AUTH session — issued by the
// parallel-lane POST /api/scanner/login — in sessionStorage under the
// key 'scanner.session'. The token is attached as a Bearer header on
// every scannerFetch; a 401 clears the session and redirects to ../login.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";

const STORAGE_KEY = "scanner.session";

export type ScannerUser = { id: string; name: string };

export type ScannerSession = {
  token: string;
  user: ScannerUser;
  siteId?: string | null;
  lineId?: string | null;
  shift?: string | null;
  expiresAt?: string | null;
};

type SessionContextValue = {
  session: ScannerSession | null;
  setSession: (next: ScannerSession | null) => void;
  patchSession: (patch: Partial<ScannerSession>) => void;
  clearSession: () => void;
  /** authenticated POST to /api/scanner/<path>; redirects to ../login on 401 */
  scannerFetch: (path: string, body?: unknown) => Promise<Response>;
  ready: boolean;
};

const ScannerSessionContext = createContext<SessionContextValue | null>(null);

function readStored(): ScannerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScannerSession;
    if (parsed && typeof parsed.token === "string" && parsed.user) return parsed;
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function ScannerSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale as string) || "pl";

  const [session, setSessionState] = useState<ScannerSession | null>(null);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<ScannerSession | null>(null);
  sessionRef.current = session;

  // Hydrate from sessionStorage once on mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    setSessionState(readStored());
    setReady(true);
  }, []);

  const persist = useCallback((next: ScannerSession | null) => {
    if (typeof window === "undefined") return;
    if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const setSession = useCallback(
    (next: ScannerSession | null) => {
      sessionRef.current = next;
      setSessionState(next);
      persist(next);
    },
    [persist],
  );

  const patchSession = useCallback(
    (patch: Partial<ScannerSession>) => {
      const base = sessionRef.current;
      if (!base) return;
      const merged = { ...base, ...patch };
      sessionRef.current = merged;
      setSessionState(merged);
      persist(merged);
    },
    [persist],
  );

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    setSessionState(null);
    persist(null);
  }, [persist]);

  const scannerFetch = useCallback(
    async (path: string, body?: unknown) => {
      const token = sessionRef.current?.token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const url = path.startsWith("/api/") ? path : `/api/scanner/${path.replace(/^\//, "")}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401) {
        clearSession();
        router.replace(`/${locale}/scanner/login`);
      }
      return res;
    },
    [clearSession, locale, router],
  );

  const value = useMemo<SessionContextValue>(
    () => ({ session, setSession, patchSession, clearSession, scannerFetch, ready }),
    [session, setSession, patchSession, clearSession, scannerFetch, ready],
  );

  return (
    <ScannerSessionContext.Provider value={value}>{children}</ScannerSessionContext.Provider>
  );
}

export function useScannerSession(): SessionContextValue {
  const ctx = useContext(ScannerSessionContext);
  if (!ctx) {
    throw new Error("useScannerSession must be used within a ScannerSessionProvider");
  }
  return ctx;
}

export { STORAGE_KEY as SCANNER_SESSION_STORAGE_KEY };
