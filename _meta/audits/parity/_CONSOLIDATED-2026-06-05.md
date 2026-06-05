# Parity Audit — CONSOLIDATED (2026-06-05)

4 read-only Opus auditors (out of the 12-pool) audited every BUILT UI module against the
prototype + labeled index. Per-module reports: `01-npd.md`, `02-settings.md`,
`03-technical.md`, `08-production-quality-shell.md`.

## Headline diagnosis: "skill vs execution?"
**It is MOSTLY a skill/process problem, not careless per-screen execution.** Two hard facts:
1. **Red-lines are CLEAN across every built screen** — org_id (never tenant_id), real
   Supabase via `withOrgContext`+RLS, NUMERIC-as-string, FG-not-FA, canonical owners,
   D365 export-only. The ONE red-line breach (raw `<select>`) is itself *systemic* (a
   missing codified pattern), not sloppiness.
2. The recurring discrepancies are each a **missing convention/gate**, not a one-off bug.
   Fix the skill + add a lint → it stops recurring AND sweeps every existing screen at once.

The large remainder (production 1/28 screens, quality 0/32) is **not "discrepancy" — it is
"not built yet"** = the SCREENS phase the user already scoped, not parity-fix work.

Total findings: npd 13 · settings 11 · technical 12 · prod/qual/shell ~24 (of which ~22 = not-built).
P0 (true blockers on BUILT screens): effectively 1 (PRD-002 Lines grid). All other "P0" = unbuilt module.

---

## BUCKET A — SKILL/PROCESS (systemic, recurs across modules) → fix ONCE + sweep
| # | class | where | fix |
|---|-------|-------|-----|
| A1 | raw `<select>` vs shadcn `<Select>` (RED-LINE) | settings ≥5 (roles, depts, import-export, migrations, schema/new) | add canonical RSC→`<SelectField>` client wrapper in MON-t3-ui + eslint ban on raw `<select>`; then mechanical swap |
| A2 | stale/phantom prototype anchors | technical ≥7 (+ likely others; every module declares anchors) | **anchor-lint CI gate**: every `prototypes/...:N-M` citation must resolve to a real index entry (routings cites past-EOF 1270-1287) |
| A3 | dual route / i18n-namespace trees | npd `(npd)`↔`[locale]/(app)/(npd)` live-dup allergens route; technical `technical.*`↔`Technical.*` | convention + lint: single i18n namespace casing; no duplicate LIVE route; + small migration |
| A4 | visual density drift (heavy `rounded-3xl p-8` cards vs compact admin density) | settings stubs/launchers; `SettingsRouteStub` | restyle stub w/ prototype density tokens (low priority — placeholders) |
| A5 | permission-denied not a distinct UI state | settings/security (maps denied→ready); suspected features/notifications/promotions/modules | SKILL rule: read-permission-denied must render the amber denied banner (pattern already used by users/page) + per-screen apply |

**POSITIVE systemic — codify as reference, do NOT touch:**
- 5-state shell idiom (`ready|empty|error|permission_denied|loading`) — npd 15/16, present everywhere.
- Real-Supabase org_id-locked + NUMERIC-honest — 16/16 npd, all technical, settings flagship, production data layer (PRD-009 is the reference impl).

---

## BUCKET B — EXECUTION (per-screen, one-off) → batched fix waves (worktree + Codex-impl/Claude-review)
- **npd:** NPD-P-001 FA-list Kanban/view-toggle · NPD-P-002 FA-detail BOM+Formulations tabs · NPD-P-004/005 delete legacy dup allergens route+stub panel · NPD-P-008/009 cosmetic status→real data (needs upstream tables) · NPD-P-011 mark-complete wiring (T-034)
- **technical:** TEC-P-001 BOM-detail tab set (routing/params/costs/graph) · TEC-P-002 item-detail 7 stub tabs · TEC-P-010 tooling stock/reorder inventory · TEC-P-012 bom-graph react-flow DAG
- **settings:** SET-P-001 ship-override-reasons + shifts real list+modal · SET-P-003 d365 config org-scoping (env→DB) · SET-P-008 security denied banner · SET-P-010 classifyPermission heuristic validation
- **production (built screen):** PRD-001 6 KPIs (add QA-holds + next-changeover + A/P/Q) · PRD-002 Lines grid+LineCard (P0, core surface) · PRD-003/004/005 attention ribbon + event feed + shift-targets · PRD-007 WO status tabs/search/filters (data already returns statusCounts)
- **shell:** SHELL-003 drop/​wire empty CountSlot badge · SHELL-005 global topbar search (readOnly stub)

---

## BUCKET C — NOT BUILT = the SCREENS phase (not parity-fix)
- **production:** 24/28 screens + 16 modals unbuilt (WO detail, line detail, waste-analytics, downtime, shifts, changeover, OEE, DLQ, settings).
- **quality:** ENTIRE module = skeleton. 32/32 screens + 15 modals unbuilt (NCR, holds/T-064 gate, HACCP, specs wizard, inspections, sampling, audit-trail) incl. CFR-21 e-sign/SoD/dual-sign.
- Plus the 9 schema-only foundation modules (planning, scheduler, finance, oee, maintenance, reporting, multi-site, shipping, warehouse-UI) + deferred integrations (supplier-specs API TEC-G-08, event-consumers QG-03/04/08).

---

## Proposed sequence
1. **SKILL-FIX (fast, cheap, gates everything):** patch MON-t3-ui + UI-PROTOTYPE-PARITY-POLICY with A1–A5 patterns/lints + codify the positive idioms as the reference impl. Mechanical sweep applies A1/A2/A3 to existing modules.
2. **SCREENS phase + BUCKET-B**, allocation TBD per user decision — but built on the corrected skill so the 9 new modules don't replicate A1–A5.
