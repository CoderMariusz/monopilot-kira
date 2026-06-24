# MonoPilot Kira — configurability audit (what's hardcoded but should be per-org), 2026-06-24

Read-only Codex scan. Goal: things that vary per food-manufacturing company but are hardcoded in code.
UoM dropdowns EXCLUDED (standing decision). NPD departments/fields covered by the dynamic rebuild
(mig 333 + follow-up). Each item: file:line · what's hardcoded · backing table status · size.

## Top 10 (onboarding blockers first)
1. **Correction/void/reversal reasons** — `apps/web/lib/corrections/correct-ledger-entry.ts:11` `CORRECTION_REASON_CODES` (+ duplicated in void-correction-modal.tsx:34, reverse-consumption-modal.tsx:47). No reason-code table (corrections foundation = mig 293). → org reference table. (M)
2. **WO lifecycle + transitions** — `apps/web/lib/production/shared.ts:40` `WO_STATES`, `:48` `WO_TRANSITIONS` hardcoded. → configurable workflow rules. (L)
3. **Catch-weight tolerance** — `apps/web/lib/production/output/register-output.ts:120` `DEFAULT_CATCH_WEIGHT_TOLERANCE = 0.1`. Item-level `variance_tolerance_pct` exists (mig 153); org-level missing. (S/M)
4. **NPD gates/stages/categories** — dynamic-fields rebuild (mig 333 + UI lanes). project-stages.ts:13, gate/page.tsx:91, create-project-wizard.tsx:120/125. (L)
5. **Label templates not enforced** — `settings/infra/printers/_actions/printers.ts:439/446/454` only `lp` type, templateId fallback to generic. `label_templates` (mig 239) + printers (mig 304) EXIST but unused. (M/L)
6. **NPD formulation allergens hardcoded EU14** — `.../formulation/_components/eu14-allergen-codes.ts:14` + formulation-editor.tsx:395. Backing `Reference.Allergens` (mig 082) EXISTS and `technical/allergens/shared.ts:129` already reads it — editor just doesn't. **Quick win (S/M).**
7. **Default currency/timezone/locale** — `apps/web/actions/orgs/create.ts:44-46` hardcodes Europe/Warsaw / pl / PLN; NPD costing assumes EUR (create-project-wizard.tsx:140 `targetRetailPriceEur`, formulation-editor.tsx:521 `currency='EUR'`). Org defaults exist (mig 037). (S–M)
8. **Shift catalog** — `production/_actions/get-wo-action-context.ts:69` `WO_SHIFT_CODES=['morning','afternoon','night']`. `shift_configs` (mig 203) EXISTS, action doesn't read it. (S/M)
9. **Approval criteria thresholds** — `packages/domain/src/approval/evaluate-criteria.ts:44-46` Nutri A/B/C, margin 15, sensory mean 7 fixed. `approval-chain-templates` (mig 098) exists. (M)
10. **Scanner status rules** — `lib/warehouse/scanner/movement.ts:8` `IMMOVABLE_STATUSES`; `receive-po.ts:109` open-PO statuses. LP workflow DSL (mig 194) exists. (M)

## Other findings
- Quality hold priorities/statuses fixed — `quality/holds/_components/labels.ts:16-17`. (M)
- Formulation costing defaults — `recompute-calc.ts:53` overhead 8%, `:61` balance tol 1%. settings-process-costing (mig 269) unused. (M)
- Schedule board window/fallback — `planning/schedule/_lib/board.ts:15` 7d, `:18` 1h. scheduler_config (mig 204) exists. (S)
- Inventory ageing buckets 7/14/30 — `mig 213:608-610`. (S/M)
- Production output types fixed — `action-modals.tsx:539` primary/co/by-product. No ref table. (M)
- Reporting periods fixed — `reporting/shared.ts:1`. (S)
- Notification prefs catalog + quiet hours — `account/notifications/page.tsx:7/32/252`. mig 070 partial. (M)
- Email merge fields/triggers — `actions/email/variable-registry.ts:43/88`. (M)
- Procurement/costing currency defaults — migs 261/262 EUR, 160 PLN. (S)
- Onboarding 6 steps — `lib/onboarding/get-onboarding-state.ts:23`. (M)
- Scanner LP lock timeout 5 min — `movement.ts:672`. (S)
- Downtime/waste reasons — ALREADY DB-backed (no action).

## Recommended quick wins (low effort, high onboarding value)
- #6 allergens (backing table already read elsewhere), #7 currency/locale (org defaults exist),
  #8 shifts (shift_configs exists), #5 label templates (tables exist) — all "table exists, just wire it".
  These become small Codex slices once the owner prioritizes.

NOTE: most of these are deliberate product-scope decisions, not autonomous build targets. Owner
prioritizes → each becomes a scoped slice. The NPD dynamic-fields rebuild is the pattern to follow
(catalog table + per-org assignment + UI), reusable for reasons/shifts/output-types.
