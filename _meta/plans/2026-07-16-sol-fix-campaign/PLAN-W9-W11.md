# SOL Fix Campaign — rozszerzenie: fale W9–W11 (19 nowych bugów)

Jeden plan wykonawczy. 19 findingów z 5-hunter sweep (poza kanonicznymi 120) wpięte w 3 fale + FABLE #3.
Źródło detali: LEDGER „Nowo znalezione (W9+)" + `hunt-fable/HUNT-*.md` (każdy ma file:line + scenariusz porażki).

## Protokół (identyczny jak W1–W8)
- Fan-out: **≤2 bugi/agent**, rozłączne pliki, batche **≤3 cursor** concurrent (5-cursor=SIGKILL).
- Pipeline: Cursor composer-2.5 impl → Opus review/arbitraż (Codex-bg zawodny) → **bramka**: tsc=0 + `pnpm --filter web test` (0 nowych regresji vs HEAD, rygorystyczny `git stash -u`→baseline→`pop`→diff) + `next build` 66/66 + **PREPARE każdej migracji** na owner-prod.
- Deploy z main (Vercel auto-migruje) → **browser-E2E na prodzie** (tylko gdy 0 cursorów) z dowodem per finding.
- Recheck-first: ustal z kodu czy defekt nadal jest; verify-first dla „uncertain".
- Kolejność: **W9 (3× P1 + produkcja/scheduler) NAJPIERW** (data-integrity), potem W10 (WH+security), W11 (costing).

---

## FALA W9 — Produkcja / Scheduler (P1 cluster, data-integrity) — 6 bugów, 5 torów
| Tor | Findings | Pliki (obszar) |
|---|---|---|
| **W9-PRD-A** | N-PRD-1 (P1) cancelWo WAC guard `isWacExcluded` + N-PRD-2 (P1) cancelWo LP-destroy guard konsumpcji/children | production cancel/complete actions |
| **W9-PRD-B** | N-PRD-3 (P2) strict-close+mass-balance kg-hardcode → wsparcie nie-kg + N-PRD-4 (P3) resumeWo negatywny czas | production close/complete + resume |
| **W9-PLN-A** | N-PLN-1 (P1) scheduler crash na infeasible-capacity → catch+omit `no_feasible_capacity` (jak changeover-defer) | sequence-solver.ts + scheduler-actions.ts |
| **W9-PLN-B** | N-PLN-2 (P2) capacity budget ignoruje changeover+cross-day + N-PLN-3 (P3) MRP horizon vs bucket grid | scheduler capacity + MRP bucketing |
| **W9-PLN-C** | N-PLN-4 (P3) TO create bez `from!==to` guard (phantom moves+dup LP) | transfer-order create |

## FALA W10 — Warehouse / Finance / Security — 7 bugów, 5 torów
| Tor | Findings | Pliki (obszar) |
|---|---|---|
| **W10-WH-A** | N-WH-1 (P2) `locations.is_active` egzekwowane na WSZYSTKICH stock writes (loadLocationScope, single-code lookup, GRN receive-core, put-away suggest) | warehouse location scope + writes |
| **W10-WH-B** | N-WH-2 (P3) `normalizeDecimal` over-strip zer + N-WH-3 (P3) scanner pick dest-site-vs-WO-site invariant | receive-po.ts + scanner pick |
| **W10-WH-C** | N-WH-4 (refactor) usuń dead `listFefoLps` (movement.ts:394) bez filtrów | warehouse movement (delete-only) |
| **W10-FIN-A** | N-FIN-2 (P3/SECURITY) `listCustomers`/`getCustomer` permission-gate + N-FIN-3 (P4) `nextCustomerCode` lock/race | customer-actions.ts |
| **W10-FIN-B** | N-FIN-1 (P2) hardcoded `'PLN'` fallback → reporting currency default | wo-cost-actions.ts |

## FALA W11 — NPD / Costing — 4 bugi, 3 tory
| Tor | Findings | Pliki (obszar) |
|---|---|---|
| **W11-NPD-A** | N-NPD-1 (P2) `WipProcessCostInput` + `setupCost` → WIP nie gubi setup (waterfall + persistWipUnitCosts) | wip-cost.ts + compute-waterfall + costing/compute |
| **W11-NPD-B** | N-NPD-2 (P3) cost-readiness gate uwzględnia locked recipe version + N-NPD-3 (P3) `computeWipTreeUnitCost` cyclic → `missing:true` | npd readiness + wip tree |
| **W11-NPD-C** | N-NPD-4 (P3, VERIFY-FIRST) recipe rollup vs waterfall `scrap_pct` — ustal czy intencjonalne; align albo udokumentuj | technical recipe rollup |

### FABLE REGRESSION #3 (po W11)
Fable out-of-credits → substytut Opus/Claude niezależny sweep + stash/pop regression diff (0 cross-wave). Cross-check W9–W11 fixy live na prodzie.

---

## Szacunek
3 fale · 13 torów · ~4-6 migracji prawdopodobnych (WIP setup_cost persist, TO guard, może locations enforce). P1 (3) w W9 pierwsze.
Po W11: 139/139 znanych findingów (120 + 19) zamkniętych.
