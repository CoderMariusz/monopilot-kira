# 15-OEE PRD Amendments — 2026-04-30 Reconciliation Pass

**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §Module 15-OEE (~75% coverage; 4 Direction-B orphans + several unanchored modals)
**Target file:** `15-OEE-PRD.md` (now v3.2.1)
**Scope discipline:** Strictly within 15-OEE. UX file (`design/15-OEE-UX.md`) untouched. Only ADD or RE-ORDER inside the PRD; no deletions. Inline citations of UX line numbers and prototype labels per audit fix protocol.

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD screen IDs (OEE-NNN, OEE-ADM-NNN, OEE-001x sub-screens) | 5 (OEE-001/002/003 + OEE-ADM-001/002) | 9 (added OEE-001a/b/c, OEE-ADM-003) |
| PRD modal contracts (OEE-M-NN) | 2 (OEE-M-001/002) | 12 (OEE-M-001..012) |
| OEE-003 tabs anchored (OEE-003.T1..T3) | 0 (referenced as "tabs", no IDs) | 3 (T1 Summary, T2 Six Big Losses, T3 Changeover) |
| Prototype labels in `prototype-index-oee.json` referenced by PRD | ~9 / 27 (~33%) | 27 / 27 (100% — every entry referenced at least once) |
| Direction A rows without design (`[NO-PROTOTYPE-YET]`) | implicit in §15.2 P2 list | 3 explicit (`/oee/benchmark`, `/oee/forecast` P3+, `/oee/rules-config`) |
| Direction B orphans (prototypes without PRD anchor) | 4 (`shifts_screen` post-relabel, A/P/Q drilldowns) + 8 unanchored modals | 0 — all anchored via OEE-ADM-003, OEE-001a/b/c, OEE-M-003..012, OEE-003.T1..T3 |
| **Headline coverage** | **~75%** (per audit row) | **≥90%** — only residuals are 3 `[NO-PROTOTYPE-YET]` P2/P3 rows with explicit TODOs |

The single notable behavioural change is structural: `settings_shifts_screen` (now `shifts_screen` in `prototype-index-oee.json` after 2026-04-30 labeling fix) is anchored as **OEE-ADM-003** rather than living as a 02-SETTINGS orphan. PRD §15.3 documents the rationale and the cross-link to OEE-ADM-002.

---

## 2. Sections added

All inserted inside `15-OEE-PRD.md` §15 Screens (between existing §15.1/§15.2 and §16 Build Roadmap). No content deleted.

| New PRD ID | Title | UX source line(s) | Source prototype | Anchored modal/tab? |
|---|---|---|---|---|
| OEE-ADM-003 | Shift Patterns + Non-Production Calendar | `design/15-OEE-UX.md:805-834` (cross-link from OEE-ADM-002; dedicated UX section pending — TODO OEE-PRD-AMEND-01) | `settings_shifts_screen` → `shifts_screen` (`design/Monopilot Design System/settings/org-screens.jsx:255-306`) **moved 2026-04-30** to `prototype-index-oee.json` | — |
| OEE-001a | Availability Drill-down (A factor) | `[NO-UX-YET]` (TODO add to UX §3) | `oee_availability_drilldown_page` (`oee/screens.jsx:471-543`) | — |
| OEE-001b | Performance Drill-down (P factor) | `[NO-UX-YET]` | `oee_performance_drilldown_page` (`oee/screens.jsx:546-598`) | — |
| OEE-001c | Quality Drill-down (Q factor) | `[NO-UX-YET]` | `oee_quality_drilldown_page` (`oee/screens.jsx:600-655`) | — |
| OEE-M-003 | Per-line Threshold Override (create/edit) | `15-OEE-UX.md:719-761` | `line_override_modal` (`oee/modals.jsx:163-204`) | yes |
| OEE-M-004 | Delete Per-line Override | `15-OEE-UX.md:719-761` | `delete_override_modal` (`oee/modals.jsx:350-370`) | yes |
| OEE-M-005 | Big Loss Mapping Editor | `15-OEE-UX.md:762-803` | `big_loss_mapping_modal` (`oee/modals.jsx:206-259`) | yes |
| OEE-M-006 | Changeover Detail | `15-OEE-UX.md:1004-1006` | `changeover_detail_modal` (`oee/modals.jsx:261-298`) | yes |
| OEE-M-007 | Heatmap Cell Drill-down | `15-OEE-UX.md:476-486` | `cell_drill_modal` (`oee/modals.jsx:300-326`) | yes |
| OEE-M-008 | Request Edit Escalation | `15-OEE-UX.md:865` | `request_edit_modal` (`oee/modals.jsx:328-348`) | yes |
| OEE-M-009 | Copy KPIs to Clipboard | `[NO-UX-YET]` | `copy_clipboard_modal` (`oee/modals.jsx:372-408`) | yes (TODO OEE-PRD-AMEND-02) |
| OEE-M-010 | Compare Weeks | `15-OEE-UX.md:1292` | `compare_weeks_modal` (`oee/modals.jsx:410-446`) | yes (P1.5 BL-OEE-05) |
| OEE-M-011 | Acknowledge Anomaly | (P2 placeholder area) | `acknowledge_anomaly_modal` (`oee/modals.jsx:448-484`) | yes (P2) |
| OEE-M-012 | Auto-refresh Pause | `[NO-UX-YET]` | `auto_refresh_pause_modal` (`oee/modals.jsx:486-509`) | yes (TODO OEE-PRD-AMEND-02) |
| OEE-003.T1 | Summary tab | `15-OEE-UX.md:528-674` | `oee_daily_summary_page` (`oee/dashboard.jsx:1-198`) | tab |
| OEE-003.T2 | Six Big Losses tab | `15-OEE-UX.md:1037` | `six_big_losses_tab` (`oee/dashboard.jsx:200-306`) | tab |
| OEE-003.T3 | Changeover Analysis tab | `15-OEE-UX.md:1041` | `changeover_tab` (`oee/dashboard.jsx:308-390`) | tab |
| §15.6 | P2 Placeholder Shell pattern (shared layout primitive, NOT a screen ID) | (n/a) | `p2_placeholder_shell` (`oee/screens.jsx:902-948`) | n/a |
| §15.7 | UI surfaces traceability matrix (bidirectional PRD ↔ UX ↔ prototype) | n/a | n/a (matrix) | 30 rows |

Also amended:
- **Header line `**Wersja:**`** → `3.2.1 (… + PRD↔UX reconciliation pass 2026-04-30)`.
- **§Changelog** → new top entry `v3.2.1 (2026-04-30, PRD↔UX reconciliation pass)` summarising additions.

No content deleted from §1–§14, §16 Build Roadmap, §17 Open Questions, or §19 References.

---

## 3. TODOs created

| Token | Location in PRD | Description | Owner |
|---|---|---|---|
| `TODO OEE-PRD-AMEND-01` | §15.3 OEE-ADM-003 + §15.7 matrix | Decide canonical write-owner of `org_non_production_days` (15-OEE OEE-ADM-003 vs 02-SETTINGS §8.1). Default P1: OEE-ADM-003 owns writes; 02-SETTINGS exposes read-only viewer. | 15-OEE owner + 02-SETTINGS owner |
| `TODO OEE-PRD-AMEND-02` | §15.4 OEE-M-009/012 + §15.7 matrix | Add UX surface lines for OEE-M-009 (Copy clipboard) + OEE-M-012 (Auto-refresh pause). Pure-client ergonomics; non-blocking for P1. | UX owner |
| `TODO OEE-PRD-AMEND-03` | §15.4 OEE-M-010 row | Confirm OEE-M-010 (Compare Weeks) ships with 15-a or slips to 15-c stub linking OEE-002 with `?compareWeekA=` URL params. BL-OEE-05 backlog. | 15-c build session |
| `TODO OEE-PRD-AMEND-04` | §15.7 matrix `/oee/benchmark` row | Spec `/oee/benchmark` (industry comparison P2). Currently `[NO-PROTOTYPE-YET]`. | 15-OEE owner P2 |
| `TODO OEE-PRD-AMEND-05` | §15.7 matrix `/oee/rules-config` row | Spec `/oee/rules-config` (tenant-admin UI for anomaly + maintenance thresholds P2). Currently `[NO-PROTOTYPE-YET]`. | 15-OEE owner P2 + 02-SETTINGS owner |

`[NO-PROTOTYPE-YET]` markers in §15.7: 3 (`/oee/benchmark`, `/oee/forecast`, `/oee/rules-config`). All correctly classified P2/P3+ — Direction A residuals = 0 for P1.

---

## 4. ADR-034 hygiene work performed

- All new §15 sections tagged with `[UNIVERSAL]` / `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]` per ADR-034 generic-product-lifecycle-naming-and-industry-configuration.
- OEE-ADM-003 holiday seed pack tagged `[INDUSTRY-CONFIG]` (UK/EU/US country packs); the per-tenant rota itself tagged `[ORG-CONFIG]`. Reference tables (`shift_configs`, `shift_patterns`) tagged `[UNIVERSAL]`.
- Existing inline `[APEX-CONFIG]` markers in §1, §2, §6, §13.4 left in place per audit constraint ("do NOT delete PRD content; only ADD or RE-ORDER"). The new §15.7 closing note explicitly defines the read-as-`[ORG-CONFIG]` equivalence (matches 08-PRODUCTION v3.1.1 pattern).
- No FA→FG, PR→WIP, or `Process_NN`→`manufacturing_operation_NN` substitutions performed in this pass — v3.2 changelog already covers those.
- `oee_target_pct = 70` baseline retained as `[ORG-CONFIG]` exemplar (Apex UK launch tenant); world-class 85% threshold retained as `[INDUSTRY-CONFIG]` (industry-standard food-mfg benchmark).

---

## 5. Blockers

None for this reconciliation pass. The 5 TODOs above are non-blocking:

- **OEE-PRD-AMEND-01** is a cross-PRD ownership decision; default-owner-here preserves prototype behaviour for P1.
- **OEE-PRD-AMEND-02** is documentation-only; modals already work.
- **OEE-PRD-AMEND-03** is a 15-c sub-module scope clarification (BL-OEE-05).
- **OEE-PRD-AMEND-04 / 05** are P2 spec gaps on placeholders; `[NO-PROTOTYPE-YET]` markers explicit and tracked.

External cross-PRD dependencies referenced but not modified:
- 02-SETTINGS §8.1 reference tables (`shift_configs`, `shift_patterns`, `org_non_production_days`) — no schema change required for this pass.
- 02-SETTINGS §7.8 rule registry (3 OEE rules already registered).
- 08-PRODUCTION §9.9 `oee_snapshots` (read-only consumer; no change).
- 12-REPORTING D-RPT-9 OEE consumer (no change).

---

## 6. Verification snapshot

`prototype-index-oee.json` entries vs PRD anchors after this pass:

| Prototype | PRD anchor |
|---|---|
| `annotate_downtime_modal` | OEE-M-001 |
| `export_oee_modal` | OEE-M-002 |
| `line_override_modal` | OEE-M-003 |
| `big_loss_mapping_modal` | OEE-M-005 |
| `changeover_detail_modal` | OEE-M-006 |
| `cell_drill_modal` | OEE-M-007 |
| `request_edit_modal` | OEE-M-008 |
| `delete_override_modal` | OEE-M-004 |
| `copy_clipboard_modal` | OEE-M-009 |
| `compare_weeks_modal` | OEE-M-010 |
| `acknowledge_anomaly_modal` | OEE-M-011 |
| `auto_refresh_pause_modal` | OEE-M-012 |
| `oee_daily_summary_page` | OEE-003 / OEE-003.T1 |
| `six_big_losses_tab` | OEE-003.T2 |
| `changeover_tab` | OEE-003.T3 |
| `oee_line_trend_page` | OEE-001 |
| `oee_shift_heatmap_page` | OEE-002 |
| `oee_downtime_pareto_page` | OEE-P2-C |
| `oee_availability_drilldown_page` | OEE-001a |
| `oee_performance_drilldown_page` | OEE-001b |
| `oee_quality_drilldown_page` | OEE-001c |
| `oee_settings_page` | OEE-ADM-001 |
| `oee_shift_configs_page` | OEE-ADM-002 |
| `oee_anomaly_detection_page` | OEE-P2-A |
| `oee_equipment_health_page` | OEE-P2-B |
| `oee_tv_dashboard_page` | OEE-P2-D |
| `p2_placeholder_shell` | §15.6 (shared primitive, not a screen ID) |
| `shifts_screen` | OEE-ADM-003 (moved from `prototype-index-settings.json` 2026-04-30) |

**Total: 27/27 entries anchored. Zero blind orphans.**
