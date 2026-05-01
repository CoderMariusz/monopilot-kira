# 06-SCANNER-P1 PRD Amendments — 2026-04-30 Reconciliation Pass

**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §06-SCANNER-P1 (Module already at ~95%, "best-aligned module"; only minor polish items called out: SCN-011b/c PIN setup variants UX-only, `inquiry_screen` orphan, plus the post-labeling-fix `devices_screen` moved into the scanner prototype index)
**Target file:** `06-SCANNER-P1-PRD.md` (now v3.1.1)
**Scope discipline:** Strictly within 06-SCANNER-P1. UX file (`design/06-SCANNER-P1-UX.md`) untouched. Only ADD or RE-ORDER inside the PRD; no deletions.

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD screen IDs (SCN-NNN major) | 14 (per §7.3 + bridge SCN-070..073) | 19 (added SCN-011b, SCN-011c, SCN-013, SCN-095; SCN-090/SCN-error already enumerated) |
| UX screens covered by a PRD code | 16 / 16 | 16 / 16 (unchanged — UX was already the canonical schema; PRD now matches) |
| Prototype labels referenced by PRD | ~37 / 41 (`pin_screen` setup variants, `inquiry_screen`, `devices_screen` previously orphan) | 41 / 41 (every entry in `prototype-index-scanner.json` is now anchored to ≥1 SCN-ID) |
| Direction A blockers (PRD-only without UX) | 0 | 0 |
| Direction B orphans (prototype without PRD anchor) | 3 (`inquiry_screen`, `devices_screen` post-relabel, plus the SCN-011b/c PIN variants partially covered as `pin_screen`) | 0 |
| **Headline coverage** | **~95%** (per audit Module 06-SCANNER-P1 row) | **≥98%** |

The `devices_screen` migration matters: during the 2026-04-30 labeling fix it moved from `prototype-index-settings.json` → `prototype-index-scanner.json`, which would otherwise have left it as a Direction B orphan in scanner. Now anchored as **SCN-013** with FR-SC-FE-004b.

---

## 2. Sections added / amended

All inside `06-SCANNER-P1-PRD.md` v3.1.1; no sections removed.

| New PRD ID / locator | Title | UX source line | Source prototype path | ~Words |
|---|---|---|---|---|
| FR-SC-FE-003b (§8.1) | SCN-011b PIN First-time Setup (forced 2-step Set/Confirm) | `design/06-SCANNER-P1-UX.md:240-249` §3.3 | `design/Monopilot Design System/scanner/login.jsx:58-112` (`pin_screen` reused) | ~110 |
| FR-SC-FE-003c (§8.1) | SCN-011c PIN Change Self-service (3-step Old/New/Confirm) | `design/06-SCANNER-P1-UX.md:253-258` §3.4 | `design/Monopilot Design System/scanner/login.jsx:58-112` (`pin_screen` reused) | ~80 |
| FR-SC-FE-004b (§8.1) | SCN-013 Devices fleet management (org admin entry) | (no dedicated UX section — covered via 02-SETTINGS Org Admin entry-point + scanner-side rendering) | `design/Monopilot Design System/settings/ops-screens.jsx:4-95` (`devices_screen`, moved from settings index 2026-04-30) | ~140 |
| FR-SC-FE-074 + FR-SC-BE-072 (§8.6) | SCN-095 LP Inquiry (P2 with P1 shell) | `design/06-SCANNER-P1-UX.md:1057-1063` §5.7 | `design/Monopilot Design System/scanner/flow-other.jsx:391-438` (`inquiry_screen`) | ~140 |
| §8.8 (new) | UI Surfaces Traceability Matrix (bidirectional PRD ↔ UX line ↔ prototype label) | n/a (matrix consolidates all §3.x UX refs) | n/a (matrix references all `prototype-index-scanner.json` labels) | 24 screen rows + 11 modal rows |
| §7.3 update | Screen catalog table extended with SCN-011b, SCN-011c, SCN-013, SCN-095 | n/a | n/a | 4 new rows |
| Related ADRs | Added ADR-034 reference (generic naming convention applies to "Devices"/"LP"/"WO" labels) | n/a | n/a | 1 line |

Also amended:
- Header `# 06-SCANNER-P1 — PRD v3.1` → `v3.1.1` and `**Wersja:** 3.1` → `3.1.1 (PRD ↔ UX reconciliation pass — adds SCN-011b/c, SCN-013, SCN-095 + §8.8 traceability matrix)`.
- §16.6 Changelog: new top entry `v3.1.1 (2026-04-30, PRD ↔ UX reconciliation pass)`.
- §7.3 paragraph footer note: pointer to §8.8 + ADR-034 generic-naming note.

No content deleted from existing §1..§16, FR-SC-BE-001..055, FR-SC-FE-001..073, validation rules V-SCAN-*, or appendices A/B.

---

## 3. ADR-034 markers

ADR-034 (`_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md`) defines `[UNIVERSAL]` patterns for entity / column naming that travel across industries (meat / bakery / pharma / generic). For scanner, the implication is:

- Entity labels in the new sections (`Devices`, `LP`, `WO`, `Inquiry`) are **`[UNIVERSAL]`** — they do not change per industry. Industry-specific renaming (FA→FG, PR→WIP-…) is already handled in 03-TECHNICAL/01-NPD reference data; scanner UI strings stay generic.
- Markers added inline in §7.3 footer note, FR-SC-FE-003b, FR-SC-FE-004b, FR-SC-FE-074, §8.8 preamble, and `Related ADRs` (Appendix B).

No new `[INDUSTRY-CONFIG]` or `[ORG-CONFIG]` markers were needed — the scanner module is the consumer side of those configurations (it reads from `display_label` per ADR-034 §155-160), it does not own any industry-configurable taxonomy itself.

---

## 4. Open items / TODOs

None blocking. Two soft follow-ups for Phase E:

| Tag | Description | Owner |
|---|---|---|
| SCN-PRD-AMEND-01 | If/when SCN-013 Devices gets a dedicated `design/06-SCANNER-P1-UX.md` section (rather than the current cross-anchor via 02-SETTINGS Org Admin), update the §8.8 matrix UX-line column from "(no dedicated section …)" to the actual `:NNN` line. | UX writer |
| SCN-PRD-AMEND-02 | When P2 lands, FR-SC-FE-074 SCN-095 should drop the `flags.scanner_lp_inquiry` feature flag and the prototype's "P2 preview" Banner; the Inquiry tile in SCN-home Magazyn section flips from P2 placeholder to active. | Phase E impl |

---

## 5. Verification checklist

- [x] §7.3 catalog now contains 19 SCN-IDs (was 14) with explicit footer pointer to §8.8.
- [x] FR-SC-FE-003b/003c follow naming pattern of existing FR-SC-FE-NNN slots and cite UX line + prototype label inline.
- [x] FR-SC-FE-004b explicitly marks SCN-013 as moved from settings prototype index 2026-04-30 (audit-fix-2026-04-30 generator note); no double-counting in §8.8.
- [x] §8.6 P2 placeholders extended with SCN-095 + matching FR-SC-BE-072; existing SCN-090 Offline Queue rows unchanged.
- [x] §8.8 traceability matrix: every PRD SCN-ID has UX line + prototype label; every prototype-index-scanner.json entry referenced (24 screens + 11 modal rows).
- [x] Direction A: 0 blockers — every SCN-NNN cites a UX line (SCN-013 cross-anchors via 02-SETTINGS Org Admin until UX writer adds a dedicated section; SCN-090 explicitly `[NO-PROTOTYPE-YET]` P2-deferred).
- [x] Direction B: 0 orphans — `pin_screen` multi-anchored (SCN-011/011b/011c), `block_fullscreen` multi-anchored (SCN-error + Use-by Hard Block), `devices_screen` anchored to SCN-013, `inquiry_screen` anchored to SCN-095.
- [x] ADR-034 markers present in new content (§7.3 footer note, FR-SC-FE-003b/004b/074, §8.8 preamble, Appendix B Related ADRs).
- [x] No content deleted from `06-SCANNER-P1-PRD.md`.
- [x] UX file `design/06-SCANNER-P1-UX.md` not touched.

---

_Amendment audit produced 2026-04-30 as part of the audit-fix wave that also covers 03-TECHNICAL, 04-PLANNING-BASIC, 05-WAREHOUSE, 07-PLANNING-EXT, 08-PRODUCTION, 09-QUALITY, 10-FINANCE, 11-SHIPPING, 12-REPORTING, 13-MAINTENANCE, 14-MULTI-SITE, 15-OEE. 06-SCANNER-P1 was the cleanest module entering the pass; this file documents the minor polish that lifted coverage from ~95% to ≥98% and reduced Direction B orphans to zero._
