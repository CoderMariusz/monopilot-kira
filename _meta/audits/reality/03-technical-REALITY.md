# 03-technical — REALITY (ground-truth audit)

**Date:** 2026-06-04 · **Branch:** kira/long-run · **HEAD:** df7f2036 · **Supabase:** @175
**Method:** read all 93 `T-NNN.json` + inspect real repo artifacts (Sonnet fan-out, evidence-cited). Audit-only — no code changed. Supersedes the 2026-06-02 audit (which predated all 03-technical implementation).

## Count reconciliation
- Task files: **93** · manifest `task_count`: **93** · STATUS.md: present (was severely stale @2026-06-02 — refreshed by this audit).
- Reality (per-task table authoritative): **IMPLEMENTED 36 · STUB 11 · MISSING 46 · PHANTOM 0 · BROKEN 0**.

## Verdict summary

**IMPLEMENTED (44)** — backend complete, merged this session, tests captured:
- Schema: T-001 items (153), T-002 BOM SSOT (159), T-003 cost-history (160), T-004 allergen (161), T-005 lab/supplier (162), T-006 routings (163), T-007 d365 (164), T-079 factory_specs (165), T-084 sensory (166), T-075 supplier-gov (174), T-091 RBAC enum, T-093 RBAC seed (154).
- API: T-008–T-011 items CRUD, T-012–T-016 BOM API, T-017–T-019 allergen API, T-020 lab read, T-021 cost, T-022–T-023 routings, T-024 cascade-rule (170), T-028–T-030 D365 worker, T-073 BOM clone-on-write (168), T-074 RM usability, T-080 bundle approval, T-081 release adapter.

**STUB (9)** — exists but incomplete / parity-unproven:
- T-032 item list (real data, but no parity evidence / RTL parity test), T-033 item create (single-form, NOT the 4-step wizard per modals.jsx:22-136), T-035 deactivate (inline confirm, not modal), T-036 dashboard (count skeleton, NOT the 5-KPI TEC-080), T-070 seeds (split across 167 + seeds/, named scope file absent, no test), T-055/T-056/T-057 D365 sync/audit/mapping (built+tested but under `/settings/integrations/d365/*`, D-1 namespace unresolved), T-058 DLQ manager (SettingsRouteStub only; retry API exists).
- Borderline: T-078, T-083 UX red-line docs exist but no "applied/signed-off" evidence.

**MISSING (40)** — the UI wave + cross-module wiring + docs:
- UI (Wave-C): T-034 item detail page (no `[item_code]` route → every per-item deep-link 404s), T-037–T-045 BOM UI (list/detail-7-tabs/edit/diff/generator/graph/recipe-sheet/history), T-046 shelf-life, T-047–T-049 allergen UI, T-050 cost UI, T-051–T-053 routings UI, T-054 maintenance cross-link, T-059 drift table, T-060 factory_spec review, T-061–T-063 nutrition/costing/traceability (cross-module), T-085–T-090 spec-driven UI, T-092 sensory UI.
- Wiring: T-025 BOM snapshot @WO (08-production dep), T-026 ATP auto-fail trigger, T-027 L3 propagation, T-031 variance nightly, T-076/T-077 PO/TO NC contracts (05-warehouse dep), T-082 NCR event contract.
- Docs: T-064–T-069, T-071, T-072.

## Top integration risks
1. **T-025 BOM snapshot write absent** — `bom_snapshots` exists but the service 08-production must call at WO creation (`lib/technical/bom/snapshot.ts`) is missing → WOs created before T-025 violate the immutable-snapshot invariant.
2. **Entire UI layer dark** — 44 IMPLEMENTED API tasks but ~30 screens MISSING; the only navigable Technical UI is the items list + stub dashboard. The API surface is unreachable by users.
3. **D365 route namespace (D-1 unresolved)** — sync/audit/mapping built+tested under `/settings/integrations/d365/*`; task JSONs target `/technical/d365/*`. Plus legacy `settings/d365-dlq` + `settings/d365-mapping` stubs coexist → two partial D365 homes.
4. **Item detail page absent (T-034)** — no `/technical/items/[item_code]` route → every deep-link from lists/BOM/allergen/cost 404s. Primary UX blocker.
5. **Cross-module NC contracts absent (T-076/077/082)** — RM usability + supplier governance exist, but PO/TO actuals from 05-warehouse have no Technical consumer; failed-spec RMs raise no Technical alert.

## Carry-forwards referencing 03-technical
`carry-forward T-062/T-064/T-069/T-072/T-073/T-080` + `CF-T015` (cross-module STATUS notes; feed Phase-1 consolidation).

## Recommendation
Backend (schema + API) is solid and live. **Wave-C = the UI layer (~30 screens)** is the dominant remaining work; sequence: item detail (T-034, unblocks deep-links) + dashboard (T-036) → BOM detail/edit/diff/generator (T-037–T-041) → allergen/cost/routings editors (T-047–T-052) → factory_spec+bundle panel (T-060/T-090) → sensory (T-092) → D365 UI (resolve D-1 first). T-025 should land alongside 08-production WO-creation.
