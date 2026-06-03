# Walking Skeleton — Reality Audit (2026-06-02)

## Build result

**`pnpm --filter web build`: PASS** — Next.js 16.2.4, compiled successfully, 0 errors, 0 TypeScript errors. All routes emit as dynamic (`ƒ`). Only warnings: `@serwist/next` Turbopack warning (non-blocking) and Node.js `url.parse()` deprecation notices from third-party deps.

---

## 1. Auth / Login ✅

**Files:**
- `apps/web/app/[locale]/(auth)/login/page.tsx` — renders `LoginFormClient` with i18n labels
- `apps/web/app/[locale]/(auth)/login/_actions/auth.ts` — `signInWithPassword` calls `supabase.auth.signInWithPassword` via `createServerSupabaseClient` (`@supabase/ssr`); MFA path wired; redirects to `/${locale}/` on success
- `apps/web/proxy.ts` — edge middleware validates Supabase JWT via `resolveEdgeSecurityContext` + `checkIdleTimeout`; unauthenticated requests redirect to `/login`; `isPublicRoute()` correctly bypasses `/login`, `/onboarding/`, `/api/auth/saml/`

**Verdict:** ✅ IMPLEMENTED — real Supabase Auth login (not mock). Session established via `@supabase/ssr` cookies. `org_id` context established in `withOrgContext` via `public.users.org_id` lookup (not JWT claims). Logout calls `supabase.auth.signOut()` then redirects.

**Gap:** NONE for auth correctness. Minor: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **NOT in `.env.local`** (only in `.env.example`). These must be set in Vercel environment variables for the deployed app to authenticate. Cannot confirm they are set in Vercel dashboard from local read-only inspection — this is a deploy risk if not wired.

---

## 2. App Shell ✅

**Files:**
- `apps/web/app/[locale]/(app)/layout.tsx` — CSS grid layout: `grid-template-columns: var(--shell-sidebar-w) minmax(0,1fr)`, `grid-template-rows: var(--shell-topbar-h) minmax(0,1fr)`. Topbar row spans full width; sidebar col 1; main col 2.
- `apps/web/components/shell/app-sidebar.tsx` — `<nav data-testid="app-sidebar">`, groups/items driven by `APP_NAV_GROUPS` from `lib/navigation/app-nav.ts`
- `apps/web/components/shell/app-topbar.tsx` — `<header data-testid="app-topbar">`, brand, search input (readOnly), UserMenu with sign-out action

**Prototype parity check** vs `prototypes/design/Monopilot Design System/settings/shell.jsx` lines 1–105:
- `foundation_app_shell_layout`: sidebar+topbar+main CSS grid ✅ matches prototype pattern
- `foundation_app_sidebar`: nav groups (Core, Operations, QA & Shipping, Premium, Analytics & Network) with icon tokens ✅ matches prototype structure. Prototype shows Maintenance/Technical missing from sidebar — implementation adds them in "Premium" group; this is acceptable scope expansion.
- `foundation_app_topbar`: brand + search + avatar (UserMenu) ✅ present. Prototype shows role switch (Admin/User buttons) — implementation uses UserMenu dropdown instead. Minor divergence but functionally equivalent.
- `foundation_navigation_manifest`: manifest-driven sidebar via `APP_NAV_GROUPS` + `module-registry.ts` ✅ not hardcoded

**Verdict:** ✅ IMPLEMENTED. No evidence of prototype parity screenshots captured (e2e/parity-evidence/shell/ has `shell-smoke-trace.zip`) — trace exists.

**Gap:** Role-switch widget in topbar prototype (Admin/User toggle) replaced by UserMenu dropdown. Parity evidence is a zip trace, not screenshot per UI-PROTOTYPE-PARITY-POLICY.md — 🟡 evidence is a trace file not explicit screenshot+axe audit.

---

## 3. Navigation ✅

**Files:**
- `apps/web/lib/navigation/app-nav.ts` + `module-registry.ts` — manifest-driven, not hardcoded. All sidebar items derive from `APP_NAV_GROUPS` via `getAppModule()`.
- Routes in sidebar: `/dashboard`, `/settings`, `/planning`, `/production`, `/warehouse`, `/quality`, `/shipping`, `/technical`, `/npd`, `/finance`, `/oee`, `/maintenance`, `/reporting`, `/multi-site`
- All 14 routes confirmed in build output as `ƒ /[locale]/<module>` (dynamic pages exist)

**Verdict:** ✅ IMPLEMENTED — every sidebar link resolves to a real page (no 404s). Navigation manifest drives the sidebar.

**Gap:** NONE for nav correctness. RBAC gating is explicitly `TODO(rbac/02-settings/T-130)` in `app-sidebar.tsx` — all nav items accessible to any authenticated user regardless of role.

---

## 4. Data Wiring 🟡

**Pages with real Supabase data (via `withOrgContext` + direct pg queries):**
- `/dashboard` → `getOrgSummary()` — org-scoped counts of users, work_orders, lots, quality_events, shipments, bom_items ✅ REAL
- `/production` → `getModuleCount("work_order")` ✅ REAL
- `/warehouse` → `getModuleCount("lot")` ✅ REAL
- `/quality` → `getModuleCount("quality_event")` ✅ REAL
- `/shipping` → `getModuleCount("shipment")` ✅ REAL
- `/technical` → `getModuleCount("lot")` (reuses lot table) ✅ REAL (but suspicious — technical module counts lots?)

**Stub pages (ModuleStubNotice, no DB query):**
- `/planning`, `/scheduler`, `/oee`, `/finance`, `/maintenance`, `/npd`, `/reporting`, `/multi-site`

**Verdict:** 🟡 PARTIAL — 6 of 14 module pages do real Supabase reads (dashboard + 5 modules). 8 pages are stubs showing "Coming soon" notices. The data path uses `withOrgContext` → `app.set_org_context` RLS correctly. Stub pages are intentional Wave 0 placeholders.

**Gap:** `DATABASE_URL_OWNER`, `DATABASE_URL_APP` (or `DATABASE_URL`) must be wired as Vercel env vars pointing to the Supabase Postgres direct connection string (not the pooler). If these are missing in Vercel, all real-data pages fail at runtime (degrade to `{ ok: false }` not 500, due to error handling in `skeleton-data.ts`).

---

## 5. Deploy Reality ✅ / 🟡

**Build:** PASS (see top).

**Vercel config:** `apps/web/vercel.json` — framework: nextjs, buildCommand wired, cron configured. Project linked: `prj_tqakvTBKhLbKynJuPWal3BOak0TD`.

**Env vars in `.env.local` (root):** Present — `CRON_SECRET`, `RBAC_APPROVAL_HMAC_KEY`, `APP_VERSION`, `IDLE_TIMEOUT_MIN`, `NODE_ENV=development`, VERCEL_OIDC_TOKEN. These are Vercel CLI–pulled vars.

**MISSING from `.env.local` (and therefore must be in Vercel dashboard):**
- `NEXT_PUBLIC_SUPABASE_URL` — required for all auth flows
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — required for all auth flows
- `DATABASE_URL_OWNER` — required for `withOrgContext` org resolution
- `DATABASE_URL_APP` — required for RLS-scoped data queries
- `DATABASE_URL` — fallback

**Verdict:** 🟡 — build is green, Vercel project is linked. However, the 5 critical env vars above are not verifiable from local files alone. If they are set in the Vercel dashboard (likely, given Wave 0 ran and showed real data per prior commit `42258d53`), the live app works. If any are missing, login works but real-data pages fall back to `{ ok: false }` silently.

---

## Summary: Gap List

| # | Area | Gap | Severity |
|---|------|-----|----------|
| 1 | Deploy/Env | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` not in `.env.local`; must be in Vercel dashboard — not verifiable locally | 🟡 Medium |
| 2 | Deploy/Env | `DATABASE_URL_OWNER`, `DATABASE_URL_APP`, `DATABASE_URL` (Supabase direct Postgres) not in `.env.local`; must be in Vercel dashboard | 🟡 Medium |
| 3 | Data | 8 of 14 module pages are stubs (`ModuleStubNotice`) — no real data query | 🟡 Intentional Wave 0 |
| 4 | Shell parity | Topbar role-switch toggle (prototype lines 23–33) replaced by UserMenu dropdown — minor visual divergence | 🟡 Low |
| 5 | Shell parity | Parity evidence is a zip trace (`shell-smoke-trace.zip`), not screenshot+axe audit per UI-PROTOTYPE-PARITY-POLICY.md | 🟡 Low |
| 6 | Auth/Nav | RBAC gating absent from sidebar — all nav items accessible to any authenticated user | 🟡 Known TODO (T-130) |
| 7 | `/technical` page | Uses `getModuleCount("lot")` — counts `lot` table instead of a technical-domain table | 🟡 Wrong metric |
