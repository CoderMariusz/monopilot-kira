# Foundation AppShell Wave — Coverage

Source brief: `/tmp/monopilot-shell-gap-brief-combined.md`
Prototype root: `prototypes/design/Monopilot Design System/`
Parity policy: `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`

## Coverage by gap

| Gap (brief §) | Concrete deliverable | Task | Status |
|---|---|---|---|
| §1 Sidebar globalny — missing | `apps/web/components/shell/app-sidebar.tsx` | UI-129 | covered |
| §1 Topbar globalny — missing | `apps/web/components/shell/app-topbar.tsx` | UI-130 | covered |
| §1 UserMenu / Avatar — orphaned `user-menu-language-picker.tsx` | `apps/web/components/shell/user-menu.tsx` host that mounts `apps/web/app/_components/user-menu-language-picker.tsx` | UI-130 | covered |
| §1 Settings sub-nav — missing | `apps/web/components/shell/settings-subnav.tsx` + `app/[locale]/(app)/(admin)/settings/layout.tsx` | UI-132 | covered |
| §1 PageHeader (page title primitive) — missing | `packages/ui/src/PageHeader.tsx` (+ re-export from `packages/ui/src/index.ts`) | UI-132 | covered |
| §1 `(app)/` authenticated route group + auth guard | `apps/web/app/[locale]/(app)/layout.tsx` + relocations | UI-131 (layout) + T-133 (topology refactor) | covered |
| §1 Scanner shell (device chrome) — missing | `apps/web/app/[locale]/(scanner)/layout.tsx` + `components/shell/scanner-frame.tsx` | T-134 | covered |
| §1 E2E smoke route-discovery — missing | `apps/web/e2e/shell-smoke.spec.ts` + `parity-evidence/shell/parity_report.json` | T-136 | covered |
| §2 Sidebar/topbar/subnav/PageHead pattern parity | shared design tokens + central nav manifest | UI-127, UI-128 | covered |
| §3 Luka A — Authenticated route-group wrapper | `(app)` + `(auth)` + relocations of `(admin)`, `(npd)`, `(settings)`, `[locale]/page.tsx`, `[locale]/login/` | T-133 | covered |
| §3 Luka B — AppSidebar | `app-sidebar.tsx` | UI-129 | covered |
| §3 Luka C — AppTopbar + UserMenu | `app-topbar.tsx` + `user-menu.tsx` | UI-130 | covered |
| §3 Luka D — PageHeader primitive | `packages/ui/src/PageHeader.tsx` | UI-132 | covered |
| §3 Luka E — SettingsSubNav layout | `app/[locale]/(app)/(admin)/settings/layout.tsx` + `settings-subnav.tsx` | UI-132 | covered |
| §3 Luka F — Scanner shell isolation | `(scanner)/layout.tsx` + `scanner-frame.tsx` | T-134 | covered |
| §3 Luka G — Auth guard in AppShell layout | Server Component check in `(app)/layout.tsx` via `createServerSupabaseClient` | UI-131 | covered |
| §3 Luka H — Browser error-discovery Playwright gate | `e2e/shell-smoke.spec.ts` | T-136 | covered |
| §6 SiteSwitcher dropdown (multi-site) | static `org.name` slot in topbar; live widget = `14-multi-site/T-020` | UI-130 (slot only) | out-of-scope per brief §6 → 14-multi-site/T-020 |
| §6 RBAC-gated nav item hiding | render-all-with-TODO; gating = `02-settings/T-130/T-131` | UI-132 + UI-129 (TODO(rbac) comments) | out-of-scope per brief §6 → 02-settings |
| §6 Mobile responsive shell (hamburger) | not covered | none | out-of-scope per brief §6, deferred wave |
| §6 Global search implementation | search slot is a `placeholder=Search…` `<input>` only | UI-130 (slot only) | out-of-scope per brief §6 |
| §6 Notification bell | absent from every `shell.jsx` baseline | none | out-of-scope per brief §6 |
| §6 NPD Topbar / ChromeNpd | each module's own T3-ui | none | out-of-scope per brief §6 |
| §6 OEE arc gauge, Spark, GaugeRing | OEE T3-ui tasks | none | out-of-scope per brief §6 |
| §6 Module-specific badges (counts) | each module fills its own slot via UI-128 manifest values | UI-128 leaves count fields nullable | out-of-scope per brief §6 (slots only) |
| §7 risk: scanner inherits AppShell | Playwright asserts `app-sidebar` absent on `/scanner/*` | T-134 + T-136 | covered |
| §7 risk: login renders sidebar | `(auth)` group lives outside `(app)`; Playwright asserts absence | T-133 + T-136 | covered |
| §7 risk: route reorganization breaks existing tests | T-133 runs full vitest + e2e suite as RED; relocations preserve URLs | T-133 | covered |
| §7 risk: SiteSwitcher implemented too early | UI-130 contract: static `org.name` only, comment-pinned `// TODO(multi-site/T-020)` | UI-130 | covered |
| §7 risk: Auth guard in Server Component vs middleware | UI-131 uses `createServerSupabaseClient`; proxy.ts unchanged | UI-131 | covered |
| §7 risk: T-130 not done when UI-132 ready | settings-subnav renders all items behind `// TODO(rbac/02-settings/T-130)` | UI-132 | covered |
| §7 risk: language picker is `'use client'`, topbar must wrap | UI-130 = Server Component shell with Client `<UserMenu>` child | UI-130 | covered |
| Existing language picker integration | `user-menu-language-picker.tsx` mounted inside `user-menu.tsx` | UI-130 | covered |
| Browser parity gate generates follow-up evidence | `parity_report.json` machine-readable, includes `recommended_followups[]` | T-136 | covered |

## Coverage by category

### UI (5 tasks)
| Task | Subcategory | Prototype anchor |
|---|---|---|
| UI-127 | shell/tokens | n/a (token extraction) |
| UI-129 | shell/sidebar | `settings/shell.jsx:3-21` |
| UI-130 | shell/topbar | `settings/shell.jsx:23-33`, mounts existing language picker file |
| UI-131 | shell/layout | composes UI-129 + UI-130 + auth guard |
| UI-132 | shell/page-header+settings-nav | `settings/shell.jsx:61-69` + `:35-59` |
| T-134 | shell/scanner-isolation | `scanner/shell.jsx:9-66` |

### UI manifest/config (1 task)
| Task | Subcategory |
|---|---|
| UI-128 | navigation manifest |

### Test / contract (3 tasks)
| Task | Subcategory |
|---|---|
| T-133 | route-topology refactor + smoke |
| T-135 | RTL unit contracts for shell components |
| T-136 | Playwright browser error-discovery + parity report |

## Atomicity gate

| Task | One deliverable | ≤5 impl steps | Context <100k | One task_type |
|---|---|---|---|---|
| UI-127 | shell tokens | ✓ | ✓ | T3-ui |
| UI-128 | nav manifest | ✓ | ✓ | T3-ui |
| UI-129 | sidebar | ✓ | ✓ | T3-ui |
| UI-130 | topbar + user-menu host | ✓ | ✓ | T3-ui |
| UI-131 | (app) layout + auth guard | ✓ | ✓ | T3-ui |
| UI-132 | PageHeader + settings subnav | ✓ (one shell-frame deliverable per brief Luka D+E) | ✓ | T3-ui |
| T-133 | route topology refactor | ✓ | ✓ | T4-wiring-test |
| T-134 | scanner isolation | ✓ | ✓ | T3-ui |
| T-135 | shell unit RTL | ✓ | ✓ | T4-wiring-test |
| T-136 | browser error-discovery | ✓ | ✓ | T4-wiring-test |

UI-132 deliberately bundles `PageHeader` primitive and `SettingsSubNav` layout
because the brief calls them out as the same shell-frame deliverable (Lukas D+E)
and `SettingsSubNav` itself depends on `PageHeader` for its `actions` slot. The
split would force a circular UI dependency; the bundle still meets ≤5
implementation steps. Coverage row above shows the trade-off.

## Gaps

| Item | Status |
|---|---|
| (none) | All brief gaps and risks covered or marked out-of-scope above. |
