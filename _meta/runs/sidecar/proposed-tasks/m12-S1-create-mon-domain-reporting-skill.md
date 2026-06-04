# PROPOSED STUB — m12-S1 (12-reporting): Create MON-domain-reporting skill

**Severity:** Medium — reporting wave has no consolidated domain playbook.
**Type:** Gap (skill). Builders of T-003..T-027 currently have no MON-domain-reporting skill,
while 10-finance (MON-domain-finance) and 15-oee (MON-domain-oee) both do.

## Evidence
- `ls .claude/skills/MON-domain-*` → finance, oee, npd, settings, production, quality, planning,
  warehouse, shipping, maintenance present. **No `MON-domain-reporting`.**
- 12-reporting is 27 tasks of MV/refresh/export/dashboard work with non-obvious invariants.

## Proposed skill content (outline)
1. **Read-only sink boundary** — 12-REPORTING never writes to upstream/outbox tables
   (PRD §12.1 "NIE produkuje eventow"); all sources consumed read-only.
2. **Materialized-view discipline** — `REFRESH MATERIALIZED VIEW CONCURRENTLY` REQUIRES a
   UNIQUE index on every MV; refresh runs on apps/worker (T-005), never in request path;
   2-min prod / 5-min QC cadence; 3-consecutive-failure auto-disable; advisory lock per view;
   view names enum-bound (never string-interpolated).
3. **KPI glossary as SoT** — formulas live in `_foundation/contracts/reporting-kpi-glossary.md`
   + TS export (T-002, 16 P1 KPIs); UI/MVs must not redefine formulas inline.
4. **Export + retention** — `report_exports` SHA-256 + GENERATED 7-year `retention_until`
   (BRCGS §14.1); PDF via Edge Function, CSV stream; rate-limit dedup (Foundation T-121).
5. **Wave0 org_id** — PRD prose still says `tenant_id`; tasks override to `org_id` +
   `app.current_org_id()`; never `current_setting('app.tenant_id')`.
6. **Access gate** — `report_access_gate_v1` DSL rule + middleware (T-009) + `report_access_audits`.
7. **Catalog is metadata-driven** — `dashboards_catalog` (10 P1 + 15 P2 feature-flag stubs),
   not hardcoded.
8. **Prototype parity** — `_meta/prototype-labels/prototype-index-reporting.json` + UI parity policy.

## Acceptance
- `.claude/skills/MON-domain-reporting/SKILL.md` exists, registered in MON-INDEX.md, with a
  trigger description matching reporting tasks.

READ-ONLY proposal — create via /kira:skills-overhaul, not in this audit.
