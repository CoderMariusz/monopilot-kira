# PRD Coverage — Onboarding Wizard (§14.3–14.4, 02-SETTINGS-PRD.md)

## Coverage by PRD section

| PRD ref | Requirement | Task file | Status |
|---|---|---|---|
| §14.3 intro | 6-step onboarding wizard, <15min P50 target | tasks/T-001 through tasks/T-010 | covered |
| §14.3 step 1 | Organization Profile (name, timezone, locale, currency, logo) | tasks/T-001 (schema), tasks/T-002 (API), tasks/T-006 (UI SET-002) | covered |
| §14.3 step 2 | First Warehouse (name, type, code) | tasks/T-001 (schema), tasks/T-002 (API), tasks/T-007 (UI SET-003) | covered |
| §14.3 step 3 | First Location (zone, bin in created warehouse) | tasks/T-001 (schema), tasks/T-002 (API), tasks/T-008 (UI SET-004) | covered |
| §14.3 step 4 | First Product (soft redirect, skippable) | tasks/T-002 (API with skip support), tasks/T-009 (UI SET-005) | covered |
| §14.3 step 5 | First Work Order (soft redirect, skippable) | tasks/T-002 (API with skip support), tasks/T-010 (UI SET-006) | covered |
| §14.3 step 6 | Completion Celebration (confetti + next steps cards) | tasks/T-004 (UI SET-007) | covered |
| §14.3 state schema | organizations.onboarding_state JSONB {current_step, completed_steps, skipped_steps, started_at, last_activity_at} | tasks/T-001 (migration + default), tasks/T-002 (state updates) | covered |
| §14.3 resume capability | User returns → wizard continues from current_step | tasks/T-002 (step logic), tasks/T-003 (GET /api/v1/onboarding/resume endpoint) | covered |
| §14.3 skip button | Skip allowed on steps 4 and 5 only (optional steps) | tasks/T-002 (skip=true handling), tasks/T-009 (SET-005 UI), tasks/T-010 (SET-006 UI) | covered |
| §14.4 SET-001 | Wizard Launcher modal, auto-show for new orgs | tasks/T-005 (UI) | covered |
| §14.4 SET-002 | Org Profile Step, RHF form | tasks/T-006 (UI) | covered |
| §14.4 SET-003 | First Warehouse Step, warehouse create | tasks/T-007 (UI) | covered |
| §14.4 SET-004 | First Location Step, location create | tasks/T-008 (UI) | covered |
| §14.4 SET-005 | First Product Step, redirect to 03-TECHNICAL | tasks/T-009 (UI) | covered |
| §14.4 SET-006 | First WO Step, redirect to 04-PLANNING-BASIC | tasks/T-010 (UI) | covered |
| §14.4 SET-007 | Completion Celebration, confetti + card grid | tasks/T-004 (UI) | covered |
| §14.4 SET-100 | User Menu Language Picker | none | out-of-scope: user preferences, not onboarding flow (separate module) |
| §14.4 SET-101 | User Preferences (language, notifications, MFA) | none | out-of-scope: user settings module, not onboarding (separate feature) |
| PRD line 57 KPI | Onboarding time (first WO created) <15min P50, <30min P95 | tasks/T-002 (state tracking with timestamps) | covered (measurement infrastructure assumed in KPI collection) |

## Coverage by category

### Data (1 task)
| PRD ref | Task | Subcategory |
|---|---|---|
| §14.3 state schema | T-001 | schema (JSONB migration) |

### API (3 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §14.3 step progression | T-002 | endpoint (POST /api/v1/onboarding/step) |
| §14.3 resume capability | T-003 | endpoint (GET /api/v1/onboarding/resume) |

### UI (6 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §14.4 SET-001 | T-005 | screen (Wizard Launcher modal) |
| §14.4 SET-002 | T-006 | screen (Org Profile form) |
| §14.4 SET-003 | T-007 | screen (Warehouse form) |
| §14.4 SET-004 | T-008 | screen (Location form) |
| §14.4 SET-005 | T-009 | screen (Product redirect) |
| §14.4 SET-006 | T-010 | screen (WO redirect) |
| §14.4 SET-007 | T-004 | screen (Celebration) |

## Gaps

| PRD ref | Requirement | Status |
|---|---|---|
| (none) | All PRD requirements 1516-1547 mapped | ✅ 100% coverage, no gaps |

## Notes

- T-001 (schema) is a foundation task (priority 80, blocks T-002/T-003)
- T-002 (step API) and T-003 (resume API) form the state machine core (priority 80/85)
- T-005 (launcher modal) depends on T-001/T-002 but can auto-show logic parallel
- T-004 (celebration) and T-006-T-010 (step screens) can be built mostly in parallel after T-002 API is ready
- SET-100 and SET-101 are explicitly out-of-scope per PRD: they are user preferences, not part of the onboarding flow
- KPI measurement (line 57) assumes timestamps are captured in onboarding_state.started_at and last_activity_at; validation of <15min P50 / <30min P95 is monitoring/analytics work (not included in decomposition)
