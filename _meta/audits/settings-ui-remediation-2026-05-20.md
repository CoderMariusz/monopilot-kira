# Settings UI remediation inventory after localized admin routing rule

Date: 2026-05-20
Scope: `02-settings` tasks T-058..T-079 plus T-119/T-120/T-127/T-129.
Repository: `/Users/mariuszkrawczyk/Projects/monopilot-kira`

## Executive finding

Canonical user-visible admin/account Settings routes now belong under:

- Source tree: `apps/web/app/[locale]/(admin)/...`
- URL shape: `/{locale}/settings/...` or `/{locale}/account/...` because `(admin)` is a route group.

The audited task metadata mostly now names localized source paths, but the implementation tree has no `apps/web/app/[locale]/(admin)` route group and none of the page tasks exist at the localized target paths.

False-green root after T-059:

1. Several completed page implementations/tests are still under legacy non-localized `apps/web/app/(admin)/...`.
2. Their tests import `./page` from the same legacy folder, so they can pass while the canonical localized route is missing.
3. Many tests catch module-resolution failures and return a placeholder component. That is useful for RED but unsafe for route closeout unless paired with a hard existence assertion against the canonical path.
4. Current task metadata `scope_files`/RED commands point at `[locale]/(admin)` for most tasks, but existing source files were not moved. A closeout can therefore claim green against the wrong path if it only runs legacy co-located tests.
5. There is no `apps/web/app/[locale]/(admin)/layout.tsx` or equivalent admin route shell found in the current tree; only `[locale]/login` and `[locale]/page.tsx` exist.
6. Some implemented UI still hardcodes non-localized links such as `/settings/audit?...` in T-127; these must become locale-aware or use localized route helpers.
7. T-129 is component-only and currently has no route-level host evidence proving it is mounted in the localized admin shell or that locale switching preserves the current localized pathname.

## Remediation matrix

Legend for current source path:
- `legacy exists` = implementation/tests found under `apps/web/app/(admin)/...`, not under `[locale]/(admin)`.
- `absent` = no implementation/test found at expected localized path or obvious legacy equivalent.
- `component exists` = non-page component exists and still needs host/route evidence if user-visible.

| Task | Expected localized route / target | Current source path | Prototype anchor / index | False-green signatures | Required repair type | Suggested dependencies / gates | Parallelization |
|---|---|---|---|---|---|---|---|
| T-058 Company Profile | `/{locale}/settings/profile`; `apps/web/app/[locale]/(admin)/settings/profile/page.tsx` | legacy exists: `apps/web/app/(admin)/settings/profile/page.tsx`, `.test.tsx` | `company_profile_screen`; `prototypes/design/Monopilot Design System/settings/org-screens.jsx:4-100` | Legacy co-located test imports `./page`; canonical localized page absent; metadata scope localized but filesystem still legacy. | Relocate page/test to `[locale]/(admin)`; update relative imports; add canonical-path existence test; verify no legacy route closeout. | Keep backend deps T-016/T-027/T-028; gates: route existence, localized test command, typecheck/lint, UI parity evidence. | Can run with T-059/T-060/T-074/T-075 if shared route-shell gate is ready. |
| T-059 Users | `/{locale}/settings/users`; `apps/web/app/[locale]/(admin)/settings/users/page.tsx` | legacy exists: `apps/web/app/(admin)/settings/users/page.tsx`, `.test.tsx` | `users_screen`; `prototypes/design/Monopilot Design System/settings/access-screens.jsx:4-157` | This is the observed false-green pattern: legacy test imports `./page`; missing canonical route is not asserted. | Relocate page/test to `[locale]/(admin)`; update import path to `packages/ui/test/assertModalA11y`; add path/URL closeout assertion. | Deps T-016/T-017/T-018; gate must reject `apps/web/app/(admin)/settings/users/page.test.tsx` as closeout command. | Parallel with other low-coupling migrations after route shell. |
| T-060 Security | `/{locale}/settings/security`; `apps/web/app/[locale]/(admin)/settings/security/page.tsx` | legacy exists: `apps/web/app/(admin)/settings/security/page.tsx`, `.test.tsx` | `security_screen`; `prototypes/design/Monopilot Design System/settings/access-screens.jsx:160-245` | Legacy route green possible; canonical page absent; audit preview links likely non-localized. | Relocate to localized path; fix hardcoded settings/audit links; add canonical path + locale-aware link tests. | Deps T-032/T-033/T-034/T-036; gates include link localization and no direct Radix import. | Parallel migration. |
| T-061 D365 Connection | `/{locale}/settings/integrations/d365`; `apps/web/app/[locale]/(admin)/settings/integrations/d365/page.tsx` | absent | `d365_connection_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-107` | Metadata target localized, but no page/test exists; false-green risk if ACP accepts task metadata update only. | Fresh implementation under localized path only. | Deps T-020/T-030/T-054; gate: D365 secret fields never rendered, locale-aware navigation from integrations catalog. | Parallel with T-062 after D365 action contracts; can run independent of user/account migrations. |
| T-062 D365 Mapping | `/{locale}/settings/integrations/d365/mapping`; target localized page/test | absent | `d365_mapping_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:109-146` | No localized source; possible closeout by docs-only metadata. | Fresh localized implementation. | Deps T-030; suggested soft dependency on T-061 for breadcrumb/nav consistency; gates: read-only table, export action, BL-TEC-01 banner. | Parallel with T-061 if shared D365 fixtures agreed. |
| T-063 Rules Registry | `/{locale}/settings/rules`; target localized page/test | absent | `rules_registry_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217` | No localized source; route/detail nav could be unlocalized by default. | Fresh localized implementation. | Deps T-025; gate: row links use `/{locale}/settings/rules/:code`. | Parallel with other admin list pages; should precede T-064. |
| T-064 Rule Detail | `/{locale}/settings/rules/:code`; target localized dynamic page/test | absent | `rule_detail_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:223-351` | No source; if built before registry may miss localized inbound links. | Fresh localized dynamic route. | Deps T-025/T-047; suggested UI dependency T-063; gates: dynamic param test under `[code]`, modal/a11y evidence. | Parallel only after shared rule data/action contract; otherwise after T-063. |
| T-065 Flags Admin | `/{locale}/settings/flags`; target localized page/test | absent | `flags_admin_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:357-415` | No localized source; risk of using `/settings/admin/flags` or `/settings/flags` nonlocalized links from prototype notes. | Fresh localized implementation; normalize route as `/settings/flags` under locale unless product wants `/settings/admin/flags`. | Deps T-020/T-048/T-051; gate: L1 edit redirects to localized promote flow; audit reason enforced. | Parallel with T-070 if promotion modal contract is settled. |
| T-066 Schema Browser | `/{locale}/settings/schema`; target localized page/test | absent; related legacy shadow preview exists at `apps/web/app/(admin)/settings/schema/preview/page.tsx` but not this task | `schema_browser_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:421-476` | Browser route absent while adjacent preview route exists legacy; closeout could confuse T-066 with T-128/T-034 preview. | Fresh localized browser implementation; keep preview out of scope except route-link compatibility. | Deps T-023/T-049; gate: edit/deep-links go to localized schema wizard/diff targets. | Parallel with T-067/T-073 if reference data contracts stable. |
| T-067 Reference Data | `/{locale}/settings/reference` and `/{locale}/settings/reference/:code`; target localized pages/tests | absent | `reference_data_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:561-621` | No localized source; T-077 legacy child route exists under old tree and could be mistaken as reference data completion. | Fresh localized list/detail routes; reconcile child manufacturing route placement. | Deps T-021/T-056/T-057; gates: schema-driven columns, import wizard not claimed unless separate, localized child links. | Parallel with T-073; coordinate with T-077 migration. |
| T-068 Email Templates | `/{locale}/settings/email`; target localized page/test | absent | `email_templates_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:626-673` | No localized source. | Fresh localized implementation. | Deps T-031/T-050; gates: API key placeholder only, no secret exposure, SM-04 modal evidence. | Can run with T-069 if fixtures shared. |
| T-069 Email Variables | `/{locale}/settings/email/variables`; target localized page/test | absent | `email_variables_screen`; `prototypes/design/Monopilot Design System/settings/admin-screens.jsx:678-717` | No localized source; likely linked from T-068. | Fresh localized implementation. | Deps T-031; suggested soft dependency T-068 for navigation; gate: clipboard action client-only, no mutation. | Parallel with T-068. |
| T-070 Promotions | `/{locale}/settings/promotions`; target localized page/test | absent | closest `promote_to_l2_modal`; `prototypes/design/Monopilot Design System/settings/modals.jsx:262-375`; no exact full page in index | No localized source; prototype is modal pattern, not page; risk of false 1:1 prototype claim. | Fresh spec-driven localized page; explicitly document no exact screen prototype. | Deps T-028/T-051; gates: do not claim exact parity; route to localized promote modal/diff. | Parallel with T-065 if promotion modal interface shared. |
| T-071 Org Notifications | `/{locale}/settings/notifications`; target localized page/test | absent | `notifications_screen`; `prototypes/design/Monopilot Design System/settings/ops-screens.jsx:98-163` | No localized source; task notes mention `/settings/integrations?highlight=slack` without locale. | Fresh localized implementation; locale-aware Slack integration deep-link. | Deps T-016; gates: localized links and per-rule action isolation. | Independent parallel page. |
| T-072 Features | `/{locale}/settings/features`; target localized page/test | absent | `features_screen`; `prototypes/design/Monopilot Design System/settings/ops-screens.jsx:166-244` | No localized source; prototype note links to flags admin likely nonlocalized. | Fresh localized implementation; locale-aware link to flags admin. | Deps T-019; suggested soft dependency T-065 for full flags link target; gate: plan gating and blockers. | Parallel; avoid blocking on T-065 if link test uses route helper. |
| T-073 Units | `/{locale}/settings/units`; target localized page/test | absent | `units_screen`; `prototypes/design/Monopilot Design System/settings/data-screens.jsx:151-187` | No localized source. | Fresh localized implementation. | Deps T-021; gates: category grouping, base unit derivation, add-unit deferred truthfully. | Independent parallel page. |
| T-074 My Profile | `/{locale}/account/profile`; `apps/web/app/[locale]/(admin)/account/profile/page.tsx` | legacy exists: `apps/web/app/(admin)/account/profile/page.tsx`, `.test.tsx` | `my_profile_screen`; `prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75` | Legacy co-located test green while canonical account route absent; language selector overlap with T-129 can hide integration gap. | Relocate page/test; ensure language preference uses same i18n primitives as T-129; canonical route test. | Deps T-016; gate: no duplicate language persistence path divergent from T-129. | Parallel migration; coordinate with T-129. |
| T-075 My Notifications | `/{locale}/account/notifications`; target localized page/test | legacy exists: `apps/web/app/(admin)/account/notifications/page.tsx`, `.test.tsx` | `my_notifications_screen`; `prototypes/design/Monopilot Design System/settings/account-screens.jsx:77-124` | Legacy test/page under nonlocalized account route. | Relocate page/test and update imports; add route closeout. | Deps T-016; gates: browser push permission behavior client-only, quiet hours validation. | Parallel migration. |
| T-076 Integrations Catalog | `/{locale}/settings/integrations`; target localized page/test | absent | `integrations_screen`; `prototypes/design/Monopilot Design System/settings/integrations.jsx:7-118` | No localized source; downstream tasks may hardcode links into this route. | Fresh localized implementation. | Deps T-030; suggested to land before/with T-061/T-062 for D365 navigation; gate: `view=list|grid` search param preserved with locale. | Parallel with T-061/T-062 if link helper is shared. |
| T-077 Manufacturing Operations List | `/{locale}/settings/reference/manufacturing-operations`; target localized page/test | legacy exists: `apps/web/app/(admin)/settings/reference/manufacturing-operations/page.tsx`, `.test.tsx` | spec-driven SET-055; closest `manufacturing_ops_screen`; `prototypes/design/Monopilot Design System/settings/manufacturing-ops.jsx:54-270` | Legacy route green; test comments name legacy path; no canonical localized child route. | Relocate page/test; integrate or stub T-078 modal contract honestly; route closeout. | Deps T-038; suggested soft dependency T-078 for edit modal; gates: reorder action contract and localized route. | Can migrate in parallel with T-078 if API props are agreed; otherwise after T-078. |
| T-078 Manufacturing Operation Edit Modal | component target `apps/web/components/settings/modals/manufacturing-operation-edit-modal.tsx` | absent | `manufacturing_ops_screen` edit modal portion; `prototypes/design/Monopilot Design System/settings/manufacturing-ops.jsx:54-186` | Not a route, so routing false-green risk is lower; risk is T-077 claiming edit behavior without actual shared modal. | Fresh shared component implementation with tests; ensure T-077 imports it from shared component path. | Deps T-038; gates: V-SET-MFG validations, create/edit read-only differences, modal a11y. | Parallel with T-077 only with stable prop contract; otherwise before T-077 closeout. |
| T-079 Audit Log Viewer | `/{locale}/settings/audit`; target localized page/test | absent | `audit_log_full_screen`; `prototypes/design/Monopilot Design System/settings/audit-log-full.jsx:54-251` | No localized source; earlier task text referenced security_screen but index now has full audit prototype; risk of building preview not full viewer. | Fresh localized implementation from `audit_log_full_screen`, not security preview. | Deps T-010/T-014; gates: partition-aware date-range query, expandable diff, export, localized inbound links from T-060/T-127. | Independent but useful before T-060/T-127 link closeout. |
| T-119 Pending Invitations | `/{locale}/settings/invitations`; target localized page/test | legacy exists: `apps/web/app/(admin)/settings/invitations/page.tsx`, `.test.tsx` | spec-driven SET-010; closest `users_screen` invited-status pattern; `access-screens.jsx:4-157` | Legacy co-located test/page; exact prototype missing; possible false 1:1 parity claim. | Relocate page/test; keep spec-driven deviation log; locale-aware users/roles actions. | Deps T-017/T-052/T-124; gates: no exact prototype claim, non-ready states, permission strings. | Parallel migration after deps confirmed. |
| T-120 Roles and Permissions | `/{locale}/settings/roles`; target localized page/test | legacy exists: `apps/web/app/(admin)/settings/roles/page.tsx`, `.test.tsx` | spec-driven SET-011; closest `users_screen` role permissions matrix; `access-screens.jsx:4-157` | Legacy route green; exact prototype missing; downstream T-127 depends on it. | Relocate page/test first; add canonical route and localized SM-07/modal evidence. | Deps T-001/T-002/T-016/T-018/T-053/T-126; gate before T-127 closeout. | High-priority migration; can run parallel with T-119 but before T-127. |
| T-127 Authorization Policies | `/{locale}/settings/authorization`; target localized page/test | legacy exists: `apps/web/app/(admin)/settings/authorization/page.tsx`, `.test.tsx` | spec-driven SET-011b; closest `tenant_variations_screen` plus `security_screen` pattern; `tenant-variations.jsx:34-161`, `access-screens.jsx:160-245` | Legacy route green; pipeline `scope_files` still placeholder even though prompt names localized path; hardcoded `/settings/audit?entity=org_authorization_policies` in implementation/tests. | Relocate page/test; repair task metadata `scope_files`; make audit link locale-aware; enforce no exact prototype claim. | Deps T-052/T-120/T-126; gate after T-120 localized; test hard blockers and localized audit link. | Run after T-120 migration; can share audit-link helper with T-079. |
| T-129 User Menu Language Picker | Component mounted in localized admin user menu; no direct page route. Expected host route evidence under `[locale]/(admin)` shell. | component exists: `apps/web/app/_components/user-menu-language-picker.tsx`, tests and `apps/web/lib/i18n/user-language.ts` exist | spec-driven SET-100; `my_profile_screen` language field anchor `account-screens.jsx:3-75`; component also declares UX anchor `02-SETTINGS-UX.md:1519-1525` | Component tests can pass without proving it is mounted in localized app shell; `switchNextIntlLocale` is injected and untested at route level; no host `[locale]/(admin)` shell currently present. | Host integration repair, not component relocation: mount in localized AppTopbar/UserMenu, add route-preserving locale switch test, prove no full reload. | Deps T-004/T-116 plus app-shell host task (foundation UI-130/UI-131 or equivalent); gates: locale cookie/path update, current pathname preserved with new locale, Phase 2 disabled. | Can run in parallel with page migrations only after shell host exists; otherwise block on app-shell. |

## ACP-ready remediation waves

### Wave 0 — route/static gate hardening (P0, before more UI greens)

Goal: make false green impossible before any page work continues.

Required gate behavior:

1. For every user-visible Settings/account UI task, assert all page sources live under `apps/web/app/[locale]/(admin)/...`.
2. Reject closeout if the only page/test command references `apps/web/app/(admin)/...` for audited Settings/account pages.
3. Add or enforce an allowlist: non-page shared components may live outside `[locale]/(admin)`, but page routes may not.
4. Require a static route check in closeout: expected localized source file exists; legacy non-localized page is absent or explicitly documented as a temporary redirect/shim.
5. Require route/link tests to assert generated hrefs are locale-aware (`/{locale}/settings/...`, not bare `/settings/...`) or route helper based.
6. Require UI closeout artifacts already mandated by `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`: screenshot/DOM diff, Playwright trace when available, axe report, deviation log for spec-driven/no-exact-prototype screens.

Recommended static search gates:

- Fail audited tasks if changed files include `apps/web/app/(admin)/settings/**/page.tsx`, `apps/web/app/(admin)/settings/**/page.test.tsx`, `apps/web/app/(admin)/account/**/page.tsx`, or `apps/web/app/(admin)/account/**/page.test.tsx`, unless the file is being deleted/moved.
- Fail localized UI page closeout if no matching `apps/web/app/[locale]/(admin)/**/page.tsx` exists.
- Fail on hardcoded `href="/settings` or `href='/settings` and string defaults such as `auditLogHref = "/settings/..."` unless wrapped in a locale-aware route helper.

### Wave 1 — migrate already-built legacy pages (fastest false-green burn-down)

These have code/tests now and should be repaired before claiming further wave progress:

- T-058, T-059, T-060
- T-074, T-075
- T-077
- T-119, T-120
- T-127 after T-120

Parallel lanes:

- Lane A account/org/access basics: T-058, T-059, T-060, T-074, T-075 can run concurrently once `[locale]/(admin)` parent layout exists.
- Lane B settings access extensions: T-119 and T-120 can run concurrently after deps; T-127 waits on T-120.
- Lane C manufacturing reference: T-077 can run with T-078 only if the modal prop contract is agreed; otherwise T-078 first.

Wave 1 gates per task:

- Localized file exists and legacy page/test is removed or replaced only by a deliberate redirect/shim with tests.
- Test command uses `[locale]/(admin)` path.
- No hardcoded non-localized settings/account hrefs.
- Existing parity/behavior tests still pass after import-depth updates.

### Wave 2 — fresh localized page implementations

These are currently absent and can be scheduled as independent ACP tasks after Wave 0 gates:

- Admin/data pages: T-063, T-065, T-066, T-067, T-070, T-071, T-072, T-073, T-079
- Integrations/email pages: T-061, T-062, T-068, T-069, T-076
- Detail route: T-064 should follow or pair with T-063.

Parallel lanes:

- Rules lane: T-063 -> T-064.
- D365/integrations lane: T-076 with T-061/T-062; T-061 and T-062 can run together if fixtures/actions are stable.
- Email lane: T-068 and T-069 in parallel.
- Data/reference lane: T-066, T-067, T-073 in parallel; coordinate T-067 with T-077 route placement.
- Ops/flags lane: T-065, T-070, T-071, T-072 in parallel; share route helpers for cross-links.
- Audit lane: T-079 independent, but prioritize before finalizing T-060/T-127 audit links.

Wave 2 gates:

- New code must be created only under localized route paths.
- No exact prototype claim for T-070/T-119/T-120/T-127 where exact screen prototype is missing.
- Prototype index anchor must be cited in closeout.
- Playwright/RTL evidence must use localized URLs.

### Wave 3 — shell/i18n host integration

- T-129 should not be treated as fully green until the user-menu host exists in the localized authenticated/admin shell.
- Add integration evidence that selecting PL/EN switches `/{oldLocale}/...` to `/{newLocale}/...` without full reload and preserves the rest of the pathname/search params.
- This may depend on foundation app-shell work (UI-130/UI-131 or equivalent) because the current tree does not contain a localized admin shell route group.

## Immediate recommended parent actions

1. Freeze ACP closeout for Settings UI page tasks until Wave 0 static route gates are in place.
2. Prioritize migration of T-059 and its siblings because they are the concrete false-green precedent.
3. Run Wave 1 migrations before accepting new page implementations, otherwise new pages may copy the legacy route/test pattern.
4. Fix T-127 metadata `pipeline_inputs.scope_files` from placeholders to the localized page/test paths before requeueing it.
5. Require all requeued task prompts to state both URL route (`/{locale}/...`) and source path (`apps/web/app/[locale]/(admin)/...`).

## Audit notes

- I did not edit implementation files while producing the initial matrix.
- Follow-up remediation in the same session created the accepted routing decision at `_meta/decisions/2026-05-20-localized-admin-routing.md`.
- Follow-up remediation created a localized T-059 implementation under `apps/web/app/[locale]/(admin)/settings/users/` and reduced the legacy `apps/web/app/(admin)/settings/users/page.tsx` to a redirect shim.
- Follow-up remediation extended the Settings JSON path migration beyond the initial T-058..T-079/T-119/T-120/T-127/T-129 audit set to remaining `02-settings` user-visible route tasks that still referenced `apps/web/app/(admin)/...`.
- I found extensive pre-existing working-tree modifications before writing this report; do not treat this report as a clean-tree assertion.
- This report intentionally avoids secrets and did not inspect `node_modules`.
