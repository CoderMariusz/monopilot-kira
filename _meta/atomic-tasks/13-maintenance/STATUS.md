# 13-maintenance — Task Status

Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED/STUB | ⬜ NOT STARTED

> Last updated: 2026-06-02 (initial STATUS.md — created by reality audit; no prior STATUS existed)
> Reality audit: `_meta/audits/reality/13-maintenance-REALITY.md`

## Summary

**0 / 30 tasks implemented.** All tasks are pre-implementation. The module has a
walking-skeleton stub page only (`apps/web/app/[locale]/(app)/(modules)/maintenance/page.tsx`).
All schema, actions, and UI components are absent from the repo.

**P0 blocker:** T-001 (permission enum) must land before any other task can compile RBAC checks.

**Wave1 foundation gate:** T-002..T-017 require `app.current_org_id()` (00-foundation T-125),
outbox+worker (T-111/T-112), and e-sign (T-124) — none of which are implemented yet.

## Task rows

| Task | Title | Type | Status | Note |
|---|---|---|---|---|
| T-001 | Lock mnt.*.* permission enum | T1-schema | ⬜ | P0-blocker; `packages/rbac/src/permissions.enum.ts` has no `mnt.` strings |
| T-002 | maintenance_settings + technician_profiles + equipment DDL+RLS | T1-schema | ⬜ | Blocked: needs 00-foundation T-125 (`app.current_org_id()`) |
| T-003 | maintenance_schedules + mwo_checklist_templates DDL+RLS | T1-schema | ⬜ | Blocked: needs T-002 |
| T-004 | MWO + mwo_checklists + mwo_loto_checklists DDL+RLS | T1-schema | ⬜ | Blocked: needs T-002, T-003 |
| T-005 | spare_parts + stock + transactions + mwo_spare_parts DDL+RLS | T1-schema | ⬜ | Blocked: needs T-002 |
| T-006 | calibration_instruments + calibration_records + sanitation_checklists + maintenance_history DDL+RLS | T1-schema | ⬜ | Blocked: needs T-002 |
| T-007 | Register 6 P1 DSL rules in rules registry | T5-seed | ⬜ | Blocked: needs T-002 schema + 02-Settings rule registry (rule-registry migration exists) |
| T-008 | maintenance_kpis MV + pg_cron daily refresh | T1-schema | ⬜ | Blocked: needs T-002..T-006 |
| T-009 | PM schedule due engine worker | T2-api | ⬜ | Blocked: needs T-003, T-005, T-006, T-008 + 00-foundation T-111/T-112 |
| T-010 | MWO state machine Server Actions (6 verbs) | T2-api | ⬜ | Blocked: needs T-001, T-004 |
| T-011 | Spare parts Server Actions (consume/adjust/reorder/receipt) | T2-api | ⬜ | Blocked: needs T-001, T-005 |
| T-012 | Maintenance outbox publisher (8 events) + Zod contracts | T2-api | ⬜ | Blocked: needs T-002..T-006 + 00-foundation T-111 |
| T-013 | Reference table seeds + GDPR erasure + i18n PL/EN | T5-seed | ⏸ | Partial: reference-schemas.sql has alert_thresholds schema def + skill levels + spare part categories; full i18n keys and GDPR erase fn absent |
| T-014 | LOTO apply/clear + two-person e-sign | T2-api | ⬜ | Blocked: needs T-001, T-004 + 00-foundation T-124 (e-sign) |
| T-015 | Calibration record + cert upload + SHA-256 | T2-api | ⬜ | Blocked: needs T-001, T-006 |
| T-016 | Sanitation checklist + ATP gate + allergen dual e-sign | T2-api | ⬜ | Blocked: needs T-001, T-006 + 00-foundation T-124 |
| T-017 | Auto-MWO from downtime consumer + downtime linkage | T2-api | ⬜ | Blocked: needs T-001, T-004 + 08-production downtime_events |
| T-018 | UI: Maintenance Dashboard | T3-ui | ⬜ | Stub page exists (ModuleStubNotice only); no KPIs, no Supabase queries; needs T-008, T-010 |
| T-019 | UI: Asset Registry List + Detail | T3-ui | ⬜ | No components; needs T-002, T-010 |
| T-020 | UI: PM Schedule List + Wizard + Calendar | T3-ui | ⬜ | No components; needs T-003, T-009 |
| T-021 | UI: Work Request + MWO List + Create/Triage | T3-ui | ⬜ | No components; needs T-010 |
| T-022 | UI: MWO Detail (7-tab + state stepper) | T3-ui | ⬜ | No components; needs T-010, T-012 |
| T-023 | UI: Spare Parts List + Detail + Reorder | T3-ui | ⬜ | No components; needs T-011 |
| T-024 | UI: Calibration List + Detail + Cert Upload | T3-ui | ⬜ | No components; needs T-015 |
| T-025 | UI: LOTO Procedures List + Apply/Clear (safety-critical) | T3-ui | ⬜ | No components; needs T-014 |
| T-026 | UI: Technicians List + Detail + Skill Edit (GDPR PII) | T3-ui | ⬜ | No components; needs T-002, T-013 |
| T-027 | UI: Analytics Hub + Settings page | T3-ui | ⬜ | No components; needs T-008, T-012 |
| T-028 | Rate-limit + observability wiring | T4-wiring-test | ⬜ | Blocked: needs T-009..T-017 + 00-foundation T-121, T-116..T-118 |
| T-029 | Register MNT-001..014 in dashboards_catalog | T5-seed | ⬜ | Schema registered; MNT rows not seeded; needs T-008 MV |
| T-030 | E2E spine: WR→approve→start→consume spare→complete | T4-wiring-test | ⬜ | Needs T-010..T-017 + 00-foundation T-123 (Playwright) |

## Carry-forwards from manifest cross-module dependencies

These 00-foundation tasks are declared as requirements in the manifest and are not yet done:
- `00-foundation T-124` — e-sign primitive (blocks T-014, T-016)
- `00-foundation T-125` — `app.current_org_id()` function (blocks T-002..T-006 RLS)
- `00-foundation T-111/T-112` — outbox+worker primitive (blocks T-009, T-012)
- `00-foundation T-121` — rate-limit primitive (blocks T-028)
- `00-foundation T-116..T-118` — observability (blocks T-028)
- `00-foundation T-123` — Playwright setup (blocks T-030)
