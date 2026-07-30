# DZIENNIK 2026-07-30 — bieżący stan pracy

> Aktualizowany na bieżąco. **Po kompakcie czytaj to jako drugie, zaraz po `PLAN-DNIA.md`.**
> Koniec pracy: **20:00**. Ostatnie zlecenie: **19:45**.

## Bieżące tory

| tor | co robi | silnik | zasób | status |
|---|---|---|---|---|
| Fable-obliczenia | audyt WAC / konwersji / skal / wariancji | **Fable** | klon `t3` | 🔵 od 08:20 |
| Fable-łańcuch | logika NPD→finanse, blokery, niedziałające funkcje | **Fable** | klon `t2` | 🔵 od 08:20 |
| E2E-ścieżka | przejście NPD→finanse w przeglądarce | Opus | **przeglądarka** + `monopilot` | 🔵 od 08:50 |
| F4 | konwersja g→kg · netting WAC · NSA-027 (preflight) | Codex SOL | klon `t1` | 🔵 od 09:00 |

**Przydział zasobów jest ROZŁĄCZNY** — `monopilot`=przeglądarka, `t1`=F4, `t2`=Fable-łańcuch,
`t3`=Fable-obliczenia. Nie łam tego: dwa tory na jednym klonie dają wyniki nieodróżnialne
od kolizji fixture'ów (zdarzyło się dziś, poprawione).

## Zamknięte dziś

### `a4793ff5` — cztery naprawy, wszystkie zweryfikowane uruchomieniem
| naprawa | dowód |
|---|---|
| **PRD-008** duplikat zdarzeń przy replayu | `wo-lifecycle.integration` **10/10**, w tym test idempotencji — wcześniej czerwony |
| **NSA-150** RODO, 3 przeciekające odwołania | AC1 przechodzi — wcześniej `expected 3 to be +0`. Mig **545**, PREPARE na prodzie 3× |
| **Onboarding** (3 ID katalogu) | RED `2 failed` → GREEN **4/4**; anty-testy zamienione na kontraktowe |
| **Bramka anulowania WO** | oba kierunki: skonsumowany blokuje ✓, nieskonsumowany przechodzi ✓ |

Plus korekty katalogu wg decyzji ownera (`WH-066` fail-closed, `SFQ-072` blokada, oba przejścia zostają).

**Bramka:** typecheck 0 · obie suity osobno · PREPARE 545 3× · **różnica ZBIORÓW**:
6 plików naprawionych, 2 nowe czerwone — **oba nie-regresje** (nowy test PG padający jawnie bez
`DATABASE_URL`; flak od obciążenia potwierdzony 3× szeregowo 5/5).
Rdzeń: **39 → 34** czerwonych plików, **57 → 39** czerwonych testów.

### Wcześniej (noc)
- 457 zdarzeń outboxu ostemplowanych na prodzie · push `9f9dd557..1323a7ae` (15 commitów)

## ⚠️ Do pilnowania
- **`corrections-actions.test.ts` — 13 czerwonych** wokół unieważniania outputu i odwracania WAC.
  Objaw: `expected { ok: false, error: 'invalid_state' } to deeply equal { ok: true }`.
  **Czerwień ZASTANA** (była w pomiarze bazowym). Wzorzec „guard zamraża sąsiedni przypadek".
  Kandydat na osobny tor.
- **`npd-gdpr-erasure.test.ts`** — 3 pozostałe czerwone padają na `product delete requires an org
  context`. To sprzątanie fixture'u, **nie kontrakt**. Rdzeń defektu naprawiony.
- `UI-003` (global search) — **bez decyzji ownera**.
- Obejście B w `lp-downstream-guard.ts` (netto konsumpcji = 0) — **świadomie zostawione**, do decyzji.

## Nauczki z dziś (nie powtarzać)
1. **Dałem dwóm torom ten sam klon** — poprawione, ale kosztowało rundę. Przydział musi być rozłączny.
2. **Pierwsza ścieżka E2E wyglądała na bloker produktu** (kreator NPD nie odblokowywał „Dalej").
   Naprawdę: **spec starszy od formularza** — wypełnia 1 pole, walidacja wymaga 3 (doszły mig 427).
   Zgłoszenie bez sprawdzenia dałoby fałszywy bloker na głównej ścieżce.

## Następne w kolejce
1. Odbiór F4 (obliczenia — priorytet ownera) + bramka + commit.
2. Odbiór obu Fable → z ich znalezisk uformować kolejną falę napraw.
3. Faza 2: szardy P1-P5 (klony wolne po zakończeniu torów).
4. `corrections-actions` — 13 czerwonych, osobny tor.

---

# ZNALEZISKA FABLE (08:20-08:45) — 16 defektów, 10 potwierdzonych uruchomieniem

Pełne raporty: `FINDING-OBLICZENIA.md` (8) · `FINDING-LANCUCH.md` (8 + 1 obserwacja)

## 🔴 Integralność finansowa — pieniądze (raport obliczeń)
| # | co | plik | dowód |
|---|---|---|---|
| 1 | **void + ponowna rejestracja outputu = wyrób za £0** | `resolve-output-wac.ts:103-113` | £500 → output 100 kg (£500 ✓) → void (0/0 ✓) → ponowna rejestracja → **100 kg / £0 / śr. £0**, `applied:true` |
| 2 | **storno zużycia = £500 z niczego** | `resolve-output-wac.ts:66-102` | WO z netto 0 kg wycenia output na £500, a pula surowca już dostała zwrot → **wartość zapasów podwojona** |
| 3 | **zużycie w tonach nie schodzi z wyceny** | `upsert-wac.ts:316-342` | `debitWac(2 t)` na 3000 kg/£15000 → **pula nietknięta**, tylko `console.warn`. Konwerter obok liczy `2 t = 2000 kg` |
| 4 | pack→kg bez wagi bazowej | — | 10 each × 250 g → **2500 kg zamiast 2,5** (1000×) |
| 5 | kosztorys NPD bez wagi paczki | — | koszt 1,70→1,00, marża 66%→80%, `missing:[]` |
| 6-8 | blokada outputu przy historycznych gramach (422) · reversal WAC pomijany bez snapshotu · yield WIP 150%/0% traktowany jak 100% | | |

## 🔴 Łańcuch biznesowy (raport łańcucha)
| # | co | dowód |
|---|---|---|
| 1 | **DEADLOCK korekt na COMPLETED WO** — bramka anulowania każe „void each output before cancelling", a void odpowiada `invalid_state`; `reopen` nie istnieje | guard `isTerminalOutputVoidForbiddenStatus` (`correct-ledger-entry.ts:76-79`, Fala 10) stał się **pierwszą** kontrolą i odrzuca przed kontrolami LP/e-sign. Fala 10 dodała guard + 3 testy, **nie zmigrowała 12 testów starego kontraktu** |
| 2 | **konsumpcja bez site-scope** | **potwierdzone uruchomieniem**: FEFO wybrał LP z **cudzego zakładu** dla warszawskiego WO. Bliźniaczy `registerOutput` zakład **wymusza** |
| 3 | **outbox ma JEDNEGO konsumenta** | obiecani (scheduler→WO, finanse AR, raportowanie) **nie istnieją** — po naprawie cronów nie zmaterializuje się nic poza kaskadą. Tłumaczy, czemu duplikat PRD-008 był bezobjawowy |
| 4 | alokacja SO bez filtra `lp.uom` · wysyłka nie pisze `stock_moves`/`lp_state_history` (ledger ślepnie na rozchód) · sibling warehouse-target w `registerOutput` | |
| — | kolumny `*_eur` mają semantykę GBP — **odnotowane, żeby nikt nie zgłosił fałszywego rozjazdu walut** | |

## Rozwiązana zagadka 13 czerwonych w `corrections-actions.test.ts`
To **spór o kontrakt z twardym skutkiem**, nie zwykła czerwień. Asymetria: `reverseConsumption`
i `voidWasteEntry` na tym samym COMPLETED WO **działają** — korekta zakończonego zlecenia jest
jednostronna (wejście tak, wyjście nie). 13. czerwony jest osobny: `upsertWac` urósł do 7
parametrów, test asertuje stare 5.
**Decyzję trzeba spiąć z `E2E-054-10` i nettingiem WAC — to jeden węzeł polityki.**

## ⚠️ POWTÓRZONY BŁĄD ORCHESTRATORA (2× dziś)
**Przydzieliłem ten sam klon dwóm torom** — raz Fable-łańcuch + F1, raz Fable-uprawnienia + F4.
Oba razy poprawione, ale kosztowało rundy. **Przed każdym uruchomieniem toru sprawdź tabelę
przydziału zasobów na górze tego pliku.**

## Do decyzji ownera (kolejka)
1. **Deadlock korekt COMPLETED WO** — spiąć z `E2E-054-10` i nettingiem WAC, jeden węzeł polityki
2. `UI-003` global search — budujemy czy topbar przestaje obiecywać
3. Obejście B w `lp-downstream-guard.ts` (netto konsumpcji = 0)
