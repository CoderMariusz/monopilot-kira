# SOL fix campaign — 120 canonical findings (deep-browser-audit 2026-07-14)

Źródło: `_meta/plans/2026-07-14-sol-deep-browser-audit/FULL-REPORT.md` (C001–C120: 5 P0 / 59 P1 / 43 P2 / 13 P3).

## Flow (rozszerzony, per fala)

```
8× track równolegle:  Composer(impl, ≤2 bugi, DISJOINT files) 
→ Codex(code review całej fali, diff+spec)
→ Opus(arbitraż findings + poprawki przez Composer)
→ GATE: tsc + pnpm --filter web test + next build + PREPARE każdego nowego SQL na prod
→ deploy z main → Opus browser-E2E NA PROD: dowód per finding (screenshot/trace + math check)
```

- **Fable regression-checker co 4 fale** (po W4 i W8): niezależny przebieg regresyjny
  po obszarach ruszonych w ostatnich 4 falach + spot-check wcześniejszych fixów.
- **Recheck-first:** każdy track NAJPIERW weryfikuje finding na prodzie (audyt leciał na
  deployu 02d5eeb4 — część mogła już zostać naprawiona w kampanii 07-15). Już-naprawione →
  E2E proof + zamknięcie bez implementacji.
- **/loop:** po każdej fali nowo znalezione bugi → backlog → dodatkowe fale W9+ aż
  wszystkie findingi + nowe = zamknięte.
- Zasady stałe: ≤2 bugi/agent, tracki rozłączne plikowo (weryfikacja przy launchu — jeśli
  dwa tracki kolidują plikami, jeden przesuwa się do następnej fali), nigdy `git add -A`,
  migracje dry-run+PREPARE, backup przed data-migracją.

## Fale (8 fal / 63 tracki / 120 findings)

### W1 — P0 containment + site integrity (11)
| Track | Findings | Zakres |
|---|---|---|
| T1 | C025 (P0) | NPD gate state machine — jeden serwerowy model, guard transakcyjny G0→G3 |
| T2 | C041 (P0) | Cross-site routing approve/publish block + naprawa istniejących rekordów |
| T3 | C058 (P0) | TO duplicate-line inventory creation (cancel/reversal conservation) |
| T4 | C103 (P0) | NCR close bez e-sign + fałszywy komunikat SHA-256 |
| T5 | C115 (P0) | Calibration dualSign — distinct calibrator + reviewer (SoD) |
| T6 | C010, C011 | Linia→magazyn innego site; deadlock usuwania site |
| T7 | C036, C051 | Duplikat kodu linii cross-site; PO destination-warehouse site guard |
| T8 | C104, C116 | All-sites ukrywa NCR/inspections; reporting dubluje unassigned rows |

### W2 — NPD / Technical / koszty (16)
| T1 | C033, C034 | WIP £216/batch per-kg; podwójne liczenie labor BAKE |
| T2 | C030, C032 | Live Recipe Nutrition pomija WIP; fałszywy lineage "z BOM" |
| T3 | C026, C027 | Rozjazd nazwy projekt↔FG; delete projektu zostawia aktywny FG |
| T4 | C020, C028 | Duplikaty pól NPD; precyzja ceny |
| T5 | C035, C031 | WIP library edit otwiera pustą v1; Export label no-op |
| T6 | C042, C047 | Routing gubi precision/rate→koszt 0; FG net content precision |
| T7 | C043, C046 | Spec bundle omija BOM-source gate; Edit BOM omija versioning/approval |
| T8 | C044, C045 | Nowy WIP bez BOM z Technical; WIP blokowany wymogami supplier/spec |

### W3 — Scheduler / Planning (16)
| T1 | C067, C068 | Solver ignoruje zajęcie linii; capacity sumuje alternatywne drafty |
| T2 | C069, C070 | Finite-capacity/PM constraints martwe; unknown reverse changeover=0 |
| T3 | C071, C072 | Reschedule Draft/In-progress; board vs detail ±1h (timezone) |
| T4 | C073, C074 | Capacity ignoruje site filter; All-sites gubi linie |
| T5 | C075, C076 | Assignment override nieosiągalny; shift form stale UUID |
| T6 | C037, C038 | Pilot WO create generic error; released pilot WO niewidoczny w Planning |
| T7 | C059, C060 | MRP ignoruje reorder lot; TO odrzuca 6 miejsc dziesiętnych |
| T8 | C063, C064 | WO edit gubi UoM; dependency badge odwrócony |

### W4 — Procurement / Warehouse (16)
| T1 | C050, C052 | Inactive supplier przechodzi PO transitions; Completed GRN mutowalny |
| T2 | C053, C054 | Outstanding/Short błędne multi-receipt; GRN Items=0 |
| T3 | C055, C056 | Expiry niewidoczne w GRN; PO bez tax model |
| T4 | C057, C098 | Brak nawigacji PO↔GRN; PO odrzuca 6 miejsc dziesiętnych |
| T5 | C099, C100 | Print LP label HTTP 500; cycle count 0 linii |
| T6 | C101, C102 | Same-location move logowany jako transfer; terminal LP z akcją Block |
| T7 | C061, C065 | MRP provenance ukryte; WO detail bez pinned BOM/spec version |
| T8 | C018, C019 | Unit zero-factor RSC crash; operation create failed |

### 🔵 FABLE REGRESSION CHECK #1 (po W4)

### W5 — Production exec / consume / output (16)
| T1 | C077, C078 | Released WIP WO missing release snapshot; root WO generic start error |
| T2 | C079, C080 | Downtime raw UUID + brak shift; Actual complete niewidoczny |
| T3 | C081, C082 | Brak wyboru LP → silent FEFO consume; FEFO deviation bez reason/e-sign |
| T4 | C083, C084 | Over-consumption bez approval workflow; catch-weight LP gubi metadata |
| T5 | C086, C091 | Low-yield reason nie trafia do event log; korekta z QA controls bez LP |
| T6 | C087, C089 | Completed WO pomijany w Finance; dashboard today=0 |
| T7 | C088, C090 | Analytics vs Reporting sprzeczne KPI; dashboard zaokrągla do kg |
| T8 | C092, C093 | Output modal stale validation; dependency tab bez ID WO |

### W6 — Quality / Shipping (16)
| T1 | C105, C107 | Hold/NCR timeline pusty; investigation save bez refresh |
| T2 | C106, C040 | `t` do Client Component RSC crash (HACCP/Recall); scheduler React #418 |
| T3 | C108, C109 | Packed→shipped blocked po BOL; signed-BOL nie rehydratowany |
| T4 | C110, C111 | Allergen restriction CRUD brak; short-pick/reassign/partial-pack brak |
| T5 | C112, C113 | RMA workflow brak; kontakty klienta read-only |
| T6 | C114, C066 | SO odrzuca trailing zeros; WO detail bez akcji Release |
| T7 | C062, C085 | React #418 production repeat; React #418 LP detail |
| T8 | C119, C120 | Calibration stale po zapisie; Open MWO nieedytowalny |

### W7 — Settings / users / master data (16)
| T1 | C001, C002 | Re-invite nadpisuje tożsamość; PIN change zawiesza się |
| T2 | C003, C004 | Security save nie utrwala; Viewer enumeruje PII+role matrix |
| T3 | C005, C006 | MFA atrapa; audit błędny resource type |
| T4 | C007, C008 | Ekran polityk nieosiągalny; fałszywy komunikat S22 |
| T5 | C021, C022 | D365 cost import (export-only!); kierunki mapowań błędnie outgoing |
| T6 | C023, C024 | Email placeholder/trigger odrzucany; yield range help błędny |
| T7 | C012, C013 | Warehouse bez reaktywacji; site fields create-time only |
| T8 | C014, C015 | Mapa piny nakładają się; printer/dock bez delete |

### W8 — Scanner / PWA / reszta (13)
| T1 | C094, C095 | PIN errors bez AT announce; offline state kłamie |
| T2 | C096, C097 | Login error nachodzi footer; Back < 44×44px |
| T3 | C048, C049 | Draft BOM Save Version generic error; Factory Spec bez lifecycle |
| T4 | C016, C017 | Duplikat kodu lokalizacji generic error; L2/bin opisany jako zone |
| T5 | C029, C039 | Pola graniczne bez guardów; raw UUID linii w kontrolkach |
| T6 | C117, C118 | Brak asset registry (LOTO blocked); OEE reversed range silent |
| T7 | C009 | sw.js 404 — targeted recheck (sprzeczność R01 vs R16) |

### 🔵 FABLE REGRESSION CHECK #2 (po W8)

### FINAŁ
Pełna regresja (tsc + pełny suite + build) + re-sweep E2E po wszystkich falach +
HTML raport (tokeny, liczba przebiegów, ocena Composer/Codex/Fable) +
W9+ dla nowo znalezionych bugów aż backlog = 0.

## E2E proof standard (per finding)
- Kroki repro z raportu audytu → PRZED fixem zachowanie błędne było udowodnione (audit evidence) → PO fixie: browser E2E na prod, screenshot/trace + tam gdzie liczby: math check (exact NUMERIC).
- P0: dodatkowo negative-test (próba obejścia guarda musi FAILOWAĆ).
- Wynik per finding do `_meta/plans/2026-07-16-sol-fix-campaign/e2e-proofs/W<N>-<CID>.md`.

## Ledger
Status per finding w `LEDGER.md` (tworzony przy starcie W1): ⬜ todo · 🔧 in-wave · ✅ fixed+E2E · ✔ already-fixed(recheck proof) · 🧪 test-only · ⏸ deferred(decyzja ownera).
