# PROPOSED STUB — m05 T-060: Consolidate GS1/barcode parser to one shared package

> Status: PROPOSAL (not in manifest). Resolves T-023 path mismatch + cross-module triple-conflict.
> Type: T2-api (refactor/spec). Depends: none (do first, before T-023 and SCN T-003).

## Why
Three different homes are specified for the GS1/AI parser across the codebase:
- 05 WH T-023 → `packages/barcode-parser/` (does not exist)
- 06 SCN T-003 → `packages/scanner-utils/gs1-parser.ts` (does not exist)
- PRD 06 §10.3 → `lib/utils/gs1-parser.ts`
- Repo reality → `packages/gs1/` already exists with `parse.ts` + `check-digit.ts`.
Building as written produces 2–3 divergent GS1 parsers (GTIN-14 mod-10, AI 01/10/17/21/310x, GS delimiter, YYMMDD Y2K boundary) that will drift.

## Goal
Designate `packages/gs1/` as the single shared GS1-128/GTIN/AI parser consumed by both 05-warehouse (T-023 GRN auto-fill) and 06-scanner (T-003, camera + manual). Extend it to the full PRD AI set; retarget both task references.

## Implementation contract
1. Audit `packages/gs1/parse.ts` + `check-digit.ts` against PRD 05 §7.4/§15.2 and 06 §10 AI list (01/10/17/11/21/37/310x/3103/3922; P2: 00/13/15, QR, DataMatrix).
2. Add missing AIs + `detectBarcodeType()` + `parseGS1()` returning the §10.3 `ParsedGS1` shape; ≥20 fixtures/AI incl. missing-GS, bad checksum, leading-zero weight, mixed-case batch, UTF-8.
3. Update WH T-023 + SCN T-003 scope_files + prompts to import from `packages/gs1/` (retire `packages/barcode-parser/` and `packages/scanner-utils/gs1-parser.ts` references).

## Acceptance criteria
1. Given the consolidated `packages/gs1/`, when WH GRN auto-fill and SCN scan both parse the same GS1-128 string, then they call the same parser and return identical AI maps.
2. Given the PRD AI fixtures, when the test suite runs, then ≥20 fixtures per P1 AI pass incl. edge cases; GTIN-14 mod-10 validates.
3. Given T-023 and SCN T-003 task files, when re-read, then both reference `packages/gs1/` and no `packages/barcode-parser/` or `packages/scanner-utils/gs1-parser.ts` path remains.

## Risk red lines
- Do not create a second parser package — one shared `packages/gs1/`.
- Do not hardcode Y2K boundary differently between WH and SCN (YY<50→20YY).
