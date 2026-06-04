# SIDE-CAR Reachability Audit — 00-foundation + Global App Shell

**Date:** 2026-06-04
**Mode:** READ-ONLY (code + DB-structure level; no live browser, no writes)
**Scope:** 00-foundation primitives + global app shell (nav/menu, auth, dashboard shell, org/site crumb, locale, layout chrome) for test user `admin@monopilot.test`
**Routing model confirmed:** next-intl `localePrefix: 'always'` (default — `apps/web/i18n/routing.ts` sets only `locales`+`defaultLocale`). Canonical app tree = `apps/web/app/[locale]/(app)/...`. Any route outside `[locale]/` is shadowed/dead.

---

## TL;DR — verdict for Gate-5 (foundation)

The **core shell is reachable and healthy**: real Supabase auth guard, sidebar + topbar + main, locale routing, dashboard with real org-scoped data. **But three reachability defects will be visible on a live click-through**, plus a build-level route collision that may already affect 01-npd:

1. **P0 — `/dashboard` route collision** between `(modules)/dashboard` (Walking-Skeleton) and `(npd)/dashboard` (T-052). Both strip to the same URL `/{locale}/dashboard`. This is a Next.js duplicate-page conflict (build error or silent winner). *(Belongs to 01-npd — reported, NOT modified.)*
2. **P1 — Entire built NPD module is ORPHANED from the global sidebar.** Sidebar "NPD" → `/npd` = a `ModuleStubNotice` "stub" page. The real NPD tree (`/briefs`, `/fa`, `/pipeline`, npd dashboard) is internally cross-linked but has **no entry point** from global nav. Same orphan class the task flagged.
3. **P1 — Clicking sidebar "Settings" lands on an EMPTY page.** `/settings` index renders `return null` with no redirect to a first child. Sub-nav shows, content area is blank.
4. **P2 — 5 full-featured settings pages are URL-only orphans** (zero inbound links): `roles`, `invitations`, `modules`, `promotions`, `quality`.
5. **P3 — A large non-locale route tree is dead** (shadowed by `localePrefix:'always'`): `app/(admin)/*`, `app/(settings)/*`, `app/(npd)/*`, `app/onboarding/*`, `app/page.tsx`. Cosmetic/clutter, not user-visible, but same orphan class.

The unbuilt modules (03-15) are correctly handled as **labeled stubs** (`ModuleStubNotice` "stub" badge) or **labeled live-count panels** — they are not dead links and not crashes.

---

## 1. Global app shell — component-level reachability

| Shell element | Source | Reachable / functional? | Notes |
|---|---|---|---|
| Auth guard | `app/[locale]/(app)/layout.tsx` | OK | `createServerSupabaseClient().auth.getUser()`; redirects to `/{locale}/login` on no-user/error. Real Supabase. |
| Edge middleware | `apps/web/proxy.ts` | OK | Rate-limit → public-route bypass → idle-timeout (verified token) → admin IP allowlist → onboarding guard → intl. Fail-closed. |
| Sidebar (primary nav) | `components/shell/app-sidebar.tsx` + `lib/navigation/app-nav.ts` | OK (renders) | 5 groups, Dashboard + 14 module links. **All ungated** (`permission_key: null`, RBAC_TODO everywhere). |
| Topbar | `components/shell/app-topbar.tsx` | OK | Brand + search + SiteCrumb + UserMenu. |
| Topbar search | `app-topbar.tsx:56` | NON-FUNCTIONAL | `readOnly` input, placeholder only. Intentional (no search backend). |
| Org/Site switcher | `components/shell/site-crumb.tsx` | STATIC LABEL | Renders `orgName` text only. `data-todo="multi-site-T-020"` — no switching. Acceptable for single-org test user. |
| UserMenu | `components/shell/user-menu.tsx` | OK | Language picker + sign-out form (real `signOutAction` → `supabase.auth.signOut()` → `/login`). No link to account/settings (reached via sidebar). |
| Locale switching | UserMenu language picker | OK (PL/EN) | `selectLanguageAction` rejects uk/ro as `unsupported_locale` (Phase-1 = pl/en). Matches memory. |
| Settings sub-shell | `(admin)/settings/layout.tsx` + `components/shell/settings-subnav.tsx` | OK (renders) | Sub-nav with 9 groups; active-state aliases `/settings`→profile, `/settings/roles`→users, `/settings/authorization`→security. |

---

## 2. Reachability table — canonical `[locale]/(app)` routes

Legend: **OK** = linked + real data · **OK-stub** = linked, intentional labeled stub · **OK-live** = linked, real live-count panel · **EMPTY** = renders blank · **ORPHAN** = exists, no nav link · **COLLISION** = duplicate URL.

### Global / dashboard
| Route | Linked from | Perm/seed | Data-real? | Class | Fix |
|---|---|---|---|---|---|
| `/{locale}` (home) | post-login landing | session-gated | redirect | OK | — |
| `/dashboard` ((modules)) | sidebar Dashboard | ungated | **real** (`getOrgSummary`) | **COLLISION** | resolve vs (npd)/dashboard |
| `/dashboard` ((npd), T-052) | npd internal | ungated | real (`getDashboardSummary`) | **COLLISION/ORPHAN** | 01-npd: move to `/npd/dashboard` or wire nav |

### Module landings (sidebar group items)
| Route | Class | Data |
|---|---|---|
| `/settings` | **EMPTY** (`return null`) | — |
| `/npd` | **OK-stub** but ORPHANS real npd (see §3) | stub notice |
| `/finance`, `/maintenance`, `/multi-site`, `/oee`, `/planning`, `/reporting`, `/scheduler` | OK-stub | `ModuleStubNotice` (labeled "stub") |
| `/production`, `/quality`, `/shipping`, `/technical`, `/warehouse` | OK-live | `ModuleDataPanel` real `getModuleCount(...)` |

All 15 sidebar targets resolve to a `page.tsx` — **no dangling sidebar links, no 404s.** Unbuilt 03-15 are correctly labeled stubs/live-panels (not dead links).

### Settings sub-pages — all 36 sidebar links resolve
Verified every `SETTINGS_NAV_GROUPS` route (`lib/navigation/settings-nav.ts`) maps to an existing `page.tsx` (company, infra/lines, infra/warehouses, shifts, products, boms, processes, reference/manufacturing-operations, partners, units, import-export, users, security, audit, devices, notifications, features, integrations, labels, onboarding, integrations/d365[/mapping], d365-dlq, rules, flags, schema[/new][/migrations], tenant, reference, email[/variables], ship-override-reasons, gallery, /account/profile, /account/notifications). Sampled pages query real Supabase (company 242L, users 485L, security 409L, reference 429L, tenant 642L, audit 380L, etc.) — **data-real confirmed**.

---

## 3. ORPHANED routes (exist, not navigable)

### P1 — NPD module orphaned from global nav
- Sidebar "NPD" (`module-registry.ts:40`, route `/npd`) → `(modules)/npd/page.tsx` = **stub** (`ModuleStubNotice`).
- Real NPD feature pages exist and are internally cross-linked but **have no global entry point**:
  - `(npd)/dashboard/page.tsx` (T-052, 378L, real data)
  - `(npd)/briefs/page.tsx` + `[briefId]`
  - `(npd)/fa/page.tsx` + `[productCode]` (+ allergens/docs/risks)
  - `(npd)/pipeline/page.tsx` + `[projectId]` (+ formulation/nutrition/costing/gate/approval)
- A user clicking "NPD" sees the stub notice and **cannot reach any built NPD screen** without typing a URL.
- **Fix (01-npd owns):** point sidebar `npd.route` at the real landing (`/dashboard` once collision resolved, or a new `/npd/dashboard`), and/or replace the `(modules)/npd` stub with a redirect into the npd tree.

### P1 — `/settings` index is empty
- `(admin)/settings/page.tsx` = `return null`. No redirect to a default child.
- **Fix:** `redirect('/{locale}/settings/company')` (the sub-nav already aliases `/settings`→profile/company for active state).

### P2 — Full settings pages with ZERO inbound links (URL-only)
| Route | Size | Note |
|---|---|---|
| `/settings/roles` | 378L | Full page; sub-nav only aliases its *active state* to "users", no actual link. `users` page does not link to it. |
| `/settings/invitations` | 146L | Full; no link anywhere. |
| `/settings/modules` | 278L | Full; no link. |
| `/settings/promotions` | 282L | Full; only self-reference (`data-route`). |
| `/settings/quality` | 141L | Full; only `revalidatePath` self-reference. |

**Fix:** add to `settings-nav.ts` (or as tabs within users/security) or delete if superseded.

### Reachable-deep (NOT orphans — linked from a sidebar page; OK)
`/settings/authorization` (from tenant + flags + tenant/rules), `/settings/tenant/depts`, `/settings/tenant/rules` (from tenant page). Detail/dynamic routes reached via parent: `reference/[code]/import`, `reference/[code]/[row_key]/history`, `rules/[code][/diff]`, `schema/diff/[id]`, `schema/preview`, `manufacturing-ops/[operation_id]/history`, `integrations/d365/{audit,sync}`, `notifications/email-log`, fa/pipeline sub-routes.

### Legacy redirect shims (harmless — 10L `redirect()` pages, OK)
`profile`→company, `audit-logs`→audit, `email-config`/`email-vars`→email[/variables], `d365-conn`/`d365-mapping`→integrations/d365[/mapping], `schema-migrations`/`schema-wizard`→schema/[migrations|new], `sites`/`warehouses`→infra/*, `my-profile`/`my-notifications`→/account/*. These resolve legacy URLs to canonical; no action needed.

---

## 4. Dead non-locale route tree (P3 — clutter, not user-visible)

Under `localePrefix:'always'`, the intl middleware redirects bare paths to `/{locale}/...`, so the canonical `[locale]/` tree always wins and these are **unreachable / shadowed**:
- `app/page.tsx` (placeholder `<h1>Monopilot Kira</h1>` — never served; `/` → `/en`)
- `app/(admin)/**` (settings/{users,roles,security,invitations,reference/...}, account/*, schema/wizard, gdpr)
- `app/(settings)/**` (schema, reference/allergens)
- `app/(npd)/**` (fa/[productCode]/allergens, brief, builder, pipeline, dashboard, _modals)
- `app/onboarding/**` (full duplicate of `[locale]/onboarding/**`)

**Same orphan class as the 01-npd `(npd)` tree the task referenced.** They are duplicates left from the pre-locale consolidation. Note one live coupling: the **non-locale** onboarding clients (`app/onboarding/product|workorder/...`) push to `/settings/profile` (the redirect shim) — but those onboarding clients are themselves in the dead tree, so it's dead-linking-dead. **Fix:** delete the non-locale tree (separate cleanup task; out of this read-only audit's scope and not 00-foundation/01-npd-owned-by-active-run).

---

## 5. Dangling nav links

**None at the sidebar/settings-nav level** — every menu entry resolves to an existing `page.tsx`. The only "dangling" semantics are:
- Sidebar "NPD" → resolves but to a stub (real module unreachable) — see §3 P1.
- Sidebar "Settings" → resolves but to empty page — see §3 P1.

---

## 6. What would show EMPTY / ERROR on a live click-through (Gate-5 input)

| Click | Result | Severity |
|---|---|---|
| Sidebar → **Settings** | Empty content pane (sub-nav only) | P1 |
| Sidebar → **NPD** | "Stub" notice; no path into built NPD | P1 |
| Sidebar → finance/maintenance/multi-site/oee/planning/reporting/scheduler | Labeled "stub" badge (expected for unbuilt) | OK |
| Sidebar → production/quality/shipping/technical/warehouse | Live record-count panel (real data) | OK |
| Sidebar → Dashboard | Real org metrics — **but** `/dashboard` collides with npd dashboard at build time | P0 (build) |
| Topbar search | Inert (readOnly) | cosmetic |
| Topbar org crumb | Static org name (no switch) | expected (single-org) |

---

## 7. Recommendations (priority-ordered)

- **P0 (01-npd, do not touch from sidecar):** Resolve `/dashboard` duplicate-page conflict — relocate `(npd)/dashboard` to `/npd/dashboard` (or merge). Verify `pnpm --filter web build` compiles.
- **P1 (foundation/02-settings):** `/settings` index → `redirect()` to `/settings/company`.
- **P1 (01-npd):** Wire global sidebar "NPD" to the real npd landing; replace/redirect the `(modules)/npd` stub.
- **P2 (02-settings):** Surface or remove the 5 orphan settings pages (`roles`, `invitations`, `modules`, `promotions`, `quality`).
- **P3 (cleanup):** Delete the dead non-locale route tree (`app/(admin|settings|npd)/**`, `app/onboarding/**`, `app/page.tsx`).
- **Tracked debt (not a defect):** all nav is `permission_key: null` (RBAC_TODO UI-128 / T-130). When RBAC lands, every route is currently reachable by any authenticated user regardless of role — fine for `admin@monopilot.test`, but means there is no FORBIDDEN-missing-perm class today.

---

## Appendix — method / evidence

- Route enumeration: `find apps/web/app/[locale] -name page.tsx` (118 page/layout files) + non-locale `find apps/web/app -name page.tsx -not -path '*/[locale]/*'` (18 dead files).
- Nav source of truth: `lib/navigation/{module-registry,app-nav,settings-nav,types}.ts`; render: `components/shell/{app-sidebar,settings-subnav,app-topbar,user-menu,site-crumb}.tsx`.
- Routing: `i18n/routing.ts` (no `localePrefix` ⇒ `'always'`), `proxy.ts` matcher `/((?!_next|_vercel|.*\..*).*)`.
- Collision proof: stripping route-groups from all `[locale]/(app)` page paths yields exactly one duplicate URL: `/dashboard` (from `(modules)` and `(npd)`).
- Orphan-link proof: `grep` for inbound `href|push|route` references per route, excluding tests/self-references.
- Data-real spot checks: sampled settings pages all import server Supabase / `_actions`; module landings use `getOrgSummary`/`getModuleCount`; stub landings use `ModuleStubNotice`.
- **No files modified. No 01-npd or repo config touched.**
