# W4 verification proof (prod deploy 0ea80488, dpl egwyfvl54)
Deploy 2026-07-16: mig "Done: 2 applied (506/507), 484 skipped" — no errors, logged. Build green + i18n parity 604.
Layers: [DB] live prod · [CODE] Opus verification (codex-bg + Codex-review infra-limited) · [UNIT] vitest per-track · [GATE] tsc+build+suite+PREPARE.

| Finding | Proof |
|---|---|
| C050 supplier PO-transition guard | [CODE] ensurePurchaseOrderSupplierActive + FOR UPDATE, supplier_blocked. |
| C098 PO qty 6dp | [DB] purchase_order_lines.qty **numeric(18,6)** live (was 12,3). mig506. |
| C056 PO tax model | [DB] purchase_order_lines.tax_pct **numeric(7,4)** live. mig507. net/tax/gross sums. |
| C057 PO<->GRN nav | [CODE] direct links both directions. |
| C052 completed-GRN immutable | [CODE] status guard cancelGrnLine + can_cancel=false. |
| C053 outstanding/short multi-receipt | [CODE] grn-line-aggregates.ts per po_line, toMicro (no float). |
| C054 GRN items count | [CODE] real line count. |
| C055 receipt expiry in GRN | [CODE] expiry in detail + label. |
| C099 print LP label (no 500) | [CODE] safe GS1 build → gs1_build_error, print_jobs saved, typed failure not 500. |
| C100 cycle count lines | [CODE] snapshot real LP lines. |
| C101 same-location move | [CODE] from!=to guard in createStockMove. |
| C102 terminal LP block | [CODE] Block hidden for terminal LP. |
| C061 MRP provenance/supplier | [CODE] supply provenance + supplier status surfaced. |
| C065 WO detail BOM version | [CODE] pinned bom/spec version IDs. |
| C018 unit zero-factor | [CODE] factor>0 validation, no RSC crash. |
| C019 operation create | [CODE] valid op creates (serializeCreatedAt fix). |

## Summary
- 16 findings. Cursor-primary impl (codex-background unreliable mid-wave — switched to Cursor). Process kills mid-wave: PO-2 completed via W4-FIX; taxPct/WOHeader test-ripples fixed by Opus.
- Gate: tsc 0, full suite 60 fail/3957 pass = baseline (ZERO W4 regressions), i18n parity 604, mig506/507 PREPARE-clean + applied+verified-live (qty 18,6, tax_pct 7,4).
- Codex whole-wave review + short reviews all died (bash time-limit) → Opus verification.
