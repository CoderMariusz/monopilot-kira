# Codex cross-provider review — verdicts + adjudication (2026-06-04)

Gate-4 cross-provider review (Codex gpt-5.5, read-only) of recent long-run work, per-module
settings→production. Diffs = `git diff main...HEAD` scoped to each module's migrations.
Writer = Claude/agents; reviewer = Codex; **adjudication by orchestrator (writer never breaks the tie)**.
Raw output: `_meta/runs/reopen/codex/review-<module>.md`.

> **Process note:** the diffs were scoped to migration files only, so Codex could not see
> `events.enum.ts` / `permissions.enum.ts` / schema `.ts`. That produced **diff-scoping false
> positives** (any enum-side companion looked "missing"). Remaining/future review diffs must
> include the enum + schema files. Lesson saved to memory.

## Verdict summary

| Module | Codex verdict | Real actionable | Dismissed (scoping/by-design) |
|---|---|---|---|
| 02-settings | FAIL | 1 (mig 148 header cosmetic) | 1 BLOCK (enum drift — FALSE) + 1 HIGH (072 site_id, pre-existing) |
| 03-technical | FAIL | 3 (RBAC operator seed, mig 174 IMMUTABLE, mig 168 reopen) | 2 BLOCK (D365 pull/import = by-design per PRD) + 1 (lab_results) |
| 04-planning | FAIL | **9 (org-coupled composite FKs)** + 1 MED index | — |
| 08-production | FAIL | 1 (mig 188 work_order_items shape) | 2 (category shells pragmatic; oee grant model-level) |

## Adjudication detail

### 02-settings
- ~~BLOCK mig 180 `settings.d365_sync.updated` enum drift~~ → **FALSE POSITIVE.** `events.enum.ts:121`
  has `SETTINGS_D365_SYNC_UPDATED`; drift gate 24/24 green. Diff-scoping artifact. **Dismiss.**
- HIGH mig 072 `integration_settings` no `site_id` → pre-existing APPLIED table (on main); site_id-day-1
  applies to NEW operational tables. **Backlog** (would need an ALTER migration; never edit applied).
- MED mig 148 header says "Migration 210" (file is 148) → **REAL cosmetic** hygiene. Applied file →
  comment-only; leave (checksum risk) or fix in a doc-only follow-up. Low priority.

### 03-technical
- BLOCK mig 164 d365_sync `direction in ('pull','push')` (R15 export-only) → **BY DESIGN.** MON-domain-technical
  + PRD §D365 stage-1 explicitly allow authorized nightly **pull** of items+BOM (anti-corruption = D365 not SoT,
  not "no inbound"). **Dismiss with rationale.**
- BLOCK mig 165 `factory_specs.source` allows `d365_import` in draft → same R15 nuance; import is authorized+audited,
  never auto-canonical. **Dismiss with rationale** (revisit if PRD tightens).
- BLOCK mig 154 technical RBAC seed grants admin family only, not operator roles → **PARTIALLY REAL.** Admin-family
  grant (the Gate-5 load-bearing one) IS present, so pages don't 403 for org-admin. Operator-role grant is a
  completeness gap. **Backlog** (corrective seed migration adding technical operator roles).
- HIGH mig 168 BOM SM allows `technical_approved → in_review` (reopens immutable approved version) → **REAL invariant
  concern** vs clone-on-write rule. **Verify + corrective migration** if the transition is truly reachable.
- HIGH mig 174 `supplier_spec_resolved_lifecycle()` declared IMMUTABLE but uses `current_date` → **REAL correctness
  bug** (mis-cache/index hazard). Clean isolated fix → **corrective migration: redeclare STABLE.**
- HIGH mig 162 `lab_results` created+`app_user` INSERT by technical, but Quality-owned → **REAL boundary.** Technical
  should read-only; write ownership → 09-quality. **Backlog** (reconcile when 09-quality lands its lab tables).

### 04-planning — the strongest, most legitimate set
- 9× HIGH: child tables (`wo_materials`, `wo_operations`, `schedule_outputs`, `wo_dependencies`, `mrp_requirements`,
  `mrp_planned_orders`, `capacity_plan_lines`) reference parent `(id)` **not `(org_id, id)`** → a known multi-tenant
  integrity gap: RLS scopes reads, but an insert can peg a child to another org's parent by UUID and RLS then treats
  the child as the inserter's org. Fix = `unique (org_id, id)` on parents + composite FK `(org_id, parent_id)`.
  **REAL + cross-cutting** (same pattern in production 181+ and warehouse 191). → **Proposed corrective wave**
  (new migrations adding composite FKs) — ARCHITECTURAL, surface to human before executing mid-flight.
- MED mig 176 `wo_operations.started_by/completed_by` no index → minor; fold into the corrective wave.

### 08-production
- BLOCK mig 183 creates `waste_categories`/`downtime_categories` (02-Settings tables) → **PRAGMATIC SHELL** (no seed,
  documented; settings owns the seed). Ownership murky. **Backlog**: settings adopts these tables.
- BLOCK mig 188 creates `work_order_items` (08-canonical) inside a technical/gap migration → **REAL shape hazard**
  (`if not exists` shell could lock a wrong shape before 08 ships the real one). Migration's own comment flags it
  as soft read-source, never written. **Backlog**: 08 to own the canonical definition.
- HIGH mig 184 `oee_snapshots` grants `app_user` INSERT/UPDATE/DELETE (D-OEE-1 sole-producer not grant-enforced) →
  **REAL but model-level** (entire app = one `app_user`; sole-producer enforced by convention + 15-oee review). A
  per-module writer-role/SECURITY-DEFINER is a larger rearchitecture. **Backlog.**

## Recommended corrective wave (proposed — needs human go on the architectural item)
1. **[clean, low-risk]** mig 174 `supplier_spec_resolved_lifecycle()` IMMUTABLE→STABLE (new corrective migration).
2. **[clean]** technical operator-role RBAC seed completeness (corrective seed migration).
3. **[verify-then-fix]** mig 168 BOM `technical_approved→in_review` transition removal (if reachable).
4. **[ARCHITECTURAL — human go]** org-coupled composite FK wave across planning (176-179) + production (181) +
   warehouse (191): add `unique (org_id, id)` to parents + composite child FKs. Biggest, highest-value, but
   touches many applied tables + interacts with in-flight finance/planning-ext agents.

By-design dismissals (with rationale): D365 pull/import (164/165), settings enum "drift" (scoping artifact).

---

## Round 2 — re-review of newly-committed work (2026-06-04, post warehouse/quality/corrective)

| Target | Verdict | Key findings |
|---|---|---|
| 05-warehouse 191/192 (corrected scope) | **PASS** ✅ | clean — RLS app.current_org_id(), ownership correct, RBAC byte-match both stores, outbox parity |
| 09-quality 197/198 | **FAIL** | real bugs on just-committed code (below) |
| holistic 190-208 | **FAIL** | org-FK pattern + consume-gate coverage gap |
| **Vercel `next build`** | **PASS** ✅ | 26 projects typecheck clean, 36/36 pages, no use-server/RSC breaks. Deploy-buildable. (lint has 2 pre-existing non-blocking errors: NUL-regex in migrations-queue.client.tsx:87 + rate-limit eslint config gap) |

### 09-quality (mig 197/198) — REAL bugs to fix (corrective migration, NOT edit applied)
1. **[HIGH, runtime breaker]** `quality_hold_seq` / `ncr_seq` lack `GRANT USAGE` to app_user → app_user INSERT fails on nextval(). Tests passed because they ran as superuser. Fix: `grant usage, select on sequence ... to app_user`.
2. **[HIGH]** `v_active_holds` only exposes `quality_holds.reference_id`, IGNORES `quality_hold_items.license_plate_id` → multi-LP holds missed by the LP consume gate (T-064 safety gap). Fix: UNION active quality_hold_items into the view, org-scoped.
3. **[HIGH]** Drizzle `quality.ts` marks generated `holdNumber`/`ncrNumber` + seq cols as required insert fields → Drizzle inserts fail. Fix: model as DB-generated/defaulted.
4. **[BLOCK]** specs/spec_parameters missing 14y retention column+trigger (PRD 7y/10y/14y). 
5. **[BLOCK]** NCR critical-close dual-sign not schema-supported (only single closed_by/closure_signature_hash). Fix: first/second signer cols + distinct-signer constraint.
6. **[BLOCK]** org-coupled FK: quality_hold_items.hold_id, ncr_reports.linked_hold_id, quality_specifications.superseded_by, quality_spec_parameters.specification_id → composite (org_id,parent_id) FKs. (Part of the deferred FK-wave.)

(The "NPD/GDPR perms no seed at permissions.enum.ts:101" holistic finding is a diff-scoping artifact — those families are seeded in earlier migrations; the diff included the whole enum file.)

→ Quality corrective fixes (1-5 above) = a focused corrective migration (217+) + quality.ts edit, queued for the next fix wave once in-flight edit-load drops. FK-wave (6) stays in the deferred architectural pass.
