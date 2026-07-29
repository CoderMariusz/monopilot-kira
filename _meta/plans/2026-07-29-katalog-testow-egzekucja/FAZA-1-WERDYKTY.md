# Faza 1 — werdykty przeliczenia 55 FAIL

Zasada: werdykt tylko z **twardym dowodem uruchomieniowym**. „Nieosiągalne na dzisiejszych
danych" i „zablokowane bramką" są akceptowalnymi werdyktami. Renderowanie ekranu nie jest dowodem.

Środowisko dowodowe: izolowana baza (klon `monopilot_t2`, pełny łańcuch 506 migracji + mig 544).

---

## Partia 1 — 6 ID (`PRD-001/008/009/014`, `SFQ-164/166`)

**Stan wyjściowy:** oba pliki testowe były **niewykonalne** — padały na tworzeniu organizacji
(patrz `BLOKER-TWORZENIA-ORGANIZACJI.md`). Po migracji 544: 17 testów wykonanych, 7 zielonych.
Po triage'u fixture'ów: **16 zielonych, 1 czerwony**.

| ID | 19.07 | dziś | podstawa |
|---|---|---|---|
| `SFQ-164` | FAIL | **PASS** | fixture nie nadawał `mnt.mwo.execute`; `mwo-actions.ts:1528-1532` sprawdza je PRZED bramką LOTO, więc `forbidden` maskował asercję o podpisach |
| `SFQ-166` | FAIL | **PASS** | jw. — kontrakt dwuosobowego podpisu i SoD nietknięty, przeszedł po naprawie grantu |
| `PRD-001` | FAIL | **PASS** | test oczekiwał `in_progress`; schemat (`packages/db/schema/work-orders.ts:119-121`) i `wo-state-machine.ts:55-63` używają `IN_PROGRESS` |
| `PRD-009` | FAIL | **PASS** | fixture nie zapisywał zużycia; `complete-cancel-wo.ts:180-216` wymaga dodatniego zużycia i bilansu w tolerancji 2% |
| `PRD-014` | FAIL | **PASS** | fixture używał roli `admin`, a `has-permission.ts:14,26-35` nadaje takim rolom **wszystkie** uprawnienia — usunięcie pojedynczego grantu nie mogło dać `forbidden`. Zastąpione rolą niesuperuserową |
| `PRD-008` | FAIL | **FAIL — potwierdzony defekt kodu** | `wo-state-machine.ts:208-218` rozpoznaje replay, ale `start-wo.ts:218-234,302-315` mimo to zapisuje outbox; `shared.ts:141-156` nie deduplikuje → **dwa** zdarzenia `production.wo.started` zamiast jednego |

**Bilans partii: 5 PASS, 1 FAIL.** Cztery z pięciu PASS-ów to były defekty fixture'ów, nie kodu —
czyli werdykty z 19.07 były nieaktualne albo od początku mierzyły co innego.

### Wzorzec z tej partii
**Testowanie z roli `admin` maskuje bramki uprawnień**, a brakujący grant w fixture'ze maskuje
*inną* bramkę, którą test miał sprawdzać. Pięć testów LOTO wyglądało na sprawdzające podpisy,
a w rzeczywistości zatrzymywało się na uprawnieniu do wykonania zlecenia.
To jest dokładnie powód, dla którego Faza 0.3 (persony bez wybranych uprawnień) była konieczna.

### `PRD-008` — dlaczego to znaczy więcej, niż wygląda
Duplikat zdarzenia w outboxie dziś nie boli, bo **outbox nigdy się nie opróżnia** (trzy crony
eksportowały tylko POST, a Vercel woła GET — naprawione w commicie `739f9223`).
Po wdrożeniu tej naprawy duplikaty zaczną docierać do konsumentów.
Kolejność wdrożenia ma tu znaczenie.

---

## Pozostało: 49 z 55 ID
Rozkład domenowy pozostałych i przewidywania w `FAZA-1-FAIL-RECHECK.md`.

**Ograniczenie, które trzeba znać przy planowaniu reszty:** kontrakty wymagające dowodu
**w przeglądarce** są dziś nieosiągalne — React nie hydratuje pod lokalnym harnessem, więc żadna
akcja serwerowa wywoływana z `onClick` nie jest wykonalna. Dotyczy to zwłaszcza 11 kontraktów `UI-*`.
Diagnoza w toku. Kontrakty dowodliwe na poziomie akcji serwerowych (jak ta partia) idą normalnie.
