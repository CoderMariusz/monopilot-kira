# FALA-10 / Tor T4 — naprawa po cross-review (rep-FIX)

## Decyzja zakresowa: droga **(B)** — wycofanie `reopen`

**Wybór:** wycofanie przejścia `reopen` (migracja 536 + `WO_TRANSITIONS` + helper) i węższa naprawa PF-R15-01.

**Uzasadnienie:** Recenzja wykazała, że `reopen` bez kompensacji finansowej (`production.wo.closed`) i bez unieważnienia `oee_snapshots` zostawia niespójności rozliczeniowe i OEE. Nie da się udowodnić kompensacji testem RED/GREEN w tym torze bez pełnego workflow (outbox finance + snapshot invalidation). Bezpieczniejsza naprawa to **zablokować void wyjścia na terminalnym WO** (`completed` / `closed`) i zsynchronizować rollup tylko na dozwolonych ścieżkach (`in_progress` / `paused` / `planned`). To zamyka PF-R15-01 zgodnie z opcją (1) z run-15 REPORT: odrzucenie void, dopóki nie istnieje jawny workflow reopen/kompensacji.

---

## Znaleziska cross-review

| ID | Werdykt | Co zrobiono |
|---|---|---|
| **P1** Wyścig Complete↔void + reopen | **ODRZUCONE (usunięte)** | Całe `reopen` wycofane — scenariusz nie występuje, bo void na `completed` kończy się `invalid_state` przed zapisem korekty. |
| **P1** Fail-open brak `wo_executions` / `CLOSED` uppercase | **NAPRAWIONE** | `normalizeCorrectionWoStatus()` w `correct-ledger-entry.ts` mapuje `work_orders.status` (UPPERCASE) → runtime lowercase; guard terminalny używa znormalizowanego statusu. |
| **P1** Fałszywy snapshot OEE po reopen | **ODRZUCONE (usunięte)** | `reopen` wycofane — brak cofania `closed`/`completed` bez invalidacji OEE. |
| **P1** `closed` bez kompensacji finansowej | **NAPRAWIONE** | Void wyjścia na `closed` **zawsze** `invalid_state` (nawet z `production.corrections.closed_wo`); consumption/waste reversal na closed nadal przez istniejący tier permission. |
| **P1** Czerwony test UI `wo-consume-record` | **NAPRAWIONE** | Selector poprawiony na `wo-consumption-record` (`wo-consume-modal.test.tsx:305`). |
| **P2** FEFO escalation nie zerowana przy zmianie LP/materiału | **NAPRAWIONE** | `resetFefoApproval()` na zmianę materiału, LP i przy przeładowaniu listy FEFO (`record-consumption-modal.tsx`). |
| **P2** Angielski workflow w PL/RO/UK | **NAPRAWIONE** | Klucze `consumption.record.fefoDeviation*` + `esign*` + błędy FEFO dodane do `apps/web/i18n/{pl,ro,uk}.json` (ekran czyta `getTranslations('production.wos.detail')` → `apps/web/i18n/`). |
| **P2** Schema drift migracji 536 | **ODRZUCONE (usunięte)** | Plik `536-wo-reopen-transition.sql` usunięty — brak driftu. |
| **P2** Test FEFO nie wybiera LP-002 | **NAPRAWIONE** | Test wybiera `LP-002` przez combobox i asertuje `lpId` w obu payloadach. |
| **P2** Test in_progress „przechodzi bez poprawki" | **NAPRAWIONE** | Zastąpiony testem rollupu po void na `in_progress` (oczekuje `update work_orders … actual_qty`). |

---

## PF-R15-01 — void na terminalnym WO

### Przyczyna źródłowa
`voidWoOutput` zapisywał korektę ujemną, ale na `completed`/`closed` pozostawiał WO w stanie terminalnym z nieaktualną podstawą yield/completion. Próba `reopen` rozwiązała symptom lifecycle, ale wprowadzała luki finansowe i OEE.

### Zmiany (droga B)
| Plik | Co i dlaczego |
|---|---|
| `correct-ledger-entry.ts` | `normalizeCorrectionWoStatus`, `isTerminalOutputVoidForbiddenStatus` — jedna normalizacja dla legacy `CLOSED` i runtime `closed`. |
| `corrections-actions.ts:946-951` | Wczesny return `{ error: 'invalid_state' }` dla terminalnego WO — przed e-sign i INSERT korekty. |
| `corrections-actions.ts` (po void) | `syncWorkOrderOutputQuantities` — rollup `actual_qty`/`produced_quantity` tylko gdy void dozwolony. |
| **Usunięte:** `reopen-terminal-wo-after-output-correction.ts`, `536-wo-reopen-transition.sql` | Wycofanie przejścia poza zakresem bezpiecznej naprawy. |
| `wo-state-machine.ts`, `shared.ts` | Przywrócony kontrakt: `closed` terminalny, brak `reopen` w `WO_TRANSITIONS`. |

### Testy (co by je wywróciło)
| Test | Regresja bez poprawki |
|---|---|
| `rejects output void on a completed WO` | Przy `completed` void zwracałby `{ ok: true }` i INSERTował korektę. |
| `rejects output void on a legacy CLOSED work_orders row` | `CLOSED` uppercase przechodziłby guard case-sensitive. |
| `rejects closed-WO output void even with closed-WO tier permission` | Void na closed z uprawnieniem supervisor nadal by przechodził. |
| `recomputes output rollups after output void on an in-progress WO` | Brak `syncWorkOrderOutputQuantities` po void — brak UPDATE `actual_qty`. |
| `normalizeCorrectionWoStatus` w `correct-ledger-entry.test.ts` | `CLOSED` nie mapowałoby się na `closed` w `assertCorrectionAllowed`. |

**Usunięte (sieroty po drodze B):** `clears completed_at on reopen…` w `wo-state-machine.timestamps.test.ts`; testy reopen w `corrections-actions.test.ts`.

---

## PF-R14-01 — FEFO desktop dead-end (utrzymane + doprecyzowane)

| Plik | Co |
|---|---|
| `record-consumption-modal.tsx` | Reset eskalacji FEFO przy zmianie materiału/LP. |
| `wo-consume-modal.test.tsx` | Poprawiony selector LP-error; test wyboru `LP-002`; test resetu eskalacji po powrocie do `LP-001`. |
| `i18n/pl.json`, `ro.json`, `uk.json` | Pełne tłumaczenia panelu FEFO + e-sign. |

---

## Świadomie NIE ruszone
- **Pełny workflow reopen + kompensacja finance/OEE** — wymaga osobnego toru (outbox `production.wo.closed` reversal + invalidacja `oee_snapshots`).
- **Reverse consumption / void waste na closed** — nadal przez `production.corrections.closed_wo` (poza zakresem recenzji output-void).
- **`completeWo` inline rollup SQL** — `sync-work-order-output-quantities.ts` pozostaje helperem dla void; deduplikacja z `completeWo` w osobnym torze.
- **PF-R14-02** (genealogia LP↔WO) — poza T4.

## Znaleziska poza zakresem (zgłoszone)
| ID | Opis |
|---|---|
| B-1 (RECON-FACTS) | `wo_outputs.registered_year` GENERATED UTC — ryzyko kolizji batch/year. |
| PF-R14-02 | Genealogia WO/LP bez pełnych linków. |
| `isZeroDecimalString` + `Number()` w `corrections-actions.ts` | Pre-existing; nie dotykane. |

---

## Weryfikacja na sucho (bez uruchamiania bramki)
- Importy: `syncWorkOrderOutputQuantities` eksportowany z `sync-work-order-output-quantities.ts`; `isTerminalOutputVoidForbiddenStatus` z `correct-ledger-entry.ts`.
- Usunięte pliki: brak pozostałych importów `reopen-terminal-wo-after-output-correction` / `reopen` verb.
- Testy: selektory `data-testid` zgodne z komponentem (`wo-consumption-record`).
