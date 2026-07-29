# FAZA 2 — inwentarz 567 GAP-ów + szardowanie

**Data:** 2026-07-29 · **Tryb:** read-only (żaden plik kodu ani testu nie został zmieniony)
**Metodyka:** [`FAZA-2-PLAN.md`](FAZA-2-PLAN.md) · **Wejście z Fazy 1:** [`FAZA-1-WERDYKTY.md`](FAZA-1-WERDYKTY.md), [`FAZA-1-FAIL-RECHECK.md`](FAZA-1-FAIL-RECHECK.md)

---

## 1. Skąd się bierze 567 i dlaczego dokładnie tyle

Liczba **567 potwierdza się mechanicznie**, bez rozbieżności. Werdykty per ID nie leżą
w plikach MASTER — leżą w tabelach `| ID | Mode | Status | Evidence |` w **18 raportach szardowych**
przebiegu `full-remaining-2026-07-18` oraz w **9 raportach** wcześniejszego pokrycia.

| Warstwa | Plik(i) | Wiersze | GAP |
|---|---|---:|---:|
| Przebieg główny | `runs/full-remaining-2026-07-18/wave-0{1..7}/<shard>/REPORT.md` (18 plików) | 1363 | **515** |
| Wcześniejsze pokrycie („prior-96") | `runs/parallel-2026-07-18/*` + `runs/parallel-isolated-2026-07-18/*` (9 plików), scalone regułą `FAIL > PASS > GAP > BLOCKED` z `wave-03/AUDIT.md` | 96 | **52** |
| **Razem** | | **1459** | **567** |

Kontrola: `451 PASS + 46 FAIL + 567 GAP + 395 BLOCKED = 1459`, zero duplikatów ID,
zero nakładek między warstwami (`overlap=0`). Zgadza się z deklaracją w `FULL-MASTER.md`.

**Nie ma przypadku „ten sam ID z dwoma werdyktami".** Przebieg `unblock-blocked-2026-07-19`
dotknął **wyłącznie** 395 wierszy `BLOCKED` (51→PASS, 9→FAIL, 335 nadal BLOCKED) i **nie ruszył
ani jednego wiersza GAP**. Reguła „liczy się NOWSZY werdykt" nie ma tu więc zastosowania —
wszystkie 567 GAP-ów pochodzą z 18.07.

### Rozkład domenowy 567 GAP-ów

| Domena | GAP | z 1459 w domenie | udział GAP |
|---|---:|---:|---:|
| [`TEC`](FAZA-2-GAP-TEC.md) — Technical / PDM | **165** | 460 | 36% |
| [`SFQ`](FAZA-2-GAP-SFQ.md) — Shipping / Finance / Quality / Maintenance | **72** | 182 | 40% |
| [`PLN`](FAZA-2-GAP-PLN.md) — Planning | **67** | 130 | 52% |
| [`NSA`](FAZA-2-GAP-NSA.md) — NPD / Settings / Auth | **63** | 180 | 35% |
| [`WH`](FAZA-2-GAP-WH.md) — Warehouse / Scanner / Yard | **53** | 135 | 39% |
| [`E2E`](FAZA-2-GAP-E2E.md) — Warianty E2E | **51** | 140 | 36% |
| [`PRD`](FAZA-2-GAP-PRD.md) — Production / Scheduler / OEE | **37** | 124 | 30% |
| [`UI`](FAZA-2-GAP-UI.md) — UI / Settings-infra | **32** | 52 | 62% |
| [`XC`](FAZA-2-GAP-XC.md) — Przekrojowe | **27** | 56 | 48% |
| **Razem** | **567** | **1459** | **39%** |

> Uwaga: rozkład domenowy w `FAZA-2-PLAN.md` §3 (`TEC 460 · SFQ 182 …`) to **liczności całych domen
> w katalogu**, nie liczby GAP-ów. Powyższa tabela podaje faktyczne liczby GAP.

### Pliki inwentarza (pełne tabele, po domenach)

- [`FAZA-2-GAP-TEC.md`](FAZA-2-GAP-TEC.md) — 165 poz. · zielony test 50 · brak testu 107 · czerwony 8
- [`FAZA-2-GAP-SFQ.md`](FAZA-2-GAP-SFQ.md) — 72 poz. · zielony test 43 · brak testu 28 · czerwony 1
- [`FAZA-2-GAP-PLN.md`](FAZA-2-GAP-PLN.md) — 67 poz. · zielony test 44 · brak testu 22 · czerwony 1
- [`FAZA-2-GAP-NSA.md`](FAZA-2-GAP-NSA.md) — 63 poz. · zielony test 16 · brak testu 46 · czerwony 1
- [`FAZA-2-GAP-WH.md`](FAZA-2-GAP-WH.md) — 53 poz. · zielony test 28 · brak testu 25 · czerwony 0
- [`FAZA-2-GAP-E2E.md`](FAZA-2-GAP-E2E.md) — 51 poz. · zielony test 46 · brak testu 4 · czerwony 1
- [`FAZA-2-GAP-PRD.md`](FAZA-2-GAP-PRD.md) — 37 poz. · zielony test 21 · brak testu 14 · czerwony 2
- [`FAZA-2-GAP-UI.md`](FAZA-2-GAP-UI.md) — 32 poz. · zielony test 25 · brak testu 7 · czerwony 0
- [`FAZA-2-GAP-XC.md`](FAZA-2-GAP-XC.md) — 27 poz. · zielony test 17 · brak testu 6 · czerwony 4

---

## 2. Kolumny inwentarza — co znaczą i skąd pochodzą

Każdy wiersz w plikach domenowych ma: **ID**, **kontrakt dosłownie z katalogu**
(pola `Co sprawdza` + `Kroki`, przepisane — nie sparafrazowane), **anchor** `kat:<linia>` plus
anchor kodu z pola `Oczekiwana logika`, **czego zabrakło 18-19.07** (dosłowny zapis dowodu
z raportu szardowego), **test dziś**, **przegl.**, **persona**, **prio**.

### Kolumna „test dziś" — klasa kosztu

| Klasa | Liczba | Znaczenie | Koszt rozstrzygnięcia |
|---|---:|---|---|
| `zielony` | 278 | Test istnieje i był zielony; mierzy coś **obok** kontraktu | **najtańsze** — czytasz asercję. **Tu siedzą anty-testy.** |
| `zielony+pominięty` | 12 | Część zielona, część asercji pominięta (`skipped`) | tanie |
| `czerwony/pominięty` | 18 | Test istnieje, ale nie doszedł do zielonego | średnie |
| `brak (tylko źródło)` | 50 | Dowód = **przeczytanie źródła**, bez żadnego testu | **najdroższe** |
| `brak testu` | 209 | Brak testu pokrywającego kontrakt | **najdroższe** |
| **Razem** | **567** | | |

**Wniosek zgodny z przewidywaniem `FAZA-2-PLAN.md` §1:** klasa „istnieje zielony test mierzący coś obok"
to **290 z 567 (51%)** — w Fazie 1 było to 19/55 (35%). Przewidywanie „w populacji GAP będzie tego
więcej" **potwierdza się**.

> **Ostrzeżenie o wieku werdyktu.** Kolumna „test dziś" jest wyprowadzona z dowodu z **18-19.07**,
> a od 23.07 na produkcję poszło 12 fal naprawczych. Dla każdego GAP-a klasy `zielony` pierwszym
> krokiem toru jest **potwierdzenie, że test nadal istnieje i nadal jest zielony** — patrz §3.

### Kolumna „przegl." — czy kontrakt wymaga przeglądarki

Wyprowadzona z `KLASYFIKACJA-FRONT-BACKEND.md` + treści kontraktu:
`FRONT` → zawsze przeglądarka; `BACKEND` → nigdy; `MIXED` → przeglądarka **tylko** gdy kontrakt
dotyczy warstwy widoku (etykieta, empty-state, CTA, kolumna, modal, format wyświetlania) —
w pozostałych przypadkach `MIXED` da się dowieść **na poziomie akcji serwerowej** (akcja → wiersz w bazie),
co jest zgodne z kryterium domknięcia (`FAZA-2-PLAN.md` §4.2: stan trwały, **nie** wygląd ekranu).

| | Liczba | Tryb wykonania |
|---|---:|---|
| **wymaga przeglądarki** | **97** | sekwencyjnie, jedna sesja (`scripts/e2e-local.sh`) |
| dowodliwe akcją serwerową | 470 | równolegle, izolowane klony bazy |

### Kolumna „persona" — czy potrzebne konto inne niż `admin`

**130 z 567** kontraktów dotyka uprawnień, odmowy, scope'u site, RLS, e-podpisu lub SoD.
Dla nich `admin` jest **bezużyteczny** — `has-permission.ts:14,26-35` nadaje adminowi wszystko,
więc test negatywny jest niewykonalny (`FAZA-2-PLAN.md` §4.4). Persony: `PERSONY-TESTOWE.md`.
Przy kontraktach o odmowie wymagane są **obie strony** (odmowa dla persony bez prawa **oraz**
przejście dla persony z prawem) — §4.5.

---

## 3. Pomiar wykonany dzisiaj: realny stan suit (29.07)

Żeby kolumna „test dziś" nie była wyłącznie przepisaniem werdyktu z 18.07, uruchomiłem **oba**
zestawy testów jednostkowych `apps/web` na dzisiejszym kodzie.

| Suita | Pliki | Zielone | **Czerwone** | Testy | Padające | Pominięte |
|---|---:|---:|---:|---:|---:|---:|
| node (`vitest.config.ts`, bez `*.test.tsx`) | 1602 | 1539 | **63** | 5059 | 42 | **349** |
| UI (`vitest.ui.config.ts`) | 1262 | 1206 | **56** | 3595 | 84 | 0 |
| **Razem plików czerwonych** | | | **59** | | **126** | |

**Trzy rzeczy wyszły z tego pomiaru:**

1. **`pnpm --filter web test` maskuje suitę UI.** Skrypt to `vitest run <node> && vitest run <ui>` —
   suita node jest dziś czerwona, więc `&&` **nigdy nie dopuszcza suity UI do uruchomienia**.
   Znany wzorzec z pamięci projektu, wciąż obecny. Obie suity trzeba odpalać **osobno**.
2. **`349 pominiętych` testów w suicie node** to dokładnie te asercje DB, których przebieg 18.07
   słusznie nie policzył jako PASS. Klasa `zielony` w inwentarzu **nie oznacza**, że asercja się wykonała.
3. **Fałszywa zieleń wrappera.** `pnpm --filter web vitest run` kończy się kodem **0** przy
   `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` (nie ma skryptu `vitest`). Polecenie z `CLAUDE.md`
   raportuje sukces **nie uruchamiając ani jednego testu**. Poprawnie: `pnpm --filter web exec vitest run …`.

### 10 czerwonych dziś plików pokrywa się z defektami z Fazy 1

To **niezależne potwierdzenie**, że te defekty nie zostały naprawione przez fale 1-12:

| Czerwony plik (29.07) | Objaw dziś | Kontrakt Fazy 1 |
|---|---|---|
| `technical/items/_actions/__tests__/transition-item-status.test.ts` | `expected {ok:true} to match {ok:false}` | **TEC-049** — niedozwolone przejście przyjęte |
| `lib/warehouse/genealogy.test.ts` | `ProductionActionError: invalid_reference` | **E2E-051-01** — genealogia nie powstaje |
| `lib/i18n/__tests__/format.test.ts` | `en keys should match pl: 10861 vs 10851` | **XC-047** — parytet locale (dziś 10 kluczy) |
| `lib/warehouse/scanner/receive-po.test.ts` | `promise resolved {ok:true} instead of rejecting` | **E2E-049-02** — scanner receive |
| `lib/rbac/enforced-permissions.test.ts` | `Add to ENFORCED_PERMISSIONS_LIST: mnt.loto.apply, mnt.loto.clear, mnt.pm.create, scheduler.*` | **SFQ-164/166** — uprawnienia LOTO nieegzekwowane |
| `warehouse/_actions/warehouse-list-site-actions.test.ts` | `expected … to contain 'g.site_id = $5::uuid'` | **WH-045** — scope po site |
| `production/changeovers/__tests__/changeovers-list.test.tsx` | UI czerwone | **PRD-083** — Changeover |
| `quality/ncrs/_components/__tests__/ncrs.test.tsx` | UI czerwone | **SFQ-102/107** — NCR |
| `fa/[productCode]/…/allergen-cascade-widget.evidence.test.tsx` | UI czerwone | **TEC-334** — kaskada alergenów |
| `production/wos/[id]/…/wo-detail-screen.test.tsx` | UI czerwone | **PRD-001/008/009** — cykl życia WO |

**Konsekwencja dla kolejności:** rekomendacja `FAZA-2-PLAN.md` §7 (napraw defekty Fazy 1 **przed**
Fazą 2) zyskuje twarde poparcie. W tych 10 obszarach nowy test będzie czerwony z powodu **kodu**,
a nie z powodu testu — a to jest dokładnie ta niejednoznaczność, której §7 chce uniknąć.

### Rozkład 59 czerwonych plików po obszarach

`NSA-A NPD` 13 · `NSA-B Settings/Auth` 11 · `PRD` 5 · `PLN-B` 5 · `TEC-A Items` 5 · `WH-B Scanner` 4 ·
`TEC-B BOM` 3 · `WH-A` 2 · `UI` 2 · `XC-B` 1 · `SFQ-B` 1 · `SFQ-C` 1 · `TEC-D` 1 · `TEC-E` 1 · inne 4

Z 63 czerwonych suit node **7 pada z braku bazy** (`*.pg.test.ts`, `delete-project`,
`gate-approval-readiness`, `project-fg-sync`, `dashboard-data`, `update-item-linked-fg-name`,
`gate-actions.integration`, `gate-helpers-cost-readiness`) — to nie defekty, to brak `DATABASE_URL`.
Pozostałe **28 to realne czerwone asercje**.

---

## 4. Szardowanie — 51 torów

Zasady: **~10-14 ID na tor**, jeden tor = **spójny obszar** (te same moduły, ten sam stan wyjściowy),
szardy przeglądarkowe **oddzielone** od pozostałych.

| | Torów | ID | Tryb |
|---|---:|---:|---|
| **`B` — wymaga przeglądarki** | 9 | 97 | **sekwencyjnie, jeden naraz** (jedna sesja, `bash scripts/e2e-local.sh <spec>`) |
| **`P` — akcja serwerowa** | 42 | 470 | **równolegle** (~5 torów na falę, izolowane klony bazy) |
| **Razem** | **51** | **567** | ~9-10 fal |

Tory `B` mogą spanować domeny (i tak idą pojedynczo), tory `P` trzymają się jednej domeny
i sąsiadujących sekcji katalogu, żeby stan wyjściowy był wspólny.

Kolumny: **zielony** = ID klasy „istnieje zielony test" (czytasz asercję, szukasz anty-testu) ·
**brak** = ID bez testu (pisać od zera na prawdziwej bazie) · **pers.** = ID wymagające persony ≠ admin ·
**P0** = ID o priorytecie P0.

### 4.1 Tory przeglądarkowe (`B1`-`B9`) — sekwencyjnie

| Tor | Obszar | ID | zielony | brak | pers. | P0 |
|---|---|---|---:|---:|---:|---:|
| **B1** | WH<br/>*Adjustments / Counts — uzupełnienia · Cross-org / RLS / bezpieczeństwo · Inventory / rezerwacje / expiry · Inwentaryzacje …* | `WH-133` `WH-110` `WH-113` `WH-055` `WH-069` `WH-005` `WH-123` `WH-038` `WH-042` `WH-018` `WH-020` | 7 | 4 | 2 | 6 |
| **B2** | WH / SFQ / NSA<br/>*Cross-cutting — RLS, uprawnienia, spójność · G. Roles · Q. Reference data · Quality — Holds …* | `WH-099` `WH-077` `WH-092` `WH-082` `WH-088` `SFQ-179` `SFQ-100` `SFQ-152` `NSA-096` `NSA-159` `NSA-164` | 5 | 6 | 4 | 5 |
| **B3** | UI / PRD / TEC<br/>*Items — Allergen Profile · Scheduler — Runs · Settings — luka pokrycia · Shell / nawigacja globalna …* | `UI-038` `UI-045` `UI-046` `UI-001` `UI-002` `UI-004` `UI-006` `PRD-075` `PRD-121` `PRD-100` `TEC-062` | 6 | 5 | 3 | 1 |
| **B4** | UI<br/>*Dashboard · Finance / Reporting / Multi-site · Planning dashboard · Przekrojowe UI …* | `UI-007` `UI-009` `UI-023` `UI-024` `UI-013` `UI-014` `UI-048` `UI-049` `UI-051` `UI-028` `UI-035` | 7 | 4 | 2 | 0 |
| **B5** | PLN / E2E / XC<br/>*Importy CSV · Platform admin · Purchase Orders · Transfer Orders …* | `PLN-058` `PLN-074` `PLN-097` `E2E-053-08` `XC-031` `XC-032` `XC-033` `XC-028` `XC-046` `XC-048` | 7 | 3 | 2 | 2 |
| **B6** | TEC<br/>*BOM — Lista · BOM — Tworzenie wersji draft · Items — Edycja · Items — Szczegół / zakładki …* | `TEC-033` `TEC-058` `TEC-030` `TEC-067` `TEC-068` `TEC-073` `TEC-100` `TEC-105` `TEC-188` `TEC-196` `TEC-198` | 4 | 6 | 3 | 0 |
| **B7** | TEC<br/>*Cost History + Cost Item Picker · Cost/Routings/Tooling — przekrojowe · Ekran podglądu kaskady · Lab results …* | `TEC-218` `TEC-220` `TEC-280` `TEC-282` `TEC-269` `TEC-273` `TEC-343` `TEC-371` `TEC-373` `TEC-354` `TEC-357` | 5 | 6 | 1 | 1 |
| **B8** | TEC / PLN<br/>*Compliance — Dashboard · ECO — Change Orders · ECO/Factory-specs — przekrojowe RLS/audyt · Release-bundle — read model / assembly …* | `TEC-358` `TEC-478` `TEC-412` `TEC-414` `TEC-415` `TEC-417` `TEC-418` `TEC-498` `TEC-470` `PLN-118` `PLN-019` | 4 | 7 | 1 | 3 |
| **B9** | PLN<br/>*Carriers / freight · Forecasts · MRP · Work Orders* | `PLN-023` `PLN-027` `PLN-029` `PLN-034` `PLN-122` `PLN-102` `PLN-103` `PLN-105` `PLN-107` `PLN-052` | 6 | 4 | 3 | 4 |

### 4.2 Tory równoległe (`P1`-`P42`) — akcja serwerowa + asercja w bazie

| Tor | Domena / obszar | ID | zielony | brak | pers. | P0 |
|---|---|---|---:|---:|---:|---:|
| **P1** | WH — Receive/Putaway/Pick/LP/Inventory/Counts/Yard, Scanner<br/>*License Plates — uzupełnienia · Putaway · Ruchy · Scanner — QA …* | `WH-114` `WH-115` `WH-116` `WH-118` `WH-119` `WH-037` `WH-041` `WH-044` `WH-103` `WH-108` `WH-100` `WH-101` | 5 | 7 | 4 | 6 |
| **P2** | WH — Scanner<br/>*Scanner — RBAC per operacja · Scanner — auth / PIN / sesja / site · Scanner — move / lp / lock-lp · Scanner — pick …* | `WH-079` `WH-080` `WH-081` `WH-073` `WH-078` `WH-091` `WH-084` `WH-085` `WH-086` `WH-087` `WH-096` `WH-097` | 5 | 7 | 6 | 4 |
| **P3** | NSA — NPD<br/>*A. NPD Pipeline — stage'y i gate'y · B. NPD Formulacje — wersjonowanie* | `NSA-007` `NSA-010` `NSA-016` `NSA-017` `NSA-018` `NSA-019` `NSA-020` `NSA-022` `NSA-023` `NSA-027` `NSA-028` `NSA-029` | 3 | 9 | 5 | 7 |
| **P4** | NSA — NPD<br/>*B. NPD Formulacje — wersjonowanie · C. NPD Costing — matematyka WIP · E. NPD Allergen cascade* | `NSA-030` `NSA-031` `NSA-033` `NSA-034` `NSA-035` `NSA-039` `NSA-041` `NSA-048` `NSA-055` `NSA-057` `NSA-068` `NSA-069` | 3 | 9 | 1 | 4 |
| **P5** | NSA — NPD, Settings/Auth/Users/Onboarding/GDPR<br/>*E. NPD Allergen cascade · F. Users / Invite · I. Auth — login / PIN · J. MFA TOTP …* | `NSA-073` `NSA-076` `NSA-077` `NSA-081` `NSA-082` `NSA-101` `NSA-103` `NSA-105` `NSA-109` `NSA-117` `NSA-119` `NSA-121` | 3 | 8 | 2 | 3 |
| **P6** | NSA — Settings/Auth/Users/Onboarding/GDPR<br/>*L. Session · M. Password reset · N. Multi-tenant / RLS · O. Onboarding* | `NSA-122` `NSA-124` `NSA-125` `NSA-126` `NSA-127` `NSA-128` `NSA-129` `NSA-130` `NSA-131` `NSA-132` `NSA-134` `NSA-135` | 3 | 9 | 1 | 3 |
| **P7** | NSA — Settings/Auth/Users/Onboarding/GDPR<br/>*O. Onboarding · P. GDPR · Q. Reference data · S. Security settings …* | `NSA-136` `NSA-144` `NSA-146` `NSA-154` `NSA-155` `NSA-156` `NSA-158` `NSA-160` `NSA-162` `NSA-168` `NSA-171` `NSA-178` | 3 | 9 | 2 | 0 |
| **P8** | SFQ — Shipping/Sales/Finance/Pricing<br/>*Alokacja / FEFO · Finance — WAC · Finance — pricing / customer prices · Finance — valuation i koszty WO …* | `SFQ-021` `SFQ-022` `SFQ-078` `SFQ-088` `SFQ-090` `SFQ-092` `SFQ-081` `SFQ-085` `SFQ-047` `SFQ-053` `SFQ-025` `SFQ-026` | 9 | 3 | 3 | 7 |
| **P9** | SFQ — Quality<br/>*Quality — Inspections · Quality — NCR · Quality — Recall drills · Quality — Specifications …* | `SFQ-110` `SFQ-103` `SFQ-104` `SFQ-105` `SFQ-151` `SFQ-154` `SFQ-140` `SFQ-141` `SFQ-142` `SFQ-143` `SFQ-144` | 7 | 4 | 5 | 8 |
| **P10** | UI — UI<br/>*Dashboard · Finance / Reporting / Multi-site · Planning dashboard · Przekrojowe UI …* | `UI-010` `UI-025` `UI-015` `UI-052` `UI-030` `UI-031` `UI-032` `UI-033` `UI-034` `UI-040` `UI-042` `UI-043` `UI-016` `UI-019` | 12 | 2 | 2 | 2 |
| **P11** | SFQ — Quality<br/>*Quality — Cold chain · Quality — Complaints + CAPA · Quality — HACCP plans · Quality — Holds …* | `SFQ-131` `SFQ-132` `SFQ-134` `SFQ-135` `SFQ-136` `SFQ-137` `SFQ-139` `SFQ-094` `SFQ-095` `SFQ-099` `SFQ-108` | 8 | 3 | 6 | 5 |
| **P12** | SFQ — Quality, Maintenance<br/>*Maintenance — Assets · Maintenance — Kalibracje · Maintenance — MWO · Quality — Trace + mass balance* | `SFQ-145` `SFQ-146` `SFQ-147` `SFQ-150` `SFQ-155` `SFQ-156` `SFQ-167` `SFQ-171` `SFQ-158` `SFQ-159` `SFQ-162` | 7 | 4 | 4 | 5 |
| **P13** | WH — Receive/Putaway/Pick/LP/Inventory/Counts/Yard<br/>*Adjustments / Counts — uzupełnienia · Cross-org / RLS / bezpieczeństwo · Inventory / rezerwacje / expiry · Inventory / rezerwacje — uzupełnienia …* | `WH-131` `WH-135` `WH-111` `WH-112` `WH-050` `WH-051` `WH-054` `WH-128` `WH-063` `WH-056` `WH-062` `WH-008` `WH-013` | 8 | 5 | 2 | 5 |
| **P14** | SFQ — Shipping/Sales/Finance/Pricing, Quality<br/>*Quality — CCP deviations · Quality — CCP monitoring · Quality — Cold chain · Shipments — pack / seal / ship* | `SFQ-034` `SFQ-036` `SFQ-039` `SFQ-041` `SFQ-124` `SFQ-118` `SFQ-120` `SFQ-121` `SFQ-122` `SFQ-127` `SFQ-128` `SFQ-130` | 5 | 6 | 5 | 10 |
| **P15** | SFQ — Shipping/Sales/Finance/Pricing<br/>*Pick · RMA · Sales Orders — lifecycle i przejścia · Shipments — pack / seal / ship* | `SFQ-029` `SFQ-060` `SFQ-061` `SFQ-062` `SFQ-063` `SFQ-064` `SFQ-065` `SFQ-066` `SFQ-003` `SFQ-006` `SFQ-008` `SFQ-032` | 6 | 6 | 2 | 7 |
| **P16** | PRD — WO execution/Output/Downtime<br/>*Changeover — read · Downtime · Konsumpcja materiałów · Rejestracja produkcji / Output …* | `PRD-078` `PRD-071` `PRD-073` `PRD-039` `PRD-043` `PRD-047` `PRD-050` `PRD-052` `PRD-118` `PRD-120` `PRD-123` `PRD-124` | 8 | 4 | 6 | 6 |
| **P17** | PRD — WO execution/Output/Downtime, Scheduler/OEE/Andon<br/>*Analytics · OEE — Andon · Wykonanie WO — cykl życia* | `PRD-003` `PRD-019` `PRD-020` `PRD-023` `PRD-028` `PRD-084` `PRD-085` `PRD-113` `PRD-114` `PRD-115` `PRD-116` | 6 | 4 | 4 | 3 |
| **P18** | PRD — Scheduler/OEE/Andon<br/>*OEE — Andon · OEE — Dashboard · Scheduler — Runs* | `PRD-117` `PRD-106` `PRD-109` `PRD-110` `PRD-112` `PRD-086` `PRD-087` `PRD-088` `PRD-093` `PRD-098` `PRD-099` | 7 | 3 | 4 | 4 |
| **P19** | E2E — Łańcuchy<br/>*Łańcuch XC-050: NPD → Technical → Planning → Production · Łańcuch XC-051: Recall / trace — forward i backward · Łańcuch XC-052: Hold cascade — hold na batchu blokuje wszy* | `E2E-050-11` `E2E-050-12` `E2E-050-13` `E2E-050-14` `E2E-051-07` `E2E-052-03` `E2E-052-04` `E2E-052-05` `E2E-052-06` `E2E-052-07` | 10 | 0 | 0 | 7 |
| **P20** | TEC — Items/Materials/UoM<br/>*Items — Allergen Profile · Items — Deaktywacja · Items — Edycja · Items — Lista / Wyszukiwanie …* | `TEC-061` `TEC-063` `TEC-057` `TEC-034` `TEC-041` `TEC-042` `TEC-008` `TEC-012` `TEC-017` `TEC-018` `TEC-020` `TEC-023` | 3 | 8 | 4 | 6 |
| **P21** | TEC — Items/Materials/UoM, BOM/WIP/Revisions<br/>*BOM — Clone-on-write / request version edit · Items — Tworzenie · Items/Materials — Cross-cutting: RLS, RBAC, integralność* | `TEC-024` `TEC-025` `TEC-028` `TEC-031` `TEC-032` `TEC-095` `TEC-096` `TEC-099` `TEC-154` `TEC-155` `TEC-156` | 4 | 7 | 0 | 1 |
| **P22** | E2E — Łańcuchy<br/>*Łańcuch XC-052: Hold cascade — hold na batchu blokuje wszy · Łańcuch XC-053: Multi-site — separacja operacyjna* | `E2E-052-08` `E2E-052-09` `E2E-052-14` `E2E-052-16` `E2E-052-18` `E2E-052-20` `E2E-053-03` `E2E-053-05` `E2E-053-06` `E2E-053-07` | 10 | 0 | 4 | 4 |
| **P23** | E2E — Łańcuchy<br/>*Łańcuch XC-053: Multi-site — separacja operacyjna · Łańcuch XC-054: Cancel-cascade — WO z rezerwacjami i częśc* | `E2E-053-12` `E2E-053-13` `E2E-053-14` `E2E-053-15` `E2E-053-17` `E2E-053-18` `E2E-054-01` `E2E-054-03` `E2E-054-04` `E2E-054-05` | 9 | 1 | 3 | 5 |
| **P24** | E2E — Łańcuchy<br/>*Łańcuch XC-054: Cancel-cascade — WO z rezerwacjami i częśc · Łańcuch XC-055: Onboarding → pierwszy pełny obieg · Łańcuch XC-056: Spójność księgowa po dniu operacji* | `E2E-054-06` `E2E-054-13` `E2E-055-03` `E2E-055-04` `E2E-055-07` `E2E-056-01` `E2E-056-02` `E2E-056-07` `E2E-056-08` `E2E-056-09` | 9 | 1 | 1 | 2 |
| **P25** | E2E — Łańcuchy<br/>*Łańcuch XC-049: PO → GRN → putaway → WO → konsumpcja → out · Łańcuch XC-050: NPD → Technical → Planning → Production* | `E2E-049-05` `E2E-049-06` `E2E-049-09` `E2E-049-19` `E2E-049-25` `E2E-049-32` `E2E-050-02` `E2E-050-03` `E2E-050-04` `E2E-050-09` | 7 | 2 | 1 | 6 |
| **P26** | XC — Crony/RLS/integracje/i18n<br/>*Crony · Dokumenty i numeracja · Feature flags / telemetria · Importy CSV* | `XC-001` `XC-002` `XC-004` `XC-005` `XC-035` `XC-036` `XC-038` `XC-044` `XC-045` `XC-029` `XC-030` | 8 | 1 | 2 | 4 |
| **P27** | TEC — Cost/Routings/Tooling, Allergens/Nutrition/Lab<br/>*Allergens Config / macierz · Routing Cost Preview · Routings — CRUD · Tooling / Equipment Setup* | `TEC-266` `TEC-270` `TEC-272` `TEC-254` `TEC-256` `TEC-261` `TEC-262` `TEC-274` `TEC-336` `TEC-338` `TEC-340` | 7 | 4 | 3 | 1 |
| **P28** | XC — Crony/RLS/integracje/i18n<br/>*Importy CSV · Integracja D365 · Korekty ledgera · Notyfikacje …* | `XC-034` `XC-011` `XC-013` `XC-015` `XC-041` `XC-039` `XC-040` `XC-024` `XC-027` `XC-022` | 5 | 3 | 5 | 4 |
| **P29** | TEC — ECO/Factory-specs/Compliance/Trace<br/>*ECO/Factory-specs — przekrojowe RLS/audyt · Factory-specs — Bundle approval / release · Factory-specs — Recall* | `TEC-493` `TEC-494` `TEC-496` `TEC-451` `TEC-454` `TEC-456` `TEC-458` `TEC-459` `TEC-460` `TEC-461` `TEC-462` | 6 | 4 | 1 | 3 |
| **P30** | TEC — ECO/Factory-specs/Compliance/Trace<br/>*Compliance — Dashboard · ECO — Change Orders* | `TEC-475` `TEC-476` `TEC-477` `TEC-479` `TEC-480` `TEC-481` `TEC-400` `TEC-405` `TEC-407` `TEC-420` `TEC-422` | 5 | 5 | 3 | 5 |
| **P31** | TEC — ECO/Factory-specs/Compliance/Trace<br/>*Factory-specs — Recall · Factory-specs — tworzenie i wersjonowanie · Release-bundle — read model / assembly* | `TEC-463` `TEC-465` `TEC-466` `TEC-428` `TEC-436` `TEC-437` `TEC-439` `TEC-467` `TEC-468` `TEC-469` `TEC-471` | 5 | 6 | 1 | 3 |
| **P32** | TEC — BOM/WIP/Revisions<br/>*BOM — Detal, edycja linii · BOM — Diff wersji · BOM — Disassembly · BOM — Propagacja kosztów …* | `TEC-125` `TEC-128` `TEC-133` `TEC-134` `TEC-165` `TEC-166` `TEC-176` `TEC-177` `TEC-179` `TEC-199` `TEC-172` | 2 | 9 | 3 | 4 |
| **P33** | TEC — BOM/WIP/Revisions<br/>*BOM — Tworzenie wersji draft · Kaskada alergenów BOM→FG* | `TEC-103` `TEC-109` `TEC-110` `TEC-113` `TEC-116` `TEC-117` `TEC-118` `TEC-120` `TEC-121` `TEC-326` `TEC-330` | 1 | 10 | 2 | 5 |
| **P34** | TEC — Allergens/Nutrition/Lab<br/>*Audyt nadpisań alergenów · Lab results · Nutrition panel · Profil alergenowy pozycji — CRUD …* | `TEC-345` `TEC-369` `TEC-370` `TEC-375` `TEC-350` `TEC-310` `TEC-311` `TEC-312` `TEC-364` `TEC-366` `TEC-367` | 2 | 7 | 0 | 2 |
| **P35** | TEC — BOM/WIP/Revisions, Cost/Routings/Tooling<br/>*Cost Posting / Ledger · Kaskada alergenów BOM→FG · WIP-Library · Where-used* | `TEC-331` `TEC-332` `TEC-333` `TEC-189` `TEC-192` `TEC-194` `TEC-182` `TEC-221` `TEC-222` `TEC-223` `TEC-228` | 1 | 9 | 2 | 4 |
| **P36** | TEC — ECO/Factory-specs/Compliance/Trace<br/>*Release-bundle — read model / assembly · Traceability — Genealogy lookups* | `TEC-472` `TEC-473` `TEC-474` `TEC-483` `TEC-484` `TEC-485` `TEC-486` `TEC-488` `TEC-489` `TEC-490` `TEC-491` | 1 | 10 | 2 | 2 |
| **P37** | TEC — Cost/Routings/Tooling<br/>*Cost Posting / Ledger · Cost/Routings/Tooling — przekrojowe · Portfolio Cost · Recipe Cost — roll-up materiałowy* | `TEC-229` `TEC-234` `TEC-236` `TEC-237` `TEC-281` `TEC-239` `TEC-201` `TEC-202` `TEC-206` `TEC-208` `TEC-211` | 0 | 10 | 0 | 2 |
| **P38** | PLN — MRP/PO/Supplier/TO/Forecast<br/>*Forecasts · Import hub · MRP* | `PLN-106` `PLN-125` `PLN-126` `PLN-037` `PLN-038` `PLN-045` `PLN-049` `PLN-051` `PLN-054` `PLN-057` | 9 | 1 | 0 | 5 |
| **P39** | PLN — MRP/PO/Supplier/TO/Forecast<br/>*Purchase Orders · Reorder thresholds* | `PLN-059` `PLN-061` `PLN-062` `PLN-065` `PLN-072` `PLN-075` `PLN-077` `PLN-078` `PLN-080` `PLN-109` | 8 | 2 | 1 | 7 |
| **P40** | PLN — MRP/PO/Supplier/TO/Forecast<br/>*Reorder thresholds · Suppliers · Transfer Orders* | `PLN-110` `PLN-081` `PLN-082` `PLN-083` `PLN-084` `PLN-088` `PLN-089` `PLN-093` `PLN-100` `PLN-101` | 8 | 2 | 2 | 6 |
| **P41** | PLN — Work Orders/Schedule, MRP/PO/Supplier/TO/Forecast<br/>*Carriers / freight · Forecasts · Work Orders* | `PLN-022` `PLN-024` `PLN-025` `PLN-028` `PLN-030` `PLN-032` `PLN-033` `PLN-035` `PLN-121` `PLN-123` `PLN-104` | 4 | 6 | 4 | 5 |
| **P42** | PLN — Work Orders/Schedule<br/>*Schedule · Work Orders* | `PLN-117` `PLN-003` `PLN-005` `PLN-006` `PLN-007` `PLN-008` `PLN-009` `PLN-010` `PLN-011` `PLN-016` `PLN-018` | 7 | 4 | 1 | 4 |

---

## 5. Kolejność — od najwyższej wartości do najniższej

Kolejność wynika z trzech kryteriów `FAZA-2-PLAN.md` §3, w tej wadze:
(1) domena z **potwierdzonymi defektami Fazy 1** (`WH`, `SFQ`, `NSA`, `UI`) — tam kod już jest zepsuty,
więc GAP w sąsiedztwie ma wysokie prawdopodobieństwo trafienia; (2) obszar, którego **suita jest
czerwona dziś** (pomiar §3); (3) udział ID klasy `zielony` — najtańsze do rozstrzygnięcia i miejsce,
gdzie siedzą anty-testy; (4) udział P0.

| # | Tor | Uzasadnienie |
|---:|---|---|
| 1 | **B1** (`WH-133` `WH-110` `WH-113` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 7/11 klasy `zielony` → tanie, wysoka szansa na anty-test; **przeglądarka — sekwencyjnie** |
| 2 | **B2** (`WH-099` `WH-077` `WH-092` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; **przeglądarka — sekwencyjnie** |
| 3 | **P1** (`WH-114` `WH-115` `WH-116` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś** |
| 4 | **B3** (`UI-038` `UI-045` `UI-046` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; **przeglądarka — sekwencyjnie** |
| 5 | **P2** (`WH-079` `WH-080` `WH-081` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 6 ID wymaga persony — zaplanować konta z góry |
| 6 | **P3** (`NSA-007` `NSA-010` `NSA-016` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 9/12 bez testu → drogie, pisać od zera; 5 ID wymaga persony — zaplanować konta z góry |
| 7 | **P4** (`NSA-030` `NSA-031` `NSA-033` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 9/12 bez testu → drogie, pisać od zera |
| 8 | **P5** (`NSA-073` `NSA-076` `NSA-077` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 8/12 bez testu → drogie, pisać od zera |
| 9 | **P6** (`NSA-122` `NSA-124` `NSA-125` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 9/12 bez testu → drogie, pisać od zera |
| 10 | **P7** (`NSA-136` `NSA-144` `NSA-146` …) | domena z potwierdzonymi defektami Fazy 1; suita **czerwona dziś**; 9/12 bez testu → drogie, pisać od zera |
| 11 | **P8** (`SFQ-021` `SFQ-022` `SFQ-078` …) | domena z potwierdzonymi defektami Fazy 1; 9/12 klasy `zielony` → tanie, wysoka szansa na anty-test |
| 12 | **P9** (`SFQ-110` `SFQ-103` `SFQ-104` …) | domena z potwierdzonymi defektami Fazy 1; 7/11 klasy `zielony` → tanie, wysoka szansa na anty-test; 5 ID wymaga persony — zaplanować konta z góry |
| 13 | **P10** (`UI-010` `UI-025` `UI-015` …) | domena z potwierdzonymi defektami Fazy 1; 12/14 klasy `zielony` → tanie, wysoka szansa na anty-test |
| 14 | **P11** (`SFQ-131` `SFQ-132` `SFQ-134` …) | domena z potwierdzonymi defektami Fazy 1; 8/11 klasy `zielony` → tanie, wysoka szansa na anty-test; 6 ID wymaga persony — zaplanować konta z góry |
| 15 | **P12** (`SFQ-145` `SFQ-146` `SFQ-147` …) | domena z potwierdzonymi defektami Fazy 1; 7/11 klasy `zielony` → tanie, wysoka szansa na anty-test |
| 16 | **P13** (`WH-131` `WH-135` `WH-111` …) | domena z potwierdzonymi defektami Fazy 1; 8/13 klasy `zielony` → tanie, wysoka szansa na anty-test |
| 17 | **P14** (`SFQ-034` `SFQ-036` `SFQ-039` …) | domena z potwierdzonymi defektami Fazy 1; 5 ID wymaga persony — zaplanować konta z góry |
| 18 | **P15** (`SFQ-029` `SFQ-060` `SFQ-061` …) | domena z potwierdzonymi defektami Fazy 1 |
| … | pozostałe 33 torów | wg malejącego score'u z tabel §4 |

### Rekomendowana pierwsza fala (5 torów, ~55 ID)

Wszystkie **równoległe** (brak przeglądarki → mogą lecieć jednocześnie na osobnych klonach bazy):

- **P1** — License Plates — uzupełnienia, Putaway, Ruchy · 12 ID · zielony 5 / brak 7 / persona 4
- **P2** — Scanner — RBAC per operacja, Scanner — auth / PIN / sesja / site, Scanner — move / lp / lock-lp · 12 ID · zielony 5 / brak 7 / persona 6
- **P3** — A. NPD Pipeline — stage'y i gate'y, B. NPD Formulacje — wersjonowanie · 12 ID · zielony 3 / brak 9 / persona 5
- **P4** — B. NPD Formulacje — wersjonowanie, C. NPD Costing — matematyka WIP, E. NPD Allergen cascade · 12 ID · zielony 3 / brak 9 / persona 1
- **P5** — E. NPD Allergen cascade, F. Users / Invite, I. Auth — login / PIN · 12 ID · zielony 3 / brak 8 / persona 2

Tor `B1` (przeglądarkowy) startuje **równolegle do tej fali, ale sam** — jedna sesja przeglądarki.

---

## 6. Czego NIE planować jako wykonalne

Ustalone w Fazach 0-1, obowiązuje dla wszystkich 567 GAP-ów:

| Obszar | Dlaczego nieosiągalne |
|---|---|
| **E-podpis** (weryfikacja hasła przy podpisie) | fałszywy serwer auth przyjmuje **dowolne** hasło |
| **Supabase Storage** (uploady, polityki `storage.objects`) | `scripts/supabase-shim.sql` to atrapa |
| **Unieważnianie starych tokenów** | fałszywy GoTrue ich nie unieważnia |
| **Przełączanie flag funkcji** | `setCoreFlag` nie działa nigdzie (brak `updated_by`, `aggregate_id` NOT NULL) |
| **Przełączanie modułów** | `public.modules` **puste** — ekran pokazuje wyłącznie empty-state |
| **Renderowanie strony jako dowód zapisu** | nigdy nie jest dowodem — §4.2 kryterium domknięcia |

ID dotknięte tymi blokerami zostają w inwentarzu (dla kompletności rachunku 567), ale w torze
trzeba je oznaczyć jako **nieosiągalne lokalnie**, nie jako FAIL.

Dodatkowo: `_meta/i18n-staging/` to **trzeci** katalog tłumaczeń importowany przez ~20 modułów etykiet —
przy każdej zmianie komunikatów sprawdzaj importy **spoza** `apps/web`.

