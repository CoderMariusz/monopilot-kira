# W6 verification proof (prod deploy 6707163d, dpl 28v2dbtmk)
Deploy 2026-07-16: mig "Done: 1 applied (508 RMA), 486 skipped". Build ✓ Compiled 21.2s. Layers: [DB] live · [CODE] Opus verification · [UNIT] vitest · [GATE] tsc+build+suite+PREPARE.
| Finding | Proof |
|---|---|
| C105 hold/NCR timeline | [CODE] hold/ncr actions write audit_events (timeline source), not only outbox. |
| C107 NCR investigation refresh | [CODE] revalidate after save. |
| C106 HACCP/Recall RSC #418 | [CODE] pass strings not `t` at RSC→client boundary (PlanDetailClient, RecallDrillsList). |
| C108 packed→shipped post-BOL | [CODE] ship transition allowed after BOL. |
| C109 signed-BOL rehydrate | [CODE] signed state read from DB on refresh. |
| C110 allergen CRUD | [CODE] customer allergen restriction create/update/delete. |
| C111 pick workflow | [CODE] short-pick/reassign/partial-pack added. |
| C112 RMA workflow | [DB] rma_requests + rma_lines tables live (mig508), RLS, RMA-YYYY-NNNNN numbering. |
| C113 customer contacts CRUD | [CODE] editable contacts. |
| C114 SO trailing zeros | [CODE] so-line-numeric accepts decimals w/ trailing zeros, exact NUMERIC. |
| C040/C062/C085 React #418 | [CODE] hydration mismatch fixed per route (scheduler/production/LP; root cause verified NOT t-to-client). |
| C066 WO Release | [CODE] Release action on WO detail. |
| C119 calibration refresh | [CODE] revalidate after save. |
| C120 MWO edit | [CODE] open MWO editable. |

## Summary
- 16 findings incl RMA feature (mig508). Cursor-primary. W6-FIX resolved 26 tsc ripples → tsc 0, build green, i18n wave-4 parity 604. Zero new regressions (suite 58; 4 in-module fails pre-existing verified vs W5-close). mig508 PREPARE-clean + applied live (rma_requests/rma_lines).
- FOLLOW-UP: accumulated English-only i18n keys → pl/ro/uk translation (format.test drift, non-blocking).
