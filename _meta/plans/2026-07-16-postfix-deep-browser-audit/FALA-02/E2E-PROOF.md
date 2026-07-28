# FALA 2 — dowodowy prod E2E (behavioral, per zasada „render ≠ naprawa")

Prod `monopilot-kira.vercel.app`, org Apex 22 (…0002), admin@monopilot.test.
Commity: `a4e03f95` (fala) + `9faec411` (mig521) + `1a23e343` (cast ::text).
Metoda: odtworzenie zakazanej akcji → dowód blokady/działania + check w DB lub runtime-logu + kontrola braku over-blockingu. Wszystkie testy DB w `BEGIN…ROLLBACK` (zero mutacji prod).

---

## 🔴 Dwa REALNE błędy produkcyjne wykryte dopiero przez E2E

Oba przeszły typecheck, build, 4205 testów **i** PREPARE migracji na produkcyjnych danych.

### 1. `mig517` — funkcja padała w runtime (naprawione: `mig521`)
`SQLSTATE 42883: function digest(text, unknown) does not exist` w `npd_gate_approval_subject_hash`.
`digest()` pochodzi z `pgcrypto`, które na tej bazie żyje w schemacie `extensions`, poza search_path funkcji.
**Dlaczego PREPARE tego nie złapał:** Postgres waliduje ciało funkcji języka SQL **dopiero przy wykonaniu**, nie przy `CREATE`. Rytuał `begin; \i mig; rollback;` dowodzi, że migracja *się aplikuje*, nie że funkcja *działa*.
**Fix:** wbudowany `sha256(convert_to(x,'UTF8'))` — zero zależności od rozszerzenia; równoważność potwierdzona na prodzie (ten sam hex). Migracja 521 zawiera post-check, który funkcję **wywołuje**.
**Skutek przed fixem:** `[project-brief] org-scoped read failed` → Brief i bramka NPD zdegradowane.

### 2. `text = uuid` w zapytaniach sensory (naprawione: `1a23e343`)
`SQLSTATE 42883: operator does not exist: text = uuid` w `fetchStageGateReadinessForProject` i `[gate-screen]`.
Ten sam parametr użyty jako `npd_project_id = $2::uuid` **oraz** `subject_ref = $2`. Rzutowanie `::uuid` **przypina typ parametru dla całego statementu**, więc drugie porównanie to `text = uuid`.
**Dlaczego się maskował:** (a) z **literałami** nie występuje — ręczne `psql` z wklejonym UUID-em działa i daje fałszywą zieleń; ujawnia się wyłącznie przy parametrach bindowanych; (b) padały **tylko projekty z akceptacjami bramek** — projekt bez akceptacji ładował się poprawnie.
**Dowód:** `prepare` z wnioskowanym typem parametru na prodzie → bez `::text` = 42883, z `::text` = PREPARE OK.

---

## Dowody per finding

| # | Finding | Metoda | Werdykt |
|---|---|---|---|
| — | **P0 deadlock** (read-path rzucał `ESIGN_REQUIRED`) | NPD-019 stoi na **Pilot** — dokładnie scenariusz, który wywalał całą trasę. Workbench + pełna checklista renderują się. | ✅ |
| 1 | **PF-R04-03** modal ≠ serwer | Modal `Gate Approval` na NPD-019: **„0 of 3 required items complete"** + serwerowe blokery `Production: Line / Yield Line / Rate` (pól tych NIE ma w checkliście klienckiej → nie mogły powstać po stronie klienta), **Submit disabled**, tranzycja **G3 → G4** (koniec z „G3 → G3"). | ✅ |
| 2 | **PF-R04-05** margin = revenue | NPD-019, target `£4.20/pack`, pack `200 g`, koszt `£3.50/kg`. UI: **£17.50/kg · £3.50/pack · £17502.50/batch** = dokładnie `target − koszt`. Pod bugiem byłoby `£21.00 / £4.20 / £21000`. | ✅ |
| 2b | **backfill mig520** (najważniejszy finding review T2) | Zapisane w DB `costing_waterfall_steps`: pierwszy wiersz **`2.2600`** — dokładnie marża z audytu (`£2.50 − £0.24`), wcześniej zapisana jako `2.50`. Istniejące projekty pokazują marżę **bez ręcznego Recompute**. | ✅ |
| 3 | **PF-R04-06** yield 0% = brak straty | DB CHECK `formulation_versions_target_yield_pct_check`, obie strony: `yield=0` → **ODRZUCONE**, `yield=95` → **ZAAKCEPTOWANE**. Migracja 520 skonwertowała jedyny istniejący `0` → NULL (16 wersji, 0 wartości >100). | ✅ |
| 4 | **PF-R04-02** podpisany G4 mutowalny | **Cztery kierunki** na triggerze DB: NPD-016 (podpisany G4) `pack_weight_g` → **ODRZUCONE** (`npd_project_definition_frozen`); stan po próbie `150.000` **nietknięty**; `notes` na tym samym projekcie → **UPDATE 1** (nie muruje projektu); NPD-019 (bez podpisu) waga → **UPDATE 1** (brak over-blockingu). | ✅ |
| 5 | **PF-R04-09** pusty certyfikat | NPD-016 → Approval History → *View signature details*: **`Certificate ID: SHA256:478f1960…c8ec57a3`**, `✓ Valid — Signature verified`, czas **`12 Jul 2026, 20:35:47 BST`** (nie surowy timestamptz). **Weryfikacja niezależnie potwierdzona:** `sha256('{"decision":"approved","gateCode":"G4","projectCode":"NPD-016","projectId":"ef85…"}')` = `478f1960…` = hash z receiptu = to, co pokazuje UI. „Valid" jest **zasłużone**, nie kosmetyczne. | ✅ |
| 6 | **PF-R04-10** osierocone sensory | Po migracji 516: jedyny rekord `subject_type='project'` (`e60aa78f…`, ten z audytu) ma `voided_at` + powód *„Parent NPD project was not present during migration 516"*. Dry-run przed deployem potwierdził, że rodzic faktycznie nie istnieje → **zero fałszywych trafień** (poprawiona reguła voiduje tylko prawdziwe sieroty). | ✅ |
| 7 | **PF-R04-11** martwy Review przy Clone | Kreator → Clone bez źródła: pole `Project to clone *`, `combobox [invalid]`, komunikat **„Pick the project to clone, or go back and choose »Blank recipe« instead."**, a **`Continue →` disabled już na kroku 3** — martwy Review jest nieosiągalny, nie tylko opisany. | ✅ |
| 8 | **PF-R04-12a** generyczne „Could not save" | Edit trialu NPD-019: `101` → pole `[invalid]` + **„Yield % must be a number between 0 and 100."** przy polu; `100.01` → odrzucone; **`100` → przechodzi** (znacznik znika) — granica dokładna, bez over-blockingu. | ✅ |
| 9 | **PF-R04-07** „All gates pass" | **Kierunek pozytywny dowiedziony:** NPD-016 — wszystkie 5 bramek release faktycznie `Met` → nagłówek „Ready to promote. All gates pass" jest prawdziwy (fix nie over-blokuje). **Kierunek negatywny NIE dowiedziony behawioralnie** — patrz niżej. | ⚠️ częściowo |
| 10 | **PF-R04-08** BOM `persistence_failed` | Nie dowiedziony behawioralnie — patrz niżej. | ⚠️ |
| 11 | **PF-R04-12b** void + unbook | Akcje **Void** i **Release line time** widoczne w UI trialu (audyt: „tylko Edit/Re-book"). Samo wykonanie nie dowiedzione — patrz niżej. | ⚠️ |

**Runtime-log po całym przelocie: zero błędów** (`level=error`, okno 5 min obejmujące wszystkie ekrany).

---

## Czego UCZCIWIE nie dowiodłem (i dlaczego)

Zasada zabrania uznawać renderowania za dowód — więc nie uznaję też „przycisk istnieje" za dowód działania.

- **PF-R04-07 kierunek negatywny** (checklista zaznaczona + bramka release `Not met` → nagłówek NIE może mówić „all gates pass"). Na prodzie nie ma projektu w takim stanie: jedyne dwa na Handoff to NPD-001 (już wypromowany) i NPD-016 (wszystkie bramki spełnione). Wytworzenie stanu wymagałoby zepsucia danych produkcyjnych. **Pokrycie zastępcze:** test action-level dodany w tej fali (`kompletna checklista + niespełnione release gates → ready=false`), zielony w zestawie.
- **PF-R04-08** — wymaga projektu z zablokowaną aktywacją BOM (`SUPPLIER_SPEC_NOT_ACTIVE`); NPD-016 ma już aktywny BOM. Odtworzenie wymagałoby dezaktywacji specyfikacji dostawcy na prodzie. **Pokrycie zastępcze:** testy serwerowe (`materialize-npd-bom`, `generate-production-bom`) + RTL na konkretny komunikat `bom_activation_blocked`.
- **PF-R04-12b** — void jest operacją bez odwrotności w UI; wykonanie go na realnym trialu zostawiłoby trwały ślad na produkcji. **Pokrycie zastępcze:** testy na odmowę przy podpisanym G4, pełny pre-image w audycie, `for update` na obu ścieżkach.

→ Do domknięcia przy okazji fali, która i tak będzie tworzyć dane testowe NPD.

---

## Follow-up (niepilne, z tego E2E)

1. **Nagłówek panelu checklisty vs modal.** Na NPD-019 panel mówi „✓ All required items for G3 complete. Ready to advance", a modal — „0 of 3 required items complete" i blokuje submit. Oba są *technicznie* prawdziwe (panel liczy pozycje checklisty, wszystkie `Optional`; modal liczy serwerową gotowość), ale dla użytkownika to sprzeczny komunikat — czyli reszta tego samego defektu R04-03.
2. **`resolveGateApprovalEsignVerification` — gałąź „verified po formacie".** Gdy `expectedSubjectHash` jest `null`, funkcja zwraca `verified` na podstawie samego faktu, że hash ma poprawne 64 hex (`esign-display.ts:40-42`). Na sprawdzonych rekordach ta gałąź nie jest brana (hash liczony i zgodny), ale zasada „nigdy nie twierdź verified bez podstaw" mówi, że powinno tam być `hash_unverified`.
3. `gate_approvals.project_code` jest **NULL** dla rekordów sprzed fali — kolumna-snapshot nieużywana; przy liczeniu hasha wprost z DB daje mylący wynik (o mało nie zgłosiłem fałszywego P1). Albo backfillować, albo usunąć.
