# Foundation AppShell Wave — Coverage

Source brief: `/tmp/monopilot-shell-gap-brief-combined.md`
Prototype root: `prototypes/design/Monopilot Design System/`
Parity policy: `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`

## Coverage by gap

| Gap / requirement | Concrete deliverable | Task | Status |
|---|---|---|---|
| Stable prototype labels for shell tasks | `prototype-index-foundation-shell.json` + master-index merge | T-137 | covered |
| Sidebar globalny — missing | `apps/web/components/shell/app-sidebar.tsx` | UI-129 | covered |
| Full 16-module nav decision matrix | `APP_MODULES` registry + `APP_NAV_GROUPS` | UI-128 | covered |
| Full sidebar active routes should not 404 | module landing stubs + route contract spec | UI-138 | covered |
| Topbar globalny — missing | `apps/web/components/shell/app-topbar.tsx` | UI-130 | covered |
| UserMenu / Avatar — orphaned language picker | `user-menu.tsx` host mounts existing `user-menu-language-picker.tsx` | UI-130 | covered |
| Settings sub-nav — missing | `settings-subnav.tsx` + `[locale]/(app)/(admin)/settings/layout.tsx` | UI-132 | covered |
| PageHeader primitive — missing | `packages/ui/src/PageHeader.tsx` | UI-132 | covered |
| Authenticated `(app)` route group + auth guard | route topology + `(app)/layout.tsx` | T-133 + UI-131 | covered |
| Scanner shell device chrome | `(scanner)/layout.tsx` + `scanner-frame.tsx` | T-134 | covered |
| Browser error-discovery + parity gate | `shell-smoke.spec.ts` + `parity_report.json` | T-136 | covered |
| SiteSwitcher live widget | topbar slot only; live widget remains `14-multi-site/T-020` | UI-130 | out-of-scope implementation, slot covered |
| RBAC-gated nav hiding | render-all-with-TODO; gating remains `02-settings/T-130/T-131` | UI-128/UI-129/UI-132 | out-of-scope implementation, placeholders covered |
| Mobile hamburger shell | not in this wave | none | out-of-scope deferred |

## Full 16-module shell/nav coverage

| Module | Nav/shell decision | Route | Task |
|---|---|---|---|
| foundation | platform, non-user-facing, excluded | none | UI-128 |
| settings | desktop sidebar | `/settings` | UI-128/UI-138 |
| npd | desktop sidebar | `/npd` | UI-128/UI-138 |
| technical | desktop sidebar | `/technical` | UI-128/UI-138 |
| planning-basic | desktop sidebar label `Planning` | `/planning` | UI-128/UI-138 |
| planning-ext | desktop sidebar label `Scheduler` | `/scheduler` | UI-128/UI-138 |
| warehouse | desktop sidebar | `/warehouse` | UI-128/UI-138 |
| production | desktop sidebar | `/production` | UI-128/UI-138 |
| quality | desktop sidebar | `/quality` | UI-128/UI-138 |
| finance | desktop sidebar | `/finance` | UI-128/UI-138 |
| shipping | desktop sidebar | `/shipping` | UI-128/UI-138 |
| reporting | desktop sidebar | `/reporting` | UI-128/UI-138 |
| maintenance | desktop sidebar | `/maintenance` | UI-128/UI-138 |
| multi-site | desktop sidebar | `/multi-site` | UI-128/UI-138 |
| oee | desktop sidebar | `/oee` | UI-128/UI-138 |
| scanner | scanner shell, excluded from desktop sidebar | `/dev/scanner` harness only | UI-128/T-134 |

## Coverage by category

### UI / prototype-backed
| Task | Subcategory | Prototype anchors |
|---|---|---|
| UI-127 | shell/tokens | settings/shell.jsx:1-105, technical/shell.jsx:1-74, scanner/shell.jsx:1-66 |
| UI-128 | module registry + nav manifest | settings/shell.jsx:3-21, reporting/shell.jsx:3-23, multi-site/shell.jsx:77-124, settings/shell.jsx:35-59 |
| UI-129 | AppSidebar | settings/reporting/multi-site shell sidebars |
| UI-130 | AppTopbar/UserMenu slot | settings/shell.jsx:23-33, multi-site/shell.jsx:13-69, :127-149 |
| UI-131 | AppShell layout | settings/shell.jsx:1-105 |
| UI-132 | PageHeader + SettingsSubNav | settings/shell.jsx:35-59, :61-69 |
| T-134 | ScannerFrame | scanner/shell.jsx:1-66 |
| UI-138 | route contracts/stubs | nav/sidebar prototype anchors |

### Meta / test
| Task | Subcategory |
|---|---|
| T-137 | prototype label index |
| T-133 | route topology refactor |
| T-135 | RTL shell contracts |
| T-136 | Playwright browser parity/error discovery |

## Atomicity gate

| Task | One deliverable | ≤5 impl steps | Context <100k | One task_type |
|---|---|---|---|---|
| T-137 | prototype label index entries | ✓ | ✓ | T4-wiring-test |
| UI-127 | shell tokens | ✓ | ✓ | T3-ui |
| UI-128 | module registry/nav manifest | ✓ | ✓ | T3-ui |
| T-133 | route topology refactor | ✓ | ✓ | T4-wiring-test |
| UI-129 | sidebar | ✓ | ✓ | T3-ui |
| UI-130 | topbar + user-menu host | ✓ | ✓ | T3-ui |
| UI-131 | `(app)` layout + auth guard | ✓ | ✓ | T3-ui |
| UI-132 | PageHeader + settings subnav | ✓ | ✓ | T3-ui |
| T-134 | scanner isolation | ✓ | ✓ | T3-ui |
| UI-138 | route contracts + minimal landing stubs | ✓ | ✓ | T3-ui |
| T-135 | shell unit RTL | ✓ | ✓ | T4-wiring-test |
| T-136 | browser error-discovery | ✓ | ✓ | T4-wiring-test |

## Gaps

| Item | Status |
|---|---|
| Reporting / Multi-Site / Scheduler in global nav | covered by UI-128 + UI-138 |
| Formal prototype labels | covered by T-137 and metadata on prototype-backed tasks |
| Scanner desktop nav decision | covered: explicitly excluded from AppSidebar, isolated under `(scanner)` |
| Live SiteSwitcher business behavior | out-of-scope; slot only, module task `14-multi-site/T-020` owns live behavior |
| Module-specific subnavs/content | out-of-scope; each module wave owns its body/subnav |
