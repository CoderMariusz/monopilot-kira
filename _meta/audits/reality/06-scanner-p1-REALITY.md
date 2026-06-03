# 06-scanner-p1 — Reality Audit (2026-06-02)

## Counts
- task files: 49 | manifest task_count: 49 | STATUS rows: 0 (STATUS.md did not exist) → reconciliation: EXACT MATCH on count; no prior STATUS tracking.
- Verdict breakdown: ✅ IMPLEMENTED 0 | 🟡 STUB 0 | ⛔ MISSING 49 | 👻 PHANTOM 0 | 🔴 BROKEN 0 | 🧩 EXTRA 4

## Task reality

| Task | Title (abbrev) | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | scanner_sessions + users PIN columns migration | T1-schema | ⛔ MISSING | `packages/db/migrations/0060_scanner_sessions_and_pin.sql` absent; last migration is 050 | No scanner_sessions table, no PIN columns on users |
| T-002 | scanner_audit_log + scanner_devices migration | T1-schema | ⛔ MISSING | `packages/db/migrations/0061_scanner_audit_and_devices.sql` absent; `packages/db/src/schema/scanner-audit-log.ts` absent | |
| T-003 | GS1-128 parser utility | T1-schema | ⛔ MISSING | `packages/scanner-utils/` workspace does not exist; scoped to `packages/scanner-utils/src/gs1-parser.ts` | NOTE: `packages/gs1/src/parse.ts` exists but scopes GS1 identifiers (GTIN/SSCC), not GS1-128 Application Identifier parser — different contract; path mismatch same as 05-warehouse T-023 |
| T-004 | scanner capability detection | T4-wiring-test | ⛔ MISSING | `apps/scanner/` workspace does not exist; `apps/scanner/src/lib/scanner/detect.ts` absent | Entire apps/scanner workspace is absent |
| T-005 | scanner feedback (audio + haptic) | T4-wiring-test | ⛔ MISSING | `apps/scanner/src/lib/scanner/feedback.ts` absent | apps/scanner missing |
| T-006 | POST /api/scanner/login + bcrypt PIN verify | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/login/route.ts` absent; no scanner routes exist anywhere | |
| T-007 | scanner logout + GET /session sliding refresh | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/logout/route.ts` absent | |
| T-008 | POST /api/scanner/pin/setup + /pin/change | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/pin/` absent | |
| T-009 | context endpoints sites/lines/shifts + POST /context | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/context/` absent | |
| T-010 | GET /api/scanner/lookup/:type/:barcode | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/lookup/` absent | |
| T-011 | POST /api/scanner/audit batch ingest | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/audit/route.ts` absent | |
| T-012 | apps/scanner Next.js workspace + /scanner layout | T3-ui | ⛔ MISSING | `apps/scanner/` workspace does not exist; `apps/scanner/package.json` absent | NOTE: a partial scaffold exists in apps/web as Extra (see below) |
| T-013 | ScanInput component | T3-ui | ⛔ MISSING | `apps/scanner/src/components/scan-input.tsx` absent | Prototype anchor `prototypes/design/Monopilot Design System/scanner/flow-receive.jsx:89-233` has WRONG PATH — actual file is `prototypes/scanner/flow-receive.jsx` (431 lines, anchor in range) |
| T-014 | CameraScanner component (@zxing/browser) | T3-ui | ⛔ MISSING | `apps/scanner/src/components/camera-scanner.tsx` absent | Same prototype path mismatch as T-013 |
| T-015 | ManualInput + qty keypad component | T3-ui | ⛔ MISSING | `apps/scanner/src/components/manual-input.tsx` absent | Prototype anchor `modals.jsx:251-275` — actual at `prototypes/scanner/modals.jsx` (496 lines, range valid) |
| T-016 | withScannerPermission HOC + role check | T4-wiring-test | ⛔ MISSING | `apps/scanner/src/lib/scanner/permission-guard.tsx` absent | |
| T-017 | SCN-010 Login screen UI | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/login/page.tsx` absent | Prototype anchor `login.jsx:5-56` — actual at `prototypes/scanner/login.jsx` (426 lines, range valid) |
| T-018 | SCN-011 PIN entry UI (6-dot + 3×4 numpad) | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/pin/page.tsx` absent | Prototype anchor `login.jsx:58-112` valid |
| T-019 | SCN-011b PIN First-time Setup wizard | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/pin/setup/page.tsx` absent | |
| T-020 | SCN-011c PIN Change Self-service wizard | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/pin/change/page.tsx` absent | |
| T-021 | SCN-012 Site / Line / Shift select UI | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/context/page.tsx` absent | |
| T-022 | SCN-013 Devices admin screen + pairing API | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/devices/page.tsx` absent | |
| T-023 | SCN-home workflow launcher menu | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/home/page.tsx` absent | |
| T-024 | SCN-settings page | T3-ui | ⛔ MISSING | `apps/scanner/src/app/scanner/settings/page.tsx` absent | |
| T-025 | Session timeout modal + auto-extend | T4-wiring-test | ⛔ MISSING | `apps/scanner/src/components/session-timeout-modal.tsx` absent | |
| T-026 | Offline detection indicator stub (P1) | T4-wiring-test | ⛔ MISSING | `apps/scanner/src/components/offline-indicator.tsx` absent | |
| T-027 | pending-receipts + PO lines APIs (06-b) | T2-api | ⛔ MISSING | `apps/scanner/src/app/api/scanner/` entirely absent | Blocked: depends on 05-warehouse LP/GRN/TO tables (all ⛔ MISSING per 05-warehouse audit) |
| T-028 | POST /receive-po-line (multi-LP receive + tolerance) | T2-api | ⛔ MISSING | absent | Blocked: 05-warehouse T-002 (license_plates), T-005 (grns) all MISSING |
| T-029 | POST /receive-to-line (TO in-transit accept) | T2-api | ⛔ MISSING | absent | Blocked: 05-warehouse TO tables MISSING |
| T-030 | putaway suggest + execute APIs | T2-api | ⛔ MISSING | absent | Blocked: 05-warehouse LP/location tables MISSING |
| T-031 | SCN-020 Receive PO 4-step UI | T3-ui | ⛔ MISSING | absent | Blocked: T-028 MISSING |
| T-032 | SCN-030 Receive TO 3-step UI | T3-ui | ⛔ MISSING | absent | Blocked: T-029 MISSING |
| T-033 | SCN-040 Putaway UI | T3-ui | ⛔ MISSING | absent | Blocked: T-030 MISSING |
| T-034 | LP lock + move + split APIs (06-c) | T2-api | ⛔ MISSING | absent | Blocked: 05-warehouse LP tables MISSING |
| T-035 | SCN-031 Move LP UI | T3-ui | ⛔ MISSING | absent | Blocked: T-034 MISSING |
| T-036 | SCN-060 Split LP UI (3-step) | T3-ui | ⛔ MISSING | absent | Blocked: T-034 MISSING |
| T-037 | pick-lists + pick APIs (06-d) | T2-api | ⛔ MISSING | absent | Blocked: 04-planning-basic WO + 05-warehouse LP + 08-production all MISSING |
| T-038 | active-WOs + WO materials + suggest-LP APIs | T2-api | ⛔ MISSING | absent | Blocked: 04-planning, 05-warehouse, 08-production MISSING |
| T-039 | POST /consume-to-wo (intermediate cascade core) | T2-api | ⛔ MISSING | absent | Cross-dep: 04/05/08 all MISSING |
| T-040 | SCN-050 Pick for WO 5-step UI | T3-ui | ⛔ MISSING | absent | Blocked: T-037 MISSING |
| T-041 | SCN-080 Consume-to-WO + SCN-081 WO execute UI | T3-ui | ⛔ MISSING | absent | Blocked: T-039 MISSING |
| T-042 | production scanner output co-product waste APIs | T2-api | ⛔ MISSING | absent | Blocked: 04/05/08/09 all MISSING |
| T-043 | quality scanner pending inspect APIs | T2-api | ⛔ MISSING | absent | Blocked: 05/09 MISSING |
| T-044 | SCN-082 Output registration UI | T3-ui | ⛔ MISSING | absent | Blocked: T-042 MISSING |
| T-045 | SCN-083 Co-product registration UI | T3-ui | ⛔ MISSING | absent | Blocked: T-042 MISSING |
| T-046 | SCN-084 Waste registration UI | T3-ui | ⛔ MISSING | absent | Blocked: T-042 MISSING |
| T-047 | SCN-070–073 QA scanner UI | T3-ui | ⛔ MISSING | absent | Blocked: T-043 MISSING |
| T-048 | scanner mobile evidence + route label closeout harness | T3-ui | ⛔ MISSING | `apps/scanner/__tests__/` absent | NOTE: `apps/web/e2e/scanner-isolation.spec.ts` exists but is owned by 00-foundation T-134 (route-group isolation test), not this task |
| T-049 | Add scanner permission strings to enum (§12.5, §12.6) | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` has no scanner strings; no `ALL_SCANNER_PERMISSIONS` export | Blocked: 02-settings T-001 (enum base) must be ✅ first per cross_dep |

## Phantom / carry-forward backlog

None — all 49 tasks have task files. No phantom references detected.

## Extra (code without a 06-scanner-p1 owning task)

These files exist in the repo but are owned by 00-foundation (T-134), not by any 06-scanner-p1 task. They represent the walking skeleton scanner scaffold and are 🧩 EXTRA relative to this module:

- `apps/web/app/[locale]/(scanner)/layout.tsx` — scanner route-group layout with ScannerFrame; owned by 00-foundation T-134 (TASK-000600)
- `apps/web/app/[locale]/(scanner)/dev/scanner/page.tsx` — dev harness stub with TODO comment; owned by T-134
- `apps/web/components/shell/scanner-frame.tsx` — device chrome component (ScannerFrame); owned by T-134
- `apps/web/components/shell/__tests__/scanner-frame.test.tsx` — RED test for ScannerFrame; owned by T-134 (TASK-000599)
- `apps/web/e2e/scanner-isolation.spec.ts` — route-group isolation E2E; owned by T-134 (explicitly tagged)
- `apps/web/e2e/parity-evidence/shell/en-dev-scanner.png` — parity screenshot for dev harness; owned by T-134

## Prototype path mismatch (critical for T3-ui tasks)

All T3-ui tasks in this module reference prototype anchors at:
`prototypes/design/Monopilot Design System/scanner/<file>.jsx`

This path does NOT exist. The actual prototype files live at:
`prototypes/scanner/<file>.jsx`

Affected tasks: T-013, T-014, T-015, T-017, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-031, T-032, T-033, T-035, T-036, T-040, T-041, T-044, T-045, T-046, T-047, T-048.

Line counts confirmed valid: `login.jsx` 426 lines, `flow-receive.jsx` 431 lines, `modals.jsx` 496 lines, `shell.jsx` 203 lines — anchor ranges cited in tasks fall within bounds.

## Top integration risks

1. **apps/scanner workspace is entirely absent** — every T-006 through T-048 API and UI task scopes `apps/scanner/src/...`. This is a new Next.js workspace that must be bootstrapped from scratch before any of the 43 downstream tasks can start. No monorepo wiring (`pnpm-workspace.yaml`, `turbo.json`) for apps/scanner exists.

2. **05-warehouse LP/GRN/TO/stock tables are all ⛔ MISSING** (confirmed by 05-warehouse reality audit, 2026-06-02) — T-027 through T-036 (Warehouse In + Movement flows) are hard-blocked on schema that does not yet exist. Same applies to 04-planning-basic (WO tables absent) which blocks T-037–T-041 (Production Pick/Consume), and 08-production + 09-quality which block T-042–T-047.

3. **prototype path anchor mismatch in all T3-ui tasks** — tasks reference `prototypes/design/Monopilot Design System/scanner/...` which does not exist; actual files are at `prototypes/scanner/...`. Every T3-ui implementation will fail the parity gate unless this is corrected in task JSON or resolved via a path alias before implementation starts.

## Skeleton contribution

The walking skeleton scanner scaffold (T-134 / 00-foundation) already delivered:
- Route-group isolation: `(scanner)` layout isolated from AppShell ✅
- `ScannerFrame` device chrome component with stable test IDs ✅
- Dev harness page at `/[locale]/dev/scanner` ✅
- E2E isolation spec (passes structural isolation, not full scanner flows)

This provides the entry point for T-012 (apps/scanner Next.js workspace). However T-012 scopes a separate `apps/scanner` workspace rather than continuing in `apps/web`, which means the walking-skeleton scaffold and the module tasks are in **different workspaces** — this architectural split must be resolved before wave 1 implementation begins.
