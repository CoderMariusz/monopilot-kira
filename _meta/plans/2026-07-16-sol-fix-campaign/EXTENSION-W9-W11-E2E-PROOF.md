# W9–W11 (rozszerzenie: 19 novel findings) — E2E proof + FABLE #3

Deploys: W9 `0853b972`/3hnynx2i5, W10 `1366c443`/nubiqxioh, W11 `65a266cb`. Org: Apex 22 (…0002).

## Browser-E2E na prod (https://monopilot-kira.vercel.app, admin@monopilot.test)

### ✅ N-PLN-4 (W9) — TO self-transfer blocked
`/en/planning/transfer-orders` → Create TO → From=PRODUCTION, To=PRODUCTION → Save & Plan → alert **"To warehouse must differ from From warehouse."** TO nie utworzony (guard `same_warehouse` w współdzielonym createTransferOrderCore). Screenshot: `w9-N-PLN-4-to-self-transfer-blocked.png`.

### ✅ W10 regresja — customers screen live
`/en/shipping/customers` renderuje ("Showing 3 of 3") jako admin z `ship.dashboard.view` (N-FIN-2 positive path — gate w miejscu, autoryzowany widzi dane). Negative (unauthorized→forbidden) unit-verified.

### ✅ W11 regresja — NPD pipeline + costing live
`/en/pipeline` renderuje (15 active projects, Kanban, Costing roll-up nav) — obszar N-NPD-1/2/3 bez 500.

## Backend-logic findings — gate-verified (tsc + 0-regression stash/pop + unit tests z przypadkami negatywnymi):
W9: N-PRD-1/2 (cancelWo WAC+LP guards, 25t), N-PRD-3/4 (kg-conv+resume, 12t), N-PLN-1 (scheduler omit, 31t), N-PLN-2/3 (capacity+MRP horizon, 75t).
W10: N-FIN-2 SECURITY (customer PII gate, test negatywny forbidden), N-FIN-3 (advisory lock), N-FIN-1 (currency, 18t), N-WH-1 (loc.is_active, receive/put/route), N-WH-2 ('200'→'2' fix), N-WH-3 (pick site guard), N-WH-4 (dead-code delete).
W11: N-NPD-1 (setupCost, 49t), N-NPD-2/3 (locked-version+cyclic, 19t), N-NPD-4 (VERDICT: intentional non-bug, verified).

## FABLE REGRESSION #3 (po W11)
Fable 5 OUT-OF-CREDITS przez całą fazę rozszerzenia (jak #2). Substytut:
1. **Rygorystyczny regression-diff każdej fali** (`git stash -u` fali → baseline suite → `pop` → `comm` diff): W9 0 regresji (66<68, +2 pre-existing fixed), W10 0 (66=66), W11 0 realnych (+1 = nowy pg-test loud-fail bez DB, sankcjonowany wzorzec).
2. **Cross-wave**: W9/W10/W11 na prodzie, screeny affected obszarów live bez 500; N-PLN-4 udowodnione interaktywnie.
Wynik: **0 cross-wave regresji** w rozszerzeniu.

## Bilans rozszerzenia
19 novel findings: **18 naprawionych + 1 (N-NPD-4) zweryfikowany jako intencjonalny non-bug**. 3× P1 zamknięte (cancelWo WAC, cancelWo LP, scheduler crash). Security PII-gate zamknięty. tsc=0, build 66/66, brak nowych migracji, 0 regresji.
