# Zachowanie ilości — 13 tez do weryfikacji (Codex, 2026-08-05 23:01)

**STATUS: NIEZWERYFIKOWANE.** Codex nie miał dostępu do bazy — to są ustalenia z czytania
kodu, nie z uruchomienia. Osobny tor ma je OBALAĆ, nie potwierdzać.

Tak. W bieżącym drzewie znalazłem ścieżki, które mogą:

- utworzyć wyrób bez odpowiadającego zużycia,
- usunąć LP bez ruchu straty/zwrotu,
- przywrócić stan, ale zapisać księgę z przeciwnym znakiem,
- pokazać w „unified ledger” inną ilość niż rzeczywisty ruch,
- ukryć zapas w osieroconej rezerwacji.

Audyt był wyłącznie statyczny. Nie uruchamiałem testów, builda ani bazy. „Przechodzi dziś” poniżej oznacza: kod i istniejące asercje dopuszczają zachowanie, a nie że osobiście zaobserwowałem zielony run.

## 1. Tabela ścieżek

| Ścieżka | Werdykt | Uzasadnienie |
|---|---|---|
| PO → GRN → LP | DZIURAWA | Powstaje LP, ale nie powstaje kanoniczny `stock_move`; syntetyczny receipt później odczytuje bieżący stan LP zamiast ilości przyjęcia. |
| Putaway / pełne przesunięcie LP | CZYSTA | LP jest blokowany `FOR UPDATE`, a ruch i zmiana lokacji są w tej samej transakcji. |
| Rezerwacja / alokacja / zwykłe zwolnienie | CZYSTA | Alokacja blokuje LP i zwiększa `reserved_qty` dokładnym SQL `numeric`; nie znalazłem zwykłego lost update. |
| Short pick | DZIURAWA | Zmniejsza alokację, ale nie zwalnia odpowiadającej części `LP.reserved_qty`. |
| Pakowanie / zwykłe rozpakowanie | CZYSTA | Ilość LP nie jest przepisywana; zmieniają się zawartość opakowania i statusy. |
| Zwykła wysyłka | CZYSTA | Warunkowy SQL odejmuje dokładnie wysyłaną ilość i w tej samej transakcji zapisuje `issue`. |
| Anulowanie wysłanej wysyłki | DZIURAWA | Przywraca ilość LP, ale nie zapisuje ruchu odwrotnego do pierwotnego `issue`. |
| Pick surowca na produkcję | DZIURAWA | Dla częściowo zarezerwowanego LP księguje tylko `available_qty`, lecz przenosi cały LP. |
| Konsumpcja z LP | CZYSTA | Odejmowanie ma dolną granicę względem `reserved_qty`, a ruch i zapis konsumpcji są transakcyjne. |
| Odwrócenie konsumpcji | DZIURAWA | LP jest zwiększany, lecz ruch `adjustment` ma znak ujemny — taki sam efekt księgowy jak kolejne zmniejszenie. |
| Konsumpcja bez LP | DZIURAWA | Powstaje konsumpcja produkcyjna bez zmniejszenia żadnego zapasu i bez `stock_move`. |
| Output / co-product / by-product | DZIURAWA | Mass-balance jest domyślnie ostrzeżeniem, zero konsumpcji omija gate; dodatkowo są problemy skali i UOM. |
| Disassembly | DZIURAWA | Output większy od inputu jest tylko ostrzeżeniem, a nowe LP nie dostają kanonicznych receipt moves. |
| Waste z LP z tego samego site | CZYSTA | LP jest blokowany i zmniejszany z dolną granicą; zapisuje się ujemny adjustment. |
| Waste bez LP / LP z innego site | DZIURAWA | Bez LP nie zmienia zapasu; dla obcego site zmiana i ruch trafiają do dwóch różnych zakładów. |
| Void waste | DZIURAWA | Odwraca wyłącznie `wo_waste_log`; nie przywraca LP ani ruchu zapasu. |
| Anulowanie completed WO | DZIURAWA | Ustawia ilość output LP na zero bez ruchu straty/zwrotu. |
| Korekta outputu z replacement | DZIURAWA | Replacement powstaje w `wo_outputs`, ale nie dostaje LP ani receipt move. |
| Direct adjustment / cycle count | CZYSTA | Dokładna arytmetyka mikro-6, blokady dla ujemnych nóg i ruch o zgodnym znaku. |
| Split / merge / destroy LP | CZYSTA | Rodzice są blokowani, ilości liczone mikro-6, a każda noga ma ruch w tej samej transakcji. |
| Anulowanie linii GRN | CZYSTA* | Sam reversal jest atomowy i zapisuje `return`; gwiazdka: globalna księga nadal cierpi na brak trwałego receipt. |
| RMA / zwrot klienta | DZIURAWA | `restock`, `scrap` i `quality_hold` zmieniają tylko RMA — nie powstaje LP, movement ani hold. |
| Transfer orders między zakładami | CZYSTA | Są blokady, dokładne konwersje oraz jawny invariant `LP + in_transit` przed i po operacji. |
| Widok „unified movement ledger” | DZIURAWA | Łączy dwa źródła przez `UNION ALL`, duplikuje część ruchów i rekonstruuje historyczną ilość z bieżącego LP. |

Łącznie: 24 pogrupowane ścieżki, 10 bez potwierdzonej dziury i 14 dziurawych.

## 2. Potwierdzone dziury

### P0.1 — Produkcja może zarejestrować więcej outputu niż zużyła

Kod w [register-output.ts:500](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:500) ustawia próg blokujący domyślnie na zero, a następnie całkowicie pomija gate przy zerowej konsumpcji:

```ts
coalesce((select block_pct from cfg), 0)::text as block_pct,
...
if (!gate || gate.posted_consumption_kg === '0' || gate.expected_input_kg === null) {
  return undefined;
}
```

Mimo samego ostrzeżenia później powstają `wo_outputs`, LP oraz receipt w `stock_moves`: [register-output.ts:833](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:833), [register-output.ts:939](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:939), [register-output.ts:982](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:982).

Scenariusz:

- zaksięgowane zużycie: 100 kg,
- rejestracja outputu: 103 kg,
- wynik: LP i receipt +103 kg, consume 100 kg,
- rozmnożone: 3 kg.

Jeszcze mocniejszy przypadek:

- zużycie: 0 kg,
- output: 100 kg,
- gate zwraca `undefined`,
- powstaje 100 kg bez wejścia.

Dlaczego przechodzi:

- [register-output.mass-balance.test.ts:239](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/__tests__/register-output.mass-balance.test.ts:239) oczekuje sukcesu dla 103/100 z ostrzeżeniem.
- [register-output.mass-balance.test.ts:272](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/__tests__/register-output.mass-balance.test.ts:272) oczekuje sukcesu dla outputu 100 przy zerowej konsumpcji.
- Blokada jest testowana dopiero po ręcznym ustawieniu `blockPct`.
- Integracja [output-lp-genealogy.integration.test.ts:277](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/__tests__/output-lp-genealogy.integration.test.ts:277) wprost tworzy 10 kg outputu bez konsumpcji. Cały suite jest pomijany bez `DATABASE_URL` przez `databaseUrl ? describe : describe.skip` na linii 40.

### P0.2 — Disassembly może stworzyć nadmiar i nie zapisuje receipt moves

W [register-disassembly-output.ts:139](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:139) mass-balance zwraca wyłącznie ostrzeżenie:

```ts
if (diff <= warnThreshold) return undefined;
return {
  input_kg: fixedToDecimal(inputKg),
  output_kg: fixedToDecimal(outputKg),
  warn_pct: DISASSEMBLY_MASS_BALANCE_WARN_PCT,
};
```

Dalej warning tylko flaguje WO, po czym pętla tworzy wszystkie LP: [register-disassembly-output.ts:638](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:638), [register-disassembly-output.ts:660](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:660).

Funkcja tworząca output LP zapisuje LP, genealogię i `lp_state_history`, ale nie `stock_moves`: [register-disassembly-output.ts:401](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:401).

Scenariusz:

- input: 100 kg,
- outputs: 50 + 30 + 25 = 105 kg,
- wynik: trzy LP o sumie 105 kg,
- WO dostaje tylko flagę,
- rozmnożone: 5 kg,
- kanoniczna księga `stock_moves` nie dostaje receipt 105 kg.

Dlaczego przechodzi: [register-disassembly-output.test.ts:366](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.test.ts:366) wprost oczekuje `ok: true` i warningu dla 105/100. Test utworzenia LP sprawdza LP/WAC/genealogię/outbox, ale nie `stock_moves`.

### P0.3 — Anulowanie zakończonego WO zeruje output LP bez ruchu straty

W [complete-cancel-wo.ts:608](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/complete-cancel-wo.ts:608) zapisywana jest tylko historia `destroyed`, a następnie:

```ts
update public.license_plates lp
   set status = 'destroyed',
       quantity = 0,
       reserved_qty = 0
 where lp.id = any($1::uuid[])
```

Kod: [complete-cancel-wo.ts:648](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/complete-cancel-wo.ts:648). W tej ścieżce nie ma `insert into public.stock_moves`.

Scenariusz:

- output LP: 10 kg,
- księga zawiera receipt +10 kg,
- anulowanie completed WO ustawia LP na 0,
- księga nadal pokazuje receipt 10, bez loss/return -10,
- 10 kg znika bez sklasyfikowanego rozchodu.

Dlaczego przechodzi: [complete-cancel-wo.cancel-completed-lps.test.ts:124](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/__tests__/complete-cancel-wo.cancel-completed-lps.test.ts:124) oczekuje sukcesu i `quantity = 0`, ale w całym pliku nie ma asercji dotyczącej `stock_moves`.

### P0.4 — Replacement output nie materializuje zapasu

W [corrections-actions.ts:685](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:685>) replacement ma jawnie `lp_id = null`:

```ts
insert into public.wo_outputs (... product_id, lp_id, ... qty_kg ...)
values (..., $6::uuid, null, $7, $8::numeric, ...)
```

Następnie kod dodaje WAC i ten replacement, ale zapisuje ruch oraz zeruje LP wyłącznie dla oryginału: [corrections-actions.ts:1172](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:1172>).

Scenariusz:

- oryginalny output i LP: 10 kg,
- korekta mówi: prawidłowo było 8 kg,
- oryginalny LP zostaje wyzerowany i dostaje adjustment -10,
- powstaje logiczny `wo_output` +8, ale bez LP i receipt,
- stan magazynowy kończy na 0 zamiast 8 kg.

Dlaczego przechodzi: [ledger-correction.contract.test.ts:172](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/authorization/ledger-correction.contract.test.ts:172) sprawdza logiczne `10 - 10 + 8 = 8` i WAC. Nie sprawdza, że replacement ma LP i receipt move. Standardowy UI może nie wystawiać tego wariantu, ale publiczny input akcji go obsługuje.

### P0.5 — Zwroty RMA nie wracają do magazynu

`receiveRma` aktualizuje tylko licznik linii:

```ts
update public.rma_lines
   set quantity_received = $3::numeric
```

Kod: [rma-actions.ts:510](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/rma-actions.ts:510>).

`processRma` ustawia tylko status i disposition:

```ts
update public.rma_requests
   set status = 'processed',
       disposition = $2
```

Kod: [rma-actions.ts:556](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/rma-actions.ts:556>). Nie tworzy LP, `stock_move` ani quality hold.

Scenariusz:

- klient fizycznie zwraca 5 kg,
- operator zapisuje `quantity_received=5`,
- disposition=`restock`,
- RMA mówi „received/processed”, ale magazyn nadal ma 0 kg zwrotu,
- 5 kg jest niewidoczne dla zapasu i księgi.

Jest też potwierdzony częściowy commit:

```ts
for (const line of parsed.data.lines) {
  await update(...);
  if (!rowCount) return { ok: false, error: 'not_found' };
}
```

`withOrgContext` po każdym zwykłym return wykonuje commit: [with-org-context.ts:361](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/with-org-context.ts:361).

Scenariusz częściowego commitu:

- linia A: 5 kg, istnieje — aktualizacja sukces,
- linia B: 3 kg, błędne ID — `return not_found`,
- `withOrgContext` commituje A=5, nagłówka nie przełącza,
- klient dostaje błąd, ale połowa operacji została utrwalona.

Dlaczego przechodzi:

- [rma-actions.test.ts:158](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/rma-actions.test.ts:158>) testuje create/approve/list, ale nie ma testu `receiveRma` ani `processRma`.
- Kontrakt [T-026.json:72](/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/11-shipping/tasks/T-026.json:72) wymaga LP dla `restock` oraz hold dla `quality_hold`, więc implementacja nie spełnia własnego AC.

### P0.6 — Konsumpcja i waste bez LP odrywają proces od zapasu

Konsumpcja dopuszcza ścieżkę:

```ts
const manualNoLpPath = !lpId && Boolean(reasonCode);
...
if (!manualNoLpPath) {
  update public.license_plates ...
}
```

Kod: [consume-material-actions.ts:662](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts:662>) i [consume-material-actions.ts:765](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts:765>). `writeConsumeLedger` również jest wywoływany tylko, gdy istnieje LP: linia 936.

Waste ma opcjonalne `lp_id`: [record-waste.ts:47](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/waste/record-waste.ts:47). Zmniejszenie LP i adjustment są całkowicie wewnątrz `if (input.lp_id)`.

Scenariusze:

- przyjęto 10 kg surowca,
- manual/no-LP consume 4 kg nie zmniejsza LP,
- rejestracja outputu 4 kg tworzy nowy LP,
- końcowo raw LP 10 + FG LP 4 z wejścia 10: rozmnożone 4 kg.

Oraz:

- LP ma 20 kg,
- waste 5 kg bez `lp_id`,
- LP nadal 20 kg, a `wo_waste_log` mówi o stracie 5 kg,
- bilans `stan + strata` wynosi 25 kg z wejścia 20.

Dlaczego przechodzi:

- [consume-material-actions.test.ts:631](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.test.ts:631>) wprost oczekuje braku update LP i braku `stock_moves`.
- [output-waste.integration.test.ts:175](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/__tests__/output-waste.integration.test.ts:175) oczekuje sukcesu waste bez LP i niezmienionego stanu.

Możliwe, że `silo-draw` ma reprezentować zewnętrzny, osobny rejestr silosu. W audytowanych ścieżkach nie znalazłem jednak odpowiadającego zmniejszenia takiego rejestru.

### P0.7 — Void waste nie przywraca towaru

`loadWasteForUpdate` nie ładuje nawet `lp_id`: [corrections-actions.ts:230](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:230>).

Samo odwrócenie robi wyłącznie ujemny counter-entry:

```ts
const correction = await insertCounterEntry(ctx, {
  table: 'wo_waste_log',
  values: {
    qty_kg: negateDecimalString(original.qty_kg),
    ...
  },
});
await writeWasteVoidAudit(...);
```

Kod: [corrections-actions.ts:982](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:982>).

Scenariusz:

- LP 10 kg,
- waste 4 kg → LP 6, adjustment -4, waste +4,
- void → waste -4, więc netto waste=0,
- LP nadal 6, adjustment nadal -4,
- 4 kg zniknęło, mimo że biznesowa przyczyna straty została anulowana.

Dlaczego przechodzi: [corrections-actions.test.ts:875](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.test.ts:875>) sprawdza wyłącznie ujemny wpis waste i audit.

### P0.8 — Odwrócenie konsumpcji ma przeciwny znak ruchu

LP jest poprawnie zwiększany:

```ts
set quantity = quantity + $2::numeric
```

[corrections-actions.ts:908](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:908>).

Ale movement otrzymuje:

```ts
negateDecimalString(params.original.qty_consumed)
```

[corrections-actions.ts:596](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:596>). Scanner ma tę samą konstrukcję w [reverse-consume/route.ts:359](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts:359>).

Konwencja adjustmentów w repo jest odwrotna: increase jest dodatnie, decrease ujemne — [direct-adjust-actions.ts:359](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts:359>).

Scenariusz:

- LP 10 kg,
- consume 4 → LP 6, `consume_to_wo +4` jako rozchód,
- reverse → LP 10,
- zapisuje się `adjustment -4`, czyli kolejny ujemny adjustment,
- stan netto wrócił do 10, ale księga reprezentuje rozchód 8 kg zamiast 0.

Dlaczego przechodzi:

- [corrections-actions.test.ts:491](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.test.ts:491>) oczekuje dokładnie `-4.250`.
- [stock-moves-production-ledger.pg.test.ts:323](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/__tests__/stock-moves-production-ledger.pg.test.ts:323) również wymaga wartości ujemnej.
- Ten test DB jest pomijany bez `DATABASE_URL`: linia 32 definiuje `runPg = databaseUrl ? describe : describe.skip`.

### P0.9 — „Unified ledger” nie jest trwałą księgą ilości

Komentarz sam przyznaje, że `lp_state_history` nie posiada ilości: [stock-move-actions.ts:29](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:29>).

Implementacja robi:

```sql
union all
...
lp2.quantity::text as quantity
```

[stock-move-actions.ts:58](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:58>), [stock-move-actions.ts:99](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:99>).

Przyjęcie PO tworzy LP i genesis history, ale nie `stock_moves`: [receive-po-line-core.ts:571](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/receive-po-line-core.ts:571), [receive-po-line-core.ts:685](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/receive-po-line-core.ts:685).

Scenariusz A — historia zmienia przeszłość:

- receipt 100 kg,
- później consume 40,
- LP ma teraz 60,
- syntetyczny historyczny receipt wyświetla 60, nie 100,
- przy pełnym zużyciu historyczny receipt spadnie do 0.

Scenariusz B — duplikacja:

- standardowy output 10 kg zapisuje zarówno genesis history, jak i receipt `stock_move`,
- `UNION ALL` zwraca obie pozycje,
- ekran pokazuje 20 kg wejścia dla LP o stanie 10 kg.

Dlaczego przechodzi:

- testy `receive-po-line-core` sprawdzają LP/GRN, ale nie wymagają receipt move.
- [purchase-to-grn-valuation-chain.spec.ts:525](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/e2e/purchase-to-grn-valuation-chain.spec.ts:525) tylko loguje zmianę liczby movements.
- [mqs-warehouse-flow.spec.ts:206](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/e2e/mqs-warehouse-flow.spec.ts:206) ma asercję, która powinna brak wykryć; nie ustaliłem, czy ten E2E jest obowiązkowym gate CI, i zgodnie z poleceniem go nie uruchomiłem.
- Testy listy movements używają przygotowanych rekordów, nie pełnego writer→reader bilansu.

### P0.10 — Cancel shipment przywraca stan bez ruchu odwrotnego

Kod przywraca wysłaną ilość:

```ts
update public.license_plates
   set quantity = quantity + $2::numeric,
       status = $3
```

[cancelShipment.ts:642](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:642>).

Potem zapisuje tylko `lp_state_history` i outbox: [cancelShipment.ts:405](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:405>). Normalna wysyłka zapisała wcześniej `issue`: [ship-actions.ts:497](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:497>).

Scenariusz:

- LP 10 kg,
- wysyłka 6 → LP 4, issue 6,
- cancel → LP 10,
- brak return/adjustment +6,
- stan jest poprawny, ale księga nadal twierdzi, że 6 kg wyjechało.

Dlaczego przechodzi:

- [cancelShipment.test.ts:472](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.test.ts:472>) sprawdza 10→4→10, ale nie `stock_moves`.
- Rzeczywisty [wave8-shipping-integrity.pg.test.ts:345](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/__tests__/wave8-shipping-integrity.pg.test.ts:345>) także sprawdza wyłącznie LP/status. Jest pomijany bez `DATABASE_URL` przez guard na linii 16.

### P1.11 — Ten sam output może mieć trzy różne ilości albo błędną jednostkę

Ten sam `resolvedQtyKg` jest zapisywany do kolumn o dwóch skalach:

- `wo_outputs.qty_kg numeric(12,3)` — [migration 181:53](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/181-production-wo-outputs-consumption.sql:53),
- `license_plates.quantity numeric(18,6)` — [migration 191:42](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/191-warehouse-license-plates-fefo.sql:42),
- `stock_moves.quantity numeric(18,6)` — [migration 193:285](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/193-warehouse-lp-transitions-grn-stock-spare-parts.sql:285).

Scenariusz skali:

- request: `1.2345`,
- `wo_outputs`: 1.235,
- LP i stock move: 1.234500,
- różnica: 0.0005 kg na operację,
- 2000 operacji daje 1 kg różnicy.

Drugi problem: request może podać dowolne `uom`, a kod po konwersji do kg ponownie używa wejściowego UOM:

```ts
const resolvedQtyKg = await resolveQtyKg(...);
const outputUom = input.uom ?? wo.uom;
```

[register-output.ts:784](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:784), [register-output.ts:835](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:835). Endpoint przekazuje surowe body: [outputs/route.ts:38](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/outputs/route.ts:38>).

Scenariusz UOM:

- 2 boxes × 10 sztuk × 15 kg = 300 kg,
- caller przesyła również `uom: "box"`,
- kod zapisuje `quantity=300, uom=box`,
- system reprezentuje 300 pudeł zamiast 2 pudeł/300 kg.

Dlaczego przechodzi: [register-output-uom.test.ts:291](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/__tests__/register-output-uom.test.ts:291) sprawdza bezstratne stringi, ale mock nie symuluje skali `numeric(12,3)`. Nie znalazłem testu odrzucającego konflikt `qtyUnits/unitsUom` z `uom`.

### P1.12 — Częściowo zarezerwowany LP jest przenoszony w całości, choć księga mówi o części

Kod świadomie dopuszcza częściową rezerwację:

```ts
if (!(Number(lp.available_qty) > 0)) throw ...
...
quantity: lp.available_qty,
...
await updateLpLocation(client, session, input.lpId, toLocationId, destination);
```

[movement.ts:589](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:589), [movement.ts:617](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:617). `updateLpLocation` zmienia lokację całego pojedynczego rekordu LP: linia 951.

Scenariusz:

- LP A: quantity 10, reserved 4, available 6,
- production pick zapisuje issue/transfer 6,
- jeden rekord LP o pełnej ilości 10 zmienia lokację na staging,
- księga mówi, że A→staging przeszło 6,
- stan lokacyjny mówi, że przeszło 10,
- brakujące w księdze: 4 kg.

Dlaczego przechodzi:

- [movement.test.ts:71](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.test.ts:71) używa wyłącznie `reserved_qty=0`.
- [movement-guards.pg.test.ts:110](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/__tests__/movement-guards.pg.test.ts:110) testuje tylko skrajności 0/10 i 10/10, nie 4/10.
- Test DB jest pomijany bez `DATABASE_URL` przez guard na linii 20.

### P1.13 — Short pick pozostawia osieroconą rezerwację

Po short pick kod zmienia ilość alokacji na faktycznie pobraną:

```ts
update public.inventory_allocations
   set status = 'picked',
       quantity_allocated = $2::numeric(14,3)
```

[pick-actions.ts:363](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts:363>).

Tworzy nową pending line dla reszty, ale nie zmniejsza `license_plates.reserved_qty`: [pick-actions.ts:380](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts:380>).

Scenariusz:

- LP quantity 20, alokacja i `reserved_qty` 10,
- short pick 6,
- alokacja zostaje zmniejszona do 6, lecz reserved nadal 10,
- wysyłka 6 odejmuje reserved 6,
- końcowo LP quantity 14, reserved 4, choć nie istnieje żywa alokacja na te 4,
- 4 kg znika z dostępnego zapasu.

Nie jest to fizyczne rozmnożenie; to „zniknięcie przez rezerwację”.

Dlaczego przechodzi: [pick-actions.test.ts:407](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.test.ts:407>) sprawdza wyłącznie utworzenie remainder line i status. Mock nie modeluje `reserved_qty`.

### P1.14 — Waste może zmniejszyć LP w zakładzie B, a ruch zapisać w zakładzie A

LP jest wybierany tylko przez `id + org_id`, bez zgodności z site WO:

```sql
from public.license_plates
where id = $1::uuid
  and org_id = $3::uuid
for update
```

[record-waste.ts:169](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/waste/record-waste.ts:169).

Ale `stock_moves.site_id` dostaje `wo.site_id`:

```ts
[
  wo.site_id,
  makeStockMoveNumber(...),
  input.lp_id,
  ...
]
```

[record-waste.ts:260](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/waste/record-waste.ts:260).

Scenariusz:

- LP w site B: 10 kg,
- WO w site A,
- waste 4 kg z LP B,
- LP B spada do 6,
- adjustment -4 zostaje ostemplowany site A,
- site B traci 4 kg bez swojego movement,
- site A ma movement -4 bez zmiany swojego stanu.

Dlaczego przechodzi: test waste zawsze używa tego samego `seed.siteId` dla WO i LP; nie ma przypadku cross-site. Test sprawdza tylko, że `wo_waste_log` jest stemplowany site WO.

## Hipotezy, które odrzuciłem

- Nie znalazłem potwierdzonego lost update w zwykłym putaway, split/merge, LP consumption, shipment ani transfer orders — są tam blokady lub warunkowe atomowe `UPDATE`.
- Brak `FOR UPDATE` pomiędzy kontrolą live stock a dodatnią korektą cycle count wygląda podejrzanie, ale sama korekta jest stałą deltą i komutuje z późniejszym ruchem. Nie mam konkretnego scenariusza, w którym samo to tworzy ilość, więc nie raportuję tego jako błąd.
- Potwierdziłem, że repo nie ustawia globalnego `pg.types.setTypeParser`. Nie znalazłem jednak w audytowanych mutatorach ilości potwierdzonego `numericString + numericString`. Wartości są zwykle przekazywane jako string do SQL albo do helperów BigInt mikro-6. `Number(...)` w scannerze i short pick służy tu jako warunek, nie jako zapisywana ilość.
- Nie znalazłem zwykłego odejmowania LP bez dolnej granicy w consume, same-site waste i ship. Potwierdzone użycia `greatest(0, ...)` dotyczą głównie rezerwacji; konkretny skutek raportuję przy short pick.

## 3. CZEGO NIE SPRAWDZIŁEM

- Nie uruchomiłem żadnego testu, builda, migracji ani zapytania do bazy — zgodnie z poleceniem.
- Nie potwierdziłem, które E2E i `*.pg.test.ts` są obowiązkowe w faktycznym CI. Potwierdziłem jedynie statyczne guardy `describe.skip` zależne od `DATABASE_URL`.
- Nie sprawdziłem stanu wdrożonej bazy, wersji zastosowanych migracji ani danych produkcyjnych.
- Nie audytowałem ręcznych operacji SQL, importów historycznych, skryptów operatorskich ani integracji spoza repo.
- Nie zweryfikowałem fizycznej semantyki `manualNoLp/silo-draw`; nie znalazłem w tych ścieżkach drugiej księgi silosu, ale może istnieć poza aplikacją.
- Nie potwierdziłem z UI, czy użytkownik może obecnie wywołać correction replacement albo przesłać sprzeczne `uom`; potwierdziłem, że warstwa serwerowa takie inputy przyjmuje.
- Nie przeprowadziłem eksperymentów konkurencyjnych na prawdziwym Postgresie.
- Nie robiłem pełnego audytu WAC/FIFO ani wartości finansowej — sprawdzałem je tylko tam, gdzie wpływały na ilość.
- Audyt dotyczy bieżącego drzewa roboczego, niekoniecznie dokładnie wersji aktualnie wdrożonej.
