# UX ↔ PRD ↔ Plan Gap Backlog (Phase B.2 Modules 00 / 01 / 02)

**Date:** 2026-04-30
**Branch:** `claude/review-npd-prd-fzqem`
**Scope:** Verify 100% UX → PRD → Plan coverage for 00-FOUNDATION, 01-NPD, 02-SETTINGS before Phase E-0 kickoff
**Source data:** 14 narrow gap analyses (`/tmp/{SET-A1..A5, NPD-B1..B4, FND-B1..B3, GAP-00-FOUNDATION, GAP-01-NPD}.md`)

---

## Executive Summary

**Coverage status (3 modules, 47+37+infra prototypes):**

| Module | UX features covered fully | UPDATE needed | ADD needed |
|--------|--------------------------|---------------|------------|
| **00-FOUNDATION** | ~60% (auth, primitives missing) | 5 PRD sections, 4 plan tasks | 4 PRD sections, ~22 plan tasks |
| **01-NPD** | ~50% (13 prototypes unanchored) | 10 PRD sections, ~5 plan tasks | 4 PRD sections, ~26 plan tasks (3 new sub-modules) |
| **02-SETTINGS** | ~70% (wizard partial, auth thin, modals 0% contract) | 8 PRD sections, ~6 plan tasks | 4 PRD sections, ~25 plan tasks |

**Aggregate effort estimate:** ~85-100 person-days for full UX→PRD→Plan reconciliation (excluding implementation; just spec + plan updates + new task drafting). Of this, ~60 person-days is **net new implementation work** (auth subsystem, NPD-g/h/i sub-modules, settings wizard finalization, UI primitives package).

---

## CRITICAL DECISIONS NEEDED (must resolve before any plan changes)

These are blocked: cannot write task ACs until decided.

### D1 — RBAC: 10 system roles vs 4 customer-facing roles
- **PRD §2** mandates 10 roles (owner/admin/npd_manager/module_admin/planner/production_lead/quality_lead/warehouse_operator/auditor/viewer)
- **UX `UsersScreen`** hard-codes 4 roles (Admin/Manager/Operator/Viewer) with color map
- **Decision:** keep 10 system roles + add 4-role display alias map? Or collapse to 4? **Recommend:** keep 10 in DB, add `role_categories` table with 4 customer-visible groups for the matrix UI.

### D2 — Permission model: flat dot-strings vs 4-level matrix UI
- **PRD §3 + `permissions.enum.ts`** use flat dot-namespaced strings (`settings.users.create`)
- **UX permission matrix** shows 4 perm levels per (module × role) cell: admin (◉) / rw (✎) / r (◎) / none (–)
- **Decision:** the prototype UI cannot be built as-drawn against current model. Either (a) keep flat permissions, redesign UI as checkbox per permission grouped by module (current T-02SETa-009), OR (b) introduce `module_permission_levels` derived view that maps flat permissions to 4 levels per module. **Recommend (a)** — UI redesign matches existing model; prototype is illustrative.

### D3 — Onboarding wizard screen-code numbering
- **UX** uses SET-001..SET-006 (6 codes, no separate launcher)
- **PRD §14.4** uses SET-001..SET-007 (7 codes, separate launcher)
- **Plan T-02SETe-007** follows PRD numbering
- **Decision:** UX is the analytics + Playwright contract. **Recommend:** drop "launcher" code, renumber PRD to SET-001..SET-006 to match UX.

### D4 — NPD Sensory stage status (BUILD vs DEPRECATED)
- **5 of 7 stage screens** carry explicit LEGACY banner (Trial/Pilot/Handoff/Packaging) per BL-NPD-02
- **Sensory screen** has NO banner but references Trial (which IS deprecated)
- **Decision:** confirm Sensory deprecation status. **Recommend:** BUILD if FA Technical dept does not absorb it as single `overall_score` cell; otherwise reduce to FA cell.

### D5 — NPD Pipeline: 2 vs 3 view modes
- **PRD §17.8** lists 2 views: Kanban + List
- **UX prototype** has 3 views: Kanban / Table / Split
- **Plan T-01NPDf-020 AC** uses `view=kanban|list` URL param (matches PRD)
- **Decision:** add Split view. **Recommend:** update PRD to §17.12 listing all 3 modes; add T-01NPDf-023 for split view.

### D6 — Sub-module naming for new NPD work (g/h/i collision)
- **NPD-B1** proposes `01NPDg` = Recipe/Formulation
- **NPD-B2** proposes `01NPDh` = Nutrition+Costing+Sensory, `01NPDi` = Approval extension
- **NPD-B3** also proposes `01NPDg` = Risk + Compliance — **COLLISION**
- **Decision:** **Recommend final naming:**
  - `01NPDg` = Recipe + Formulation editor (B1)
  - `01NPDh` = Stage screens: Nutrition + Costing + Sensory (B2)
  - `01NPDi` = Approval (gate extension) + Risk Register + Compliance Docs (B2 approval + B3 combined)

### D7 — WebAuthn UI behavior (deferred per PRD but UX shows checkbox)
- **PRD §14.1** says WebAuthn "deferred Phase 3"
- **UX SecurityScreen** shows WebAuthn checkbox (unchecked)
- **Decision:** show as `disabled` with tooltip "Coming Phase 3". **Recommend** this; agreed in FND-B2 retry.

### D8 — Mis-tagged prototypes in `prototype-index-settings.json`
6 prototypes belong to other modules but indexed under settings:
- `sites_screen` → 14-MULTI-SITE
- `shifts_screen` → 15-OEE
- `devices_screen` → 06-SCANNER-P1
- `products_screen`, `boms_screen`, `partners_screen` → 03-TECHNICAL
- **Decision:** fix index file (move entries to per-module index files). Not a real coverage gap but will produce false signal in any cross-check.

---

# MODULE 00-FOUNDATION

## UPDATE list (existing PRD/plan content needs revision)

### PRD updates (5 items)

| # | Where | Current | UX evidence | Recommended change |
|---|-------|---------|-------------|---------------------|
| **F-U1** | §5 Tech Stack lines 233-263 | Mentions Supabase only as Postgres host; auth invisible | `access-screens.jsx:162-244` (TOTP/SMS/WebAuthn, SAML Entra ID, SCIM, password policy, idle timeout, max session, IP allowlist, audit log) | Add §5.x Auth & Identity Stack [UNIVERSAL] — see ADD section F-A1 below for proposed content (~330 words, FND-B1) |
| **F-U2** | §8 Multi-tenant Model lines 358-396 | Treats `tenant_id` as only multi-tenancy primitive; impersonation guarded by MFA but MFA never specced | UX SSO `Enforce SSO` toggle disables password login for non-admins; SCIM provisions users from Entra ID → tenant→IdP mapping required | Add §8.x Per-tenant IdP mapping with `tenant_idp_config` table (FND-B1 §8.x has full DDL, ~210 words) |
| **F-U3** | §11 Audit Log lines 824-825 (single paragraph) | "Append-only `audit_events` tabela; triggers + event-sourced; SOC 2/GDPR/FDA Part 11" | UX renders 5-row audit table with Who/Action/IP/timestamp + System actor + impersonation context | Expand to 13-field schema with retention tiers (FND-B1 §11.x has full table + retention matrix) |
| **F-U4** | §3 Personas lines 113-130 | Lumps "Administrator" as single secondary persona | UX has 4 default roles (Admin/Manager/Operator/Viewer) + distinct admin landing surfaces (security policy vs schema/rules) | Split into Org Admin (ACCESS pillar) + Schema Admin (ADMIN pillar) per SOC 2 CC6.3 separation-of-duties (FND-B1 has diff) |
| **F-U5** | §13 Success Criteria lines 905-942 | Compliance lists SOC 2/GDPR/FIC/BRCGS/FSMA/EUDR; no auth criteria | UX `enforce-2FA-for-admins` ON by default; password policy "Strong" default; SSO connected as first-class state | Add 5 Niefunkcjonalne items: MFA-by-default, NIST password policy, idle timeout default, SSO baseline, magic-link 7-day TTL |

### Plan updates (4 items)

| # | Task | Current scope | Required scope expansion |
|---|------|---------------|--------------------------|
| **F-PU1** | T-00c-002 (signup/login Server Actions) | Email+password happy path + outbox event | Call `password-policy.check()` (T-00c-011), increment lockout counter (T-00c-015), add typed errors `WEAK_PASSWORD\|LOCKED\|MFA_REQUIRED` |
| **F-PU2** | T-00c-003 (Next.js middleware) | Session attach + org_id resolve + redirect-if-unauthed | Add idle-timeout enforcement (T-00c-013), IP allowlist gate (T-00c-014) AFTER session, BEFORE org_id; SCIM bearer paths bypass |
| **F-PU3** | T-00c-004 (`/login` page UI) | Email+password page only | Add MFA challenge sub-step (6-digit input on `MFA_REQUIRED`), lockout 423 alert, "Sign in with SSO" + magic-link tab |
| **F-PU4** | T-00c-006 (E2E Playwright) | Happy-path login + whoami + logout | Extend with MFA-required flow + lockout-then-recover after T-00c-007 + T-00c-015 land |

## ADD list (entirely new PRD/plan content)

### PRD additions (4 new sections, ~1300 words total)

| # | Section | Source data | Content sketch |
|---|---------|-------------|----------------|
| **F-A1** | §5.x Auth & Identity Stack [UNIVERSAL] (NEW, ~330 words) | FND-B1 | GoTrue/Supabase Auth as primary IdP, `@boxyhq/saml-jackson` SAML SP, SCIM 2.0 endpoints, TOTP via `otplib` + WebAuthn via `@simplewebauthn/server`, magic-link 7-day TTL, argon2id verify-PIN, JWT 15min/refresh rotating idle 60min/abs 8h, 6 OSS libraries locked |
| **F-A2** | §8.x Per-tenant IdP Mapping (NEW, ~210 words) | FND-B1 | `tenant_idp_config` table with provider_type enum (saml/oidc/password/magic), JIT provisioning bool, SCIM token hash (argon2id), per-tenant idle_timeout/session_max/mfa_required overrides; UI in 02-SETTINGS ACCESS pillar |
| **F-A3** | §5.y Shared UI Primitives `@monopilot/ui` (NEW, ~210 words) | FND-B3 | `packages/ui` workspace package; 5 modal/form primitives (Modal/Stepper/Field/ReasonInput/Summary); 5 tuning primitives (RunStrip/EmptyState/TabsCounted/CompactActivity/DryRunButton); MODAL-SCHEMA.md as canonical contract for 10 patterns; Storybook 8 + axe-core CI |
| **F-A4** | §4.2-AMENDMENT addendum (DIFF) | FND-B3 | Add `00-FOUNDATION-impl-j (UI primitives + design-token package)` to Foundation set; must complete in parallel with d/e/f/g/h before any 01-NPD-a or 02-SETTINGS T3-ui task starts |

### Plan additions (~22 new tasks across 2 sub-modules)

#### Sub-module 00-c (Auth) — 11 new tasks (~14 person-days)

| Task ID | Scope | Dep | Effort (pd) |
|---------|-------|-----|-------------|
| T-00c-007 | TOTP enrollment + verify (`enrollTotpAction`, `verifyTotpAction`, `user_mfa_factors` table, recovery codes hashed argon2id) | T-00c-002, T-00f-002 | 1.5 |
| T-00c-008 | SAML 2.0 SP integration (`@node-saml/passport-saml`, routes `/api/auth/saml/{login,callback,logout,metadata}`, `org_saml_config` table) | T-00c-001, T-00c-003 | 3 |
| T-00c-009 | SCIM 2.0 endpoint (`/api/scim/v2/Users` + `/Groups`, bearer-token auth scoped to org, soft-delete on `active=false`) | T-00c-001, T-00d-002 | 2.5 |
| T-00c-010 | Magic-link invitation accept flow (signed token 7-day TTL single-use, `/invite/accept` page, outbox `USER_INVITE_ACCEPTED`) | T-00c-002 | 1 |
| T-00c-011 | Password policy + history (`lib/auth/password-policy.ts`, HIBP k-anonymity check, `password_history` last-5 hash, `org_password_policy` admin-tunable) | T-00c-002 | 1 |
| T-00c-012 | Active sessions list + revoke (`active_sessions` table, `/settings/sessions` page) | T-00c-003 | 1 |
| T-00c-013 | Idle timeout policy (org-level `idle_timeout_min`, separate from absolute `session_max_h`) | T-00c-003, T-00c-012 | 0.5 |
| T-00c-014 | IP allowlist admin (`org_ip_allowlist` table CIDR, middleware gate, `/settings/security/ip-allowlist` UI) | T-00c-003 | 1 |
| T-00c-015 | Login attempt lockout (`auth_attempt` counter, 5 fails → 15min, admin reset) | T-00c-002 | 0.75 |
| T-00c-016 | Impersonation UX flow with MFA gate (UI on superadmin org-list, persistent yellow banner) | T-00d-005, T-00c-007 | 1 |
| T-00c-017 | 2FA enforce-per-role toggle (org setting `mfa_required_for_roles`, force-enroll redirect) | T-00c-007 | 0.5 |

WebAuthn excluded — PRD defers to Phase 3.

#### Sub-module 00-j (UI Primitives) — 7 new tasks (~8.5 person-days)

| Task ID | Scope | Dep | Effort (pd) |
|---------|-------|-----|-------------|
| T-00j-001 | Bootstrap `packages/ui` + `<Modal/>` on Radix Dialog (size tokens, dismissible, ESC, focus trap, return-focus) | T-00a-001, T-00a-003 | 1 |
| T-00j-002 | Port 4 base form primitives: `<Stepper/>`, `<Field/>` (RHF Controller + Zod), `<ReasonInput/>` (minLength counter), `<Summary/>` | T-00j-001 | 1 |
| T-00j-003 | Implement 10 MODAL-SCHEMA pattern templates (Wizard / SimpleForm / DualPath / Picker / Override / Error / Confirm-non-destruct / Confirm-destruct-simple / Confirm-destruct-with-reason / Preview-compare) | T-00j-001, T-00j-002 | 2.5 |
| T-00j-004 | Port 5 tuning primitives + `deriveRunHistory` helper (RunStrip / EmptyState / TabsCounted / CompactActivity / DryRunButton) | T-00j-001 | 1.5 |
| T-00j-005 | Design tokens (`packages/ui/tokens.css`) + Tailwind theme map (per-tenant override hook) | T-00j-001 | 1 |
| T-00j-006 | Storybook 8 + axe-core a11y CI (21 minimum stories: 11 primitives + 10 patterns) | T-00j-002, T-00j-003, T-00j-004 | 1 |
| T-00j-007 | Modal a11y RTL helper `assertModalA11y()` + ESLint `no-restricted-imports` blocking `@radix-ui/react-dialog` outside `packages/ui` | T-00j-003 | 0.5 |

**Critical-path blocker:** T-00j-001..003 must complete before any module's T3-ui tasks (12 modules downstream).

---

# MODULE 01-NPD

## UPDATE list (existing PRD/plan content needs revision)

### PRD updates (10 items, from Section A)

| # | Where | Issue | Action |
|---|-------|-------|--------|
| **N-U1** | §10.6 (lines ~1191-1215) | Specifies single-click + MFA only; UX MODAL-10 + `d365_wizard_modal` (modals.jsx:431-594) define 8-step guided wizard | Add §10.6.1 Guided Build Wizard (8 steps + per-step server actions + SSE-based progress stream) — see ADD N-A1 |
| **N-U2** | §17 Stage-Gate (lines 1553-1685) | References stage names but no data-model/AC for stage content; SCR-07/SCR-08 + `recipe_screen`/`nutrition_screen`/`costing_screen`/`sensory_screen`/`approval_screen` have **zero schema** | Add §17.11 Stage screen specifications with sub-sections per build stage — see ADD N-A2 |
| **N-U3** | §10.7 (line ~1218) | "BOM view = computed on-the-fly... read-only" | UX SCR-03h (`fa_bom_tab`, fa-screens.jsx:823-868) shows per-row D365 status (Found/NoCost/Missing), Type badge (RM/PM), CSV export — make explicit `fa_bom_view` SQL view + `bom_export_csv` action |
| **N-U4** | §5.7 (lines 526-540), §8 (lines 837-988) | Allergen override = single TEXT field on FA + audit | `allergen_override_modal` (modals.jsx:389-428) writes to dedicated table per-row (allergen × FA × actor × ts) — add §8.10 `fa_allergen_overrides` schema |
| **N-U5** | §11.5 (lines ~1336-1340) | "Polling fallback" + "WebSocket optional Phase C5" | Make 30s polling **the Phase B.2 contract** (SWR `refreshInterval:30000` or SSE); explicitly defer WebSocket push to Phase C5; tighten AC to "alert refresh ≤30s" |
| **N-U6** | §2.2 RBAC (lines 124-141) | Matrix lists 11 permissions | Add: `risk.write`, `compliance_doc.write`, `formulation.create_draft`, `formulation.lock`, `recipe.submit_for_trial`, `pilot.promote_to_bom`, `npd.gate.advance`, `npd.gate.approve` (last two were §17.9 only) |
| **N-U7** | §6.1 Chain 2 (lines 619-655), §12 V06 (line 1361) | UX SCR-03d V06 inline alert uses meat-specific copy: "MISMATCH: Finish_Meat ends 'H' but last process suffix is 'A'" | Update UX-line 430 (and PRD V06 example) to generic ingredient/component code wording per v3.1 |
| **N-U8** | §11 Dashboard (lines 1260-1346) | Refresh D365 Cache referenced in §10.8 only | Add §11.7 Dashboard interactive controls — Show-built toggle, Refresh-D365-Cache button + last-sync timestamp, debounce/throttle |
| **N-U9** | §13.2 build sequence (lines 1399-1408) | Lists 01-NPD-a..f only | Add 01-NPD-g (Recipe + Formulation), 01-NPD-h (Stage screens: Nutrition + Costing + Sensory), 01-NPD-i (Approval + Risk + Compliance) per D6 |
| **N-U10** | §12 V08 (line 1363) | "Brief mapping complete: if fa.brief_id, all required brief→FA fields populated" | Add explicit field list (matches UX MODAL-03 13-field table) so validator has concrete checklist |

### Plan updates (~5 items)

| # | Task | Current | Required |
|---|------|---------|----------|
| **N-PU1** | T-01NPDf-020 (Pipeline kanban + list) | `view=kanban\|list` URL param | Add 3rd mode `split`; URL param `view=kanban\|table\|split`; URL persistence via `useSearchParams` |
| **N-PU2** | T-01NPDf-021 ("ProjectDetail + StageRail + stage screens") | 12 stage panels as `other-stages.jsx` placeholder | Mount Recipe stage from new T-01NPDg-003; mount Nutrition/Costing/Sensory from T-01NPDh-002/004/006; mount Approval from T-01NPDi-003 |
| **N-PU3** | T-01NPDd-020 (D365 page + modals) | Single-click + MFA | Cross-link to new T-01NPDd-021 (8-step wizard variant) |
| **N-PU4** | T-01NPDc-* (allergen tasks) | Override stored as TEXT field | Migrate to `fa_allergen_overrides` table per N-U4; per-row audit |
| **N-PU5** | T-01NPDe-020 (dashboard) | Static render only (BL-NPD-04) | Add 30s polling AC; Show-built toggle; Refresh D365 Cache button |

## ADD list (entirely new PRD/plan content)

### PRD additions (4 new sections)

| # | Section | Source | Content |
|---|---------|--------|---------|
| **N-A1** | §10.6.1 D365 Guided Build Wizard (NEW, ~200w) | NPD-B4 | 8 steps: Validate (V01-V08) → Data Review → BOM Preview → Allergen Check → D365 Constants → N+1 Preview → MFA Confirm → Execute. SSE progress stream `fa.builder.progress` per phase. Modal `dismissible=false` during execute. Transactional rollback on phase error |
| **N-A2** | §17.11 Stage Screen Specifications (NEW, ~700w in 6 sub-sections) | NPD-B1 + NPD-B2 | §17.11.1 Recipe/Formulation editor (versioned, live cost/nutrition/allergen recompute, Submit-for-trial, Compare versions). §17.11.2 Nutrition (7 nutrients per-100g/portion, Nutri-Score, allergens auto-detected). §17.11.3 Costing (waterfall 9 steps, 3 margin scenarios, what-if sliders, V07 margin ≥15%). §17.11.4 Sensory (radar SVG N attributes, panelist comments, V08 sensory ≥7.0) — TBD per D4. §17.11.5 Approval (REUSES §17 gates, multi/single chain via Reference.ApprovalChainTemplates, e-signature). §17.11.6 LEGACY note (Trial/Pilot/Handoff/Packaging deprecated, redirect map to FA/Stage-Gate/02-PROD/04-BOM) |
| **N-A3** | §17.12 Pipeline View Modes (NEW, ~200w) | NPD-B4 | 3 modes via `?view=kanban\|table\|split`. Kanban: DnD `advanceGate(projectId)` with adjacency guard (forward N+1 only, backward blocked, non-adjacent blocked, optimistic update). Table: sortable columns. Split: left TableView with selection + right sticky detail panel, URL persistence `?selected=<id>` |
| **N-A4** | §18 Risk Register (NEW, ~250w) + §19 Compliance Documents (NEW, ~250w) | NPD-B3 | §18: per-FA risk register, score=likelihood×impact (1..9), buckets High≥6/Med 3-5/Low<3, lifecycle Open→Mitigated→Closed, RBAC NPD_LEAD close, V18 cannot mark FA `built` while High Open risks exist. §19: per-FA doc attachments (PDF/XLSX/DOCX ≤20MB, MIME validated, signed URLs TTL≤15min), versioning explicit (overwrite forbidden), soft-delete, expiry warnings ≤30d |

### Plan additions (~26 new tasks across 3 sub-modules + extensions)

#### Sub-module 01-NPD-g — Recipe + Formulation editor (6 tasks, ~14.5 person-days)

| Task | Scope | AC | Dep | Effort (pd) |
|------|-------|-----|-----|-------------|
| T-01NPDg-001 | Schema migration: 5 tables (`formulations`, `formulation_versions`, `formulation_ingredients`, `formulation_calc_cache`, `formulation_audit_log`) + seed `Reference.RawMaterials` + `Reference.NutritionTargets` | Migration up/down idempotent; pgTAP tests for FKs + CHECK; seed loads ≥20 RM rows | T-01NPDf-001 | 2 |
| T-01NPDg-002 | Server actions: `getFormulation`, `saveDraft`, `submitForTrial`, `lockVersion`, `compareVersions`, `recomputeCalc`. Pure functions for cost/nutrition/allergen | totalPct ≤100.5 (warn) / =100 ±0.01 (submit); cascade rewrites `Core.Recipe_Components` + triggers Chain 3 | T-01NPDg-001 | 3 |
| T-01NPDg-003 | Editor UI (RecipeScreen): ingredients table, IngredientRow CRUD, batch/yield/target-price, Composition stacked bar | Renders within `/npd/pipeline/[projectId]?stage=recipe`; live calc <50ms p95; saves debounced 800ms | T-01NPDg-002, T-01NPDf-021 | 4 |
| T-01NPDg-004 | Save / Compare / Lock modals (toast feedback, side-by-side diff up to 50 rows × 2 versions, lock-banner) | Pre-flight blocks submit when totalPct≠100 or RM missing cost; lock prevents row edits | T-01NPDg-002, T-01NPDg-003 | 2 |
| T-01NPDg-005 | Cost panel (waterfall + 3 scenarios + RBAC mask for Commercial role) | Hits values ±€0.01 of prototype; reads/writes through `saveDraft` | T-01NPDg-002, T-01NPDg-003 | 1.5 |
| T-01NPDg-006 | Nutrition panel (weighted sum from `Reference.RawMaterials.nutrition_per_100g`; traffic-light bars; Export-label CSV stub) | 7 nutrients render with correct weighted values; pass/fail per `Reference.NutritionTargets` | T-01NPDg-001, T-01NPDg-002, T-01NPDg-003 | 2 |

#### Sub-module 01-NPD-h — Stage screens: Nutrition + Costing + Sensory (6 tasks, ~6 person-days)

| Task | Scope | AC | Dep | Effort (pd) |
|------|-------|-----|-----|-------------|
| T-01NPDh-001 | Schema: `nutrition_profiles` + `nutrition_allergens` + `nutri_score_results` migrations | Tables exist, FKs to FA, seed nutrient_codes from `Reference.Nutrients` | NPD-a | 0.5 |
| T-01NPDh-002 | Nutrition screen UI (7-row table, allergen card, Nutri-Score grade, Export CSV + label PDF actions) | Table renders 7 nutrients, allergen card, Nutri-Score grade visible | T-01NPDh-001 | 0.75 |
| T-01NPDh-003 | Schema: `costing_breakdowns` + `costing_waterfall_steps` (FK fa_id, scenario unique constraint) | Tables created; pgTAP green | NPD-a | 0.4 |
| T-01NPDh-004 | Costing screen UI (waterfall SVG/CSS, 3 scenarios row-highlight target, what-if sliders persist as scenarios) | 9-step waterfall renders; sliders persist | T-01NPDh-003 | 1 |
| T-01NPDh-005 | V07 margin validation rule + `Reference.AlertThresholds` seed | Warn badge at <15%, configurable per tenant | T-01NPDh-003 | 0.25 |
| T-01NPDh-006 | Sensory schema + radar chart UI (`sensory_panels` + `sensory_attribute_scores` + `sensory_panelist_comments`) | SVG radar, attribute mini-bars, panelist comments list | NPD-a | 0.75 (defer to D4) |

#### Sub-module 01-NPD-i — Approval (gate extension) + Risk Register + Compliance Docs (13 tasks, ~10 person-days)

**Approval extension (4 tasks, ~2 person-days):**

| Task | Scope | Dep | Effort (pd) |
|------|-------|-----|-------------|
| T-01NPDi-001 | Approval gates view (extends `gate_checklist_items` from NPD-f.2): 7-criteria summary card with pass/warn/pending status from V01-V08 evaluation | NPD-f.2 | 0.5 |
| T-01NPDi-002 | Approval chain modes (single vs multi) + `Reference.ApprovalChainTemplates` seed | NPD-f.4 | 0.6 |
| T-01NPDi-003 | Approval screen UI: 2 cards (gates + chain), Submit-for-approval CTA, badges Done/Awaiting/Pending | T-01NPDi-001 + T-01NPDi-002 | 0.6 |
| T-01NPDi-004 | V08 sensory minimum validation + integration with approval gate eval | NPDh-006 + T-01NPDi-001 | 0.25 |

**Risk + Compliance (9 tasks, ~9 person-days):**

| Task | Scope | Dep | Effort (pd) |
|------|-------|-----|-------------|
| T-01NPDi-010 | Schema: `risks` + `compliance_docs` tables + RLS + indexes (generated `score` column) | T-01NPDa-001 | 1 |
| T-01NPDi-011 | Storage: compliance docs bucket + signed-URL service (tenant-isolated, MIME allowlist 3, 20MB limit, TTL≤15min) | T-01NPDi-010 | 1 |
| T-01NPDi-012 | API: Risk CRUD + V18 built-blocker validation (300/500-char limits enforced; score auto-computed; audit_events written) | T-01NPDi-010, T-01NPDa-010 | 1 |
| T-01NPDi-013 | API: Compliance docs CRUD + nightly expiry job (≤30d & expired alerts) | T-01NPDi-011 | 1.5 |
| T-01NPDi-014 | UI: RiskRegisterScreen + RiskAddModal (MODAL-07) — port `docs-screens.jsx:56-106` + `modals.jsx:297-346` | T-01NPDi-012 | 1 |
| T-01NPDi-015 | UI: ComplianceDocsScreen + DocUploadModal — port `docs-screens.jsx:6-53` + `modals.jsx:667-689`, add expiry column + warning badge | T-01NPDi-013 | 1.5 |
| T-01NPDi-016 | Dashboard tiles (Open High risks · Expiring docs ≤30d) + drill-through filters | T-01NPDi-012, T-01NPDi-013, T-01NPDe-020 | 0.5 |
| T-01NPDi-017 | Test: integration + E2E for risks + docs (incl. V18, expiry job, signed URL TTL) | T-01NPDi-014, T-01NPDi-015 | 1 |
| T-01NPDi-018 | Seed: factories for risks (3 per FA, mixed severity) + compliance_docs (5 types per FA, 1 expiring) | T-01NPDi-010 | 0.5 |

#### NPD plan extensions (5 net-new tasks under existing sub-modules)

| Task | Scope | Effort (pd) |
|------|-------|-------------|
| T-01NPDd-021 | UI: D365WizardModal 8-step + SSE progress action (`app/(npd)/fa/d365-progress-stream/route.ts`); modal `dismissible=false` during execute | 1.5 |
| T-01NPDf-021 | UI: Pipeline Kanban DnD via `@dnd-kit/core`; `advanceGate(projectId, targetGate)` Server Action; reject backward + non-adjacent | 1 |
| T-01NPDf-023 | UI: Pipeline Split view (`pipeline-split.tsx`); URL state `?view=split&selected=<id>` | 1 |
| T-01NPDf-024 | UI: Pipeline view toggle URL persistence (replace local state with `useSearchParams`) | 0.25 |
| T-01NPDf-025 | Action: `advanceGate` adjacency guard (`targetGate === currentGate + 1`; reject 422 ADJACENCY_VIOLATION otherwise) | 0.5 |

#### NPD LEGACY archive (2 tasks, ~3 hours)

| Task | Scope | Effort |
|------|-------|--------|
| T-01NPDlegacy-001 | Document deprecation in PRD §17.11.6 + LEGACY banner CSS reuse note | 1h |
| T-01NPDlegacy-002 | Migration map: prototype → FA/Brief/Stage-Gate equivalents (Trial→FA Technical; Pilot→FA Production+02-PROD; Handoff→Stage-Gate G4→G5+04-BOM; Packaging→Brief packaging cols) | 2h |

---

# MODULE 02-SETTINGS

## UPDATE list (existing PRD/plan content needs revision)

### PRD updates (8 items)

| # | Where | Issue | Action |
|---|-------|-------|--------|
| **S-U1** | §14.4 (lines 1536-1547) | 7 screen codes (SET-001 launcher + 002-007) | Renumber to SET-001..SET-006 to match UX (drop launcher) per D3 |
| **S-U2** | §14.3 step 1 (line 1520) | Field list missing `gs1_prefix` | Append "GS1 Company Prefix (required for 11-SHIPPING SSCC)" |
| **S-U3** | §14.3 step 3 (line 1522) | "zone/bin w created warehouse" too thin | Replace with "ltree path (e.g., `FG › Zone A › Rack 1 › Bin 1`), zone label, bin code" |
| **S-U4** | §14.3 (lines 1516-1547) | No mention of Back/Jump/Restart wizard nav | Add bullets: "Wizard supports Back, Jump-to-step, Restart"; "First-WO timestamp persisted to `organizations.onboarding_state.first_wo_at` for P50 KPI"; "While `onboarding_completed_at IS NULL`, admin routes redirect to `/onboarding`; non-admins see splash" |
| **S-U5** | §14.1 + table line 442-450 (`org_security_policies`) | Single `session_timeout_minutes` field; no SSO/SCIM/IP allowlist/password complexity | Extend columns: `password_complexity TEXT`, `password_expiry_days INT NULL`, rename `session_timeout_minutes` → `session_idle_timeout_minutes`, add `session_max_length_minutes INT DEFAULT 480`; extend `mfa_requirement` doc with `mfa_allowed_methods TEXT[]` (`totp`, `sms`, `webauthn`) |
| **S-U6** | §2 Identity / §3 RBAC | UX uses 4 customer-facing roles (Admin/Manager/Operator/Viewer) — PRD has 10 system roles | Add per D1: clarify 10 system roles in DB + 4 customer-facing categories; reject 4-level perm matrix per D2 (UI shows checkboxes per permission grouped by module) |
| **S-U7** | §2 Users (invite flow) | Magic-link expiry not asserted (Supabase default) | Codify magic-link expiry 7-day TTL as Supabase Auth config requirement |
| **S-U8** | §2 Org schema (`organizations`) | KPI tile shows "Seats used 10 / 50" but no `seat_limit` column | Add `seat_limit` (or tier-derived) + inviteUser pre-flight check; OR mark KPI decorative |

### Plan updates (~6 items)

| # | Task | Current | Required |
|---|------|---------|----------|
| **S-PU1** | T-02SETe-004 (onboarding actions) | `updateOnboardingState` (writes `completed_steps` only) | Add `skipOnboardingStep(orgId, step)` (pushes to `skipped_steps[]`); add `restartOnboarding(orgId)` (resets state to initial) |
| **S-PU2** | T-02SETe-007 (onboarding wizard UI) | Steps SET-002..SET-007 only forward Next + Skip | Add `gs1_prefix` field to step 1; step 3 fields → ltree+zone+bin; add Back/Stepper-jump/Restart buttons; specify completion-card routes (`/admin/features`, `/admin/schema`, `/admin/rules`); capture first-WO timestamp on step 5 callback |
| **S-PU3** | T-02SETe-007 acceptance | Forward-only flow check | Add checklist: Back/Jump/Restart, gs1_prefix, ltree path, first-WO KPI capture, redirect-while-incomplete guard |
| **S-PU4** | T-02SETe-009 (E2E) | Wizard completes assertion only | Assert P50 < 15min via `first_wo_at - started_at`; assert `skipped_steps[]` populated when steps 4+5 skipped; assert deep-link to `/admin/*` while incomplete redirects to `/onboarding` |
| **S-PU5** | T-02SETe-005 (security policy actions) | Covers password_min_length, history, session_timeout, lockout, mfa_requirement | Extend `SecurityPolicyInputSchema` Zod: add `passwordComplexity`, `passwordExpiryDays`, `sessionMaxLengthMinutes`, `mfaAllowedMethods` |
| **S-PU6** | T-02SETa-008 (Users page UI) | Table + InviteModal + EditModal only | Expand to: KPI tiles (Active/Invited/Disabled/Seats used), Card vs Table view toggle, Role pills filter + search, inline role `<select>` per row, tri-state status derivation, personal-message textarea in InviteModal, Empty state, Export button (CSV) — defer if needed |

## ADD list (entirely new PRD/plan content)

### PRD additions (4 new sections)

| # | Section | Content |
|---|---------|---------|
| **S-A1** | §14.5 SSO Configuration (NEW, ~200w) | Table `org_sso_config` (org_id, idp_type ENUM `saml_entra`/`saml_generic`/`oidc`, metadata_url, entity_id, x509_cert, enforce_for_non_admins BOOL); SAML 2.0 + Microsoft Entra ID listed as Phase 1 baseline |
| **S-A2** | §14.6 SCIM 2.0 Provisioning (NEW, ~150w) | Table `scim_tokens`; endpoints `/scim/v2/Users` `/scim/v2/Groups`; auto-provision/deprovision via standard SCIM PATCH; group sync to roles |
| **S-A3** | §14.7 Admin IP Allowlist (NEW, ~100w) | Table `admin_ip_allowlist` (org_id, cidr INET, label) + middleware enforcement on admin routes (bypass for SCIM token + impersonation) |
| **S-A4** | § Modal Contract (NEW, ~150w, top of file) | Reference `_shared/MODAL-SCHEMA.md` as canonical contract; list 10 patterns + 5 primitives; normative ("All settings modals MUST use shared primitives and one of 10 patterns"); backfill 5 dangling MODAL-* IDs from prototype catalog (MODAL-INVITE-USER → SM-06; MODAL-ROLE-ASSIGNMENT → SM-07; MODAL-D365-CONNECTION-TEST → SM-08; MODAL-CONFIRM-DELETE → SM-10; MODAL-REF-ROW-EDIT → SM-11) |

### Plan additions (~25 new tasks)

#### Auth/Security extensions to T-02SETe-005 (4 new sub-tasks, ~5 person-days)

| Task | Scope | Effort (pd) |
|------|-------|-------------|
| T-02SETe-005b | SSO config Server Actions (`upsertSsoConfig`, `testSamlConnection`, `disableSso`) + SAML library (`samlify`/`node-saml`) + `/api/auth/saml/[...slug]` route handler | 2 |
| T-02SETe-005c | SCIM 2.0 endpoint handlers (`/api/scim/v2/Users`, `/api/scim/v2/Groups`) with bearer-token auth via `scim_tokens` table | 1.5 |
| T-02SETe-005d | IP allowlist CRUD actions + middleware enforcement on `/(admin)` routes | 1 |
| T-02SETe-005e | `<SecurityAuditLogPreview>` component (last-5 audit entries scoped to security actions) for SecurityScreen embed | 0.5 |

#### Onboarding wizard extension (1 new task, ~0.5 person-days)

| Task | Scope | Effort (pd) |
|------|-------|-------------|
| T-02SETe-007a | Onboarding route guard middleware (edge): checks `organizations.onboarding_completed_at`; admin-role users → force redirect to `/onboarding`; non-admin members → splash page; files: `apps/web/middleware.ts` delta + `apps/web/app/(onboarding)/in-progress/page.tsx` | 0.5 |

#### Modal primitives + per-modal tasks (15 tasks, ~7.5 person-days)

**Note:** These overlap heavily with 00-FOUNDATION T-00j-* (UI primitives). The shared primitives go in `packages/ui` (Foundation). Per-modal tasks below are 02-SETTINGS-specific consumption tasks.

| Task | Scope | Dep | Effort (pd) |
|------|-------|-----|-------------|
| T-02SETMod-01 | SM-01 RuleDryRunModal — wire to T-02SETd-002 deployRule + sample input action; uses Pattern-10 (Preview/compare) | T-00j-003, T-02SETd-002 | 0.5 |
| T-02SETMod-02 | SM-02 FlagEditModal — wire to T-02SETa-018 toggleFeatureFlag; Pattern-05 (Override-with-reason, ReasonInput min 10) | T-00j-003, T-02SETa-018 | 0.5 |
| T-02SETMod-03 | SM-03 SchemaViewModal — read-only column definition view; Pattern-06 (Simple) | T-00j-003 | 0.3 |
| T-02SETMod-04 | SM-04 EmailTemplateEditModal — 3-step wizard with variable picker; Pattern-01 (Wizard) | T-00j-003, T-02SETe-008 | 0.7 |
| T-02SETMod-05 | SM-05 PromoteToL2Modal — 3-step wizard with diff preview + reason; Pattern-01 + Pattern-10 hybrid | T-00j-003, T-02SETb-005 | 0.7 |
| T-02SETMod-06 | SM-06 UserInviteModal — `MODAL-INVITE-USER` (PRD backfill); Pattern-02 (Simple form) | T-00j-003, T-02SETa-003 | 0.5 |
| T-02SETMod-07 | SM-07 RoleAssignModal — `MODAL-ROLE-ASSIGNMENT`; Pattern-04 (Picker) | T-00j-003, T-02SETa-003 | 0.5 |
| T-02SETMod-08 | SM-08 D365TestConnectionModal — `MODAL-D365-CONNECTION-TEST`; Pattern-07 + async submit; idle/run/ok/fail states | T-00j-003, T-02SETe-008 | 0.5 |
| T-02SETMod-09 | SM-09 PasswordResetModal — Pattern-09 (Destructive + ack checkbox) + "Any active sessions revoked" copy | T-00j-003, T-02SETe-005 | 0.5 |
| T-02SETMod-10 | SM-10 DeleteReferenceDataModal — `MODAL-CONFIRM-DELETE`; Pattern-08 (Destructive type-to-confirm "DELETE") | T-00j-003, T-02SETd-005 | 0.5 |
| T-02SETMod-11 | SM-11 RefRowEditModal — `MODAL-REF-ROW-EDIT` (already SET-052); update existing T-02SETa-014 to depend on T-00j-003 | T-00j-003, T-02SETa-014 | 0.3 |
| T-02SETMod-FlagsAdmin | Manufacturing Operations Edit Modal SET-056 (PRD line 1069) | T-00j-003 | 0.5 |
| T-02SETMod-Storybook | Storybook gallery `<ModalGallery>` for all 11 settings modals (port from prototype catalog) | T-02SETMod-01..11 | 0.5 |
| T-02SETMod-A11y | a11y RTL helper application: every modal calls `assertModalA11y()` from packages/ui/test | T-02SETMod-01..11, T-00j-007 | 0.5 |
| T-02SETMod-V_audit | Per-modal audit-reason validators (V-* / SET-* min length): generic schema utility consumed by every modal with ReasonInput | T-00j-002 | 0.5 |

#### Permission matrix UI alternative (decided per D2)

If D2 = (a) flat-permission checkbox grid (recommended): no new tasks, T-02SETa-009 covers it.

If D2 = (b) introduce `module_permission_levels` view: ~2 person-days + new task `T-02SETa-009b — module_permission_levels SQL view + Drizzle bindings`.

#### Inventory cleanup (1 task, ~0.25 person-days)

| Task | Scope | Effort (pd) |
|------|-------|-------------|
| T-Index-Clean-01 | Fix `_meta/prototype-labels/prototype-index-settings.json`: move 6 mis-tagged entries (sites/shifts/devices/products/boms/partners) to per-module index files per D8 | 0.25 |

---

# CROSS-CUTTING FINDINGS

## 1. MODAL-SCHEMA.md is canonical contract — must be first-class in PRD

The 10-pattern modal contract + 5 base primitives in `_shared/MODAL-SCHEMA.md` (225 lines) **is never referenced in any PRD or plan**. This forces every module to reinvent modal wiring and drift from the contract. Resolution: **02-SETTINGS-A4 + 00-FOUNDATION-A3** make it normative. Single source: `packages/ui` (workspace package).

## 2. Auth subsystem is the largest single gap

UX shows a complete enterprise-grade auth surface (TOTP/SAML/SCIM/WebAuthn/IP allowlist/active sessions/impersonation/password policy). PRD has thin `org_security_policies` table only. Plan has email+password only. Resolution: **22 net-new tasks** across 00-FOUNDATION (11 in T-00c-007..017) and 02-SETTINGS (4 in T-02SETe-005b..e). Total ~14-19 person-days.

## 3. NPD has 13 fully prototyped screens with zero PRD/plan anchor

`recipe.jsx` (Recipe/Formulation editor with live cost/nutrition), `other-stages.jsx` (Nutrition/Costing/Sensory/Approval — 5 of 7 are LEGACY-banner deprecated), `docs-screens.jsx` (Risk Register + Compliance Docs), `pipeline.jsx` (Split view + DnD). Resolution: **3 new sub-modules** 01-NPD-g/h/i with ~26 tasks ~30 person-days.

## 4. NPD prototype uses legacy 5-stage R&D model, production uses G0–G4+Launched

`pipeline.jsx` is `@deprecated BL-NPD-02`; uses `brief/recipe/trial/approval/handoff` stages. PRD §17 production model is `G0`–`G4` + `Launched`. Implementer translation note: **stage mapping table needed** in T-01NPDf-021 onward.

## 5. Settings inventory has 6 mis-tagged prototypes

`sites_screen` → 14-MULTI-SITE; `shifts_screen` → 15-OEE; `devices_screen` → 06-SCANNER-P1; `products_screen`/`boms_screen`/`partners_screen` → 03-TECHNICAL. Not real gaps but produce false signal in cross-checks. Resolution: T-Index-Clean-01.

## 6. Onboarding wizard partially in plan

PRD §14.3 specs the wizard. Plan T-02SETe-007 covers it. **But** screen-code numbering is off-by-one (D3), 5 wizard features missing from plan AC (Back/Jump/Restart/gs1_prefix/ltree path). Resolution: S-PU1..S-PU4 + T-02SETe-007a (route guard middleware).

---

# EFFORT SUMMARY

| Area | PRD changes | Plan tasks (new) | Plan tasks (update) | Effort estimate (pd) |
|------|-------------|-------------------|---------------------|----------------------|
| 00-FOUNDATION (auth) | 5 (F-U1..U5) + 2 new sections (F-A1, F-A2) + 5 success criteria | 11 (T-00c-007..017) | 4 (T-00c-002/003/004/006) | ~14 |
| 00-FOUNDATION (UI primitives) | 1 new section (F-A3) + amendment (F-A4) | 7 (T-00j-001..007) | 1 (T-00a-003) | ~8.5 |
| 01-NPD (Section A — already documented) | 10 (N-U1..U10) | 5 plan extensions (T-01NPDd-021, T-01NPDf-021/023/024/025) | 5 (T-01NPDf-020/021, T-01NPDd-020, T-01NPDc-*, T-01NPDe-020) | ~5 |
| 01-NPD-g (Recipe/Formulation) | 1 sub-section §17.11.1 | 6 (T-01NPDg-001..006) | — | ~14.5 |
| 01-NPD-h (Stage screens) | 5 sub-sections §17.11.2-5 | 6 (T-01NPDh-001..006) | — | ~6 |
| 01-NPD-i (Approval + Risk + Compliance) | 2 new top-level sections §18, §19 | 13 (T-01NPDi-001..018) | — | ~10 |
| 01-NPD LEGACY archive | 1 sub-section §17.11.6 | 2 (T-01NPDlegacy-001/002) | — | ~0.5 |
| 02-SETTINGS (PRD reconciliations) | 8 (S-U1..U8) | — | 6 (S-PU1..PU6) | ~3 |
| 02-SETTINGS (auth UI gap) | 4 new sections (§14.5-14.7 + Modal contract) | 4 (T-02SETe-005b..e) | 1 (T-02SETe-005) | ~5 |
| 02-SETTINGS (modal contract + per-modal) | (covered by F-A3 +) Modal contract reference | 15 (T-02SETMod-01..11 + 4 supporting) | 1 (T-02SETa-014 dep update) | ~7.5 |
| 02-SETTINGS (onboarding finalization) | 4 PRD bullets in §14.3 | 1 (T-02SETe-007a) | 4 (T-02SETe-004/007/009 + acceptance) | ~1 |
| Inventory cleanup | — | 1 (T-Index-Clean-01) | — | ~0.25 |
| **TOTAL** | **~44 PRD changes** | **~71 new plan tasks** | **~22 plan task updates** | **~75-80 person-days** |

This includes both spec drafting AND implementation. Spec-only effort (PRD + plan task drafting): ~10-12 person-days. Pure implementation: ~65-70 person-days.

---

# RECOMMENDED IMPLEMENTATION SEQUENCE

## Wave 1 — Resolve 8 critical decisions (D1-D8) — blocks everything else
**Deliverable:** decision document in `_meta/decisions/`. Owner: PM/architect. Time: 0.5-1 day discussion + write-up.

## Wave 2 — Foundation amendments (parallel) — 4 tracks
- **Track A (auth):** PRD §5.x + §8.x + §11.x + §3 + §13 (F-U1..U5 + F-A1, F-A2). Author: 1 PRD writer, 1 day.
- **Track B (UI primitives):** PRD §5.y + §4.2-AMENDMENT (F-A3, F-A4). Author: 1 PRD writer, 0.5 day.
- **Track C (NPD Section A):** Apply 10 PRD updates (N-U1..U10). Author: 1 PRD writer, 1.5 days.
- **Track D (Settings reconciliation):** Apply 8 PRD updates (S-U1..U8). Author: 1 PRD writer, 1 day.

## Wave 3 — Plan task drafting (parallel after Wave 2 PRD lands)
- 11 auth tasks (00-c) — 1 day
- 7 UI primitives tasks (00-j) — 0.5 day
- 6 + 6 + 13 + 5 NPD tasks (g/h/i/extensions) — 2 days
- 4 + 15 + 1 settings tasks — 1.5 days

## Wave 4 — Implementation (Phase E-0 → E-2 timeline)
Sequence per existing Phase E plan + new sub-modules ordered by dependency:
1. 00-FOUNDATION-impl-d/e/f/g/h (existing) + new 00-FOUNDATION-impl-c-extended (auth) + new 00-FOUNDATION-impl-j (UI primitives) — Phase E-0
2. 02-SETTINGS-a (existing minimum carveout) — Phase E-1 starts
3. 01-NPD-a → 01-NPD-f (existing) — Phase E-2 Track A
4. 02-SETTINGS-b/c/d/e (existing) — Phase E-2 Track B parallel
5. **NEW:** 01-NPD-g (Recipe), then 01-NPD-h (Stage screens), then 01-NPD-i (Approval + Risk + Compliance) — Phase E-2 Track C (or extend Track A)
6. **NEW:** Modal-per-screen tasks (T-02SETMod-*) parallel with module UI builds

**Critical-path blocker:** T-00j-001..003 (Modal/primitives/patterns) must complete before ANY module's T3-ui task. This adds ~3 person-days to critical path before E-2 can start.

---

# OPEN QUESTIONS / FOLLOW-UPS

1. **Sensory deprecation status (D4)** — confirm with NPD product owner whether to BUILD §17.11.4 + T-01NPDh-006 (~0.75pd) or fold into FA cell.
2. **Permission model decision (D2)** — flat-checkbox vs derived 4-level matrix; affects T-02SETa-009 redesign decision.
3. **WebAuthn UX visibility (D7)** — disabled checkbox with tooltip vs hidden until Phase 3.
4. **`integrations_screen` general catalog** — UX shows multi-category catalog (Resend/Postmark/Slack/Zapier); PRD §11 only specs D365 inline. Decide: build now or defer to Phase C-integrations.
5. **`d365_mapping_screen` semantic mismatch** — prototype is read-only mapping CSV view; PRD SET-081 is editable 5-constants editor. Reconcile or retire prototype.
6. **`email_variables_screen`** — no dedicated PRD section; absorbed implicitly under §13.2. Add explicit SET-XXX or document scope.

---

# CHANGE TRACKING

This document was generated 2026-04-30 by consolidating 14 narrow gap analyses (8 successful agent runs + 6 retried runs after stream-idle timeouts). Source files preserved in `/tmp/{SET-A1..A5,NPD-B1..B4,FND-B1..B3,GAP-00-FOUNDATION,GAP-01-NPD}.md` for evidence trail.

**Next step:** PM/architect review for Wave 1 decisions (D1-D8). Once decided, proceed to Wave 2 PRD amendments in parallel tracks.
