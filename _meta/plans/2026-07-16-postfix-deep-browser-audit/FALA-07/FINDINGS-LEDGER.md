# FALA 7 — rejestr znalezisk cross-review

## Ustalenia orchestratora PRZED delegacją (weryfikacja na prodzie)
| Ustalenie | Wynik |
|---|---|
| Kierunek naprawy R07-04 | ✅ `LEFT JOIN … FOR UPDATE` → **`ERROR: FOR UPDATE cannot be applied to the nullable side of an outer join`**; `INNER JOIN` → OK. `grn_items.grn_id` jest **NOT NULL**, 0 wierszy NULL → **LEFT JOIN nigdy nie był potrzebny** |
| Typy i skale kolumn | `purchase_order_lines.unit_price` **numeric(12,4)** · `qty` **numeric(18,6)** · `grn_items.received_qty` **numeric(18,6)** → baza obsługuje 6 miejsc **po obu stronach** przyjęcia; modal ograniczający do 3 był **jedynym** zwężeniem |

## Recenzja T5 (licznik GRN / supplier batch / hydracja) — Codex, FIX-FIRST — 3×P2
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T5-1 | P2 | Test zgodności liczników **nie obejmuje anulowanej linii** | **[F]** |
| T5-2 | P2 | Test wartości `—` może przejść **bez myślnika** w kolumnie Supplier batch | **[F]** |
| T5-3 | P2 | Raport **błędnie** zgłasza druk jako pozostałą niespójność liczników | **[R]** korekta raportu |

**Czyste (odpowiedzi na moje pytania priorytetowe):**
- `.map((r) => mapGrn(r))` **realnie** usuwa przekazanie indeksu; test akcji z dwoma wierszami łapie pierwotny defekt.
- **Nie ma innych produkcyjnych `.map(fn)`** z drugim parametrem ani `.map(parseInt)` → **klasa błędu domknięta**.
- Kontrakt licznika **ujednolicony**: lista, szczegóły **i druk** liczą aktywne linie; anulowane zostają jako ślad audytowy.
- `coalesce(gi.supplier_batch_number, lp.supplier_batch_number)` **nie kopiuje batcha wewnętrznego** — LP łączone przez dokładne `gi.lp_id`, wartość GRN ma pierwszeństwo. Semantycznie poprawne.
- W plikach GRN **brak** niestabilnego formatowania SSR/CSR — nie przypisano im zgadywanej przyczyny #418.

## Znaleziska zwiadu wykraczające poza raport audytu (do rozdysponowania)
| # | Znalezisko |
|---|---|
| Z-1 | **Cicha rozbieżność wyceny:** `receipt-corrections-actions.ts:473-479` — przy kasowaniu przyjęcia z nierozwiązywalnym UoM loguje `reversal_skipped_unresolved_uom` i **kontynuuje**; LP zerowane, **wkład do WAC nigdy nie odwrócony** |
| Z-2 | **Rewalidacja w środku transakcji** — `cancelGrnLine` krok 8 (`:536-537`), po siedmiu mutacjach, niezabezpieczona. Ścieżka przyjęcia ma już poprawny wzorzec (`receive-po-line.ts:230-241`) |
| Z-3 | **Rozjazd dokumentacji z kodem:** `book-receipt-wac.ts:55` twierdzi „no-op gdy linia nie ma ceny", a kod no-opuje tylko gdy **brakuje wiersza**; `unit_price` jest NOT NULL DEFAULT 0 → **linie darmowe też blokowane** |
| Z-4 | **Migracja 299 jest z aplikacji nieosiągalna** — pozwoliła kasować linie na `completed` GRN, ale `cancelGrnLine` odmawia przy `completed`, a GRN auto-kompletują się przy rollupie PO |
| Z-5 | Cap over-receive **110 % zahardkodowany i obcinany** dzieleniem bigint (`receive-po-line-core.ts:145`) |
| Z-6 | `insertLpAutoPutaway` (`receive-po-line-core.ts:596-609`) — **martwy kod**, zero wywołań w repo |
| Z-7 | `numeric3Schema` (3 miejsca) wciąż używany przez `TransferOrderLineInput`, choć `transfer_order_lines.qty` to `numeric(18,6)` |
| Z-8 | Formularz przyjęcia **nie zbiera** batcha dostawcy mimo istniejących kolumn — osobne zadanie |

## Recenzja T1 (precyzja ceny PO + hydracja) — Codex, FIX-FIRST — 2×P1
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T1-1 | **P1** | **Puste pole ceny NADAL po cichu zapisywane jako zero** — autor zostawił jako „udokumentowane". **Ta sama cicha koercja w innym przebraniu** | **[F]** |
| T1-2 | **P1** | **`validLines` BEZ OSTRZEŻENIA usuwa inne wadliwe linie z zamówienia** — PO powstaje bez linii, którą użytkownik myśli, że zamówił. Potwierdza sąsiedni bug zgłoszony przez sam tor | **[F]** |
| T1-3 | P2 | Cena jednostkowa nie zawsze pokazuje cztery miejsca | **[F]** |
| T1-4 | P2 | Deklarowany zestaw testów nie jest częścią patcha | **[F]** |

## Ustalenia orchestratora — test live-PG (T4)
- ✅ **Przechodzi 4/4, gdy NAPRAWDĘ się wykonuje** (uruchomiłem z `DATABASE_URL`).
- ⚠️ **`describe.skip` bez `DATABASE_URL`** → w zwykłej bramce **pokazałby zieleń bez ani jednej
  asercji**. Autor ostrzegł wprost. **Bramka musi puszczać ten plik osobno z URL-em.**
- Moje pierwsze uruchomienie padło na `self-signed certificate` — **mój** błąd środowiskowy
  (`sslmode=no-verify` → `require` włącza walidację łańcucha), nie defekt testu.

**Zgłoszone przez T4, poza zakresem → TRAFIA DO FALI 8:**
`splitLp`/`mergeLps`/`destroyLp` (`lp-split-merge-destroy-actions.ts`) **nie porównują site LP
z aktywnym** — ścieżka UI zamknięta, ale bezpośredni POST server-action z cudzym `lpId` **dalej mutuje**.
Ten sam plik jest w zakresie R08-02.

## ⚠️ KOREKTA MOJEGO WŁASNEGO ZLECENIA (T3 miał rację)
W specyfikacji T3 napisałem, że kolumny docelowe to `numeric(18,6)`. **Nieprawda.**
Zweryfikowane na prodzie:
```
item_wac_state.total_qty_kg  ->  numeric(14,3)   ← KOLUMNA PULI WAC, sufit = 1 GRAM
item_wac_state.avg_cost      ->  numeric(18,6)
purchase_order_lines.qty     ->  numeric(18,6)   ← to jest ŹRÓDŁO, nie pula
```
Pomyliłem kolumny **źródłowe** z kolumną **puli**. Skutek: decyzja T3 o **zaokrąglaniu zamiast
odrzucania** przy 6-miejscowym wejściu w gramach jest **słuszna** — odrzucanie z powodu ułamka
miligrama, którego pula i tak nie przechowa, odtworzyłoby naprawiany defekt.

**To DRUGI raz przez dwie noce, gdy przypisuję typ kolumny z częściowego grepa i mylę się**
(poprzednio: `register-output.ts` „czyta" `default_location_id`, a tylko aliasuje).
**Wzorzec, nie incydent: sprawdzaj `information_schema` dla KAŻDEJ kolumny, którą cytuję w zleceniu.**

**Zgłoszone przez T3 do backlogu:** kwantyzacja puli do 3 miejsc daje **+0,125 % błędu `avg_cost`**
na przyjęciu gramowym i **urwisko poniżej 0,5 g**. Rekomendacja: osobny tor z migracją
`total_qty_kg → numeric(18,6)`. Migracji nie pisano.
