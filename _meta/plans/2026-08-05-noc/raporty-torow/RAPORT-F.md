# RAPORT F — tor przegladarkowy (ostatni, 2026-08-06 ~05:05-05:45)

Katalog: `/Users/mariuszkrawczyk/Projects/_noc/B` | Baza: `monopilot_t2` | Port 3514 (app 3814)

## 0. Stan srodowiska

- Worktree B stal na `6341c847`, **przelaczony na `96953416`** (najnowszy z glownego repo).
- Repo ma migracje do **564**; baza `monopilot_t2` ma zaaplikowane do **564** — zgodne, nie migrowalem.

## 1. BRAMKA HYDRACJI — **PRZESZLA**

```
PORT=3514 bash scripts/e2e-local.sh --db monopilot_t2 apps/web/e2e/hydration-click-proof.spec.ts
✓ 1 [chromium] › hydration-click-proof.spec.ts:20:5 › real click reaches upsertReorderThreshold and writes a row (3.7s)
1 passed (4.7s)
```

Lancuch React-hydracja -> kliknięcie -> akcja serwerowa -> wiersz w bazie jest sprawny.
Dalsze wyniki maja podstawe.

---

## 2. WERDYKTY

### POZYCJA 1 — bramka blokad jakosciowych na SCIEZCE PRODUKCYJNEJ (`bf7f0579`)

Spec: `apps/web/e2e/_noc/f01-prod-consume-hold.spec.ts`

**Zasiew.** Na palete surowca `D-RM-FLOUR-1` (`95fed772-ca7e-4a78-8067-453f84fd92d3`, 200 kg,
material DEMO-RM-FLOUR) zalozylem AKTYWNA blokade `HLD-00001004` (`reference_type='lp'`,
`priority='critical'`, `hold_status='open'`). Widok potwierdzil:

```
v_active_holds | 64976cb4-ccbe-4e0b-afbe-035ea67cc2ce | lp | 95fed772-ca7e-4a78-8067-453f84fd92d3
```

Stan wyjsciowy: paleta 200.000000 kg, `stock_moves` dla tej palety = 2 wiersze, suma 200.000000.

#### Faza A — konsumpcja palety POD blokada na zlecenie produkcyjne: **ODRZUCONA** ✅

Kroki: `/en/production/wos/25900000-0000-4000-8000-000000001003` -> zakladka *Consumption* ->
przycisk konsumpcji na wierszu FLOUR -> ilosc `50` -> wybor palety `D-RM-FLOUR-1` -> *Submit*.

Zaobserwowane:
```
[F1-A-LP-OPCJE] n=2 :: — no LP — | D-RM-FLOUR-1 · 200.000000 kg · 2026-11-04 (suggested)
[F1-A-SUBMIT] disabled=false
[F1-A-BLAD] "That license plate is on an active quality hold."
[F1-A-MODAL-OTWARTY] true
```

Komunikat **mowi wprost o blokadzie jakosciowej** — nie jest to generyczne „sprobuj ponownie".

Dowod ze stanu (po probie):
```
po_fazie_A_lp    | D-RM-FLOUR-1 | 200.000000     <- bez zmian
po_fazie_A_moves | 2            | 200.000000     <- ani jednego nowego ruchu
```

#### Faza B — KONTROLA PRZECIWNA, ta sama paleta bez blokady: **PRZESZLA I ZAPISALA SIE** ✅

Zamknalem blokade (`hold_status='released'`), `v_active_holds` dla tej palety = 0 wierszy.
Powtorzylem **identyczne kroki** (te same URL, ten sam wiersz, ta sama ilosc 50).

```
[F1-B-BLAD] ""                <- brak bledu
[F1-B-MODAL-OTWARTY] false    <- modal zamkniety, akcja przyjeta
```

Dowod ze stanu:
```
po_fazie_B_lp    | D-RM-FLOUR-1 | 150.000000   <- 200 - 50
po_fazie_B_moves | 3 wiersze
nowy ruch        | consume_to_wo | 50.000000 | wo=25900000-...-1003 | 2026-08-06 05:09:29
```

### WERDYKT POZYCJI 1: **POTWIERDZONA**

Bramka na sciezce produkcyjnej odrzuca konsumpcje palety pod aktywna blokada, komunikatem
nazywajacym przyczyne, i **nie zapisuje niczego**. Ta sama sciezka przy tej samej palecie bez
blokady przechodzi i zapisuje ruch — wiec bramka nie odrzuca wszystkiego.

---

### POZYCJA 2b — cofniecie konsumpcji w przegladarce (`58900b69`, ODWROCONY ZNAK)

Spec: `apps/web/e2e/_noc/f02-reverse-consume.spec.ts`

Kroki: WO `...-1003` -> zakladka *Genealogy* -> `Reverse…` na pozycji `D-RM-FLOUR-1 50 kg` ->
powod z listy -> notatka -> PIN e-podpisu -> *Submit*.

Zaobserwowane: brak bledu (`[F2b-BLAD] ""`), konsola czysta, zadnego 5xx.
Ekran genealogii po operacji pokazuje pare: `50 kg` + korekte.

Dowod ze stanu — **paleta i ksiega zgadzaja sie co do grama**:
```
lp_po_cofnieciu | D-RM-FLOUR-1 | 200.000000

ksiega (stock_moves dla tej palety, chronologicznie):
  consume_to_wo  100.000000   03:44:10   <- tor D
  adjustment     100.000000   03:44:17   <- cofniecie tora D
  consume_to_wo   50.000000   05:09:29   <- moja konsumpcja (F1-B)
  adjustment      50.000000   05:11:00   <- moje cofniecie
```
Bilans: 200 (start) − 100 + 100 − 50 + 50 = **200** = stan palety. Zgodnie.

**Kontrola na odwrocony znak**: gdyby naprawa nie zadzialala, po cofnieciu 50 kg paleta
pokazalaby **250** (podwojna ilosc), a nie 200. Pokazuje 200.

Palety nietkniete operacja bez zmian: `D-LP-BOUNDARY / D-LP-CTRL / D-LP-EXPIRED / D-LP-OK`
wszystkie nadal 100.000000.

### WERDYKT POZYCJI 2b: **POTWIERDZONA** (niezaleznie, na bazie `monopilot_t2`, commit `96953416`)

---

### POZYCJA 2a — anulowanie zakonczonego zlecenia (`1308ce11`): **NIE DOSZEDLEM**

**Powod (uczciwie):** zabraklo czasu, nie znalezisko.

Co ustalilem, zeby nastepny tor nie zaczynal od zera:

- WO `...-1004` (to, na ktorym mierzyl tor D) jest juz **CANCELLED** — nie da sie powtorzyc
  na nim operacji.
- WO `...-1005` jest **COMPLETED**, ale ma **0 wierszy w `wo_outputs`**. Anulowanie go nie
  dotknelo by wcale sciezki, ktora naprawia `1308ce11` (zerowanie palety wyjsciowej + ruch
  ujemny w ksiedze) — byloby to falszywe „potwierdzenie".
- Zeby zrobic to uczciwie, trzeba przejsc pelny lancuch na swiezym WO:
  **Start -> zarejestruj wyrob -> Complete -> Cancel**, potem porownac palete wyjsciowa
  (ma byc 0 i `destroyed`) z ksiega (ma byc ruch ujemny).
- Probowalem na WO `...-1002`, ale ono jest w statusie **RELEASED** i pasek akcji ma tylko
  `Start | Cancel` — spec `d03` zaklada WO juz wystartowane i przewrocil sie na braku
  `wo-action-catchweight`. **To nie jest blad aplikacji, tylko brakujacy krok w specu.**
  Poprawka to jedna linia: klikniecie `Start` przed rejestracja wyrobu.

Log: `/tmp/torF-f3.log`.

---

## 3. DROBNE ZNALEZISKA (uboczne, z nasluchu konsoli)

**BRAKUJACY PARAMETR W TLUMACZENIACH POWIADOMIEN** — DROBNY, ale powtarzalny na **kazdej**
stronie z powloka aplikacji (dzwonek powiadomien). Konsola serwera zrzuca 4 bledy formatowania
przy kazdym wejsciu:

```
Error: FORMATTING_ERROR: The intl string context variable "n" was not provided
  to the string "{n} unread notifications"
  ... "{n}m ago"   ... "{n}h ago"   ... "{n}d ago"
```

Odtworzenie: wejsc na dowolny ekran w `(app)`, np. `/en/production/wos/<id>`; bledy leca do
konsoli przy renderze. Skutek widoczny dla uzytkownika: znaczniki czasu / licznik powiadomien
nie renderuja sie poprawnie. Nie blokuje zadnej sciezki.

---

## 4. CZEGO NIE SPRAWDZILEM

- **Pozycja 2a** (anulowanie zakonczonego WO) — jak wyzej, brak czasu; scieżka opisana.
- Nie sprzatnalem po sobie w bazie `monopilot_t2` — stan koncowy jest **spójny**
  (`D-RM-FLOUR-1` = 200 kg, bilans ksiegi zerowy), ale zostawilem:
  - blokade `HLD-00001004` w statusie `released` (moj zasiew, celowo zamkniety w fazie B),
  - dwa dodatkowe ruchy w `stock_moves` (consume 50 + jego cofniecie) — wzajemnie sie znoszace.
- Nie ruszalem kodu produkcyjnego. Jedyne pliki, ktore dodalem, to dwa specy w
  `apps/web/e2e/_noc/` (`f01-prod-consume-hold.spec.ts`, `f02-reverse-consume.spec.ts`).

---

## 5. PODSUMOWANIE

| Pozycja | Naprawa | Werdykt |
|---|---|---|
| 1 | `bf7f0579` — bramka blokad jakosciowych, **sciezka produkcyjna** | **POTWIERDZONA** (z kontrola przeciwna) |
| 2b | `58900b69` — cofniecie konsumpcji, odwrocony znak | **POTWIERDZONA** (niezaleznie) |
| 2a | `1308ce11` — anulowanie zakonczonego zlecenia | **NIE DOSZEDLEM** (brak czasu; sciezka opisana) |

Bramka hydracji przeszla, wiec powyzsze pomiary maja podstawe.


