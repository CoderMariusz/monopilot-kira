"use client";

// ============================================================
// Scanner — WO data fetch helpers (Lane C).
//
// The scanner runs on a Bearer session (scanner-session.tsx). scannerFetch is
// POST-only and prefixes /api/scanner/; the WO production endpoints live under
// /api/production/scanner/** and need GET reads + POST mutations. This hook
// wraps both with the Bearer header and the 401 → ../login redirect, mirroring
// the site-select screen's raw-fetch pattern.
//
// woFetch(path)             → GET, returns Response | null (null = 401 handled)
// woPost(path, body)        → POST JSON, returns Response | null (null = 401)
// ============================================================

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

import { useScannerSession } from "../../../_components/scanner-session";

export function useWoFetch() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale as string) || "pl";
  const { session, clearSession } = useScannerSession();

  const handle401 = useCallback(() => {
    clearSession();
    router.replace(`/${locale}/scanner/login`);
  }, [clearSession, locale, router]);

  const woFetch = useCallback(
    async (path: string): Promise<Response | null> => {
      const token = session?.token;
      if (!token) {
        handle401();
        return null;
      }
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        handle401();
        return null;
      }
      return res;
    },
    [session?.token, handle401],
  );

  const woPost = useCallback(
    async (path: string, body: unknown): Promise<Response | null> => {
      const token = session?.token;
      if (!token) {
        handle401();
        return null;
      }
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        handle401();
        return null;
      }
      return res;
    },
    [session?.token, handle401],
  );

  return { woFetch, woPost };
}
