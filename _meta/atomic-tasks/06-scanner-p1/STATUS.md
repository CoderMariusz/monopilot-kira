# 06-scanner-p1 — Task Status

Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED/STUB | ⬜ NOT STARTED

> **Reality audit date:** 2026-06-02
> **Auditor:** kira:audit Phase 0
> **Result:** 0 implemented, 0 stub, 49 missing. No prior STATUS.md existed.
> **Key finding:** `apps/scanner` workspace entirely absent. All 49 tasks ⬜.
> **Extra:** Scanner route-group scaffold (layout, ScannerFrame, dev harness) exists in `apps/web` owned by 00-foundation T-134 — not counted here.

## Schema (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-001 | scanner_sessions + users PIN columns migration | ⬜ | `packages/db/migrations/0060_scanner_sessions_and_pin.sql` absent; last migration is 050 |
| T-002 | scanner_audit_log + scanner_devices migration | ⬜ | `packages/db/migrations/0061_scanner_audit_and_devices.sql` absent |
| T-003 | GS1-128 parser utility | ⬜ | `packages/scanner-utils/` workspace absent; `packages/gs1/` exists but different contract (GTIN/SSCC, not AI parser) |
| T-049 | Add scanner permission strings to enum | ⬜ | No scanner strings in `packages/rbac/src/permissions.enum.ts`; blocked on 02-settings T-001 |

## Utilities / Wiring Tests (T4-wiring-test)

| ID | Title | Status | Note |
|---|---|---|---|
| T-004 | scanner capability detection | ⬜ | `apps/scanner/` workspace absent |
| T-005 | scanner feedback (audio + haptic) | ⬜ | `apps/scanner/` absent |
| T-016 | withScannerPermission HOC + role check | ⬜ | `apps/scanner/` absent |
| T-025 | Session timeout modal + auto-extend | ⬜ | `apps/scanner/` absent |
| T-026 | Offline detection indicator stub (P1) | ⬜ | `apps/scanner/` absent |

## API (T2-api) — 06-a Shell & Core

| ID | Title | Status | Note |
|---|---|---|---|
| T-006 | POST /api/scanner/login + bcrypt PIN verify | ⬜ | `apps/scanner/` absent; blocked on T-001 |
| T-007 | scanner logout + GET /session sliding refresh | ⬜ | blocked on T-006 |
| T-008 | POST /api/scanner/pin/setup + /pin/change | ⬜ | blocked on T-001, T-006 |
| T-009 | context endpoints sites/lines/shifts + POST /context | ⬜ | blocked on T-006 |
| T-010 | GET /api/scanner/lookup/:type/:barcode | ⬜ | blocked on T-001, T-003 |
| T-011 | POST /api/scanner/audit batch ingest | ⬜ | blocked on T-002 |

## API (T2-api) — 06-b Warehouse In

| ID | Title | Status | Note |
|---|---|---|---|
| T-027 | pending-receipts + PO lines APIs | ⬜ | blocked: 05-warehouse LP/GRN tables all MISSING |
| T-028 | POST /receive-po-line (multi-LP receive + tolerance) | ⬜ | blocked: 05-warehouse T-002 (license_plates), T-005 (grns) MISSING |
| T-029 | POST /receive-to-line (TO in-transit accept) | ⬜ | blocked: 05-warehouse TO tables MISSING |
| T-030 | putaway suggest + execute APIs | ⬜ | blocked: 05-warehouse LP/location tables MISSING |

## API (T2-api) — 06-c Warehouse Movement

| ID | Title | Status | Note |
|---|---|---|---|
| T-034 | LP lock + move + split APIs | ⬜ | blocked: 05-warehouse LP tables MISSING |

## API (T2-api) — 06-d Production Pick + Consume

| ID | Title | Status | Note |
|---|---|---|---|
| T-037 | pick-lists + pick APIs | ⬜ | blocked: 04-planning WO + 05-warehouse LP + 08-production all MISSING |
| T-038 | active-WOs + WO materials + suggest-LP APIs | ⬜ | blocked: 04/05/08 MISSING |
| T-039 | POST /consume-to-wo (intermediate cascade core) | ⬜ | blocked: 04/05/08 MISSING |

## API (T2-api) — 06-e Production Output and QA

| ID | Title | Status | Note |
|---|---|---|---|
| T-042 | production scanner output co-product waste APIs | ⬜ | blocked: 04/05/08/09 all MISSING |
| T-043 | quality scanner pending inspect APIs | ⬜ | blocked: 05/09 MISSING |

## UI (T3-ui) — 06-a Shell & Core

| ID | Title | Status | Note |
|---|---|---|---|
| T-012 | apps/scanner Next.js workspace + /scanner layout | ⬜ | `apps/scanner/` absent; partial scaffold exists in apps/web as Extra (owned by 00-foundation T-134) — workspace split must be resolved |
| T-013 | ScanInput component | ⬜ | absent; prototype anchor path mismatch (should be `prototypes/scanner/flow-receive.jsx`) |
| T-014 | CameraScanner component | ⬜ | absent; prototype anchor path mismatch |
| T-015 | ManualInput + qty keypad component | ⬜ | absent |
| T-017 | SCN-010 Login screen UI | ⬜ | absent; prototype `prototypes/scanner/login.jsx:5-56` valid (426 lines) |
| T-018 | SCN-011 PIN entry UI (6-dot + 3×4 numpad) | ⬜ | absent |
| T-019 | SCN-011b PIN First-time Setup wizard | ⬜ | absent |
| T-020 | SCN-011c PIN Change Self-service wizard | ⬜ | absent |
| T-021 | SCN-012 Site / Line / Shift select UI | ⬜ | absent |
| T-022 | SCN-013 Devices admin screen + pairing API | ⬜ | absent |
| T-023 | SCN-home workflow launcher menu | ⬜ | absent |
| T-024 | SCN-settings page | ⬜ | absent |
| T-048 | scanner mobile evidence + route label closeout harness | ⬜ | `apps/scanner/__tests__/` absent; `apps/web/e2e/scanner-isolation.spec.ts` is T-134 (00-foundation), not this task |

## UI (T3-ui) — 06-b Warehouse In

| ID | Title | Status | Note |
|---|---|---|---|
| T-031 | SCN-020 Receive PO 4-step UI | ⬜ | blocked: T-028 MISSING |
| T-032 | SCN-030 Receive TO 3-step UI | ⬜ | blocked: T-029 MISSING |
| T-033 | SCN-040 Putaway UI | ⬜ | blocked: T-030 MISSING |

## UI (T3-ui) — 06-c Warehouse Movement

| ID | Title | Status | Note |
|---|---|---|---|
| T-035 | SCN-031 Move LP UI | ⬜ | blocked: T-034 MISSING |
| T-036 | SCN-060 Split LP UI (3-step) | ⬜ | blocked: T-034 MISSING |

## UI (T3-ui) — 06-d Production Pick + Consume

| ID | Title | Status | Note |
|---|---|---|---|
| T-040 | SCN-050 Pick for WO 5-step UI | ⬜ | blocked: T-037 MISSING |
| T-041 | SCN-080 Consume-to-WO + SCN-081 WO execute UI | ⬜ | blocked: T-039 MISSING |

## UI (T3-ui) — 06-e Production Output and QA

| ID | Title | Status | Note |
|---|---|---|---|
| T-044 | SCN-082 Output registration UI | ⬜ | blocked: T-042 MISSING |
| T-045 | SCN-083 Co-product registration UI | ⬜ | blocked: T-042 MISSING |
| T-046 | SCN-084 Waste registration UI | ⬜ | blocked: T-042 MISSING |
| T-047 | SCN-070–073 QA scanner UI | ⬜ | blocked: T-043 MISSING |
