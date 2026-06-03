# 02-settings — RUN LEDGER (/kira:run-module)

Started: 2026-06-03 · branch `kira/long-run` · model routing 3-tier (easy→Sonnet, medium→Codex, hard→Opus)

User mandate: polish the WHOLE settings UI to 1:1 prototype parity + nice function,
AND every link must read REAL Supabase data (zero hardcode/mocks).

## Scope (from EXECUTION-PLAN + STATUS, audited 2026-06-02)
- Backend ~90% ✅. Blocking runtime gaps: T-122 `org_authorization_policies` table (runtime bomb),
  T-126 (saves fail w/o T-122), T-034 SCIM bearer-auth join broken, T-011/012/013 schema files,
  T-117 flags migration, T-130 ESLint enum-lock, T-123 rule seed, T-116 ro/uk i18n partial.
- T3-ui: ~57 screens ⏸ — pages exist + mostly wire real data, but NO parity evidence + suspected holes.
- T4: parity Playwright+axe specs (T-143..T-153) + E2E (T-080..T-088) mostly ⬜.
- Structural: duplicate route trees — `(admin)/settings/**` (stale) vs `[locale]/(app)/(admin)/settings/**` (canonical). Consolidate.

## Stage 0 — fresh per-domain reality audit (read-only) — IN PROGRESS
7 agents partition the 69 localized routes; output drives the work-list.

## Work-list (from 7-agent reality audit, 2026-06-03)

### CLASS A — P0 RUNTIME BOMBS (page queries a non-existent table → error/crash in prod)
- T-122 `org_authorization_policies` table MISSING → breaks `/authorization` (T-127), `/roles` (T-120, falls back), `/tenant` (T-100). Migration + RLS + seed + wire T-126. [Codex schema + Opus wire]
- `unit_of_measure` + `uom_custom_conversions` MISSING → `/units` (T-073) error-state. New migration + RLS + seed + canEdit RBAC. [Codex]
- `d365_sync_runs` MISSING → `/integrations/d365/audit` (T-112) crash. New migration + RLS (empty-state honest). [Codex]
- `email_delivery_log` MISSING → `/notifications/email-log` (T-113) crash. New migration + RLS. [Codex]

### CLASS B — P0 FULL_MOCK / no real-data loader wired (violates zero-mock mandate)
- `/modules` (T-103) NO_LIVE_MODULES=[] no query · `/features` (T-072) falls back DEFAULT_FEATURES · `/flags` (T-065) no withOrgContext, toggle no-ops, needs feature_flags_core (T-013) · `/promotions` (T-070) never queries, submit no-op · `/integrations` (T-076) EMPTY_CATEGORIES · `/email` (T-068) DEFAULT_TEMPLATES=[] · `/email/variables` (T-069) DEFAULT_GROUPS=[] · `/import-export` (T-121) entities=[] loader unwired · `/audit` (T-079) callerAccess perms=[], queryAuditLog empty fallback · `/reference/[code]/import` (T-096) wizard never calls import-csv action · `/schema/preview` (T-128) SHADOW_PREVIEW_DRAFTS hardcoded · `/account/notifications` (T-075) hardcoded prefs · `/account/profile` (T-074) write actions = NOT_CONFIGURED stubs. [each: Codex wire loader/action + Opus-ui parity]

### CLASS C — MAJOR/MINOR parity gaps, real data OK (Opus-ui lane)
- `/rules` (T-063) + `/rules/[code]` (T-064) tests wired to wrong route, missing data-testid, dry-run trigger not wired
- `/schema/new` (T-097) wizard step3 type-cards + step4 validators incomplete · `/schema/diff/[id]` (T-098) version pickers static, revert no confirm · `/schema/migrations` (T-099) filter pills→select, missing Diff link
- `/reference` (T-067) schema-driven columns parity-unverified · `/reference/manufacturing-operations` (T-077) industry_code vs dept model + capacity_per_hour missing in DB · mfg-ops history (T-115) missing IP column
- `/users` (T-059), `/company` (T-058), `/security` (T-060 + passwordPolicy hardcoded fallback), `/invitations` (T-119 client-only no SSR), `/integrations/d365` (T-061 5-constant gate not enforced, save unwired), `/d365/mapping` (T-062 DEFAULT_MAPPING_ROWS static), `/tenant/*` (T-100/101/102/109 partial hardcode: schemaExtensionsL3=0, lastUpgradeAt=null, BASELINE_DEPARTMENTS, lastChangedAt=null), modals SM-01..11

### CLASS D — BUCKET D / external (DO NOT build in 02-settings — record as gaps, honor D8 + hard rule)
- D8 → 03-TECHNICAL: `/boms` `/products` `/partners` · 11-shipping T-028: `/ship-override-reasons` · 14-multi-site: `/sites` (redirect OK) · D8 → other: `/devices` `/shifts`
- No task anywhere: `/labels` `/processes` (future module) · `/gallery` (dev tool — candidate remove)
- DECISION NEEDED: leave visible nav stubs, hide nav links, or pull in. (see questions)

### CLASS E — structural cleanup / consolidation
- Non-localized `(admin)/settings/**`: DELETE orphans (users/client.tsx, profile/page.tsx+test); roles/page.tsx has hardcoded defaults + guard test FAILS → move RolesScreen logic to localized tree w/ real data, fix guard; invitations/page.tsx re-exported → migrate to localized SSR; security/* redundant.
- `(settings)/schema/_actions/draft.ts` → KEEP (used by schema/preview dynamic import) or relocate into localized tree.
- Redirect dups (harmless, low-pri tidy): /schema-migrations /schema-wizard /d365-conn /d365-mapping /email-config /email-vars /warehouses /audit-logs /manufacturing-ops.

### CLASS F — gates / evidence / infra
- FIX test infra: confirm `vitest.ui.config.ts` (web) handles JSX/'use server'; root config does not — repoint UI tests. [P0 — Gate-1 blocker]
- Parity evidence (Playwright + axe) T-143..T-153 + E2E T-080..T-088 (currently ⬜). Per-screen 5 states.
- T-130 ESLint enum-lock guard (tooling/eslint-rules missing) · T-123 rule seed · T-116 ro/uk i18n (~47%) · T-011/012/013 Drizzle schema files · T-034 SCIM bearer-auth join.

## Scope decisions (user, 2026-06-03)
- Q1 (Class D nav stubs): CHECK other modules for owning tasks. Build NOW the ones with no real owner
  (Bucket C in settings + seed real data so later module work has real data to reference). Ones with a
  genuine other-module task → build now if cleanly settings-shaped, else record as gap to build with that module.
- Q2 (missing tables): BUILD FULL — new migrations + RLS + real read (honest empty-state) for
  unit_of_measure(+uom_custom_conversions), d365_sync_runs, email_delivery_log, + T-122 org_authorization_policies.
  Seed baseline reference data where legitimate (e.g. standard UoM) — not demo mock.

## Execution waves (Agent fan-out; NO Workflow tool; ≤7 worktrees)
- W1 schema foundation (serialized migrations) + test-infra fix + Drizzle schema files — CRITICAL PATH
- W2 Class B real-data wiring (Opus-ui, depends W1)
- W3 Class C parity polish (Opus-ui)
- W4 Class E structural cleanup (Sonnet/mechanical)
- W5 Class D build-now screens + seeds (after module-ownership check)
- W6 parity evidence Playwright+axe (T-143..153) + E2E (T-080..088)
- W7 i18n ro/uk, SCIM fix (T-034), rule seed (T-123), ESLint guard (T-130)
- → Claude+Codex consensus → SIGNOFF → STOP

## Class D ownership (other-module STATUS grep, 2026-06-03) — for Wave 5 triage
- devices → 06-scanner-p1 · shifts → 06-scanner-p1 / 08-production / 15-oee · labels → 05-warehouse / 11-shipping
- products → 03-technical / 04-planning-basic / 08-production · ship-override-reasons → 11-shipping
- boms, partners, processes → NO owning task in any module STATUS (build-now candidates per user Q1)
- gallery → dev-tool (modal preview), no task. sites → redirect to infra/lines (OK).
Next migration number: 063. Test infra OK (use apps/web/vitest.ui.config.ts for .tsx; root config is node-only).

## Gate log
- W1 schema: ✅ MERGED commit 0ccedce6. Migrations 063-068 + 7 Drizzle schema files + seeds. New isolation test 13/13. Each potentially-affected existing db test passes in isolation; full-suite failures are pre-existing (concurrency + stale fixtures: dup 049, "12 migrations", cohort, users FK). STATUS updated: T-011/012/013/117/122/123 → ✅.
- W2a real-data wiring: DISPATCHED 6 Opus worktree agents (background), each = real Supabase + prototype parity + 5 states + UI tests:
  - G1 modules+features (T-072,T-103) · G2 flags (T-065) · G3 promotions (T-070) · G4 integrations (T-076) · G5 audit (T-079) · G6 email+email/variables (T-068,T-069)
  - On completion: merge each worktree → kira/long-run (resolve additive i18n), re-verify gates, refresh STATUS.
- W2a discovered gap: `public.integration_settings` (category='email' provider config) has NO migration — email loader fails closed via to_regclass guard. ADD migration in W2b/schema follow-up (or confirm canonical owner). Tracks alongside d365 sync config table family.
- W2a done so far (worktrees, not yet merged): G5 audit (9/9), G2 flags (13/13), G6 email+variables (23/23 + 3 action). All typecheck 0. Pending: G1 modules+features, G3 promotions, G4 integrations.
- MERGE-REVIEW FLAGS (resolve before/at merge):
  1. i18n path inconsistency: flags→`apps/web/messages/<locale>/02-settings.json`; promotions→`apps/web/i18n/<locale>.json`. Determine canonical next-intl path; normalize so all W2a strings resolve. CHECK before merge.
  2. promotions authored new submitPromotion/previewPromotion — verify NOT duplicating canonical upgrade orchestration at `app/api/internal/upgrade/_actions/` (recordMigrationRun/advanceCohort). STATUS T-028 claimed actions/tenant/preview-upgrade.ts exists but agent didn't find it — reconcile.
  3. integration_settings missing table (email provider config) — see above.
  4. **G1 STALE-BASE + MIGRATION COLLISION (blocking):** G1 worktree used lowercase `/Users/mariuszkrawczyk/projects/` checkout (older commit, saw max migration=050, NOT 068). It created `051-modules-description.sql` (adds modules.description + organization_modules.updated_at) — COLLIDES with existing 051. Fix at merge: renumber to 069, verify G1's features/modules page diffs apply cleanly on current HEAD (no Wave-1 revert), re-run db test for the new column. The updated_at column IS a real need (toggle.ts T-019 writes it). G2/G3/G5/G6 bases verified OK (referenced 067 correctly).
- W2a ✅ MERGED. All 6 worktrees were based on `main` (8601fd90, 137 commits behind kira/long-run) — but every touched code file was identical base↔HEAD, so applied worktree diffs as clean patches onto HEAD (no git-merge of stale base). G1 migration 051→renumbered 069 (modules.description + organization_modules.updated_at, applied to DB). G3/G4 i18n relocated from i18n/<locale>.json into messages/<locale>/02-settings.json (canonical namespace). Consolidated verify from main checkout: web typecheck=0; 7 UI test files = 59/59 green; modules+settings-core db tests green; migration 069 applied + columns verified. STATUS: T-065/068/069/070/072/076/079/103 → 🔄 (real data + RTL parity done; Playwright/axe pending W6).
- W2b DISPATCHED (6 worktree Opus agents, raw-SQL via withOrgContext, NO new-Drizzle-import since worktree base=main lacks them; tables exist in shared DB): units(T-073) · account profile+notifications(T-074/075) · import-export(T-121) · reference/[code]/import(T-096) · schema/preview(T-128) · authorization(T-127)+roles(T-120)+Class-E roles consolidation+guard-test fix. All W2b target files verified base==HEAD → patch-merge recipe applies. Merge after all 6.

## Merge recipe (proven, W2a) — for stale-base worktrees
Worktrees branch from `main` (8601fd90, 137 behind). Since touched files are base==HEAD: `git -C <wt> diff -- <tracked files except i18n/<locale>.json> | git apply` in main; copy untracked new files; renumber any new migration to next free; relocate any i18n that landed in i18n/<locale>.json → messages/<locale>/02-settings.json. Then consolidated verify (web typecheck + vitest.ui.config.ts + targeted db tests) + commit + cleanup worktrees.

## W2b merge-review flags
- units(ad0e2c): modified SHARED `apps/web/test-setup.ui.ts` (next-intl mock fix for object-form getTranslations) — after merge, re-run W2a+W2b UI suites to confirm no regression. Local Radix-free Dialog used due to worktree React-18 peer; on HEAD (React-19) revert to @monopilot/ui Modal.
- DECISION: W3+ run in MAIN checkout (non-worktree) — worktree-from-main ships React-18 packages/ui + no node_modules, forcing workarounds. Main checkout = correct React-19 peers, all migrations/schema present.
- W2b done: schema-preview(T-128,11/11), reference-import(T-096,15/15), units(T-073,9/9), account(T-074/075,15+11), authorization+roles+consolidation(T-127/120,19+24guard). Pending: import-export(T-121).
- NOTE: afb0ab (authorization+roles) wrote DIRECTLY to MAIN checkout (bypassed worktree) — its files already uncommitted in main (authorization/roles/guard-test/messages). Disjoint from other 5 worktrees except 02-settings.json. Merge other agents' i18n via NODE key-merge (not patch) to avoid JSON collisions with afb0ab's roles keys already in main.
- account(a40a90): git-mv notifications page→client + new server page.tsx; fixed stale test pagePath. authorization gaps: no user_sessions table (SESSIONS_BACKEND_UNAVAILABLE), no users.phone, quiet-hours times not stored — honest, documented.
- Pre-existing fails (out of scope, confirmed on baseline): wave7-8-i18n-consumption (non-localized (admin)/settings/users no next-intl), guard invitations @monopilot/ui import path, mfg-operations/page.test.tsx.
- W2b ✅ MERGED. Baseline (e7778f1e, no W2b) UI suite = 70 failed/556. After W2b = 36 failed/584 → net -34 fails +28 tests, ZERO new regressions (verified via stash baseline). All 36 remaining fails are pre-existing in UNTOUCHED screens (tenant, rules, tenant/rules, tenant/depts, mfg-ops history, SET-055, npd, d365/sync) = W3/other-module targets. web typecheck=0. STATUS T-073/074/075/096/120/121/127/128 → 🔄. i18n 3-way delta-merged (roles from afb0ab preserved). units used shared test-setup.ui.ts fix (no regression confirmed) + local Dialog (works on HEAD React-19; revert to @monopilot/ui Modal is optional cleanup).

## W3 DISPATCHED (6 worktree Opus agents, parity-polish, target the 36 pre-existing failing tests)
- A tenant suite (T-100/101/102/109) · B rules suite (T-063/064/108) · C schema-admin (T-097/098/099) · D reference+mfg-ops (T-067/077/115/114) · E d365 integrations (T-061/062/111/112 + the d365/sync EN/PL i18n parity test) · F users/company/security/invitations (T-059/058/060/119 + invitations SSR + @monopilot/ui import guard fix).
- Real data mostly already wired on these — focus = prototype parity 1:1 + make failing page.test.tsx pass + remove residual partial-hardcode (tenant schemaExtensionsL3/lastUpgradeAt/lastChangedAt, BASELINE_DEPARTMENTS, d365 DEFAULT_MAPPING_ROWS, security passwordPolicy fallback).
- Merge: same proven recipe (patch non-i18n, copy untracked, node 3-way i18n merge, consolidated verify vs baseline, commit, cleanup).

## W3 merge notes (in progress)
- i18n PATH DIVERGENCE: some W3 agents (e.g. D reference+mfg-ops) edit `apps/web/i18n/<locale>.json` (old structure in their stale main base) instead of canonical `messages/<locale>/02-settings.json` (HEAD). At merge, inspect each agent's actual changed i18n file and RELOCATE its settings.* additions into messages/<locale>/02-settings.json (top-level key = the subnamespace). Pages call getTranslations('settings.<ns>') which resolves from 02-settings.json on HEAD.
- W3 done so far: D reference+mfg-ops (fixed mfg-operations route test + mfg-ops history namespace + IP column; 18/18+22/22; relocate manufacturing_operation_history i18n). Pending: A tenant, B rules, C schema, E d365, F users/company/security/invitations.

## W3 ✅ MERGED (parity polish)
6 worktree agents merged via proven recipe (patch non-i18n incl packages/ui Select/Checkbox [base==HEAD]; node 3-way i18n delta-merge for A/B/C/E messages + relocate D/F from i18n/<locale>.json; test-setup.ui.ts kept main's W2b version, agents' skipped). Consolidated verify: web typecheck=0; UI suite 17 failed/591 vs 36 failed/584 baseline → net -19, ZERO new regressions (stash A/B verified). W3 FIXED: tenant(21/21), rules(9/9), schema(22/22), d365(39+13), reference+mfg-ops(18/18+IP col), users/company/security/invitations(25/0 + invitations SSR + @monopilot/ui guard fix). New action/route/client files added. i18n: en/pl 43 / ro/uk 30 top-level keys (ro/uk grew via d365/reference/tenant namespaces).
Remaining 17 fails = ALL pre-existing, out of W3 scope: npd dashboard (T-134, other module) ~8; notifications T-071 live-DB pg_catalog test (needs DB) 1; `[locale]/(admin)/settings/{flags,reference,rules}` MIDDLE-TREE parity test cruft (canonical (app)/(admin) versions pass) — fix/remove in W4.
Screens now real-data + parity: ~28. Tasks advanced (set 🔄 in next STATUS reconcile): T-058/059/060/061/062/063/064/067/077/097/098/099/100/101/102/108/109/111/112/114/115/119.

## CRITICAL DEPLOY FIX (2026-06-03) — see memory [[deploy-migration-gotcha]]
Live preview was broken because migrations 051-070 NEVER reached Supabase (dup-049 broke migrate-runner + vercel.json `|| echo` swallowed it; Supabase stuck at 050). FIXED: applied 051-070 to Supabase via MCP + tracked w/ sha256; renumbered dup-049→070 (+ outbox CHECK onboarding.* union); vercel.json fail-loud. Commits f73f5195. Build f73f5195 READY (fail-loud migrate passed). Seeds verified (authz/UoM/flags/gate).
Vercel PROD = main; work is PREVIEW (alias monopilot-kira-git-kira-long-run-...). Test login: admin@monopilot.test.

## LIVE AUDIT findings (in progress, background agent ab782065)
- company STILL "could not be loaded" AFTER migrations (columns exist) → real loader bug ([settings/company] load_failed) — agent diagnosing via runtime logs + fixing.
- INVALID_MESSAGE (next-intl ICU) errors in runtime logs — possible bad message from i18n merges → agent validating messages/02-settings.json + i18n/<locale>.json.
- App shell + full settings nav RENDER fine; login works.
- Background: live-audit-and-fix agent (full click-through + root-cause + code fixes, no commit) + Codex review of schema 063-070 (_meta/runs/codex-review-schema-063-070.md).
- modules.description seed = 0 on Supabase (069 codes mismatch live module codes) — cosmetic, backfill later.

## STANDARD (user, 2026-06-03): Gate 5 — live-deploy verification before sign-off
Green-local ≠ live. Before ANY sign-off: push → Vercel build READY w/ fail-loud migrate → Supabase
max(filename) == repo's highest migration (no stale schema) → authenticated Playwright click-through of
EVERY route on the deployed preview (`/en/login`, admin@monopilot.test), capturing get_runtime_logs error
for each failure → screens show real data live. Codified in: docs/workflow/02-QUALITY-GATES.md (Gate 5),
07-MODULE-EXECUTION.md (step 5), .claude/commands/kira/run-module.md (step 5 + Never), MON-domain-settings
skill (Gate 5 + DoD), memory [[live-deploy-verification-gate]].

## Codex cross-provider review (done) → migration 071 (applied + pushed e63345f5)
Codex found real P1s in 063-070 (validates using Codex): notification_preferences missing grant/revoke;
outbox CHECK not union-complete (missing settings.module.toggled/org.updated/reference.row_updated/scim/fa.* → 23514 on writes);
SECURITY DEFINER seed fns public-executable (cross-org bypass); d365 direction allowed 'pull' (R15 export-only).
071 fixes all + verified on Supabase (app_user grant, 44 outbox types, seed execute revoked, direction=push). 066/069 confirmed correct.

## DATA-PLANE ROOT CAUSE FOUND + FIXED (2026-06-03) — app_user PASSWORD DRIFT
Full runtime log (via `vercel logs`): `[withOrgContext] phase_failed { phase:'app_pool_connect',
message:'password authentication failed for user "app_user"', code:'28P01' }`. The env vars DO exist
(they are Vercel "Sensitive" → unreadable via pull) — DATABASE_URL_APP's embedded app_user password
no longer matched the app_user role on Supabase (DB was wiped/reseeded; env kept stale pwd). Owner pool
(DATABASE_URL/OWNER=postgres) worked → only app pool broke. FIX: reset `app_user` password via Supabase MCP
(ALTER ROLE) to a new value; set `DATABASE_URL_APP` (direct host db.<ref>.supabase.co:5432, sslmode=require)
+ `APP_USER_PASSWORD` on Vercel preview+prod to match; redeploy. Direct host from get_project (region eu-central-2).
VERIFY pending: redeploy → Playwright Gate-5 click-through → confirm phase_failed gone + real data renders.
(Earlier "DATABASE_URL_APP unset" hypothesis was WRONG — vars are set-but-sensitive; real cause = pwd drift.)

## ✅ DATA PLANE FIXED + VERIFIED LIVE (2026-06-03)
DATABASE_URL_APP corrected to `app_user.<ref>@aws-1-eu-central-2.pooler.supabase.com:5432/postgres?sslmode=no-verify`
(app_user pwd reset; pooler host aws-1/session-5432; sslmode=no-verify) on Vercel preview+prod + redeployed.
LIVE PROOF (Playwright, logged in): /en/settings/company renders REAL org data (Apex / Meat processing / Poland / PLN / Europe-Warsaw).
The 3-layer chain (28P01 pwd → ENOTFOUND direct-host → self-signed-cert) all resolved. See memory [[deploy-migration-gotcha]].
REMAINING per-screen: /settings/infra/lines still 500s ("This page couldn't load", ERROR 2923698551 — uncaught server error, SEPARATE bug, not data-plane). → full Gate-5 sweep agent to find+fix remaining per-screen bugs now that data plane is up.

## ✅ GATE-5 LIVE VERIFIED (2026-06-03, commit ce68e984 deployed)
Per-screen RSC crashes fixed: infra/lines + users passed inline closures (not 'use server' actions)
to Client Components → Next16 serialization throw → error boundary. Fixed (pass actions directly).
LIVE PROOF after redeploy: /settings/company = real org data (Apex); /settings/users = real user dir
(1 user, admin@monopilot.test, role matrix, KPIs); /settings/infra/lines = renders (RBAC-gated, not crash).
Sweep report: _meta/runs/02-settings-GATE5-SWEEP.md. Remaining non-OK = INTENTIONAL: RBAC-denied for the
admin@monopilot.test account on owner-only screens (/flags, /d365/sync), honest empty states (audit/features/
reference/tenant w/ 0 rows), D8 stubs (shifts/products/boms/processes/partners/devices/ship-override). No bugs.
NOTE: test account is org-admin, NOT owner → real owner will see fuller access. Write path (outbox CHECK 071) verified live.

## (superseded) earlier hypothesis: DATABASE_URL_APP env on Vercel
Whole settings/account data plane down on preview — withOrgContext app-pool auths with wrong app_user password
because DATABASE_URL_APP is unset (falls back to DATABASE_URL + APP_USER_PASSWORD/'app-user-test-password').
Fix = set DATABASE_URL_APP (app_user pooler conn, real pwd) on Vercel + redeploy. Options A/B/C presented to user.
Then re-run Gate-5 live click-through. observability (with-org-context phase_failed log) deployed to confirm phase.

## Remaining waves after W3 (Gate 5 live-verify is the LAST step before sign-off)
- W3 parity polish (real data OK, parity gaps): rules(T-063)+rule-detail(T-064)+diff(T-108), schema/new(T-097)+diff(T-098)+migrations(T-099), reference(T-067)+mfg-ops(T-077,115), users(T-059), company(T-058), security(T-060), invitations(T-119), d365 conn/mapping(T-061/062), tenant/*(T-100/101/102/109), modals SM-01..11, language picker(T-129), onboarding steps(T-041..046).
- W4 structural cleanup: delete non-localized (admin)/settings orphans (users/client.tsx, profile/*), redirect dups; consolidate. (roles handled in W2b.)
- W5 Class D build-now: boms/partners/processes (no owner) build in settings + seed; devices/shifts/labels/etc per ownership — hide nav OR build (user: build part now + seed). onboarding /onboarding stub→real wizard.
- W6 parity evidence Playwright+axe (T-143..153) + E2E (T-080..088) — run from MAIN checkout (worktrees lack node_modules).
- W7 i18n ro/uk full (T-116), SCIM bearer fix (T-034), ESLint enum-lock (T-130), integration_settings migration.
- → Claude+Codex consensus → SIGNOFF → STOP.
