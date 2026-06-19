# Locked execution decisions — 2026-06-19 (owner-approved)

Owner closed 8 gating decisions. From here it is EXECUTION ONLY. This doc is the
source of truth for the remaining backlog sequence. Pairs with the wave spec
`_meta/plans/2026-06-11-expansion-waves-implementation-plan.md` and the audit
backlog in memory `active-resume-state`.

## The 8 decisions (all approved as recommended)
1. **Next-wave priority = Fundament + chain A→Z**: `apps/worker` → E1 labels (GS1) → shipping UI (pick/pack/ship). Build order is foundation-first so the whole ecosystem unblocks and golden-flow closes to shipment.
2. **apps/worker = BUILD it** (outbox dispatcher on Vercel Cron/Queue + reporting MV refresh). Until then events are persisted-not-dispatched; this unblocks CCP scheduler, MV refresh, recall drills, allergen cascade, no-show marking, etc.
3. **Consume-before-output = SOFT warning + flag** (not a hard block). Allow output registration with zero consumption, but warn "no consumption → no genealogy" and flag the WO. Do not block legitimate/partial flows.
4. **fa→FG rename = DO NOW, dedicated isolated wave** (own commit + full tests) before the code grows further. Covers routes `/fa`, `fa.*` events, columns, "Factory Article" copy, `^FA` patterns.
5. **Shipping = FULL chain to ship**: SO list/detail + allocation + pick/pack (SSCC-18 mod-10 server-side) + ship/BOL/POD. Wire into trace (E2A). Backend `so-actions.ts` already exists.
6. **E-IO import = ENABLE, tranche 1 = PO + TO + WO**: build the import engine + 3 adapters per the E-IO plan; documents created as DRAFT; idempotent via external_ref. (`IMPORT_FEATURE_DISABLED=true` flips off.)
7. **HACCP = FULL plan layer (E3 complete)**: `haccp_plans` + versioning (clone-on-write) + `ccp_deviations` register + e-sign activation + auto-hold on breach. BRCGS requirement.
8. **Commit + deploy = COMMIT to main + DEPLOY to Vercel** (migrations 300–303 already live, so code↔DB must be reconciled on main). Done 2026-06-19.

## Already-decided (execution-only, do NOT re-ask) — from [[w11-reversibility-decisions]] B-list
- Suppliers canonical = PLANNING Suppliers; unify Settings→Partners into it.
- UoM canonical = `public.unit_of_measure`; remove the `reference.uom` duplicate.
- NPD release = ENFORCE REVIEW (stop writing source='technical' from NPD; specs go draft→in_review).
- Genealogy = BUILD the `lp_genealogy` junction (N parents); keep `parent_lp_id` as fast-path.
- Dead outbox events = START EMITTING `warehouse.lp.received`, `material.consumed`, `lp.shipped`.
- mig-222/223 semantic drift = BLESS new semantics, rewrite the 8 drifted tests.

## Recommended execution sequence (waves)
**WAVE A — Foundation (decisions 2, 3):**
- A1 `apps/worker`: outbox dispatcher (Vercel Cron poller over `outbox_events` → consumers) + reporting MV refresh job. Wire the existing event consumers (hold-on-breach, allergen cascade, etc.).
- A2 consume-before-output soft warning + WO flag (decision 3).
- A3 dead-outbox emits (`warehouse.lp.received`, `material.consumed`, `lp.shipped`) now that a dispatcher exists.

**WAVE B — Close the physical chain (decisions 1, 5):**
- B1 E1 labels: `printers` + `print_jobs` tables, `printLabel`/`previewLabel` (PDF mode, no hardware), [Print] on LP detail / GRN / scanner-receive / output. GS1-128 via `packages/gs1` (add generator).
- B2 Shipping full: SO list/detail + allocation gate + pick/pack (SSCC-18) + ship/BOL/POD; wire into trace.

**WAVE C — Compliance crown (decisions 1, 7):**
- C1 E2A Trace & Recall: `/quality/trace` + `/quality/recall-drills` over the existing recursive genealogy CTE + `recall_drills` table + PDF export.
- C2 HACCP full: `haccp_plans` + versioning + `ccp_deviations` + e-sign activation + auto-hold (depends on WAVE A worker for the reading scheduler, fallback in-line).
- C3 lp_genealogy junction (N parents) + E2B cold chain (optional pair).

**WAVE D — Data ingest + cleanup (decision 6 + B-list):**
- D1 E-IO import tranche 1 (PO/TO/WO adapters + engine; flip `IMPORT_FEATURE_DISABLED`).
- D2 suppliers→Planning unification + UoM dedup (reference.uom removal) + NPD review enforcement.

**WAVE E — Big rename (decision 4):**
- E1 fa→FG rename, isolated, own commit, full test pass. Schedule when no other wave is mid-flight to minimise conflicts.

**LATER (not gated today):** E4A/E4B (andon/labor), E5 (yard), E7 (disassembly), E8 (scheduler), E9 (freight/scorecard), E10 (kitting/inventory-count), E11 (complaints→CAPA), E12 (B2B portal + AI — needs own auth spec), multi-site request-path scoping (`withSiteContext` + per-site RLS), historical wo_outputs LP backfill, shipping SO 500 graceful-error, PO 200-row ceiling.

## Ops notes for execution
- Codex wrapper keeps dying before migrations even with `--timeout-ms 3000000` → for any must-be-complete deliverable use Claude lanes; treat Codex output as partial draft.
- Migrations: next free = **304**. Apply live via Supabase MCP `apply_migration` (psql owner role lacks privilege on Supabase-owned tables). Verify with a follow-up SELECT.
- Every new event → emitter + consumer + test + add to `events.enum.ts` AND regenerate the outbox CHECK in the highest migration (drift gate). Every new perm → `permissions.enum.ts` + seed migration + bump `permissions.test.ts` snapshot counts.
