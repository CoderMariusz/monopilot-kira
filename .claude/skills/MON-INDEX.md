# MON-* Skill Index (monopilot-kira)

**Convention:** All skills prefixed `MON-` are project-scoped to monopilot-kira. Read order: always start with `MON-project-overview`, then drill into specifics.

**Generated:** 2026-05-14 — after Master Aggregate Report (Phase 5/Wave 7) closeout.
**Refreshed:** 2026-06-03 — Phase 3 skills-overhaul (post Phase-0 audit + Phase-1 consolidation).
**Refreshed:** 2026-06-04 — side-car: encoded this session's recurring live-bug learnings (dropdown two-gaps, orphaned-schema-no-CRUD, shared-primitive fix, free-text→FK) into `MON-t3-ui` + the 4 next-module domain skills (planning/warehouse/production/quality) + `MON-domain-technical` + `docs/workflow/02-QUALITY-GATES.md` Gate-5 (classes 9-12). Prepped next-module skills against the merged 03-technical Wave-A schema (migs 153,156-167). **Note:** `_meta/atomic-tasks/03-technical/STATUS.md` is STALE (still shows T-001/T-002/T-003 ⬜ though migs 153/159/160 shipped via commits `3420ffad`/`e9f30796`) — needs a `/kira:audit` reality re-pass; T-080/T-081 (bundle approval + release adapter) remain genuinely PENDING (Wave-B), which 04-planning hard-depends on.

> **Phase 3 notes (2026-06-03):**
> - **Routing tokens normalized.** Legacy `hermes_gpt55` / `spark_low_risk_else_opus` /
>   `opus_if_high_risk_or_ui_or_architecture` are retired across all 1041 tasks and in
>   `prd-decompose-hybrid` (v1.2.0). New shape: `routing_hints {writer, reviewer}` +
>   `risk_tier`. Source of truth: `docs/workflow/01-MODEL-ROUTING.md`.
> - **Dead skills removed:** the 3 broken `kira-hq-*` symlinks (claude-pipeline /
>   hermes-pipeline / render-kanban) pointed at the retired ACP path `~/.kira-hq/…` and
>   resolved to nothing. Removed (no `MON-INDEX`/task `skills[]` references existed).
> - **New `MON-domain-*` skills deferred to module run.** Density justifies dedicated
>   domain skills for 01-npd, 02-settings, 03-technical, 06-scanner, 12-reporting,
>   14-multi-site, but per the lean policy each is authored as the **first step of its
>   module's `/kira:run-module`** (when its PRD is loaded), not pre-emptively. Existing
>   domain skills (planning/warehouse/production/quality/finance/shipping/oee/maintenance)
>   remain authoritative.

---

## How to choose a skill

### By task_type (T1-T5 atomic decomposition)

| `task_type` | Primary skill | Always pair with |
|---|---|---|
| T1-schema | [[MON-t1-schema]] | [[MON-multi-tenant-site]] (Wave0 lock) |
| T2-api | [[MON-t2-api]] | [[MON-multi-tenant-site]], [[MON-foundation-primitives]] |
| T3-ui | [[MON-t3-ui]] | [[prototype-labeling]] (output consumer) |
| T4-wiring-test | [[MON-t4-test]] | matching T1/T2/T3 skill |
| T5-seed | [[MON-t1-schema]] (seeds are inserts) | — |

### By module (domain skills — read AFTER the layer skill)

| Module folder | Domain skill | Critical invariants |
|---|---|---|
| 01-npd | [[MON-domain-npd]] | HEAVY UI: prototype parity + real Supabase data; FG/product SSOT + fa view; allergen cascade; ship the `npd.*` RBAC SEED (P0) + 3-digit migration renumber |
| 02-settings | [[MON-domain-settings]] | HEAVY UI: prototype parity + real Supabase data (NO hardcode) per screen; consolidate the dual settings route trees onto `[locale]/(app)/(admin)/settings`; ship the `settings.*` RBAC SEED (P0) |
| 03-technical | [[MON-domain-technical]] | item master (critical-path root `items`) + shared BOM SSOT version state machine + Technical-owned factory_specs (bundle approval emits `technical.factory_spec.approved`); released edits clone-on-write; cost NUMERIC dual-owned w/ Finance; D365 OPTIONAL/export-only; HEAVY UI parity + real data |
| 04-planning-basic + 07-planning-ext | [[MON-domain-planning]] | `schedule_outputs` NOT `wo_outputs`; V-PLAN-WO-CYCLE rule |
| 05-warehouse | [[MON-domain-warehouse]] | LP universal unit; FEFO; consume gate cross |
| 08-production | [[MON-domain-production]] | `wo_outputs` CANONICAL owner; `oee_snapshots` PRIMARY producer |
| 09-quality | [[MON-domain-quality]] | T-064 consume gate; e-sign on NCR/spec/inspection |
| 10-finance | [[MON-domain-finance]] | NUMERIC precision; D365 export-only R15; cost-per-kg dual ownership |
| 11-shipping | [[MON-domain-shipping]] | SSCC-18 mod-10 server-side; POD SHA-256 + BRCGS 7y |
| 13-maintenance | [[MON-domain-maintenance]] | LOTO + calibration DUAL e-sign (T-124) |
| 15-oee | [[MON-domain-oee]] | READ-ONLY consumer (D-OEE-1) — never write `oee_snapshots` |

Modules NOT yet domain-mapped (covered by layer skills only): 00-foundation, 06-scanner-p1, 12-reporting, 14-multi-site. Add `MON-domain-{...}` if/when domain density justifies a dedicated skill. (01-npd, 02-settings, 03-technical now mapped — authored at module-run kickoff.)

### By cross-cutting concern

| Concern | Skill |
|---|---|
| org_id Wave0 lock, RLS via `app.current_org_id()`, site_id ext, ESLint enum-lock | [[MON-multi-tenant-site]] |
| apps/worker (T-111), outbox (T-112), GDPR (T-113), pino (T-117), rate-limit (T-121), e-sign (T-124), withOrgContext (T-125) | [[MON-foundation-primitives]] |
| D365 export-only R15, BRCGS 7y retention, CFR 21 Part 11 e-sign, GS1 SSCC-18, GDPR | [[MON-integrations-compliance]] |
| Event naming `module.entity.verb` (3-seg) or `aggregate.verb` (2-seg ISA-95) | [[MON-foundation-primitives]] §events + `_meta/specs/event-naming-convention.md` |
| Prototype parity (literal `prototypes/.../<file>.jsx:<lines>` anchor) | [[MON-t3-ui]] + [[prototype-labeling]] |

### Decomposition / planning skills (legacy — not MON-prefixed)

| Skill | Use when |
|---|---|
| [[prd-decompose-hybrid]] | Filling gap tasks in `_meta/atomic-tasks/{module}/tasks/` (Opus only) |
| [[prototype-labeling]] | Scanning a `prototypes/design/Monopilot Design System/<module>/` directory (Haiku) |

---

## Reading-order recipes (common scenarios)

### Scenario: "Add a new table to module X"
1. [[MON-project-overview]] (orientation)
2. [[MON-multi-tenant-site]] (Wave0 lock + RLS pattern)
3. [[MON-t1-schema]] (migration + Drizzle schema + audit trigger)
4. [[MON-domain-{module}]] (domain invariants — e.g., wo_outputs canonical)
5. [[MON-foundation-primitives]] §audit if audit-trigger-relevant
6. [[MON-t4-test]] (RLS isolation test)

### Scenario: "Add a Server Action"
1. [[MON-project-overview]]
2. [[MON-t2-api]] (Server Action pattern + withOrgContext + zod + outbox)
3. [[MON-foundation-primitives]] (T-111/112/121/124/125 — pick what applies)
4. [[MON-multi-tenant-site]] (RLS isolation)
5. [[MON-domain-{module}]] (domain rules — e.g., quality consume gate)
6. [[MON-integrations-compliance]] if D365/SSCC/e-sign relevant
7. [[MON-t4-test]]

### Scenario: "Build a page that matches prototype X"
1. [[MON-project-overview]]
2. [[prototype-labeling]] (read index for module)
3. [[MON-t3-ui]] (literal anchor parity + ui_evidence_policy + i18n)
4. [[MON-t2-api]] (Server Action callers)
5. [[MON-domain-{module}]] (domain UI states)
6. [[MON-t4-test]] (Playwright + axe)

### Scenario: "Implement a 09-quality task (NCR / hold / HACCP)"
1. [[MON-project-overview]]
2. [[MON-domain-quality]] (T-064, e-sign requirements, holds workflow)
3. [[MON-foundation-primitives]] §e-sign (T-124)
4. [[MON-integrations-compliance]] §CFR-21 Part 11
5. Layer skill: [[MON-t1-schema]] / [[MON-t2-api]] / [[MON-t3-ui]] depending on `task_type`
6. [[MON-t4-test]]

### Scenario: "Implement D365 export dispatcher"
1. [[MON-project-overview]]
2. [[MON-integrations-compliance]] §D365 (R15 anti-corruption)
3. [[MON-foundation-primitives]] (T-111 worker + T-112 outbox)
4. [[MON-domain-finance]] (Stage 5 specifics) — or shipping
5. [[MON-t2-api]] (idempotency keys, error mapping)
6. [[MON-t4-test]]

### Scenario: "Add a new permission string"
1. [[MON-multi-tenant-site]] §ESLint enum-lock — STRICT process (edit `permissions.enum.ts`, run baseline test, dispatch per-module enum task)
2. Per-module perm-enum task — see Settings T-130 `cross_module_dependencies` for current task IDs
3. **[[MON-multi-tenant-site]] §"Granting permissions (the SEED half)" — MANDATORY.** The enum string is just vocabulary; without a `NNN-<module>-permission-seed.sql` that GRANTs it to the org-admin role family the live app is 403-everywhere (the #1 recurring live bug; vitest+tsc stay green). Schedule the seed as a wave-1 P0 task.

---

## Skill cross-link graph (text)

```
MON-project-overview  (entry point)
   ├─ MON-t1-schema ──┐
   ├─ MON-t2-api ─────┤
   ├─ MON-t3-ui ──────┼─── MON-t4-test
   ├─ MON-multi-tenant-site  (Wave0 lock — required by all T1/T2)
   ├─ MON-foundation-primitives  (T-111..T-125 contracts)
   ├─ MON-integrations-compliance  (D365/BRCGS/CFR-21/GS1/GDPR)
   │
   └─ Domain skills (read after layer skill):
       ├─ MON-domain-planning      (04-PB + 07-PE)  ←→  MON-domain-production
       ├─ MON-domain-production    (08)             ←→  MON-domain-oee (READ-ONLY)
       ├─ MON-domain-warehouse     (05)             ←→  MON-domain-shipping
       ├─ MON-domain-quality       (09)  T-064 gate ←→  MON-domain-production
       ├─ MON-domain-finance       (10)             ←→  D365 export-only
       ├─ MON-domain-shipping      (11)             ←→  BRCGS 7y POD
       ├─ MON-domain-maintenance   (13)             ←→  MON-domain-quality (calibration)
       └─ MON-domain-oee           (15)  READ-ONLY  ←→  MON-domain-production
```

---

## Skill inventory (current)

| Skill | Lines | Model | Tier |
|---|---:|---|---|
| MON-project-overview | 170 | any | orient |
| MON-t1-schema | 280 | opus | layer |
| MON-t2-api | 316 | opus | layer |
| MON-t3-ui | 195 | opus | layer |
| MON-t4-test | 253 | sonnet | layer |
| MON-foundation-primitives | 322 | opus | cross-cutting |
| MON-multi-tenant-site | 248 | opus | cross-cutting |
| MON-integrations-compliance | 396 | opus | cross-cutting |
| MON-domain-quality | 178 | opus | domain |
| MON-domain-shipping | 162 | opus | domain |
| MON-domain-finance | 168 | opus | domain |
| MON-domain-production | 176 | opus | domain |
| MON-domain-warehouse | 211 | opus | domain |
| MON-domain-planning | 174 | opus | domain |
| MON-domain-maintenance | 163 | opus | domain |
| MON-domain-oee | 129 | opus | domain |
| MON-domain-technical | ~210 | opus | domain |
| MON-domain-npd | — | opus | domain |
| MON-domain-settings | — | opus | domain |
| prd-decompose-hybrid (legacy) | 154 | opus | meta |
| prototype-labeling (legacy) | 304 | haiku | meta |

**Total:** 21 skills, ~4,400 lines (MON-domain-npd / MON-domain-settings line counts pending a precise re-count on next overhaul).

---

## Maintenance notes

- When a module gains a new sub-module / event / canonical decision: update the relevant `MON-domain-{module}` skill AND its `_meta/atomic-tasks/{module}/coverage.md`.
- When a new foundation primitive is added (T-126+): update `MON-foundation-primitives` (table + section).
- When a new compliance regime is introduced: update `MON-integrations-compliance`.
- When a new MON-* skill is created: add a row to inventory + an entry to one of the routing tables.
- `[[name]]` cross-links use slug form — keep skill folder name == frontmatter `name:` field.
