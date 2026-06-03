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
- W1 schema: dispatched (Opus, migrations 063+). _result pending_
