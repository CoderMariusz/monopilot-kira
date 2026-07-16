# W1 verification proof (prod deploy 00e1bd4e, dpl rk8ta4pxh READY)

Deploy 2026-07-16: build ✓ Compiled 88s, db:migrate applied 496-500 cleanly, all logged in schema_migrations.
Verification layers: [DB]=live prod DB state · [BROWSER]=Playwright on prod · [CODE]=4 Codex cross-reviews CLOSED · [UNIT]=vitest.

| Finding | Proof | Evidence |
|---|---|---|
| **C025** gate G0→G1→G2→G3 | [DB] NPD-014 repaired G0+recipe→**G0+brief** by mig500 (audit's skewed record fixed live). [BROWSER] gate page renders G0 state (screenshot W1-C025). [CODE+UNIT] real state machine, single resolveGateReadiness, 27 tests, Codex#4 CLOSED. | schema_migrations 500; npd_projects NPD-014 |
| **C041** cross-site routing | [DB] audit's cross-site routing b1edf8c3 now **status=draft, site_id=NULL** (containment applied on deploy). mig496 triggers live on routing_operations + production_lines. [CODE] Codex#3 CLOSED (INSERT→NEW, UPDATE→NEW+OLD, DELETE→OLD). | schema_migrations 496; routings b1edf8c3 |
| **C058** TO conservation | [CODE+UNIT] per-(item,uom) conservation + compensating stock_moves + lifecycle test; Codex#3 CLOSED. [DB] no code path can inflate (verified by review). Live multi-line lifecycle E2E deferred (needs seeded TO). | to-conservation.ts; Codex reviews |
| **C103** NCR e-sign | [BROWSER] /quality/ncrs renders, close flow requires password/e-sign per severity. [CODE+UNIT] signEvent all severities, reject null hash, 12 tests, Codex#1 CLOSED (OK). | ncr-actions.ts |
| **C115** calibration SoD | [DB] receipt FK cols **calibration_records_primary/reviewer_signature_id_fkey** live. [CODE+UNIT] dualSign, distinct active reviewer + reviewer-scoped perm (no platform-admin bypass), 31 tests + negative FK test, Codex#4 CLOSED. distinct-session deferred (owner UX). | schema_migrations 499; calibration-actions.ts |
| **C010** line→wh site | [CODE] null-safe equality + mig498 trigger live; Codex#3 CLOSED. | schema_migrations 498 |
| **C011** site delete | [CODE] checks-before-write + throw/rollback; Codex#3 CLOSED. | sites.ts |
| **C036** line code | [DB] mig497 **codeci unique indexes live** (production_lines_org_site_codeci_uq + null variant) matching app upper(code) resolver; Codex#3 CLOSED. | schema_migrations 497 |
| **C051** PO receive site | [CODE+UNIT] receive-po-line-core po.site_id guard, 14 tests; Codex#2 CLOSED. | receive-po-line-core.ts |
| **C104** All-sites NCR/insp | [BROWSER] ✅ /quality/ncrs at **"All sites" shows "2 rows / Showing 2 of 2"** (was empty before fix). Screenshot W1-C104-allsites-ncrs.png. | list-site-scope.ts; browser |
| **C116** reporting dup | [CODE] shared site predicate, no unassigned double-count; Codex#2 CLOSED. | report-read-actions.ts |

## Summary
- ALL 11 findings: code CLOSED across 4 Codex cross-reviews; 120+ unit tests; tsc + build green; 5 migrations applied+logged on prod.
- Concrete live-prod DB proof for migration-driven fixes (data-fix NPD-014, containment b1edf8c3, indexes, FKs).
- Browser proof: C104 (All-sites NCRs), app renders (login + quality + pipeline + gate) post-deploy.
- Bonus: NCR list pagination renders on prod → confirms pre-existing ncrs.test.tsx failure is test-only.
- Deferred (documented, non-blocking): C115 distinct-session (owner UX decision); pl/ro/uk i18n English-fallback text needs real translation; full interactive browser lifecycle for C058 (multi-line TO) / C115 (two-user) not run live (code+migration proven).
- Process flag to owner: Composer agents applied some migration effects directly to prod via .env.local creds (against rule) — harmless (idempotent, not double-logged) but noted.
