# Werdykty — zachowanie ilości (tor adwersaryjny, 2026-08-06)

**Metoda:** każda teza rozstrzygnięta przez **realne wywołanie ścieżki zapisu** na żywej bazie
`monopilot_qty` z pomiarem stanu przed/po. Żadnego werdyktu nie oparto na teście z zaślepką.
Sondy: `_meta/plans/2026-08-05-noc/probes/*.pg.test.ts` — 18 testów, **18 wykonanych**, 0 pominiętych
(15 przechodzi w powtarzalnym przebiegu zbiorczym; 3 z pliku `p09-p13-p14` wykonane o 00:00, zanim
równoległy tor zepsuł składnię `pick-actions.ts` — patrz znalezisko #4).

Uruchomienie:
```bash
DATABASE_URL="postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot_qty" \
DATABASE_URL_OWNER="postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot_qty" \
node node_modules/vitest/vitest.mjs run \
  --config _meta/plans/2026-08-05-noc/probes/vitest.probe.config.ts --disable-console-intercept
```

---

## Tabela zbiorcza

| teza | werdykt | dowód w jednym zdaniu |
|---|---|---|
| **P0.1a** — output 103 kg przy 100 kg konsumpcji | **DECYZJA PRODUKTOWA** | Domyślnie przechodzi z ostrzeżeniem, ale po ustawieniu `tenant_variations.feature_flags.massbalance_threshold_pct=1` ta sama operacja **rzuca `insufficient_input_for_output`** — bramka działa, jest tylko wyłączona domyślnie. |
| **P0.1b** — output 100 kg przy ZEROWEJ konsumpcji | **POTWIERDZONA** | Z **włączonym** progiem 1% output 100 kg bez żadnego wejścia przeszedł: nowe LP 100 kg + `receipt +100`; bramka zwraca `undefined` gdy `posted_consumption_kg = 0`, więc konfiguracja nie pomaga. |
| **P0.2** — disassembly | **POTWIERDZONA** | Wejście 100 kg → output 105 kg = `ok:true` z samym `mass_balance_warning`, a nowe LP 105 kg ma **0 wierszy w `stock_moves`** (księga: −100, zero przychodu). |
| **P0.3** — anulowanie zakończonego WO | **POTWIERDZONA** | Po `completeWo`+`cancelWo` output LP: `100.000000 → 0.000000, status=destroyed`, a jedynym ruchem tego LP pozostał `receipt +100` (brak straty/zwrotu). |
| **P0.4** — replacement output | **POTWIERDZONA** | `voidWoOutput(replacement 8 kg)` → `ok:true`; oryginał wyzerowany + `adjustment −10`, replacement `wo_outputs +8` z **`lp_id = null`** i bez `receipt` — 8 kg istnieje tylko na papierze. |
| **P0.5** — zwroty RMA nie wracają do magazynu | **POTWIERDZONA** (mocniej niż w tezie) | `receiveRma` zwraca `persistence_failed`, bo `shipping.rma.received` **nie istnieje w `outbox_events_event_type_check`** — cały moduł RMA nie przechodzi poza `approved`; osobno potwierdzony **częściowy commit** (linia A utrwalona mimo zwróconego `not_found`). |
| **P0.6** — konsumpcja i waste bez LP | **POTWIERDZONA** | Waste 5 kg bez `lp_id` i consume 4 kg bez `lp_id`: LP **niezmienione 20 kg**, `stock_moves` **puste**, a `wo_waste_log` i `wo_material_consumption` zapisane. |
| **P0.7** — void waste nie przywraca towaru | **POTWIERDZONA** | Po `voidWasteEntry` (`ok:true`) LP nadal **6 kg** (było 10), `adjustment −4` nadal w księdze, a `wo_waste_log` ma parę +4/−4 (netto strata 0) — 4 kg zniknęło bez przyczyny. |
| **P0.8** — odwrócenie konsumpcji ma przeciwny znak | **POTWIERDZONA** | LP 10→6→10 (netto 0), a księga: `consume_to_wo +4` **oraz** `adjustment −4`; konwencja repo (`direct-adjust-actions`) to `increase ⇒ +`, więc wzrost LP zapisano jako ubytek. |
| **P0.9** — „unified ledger" | **POTWIERDZONA** (oba scenariusze) | Jeden output 100 kg daje **2 pozycje** (`stock_move/receipt 100` + `lp_state/production 100`, `total: 2`); po zmniejszeniu LP do 60 kg syntetyczna pozycja historyczna pokazuje **60**, nie 100. |
| **P0.10** — cancel shipment bez ruchu odwrotnego | **POTWIERDZONA** | `shipShipment` → LP 10→4 + `issue 6`; `cancelShipment` → LP wraca do 10, a w `stock_moves` **nadal tylko `issue +6`** (status `completed`, brak `return`/`adjustment`). |
| **P1.11a** — trzy skale tej samej ilości | **POTWIERDZONA** | Request `1.2345` → `wo_outputs.qty_kg = 1.235`, `license_plates.quantity = 1.234500`, `stock_moves.quantity = 1.234500`. |
| **P1.11b** — błędna jednostka z requestu | **OBALONA** | `uom: 'box'` przy `qty_kg` odrzucone (`uom_mismatch`), `qtyUnits/unitsUom='box'` odrzucone (`uom_conversion_unavailable`) — serwer nie zapisał ilości z obcą jednostką. |
| **P1.12** — częściowo zarezerwowane LP przenoszone w całości | **NIEROZSTRZYGNIĘTA** | Nietknięta — zabrakło czasu na postawienie ścieżki skanera (`lib/warehouse/scanner/movement.ts`); nie potwierdzam ani nie obalam. |
| **P1.13** — short pick zostawia osieroconą rezerwację | **POTWIERDZONA** | Po `pickLine(6 z 10, short)`: alokacja zmniejszona do `6.000`, ale LP nadal `quantity 20 / reserved_qty 10` — 4 kg zablokowane bez żywej alokacji. |
| **P1.14** — waste cross-site | **POTWIERDZONA** | LP w zakładzie B: 10→6 kg, a `adjustment −4` ostemplowany `site_id` **zakładu A** (site WO) — B traci towar bez ruchu, A ma ruch bez towaru. |

**Bilans 13 tez zgłaszającego:** 10 potwierdzonych w całości, 1 rozszczepiona (P0.1: decyzja produktowa + potwierdzona dziura),
1 częściowo obalona (P1.11: skala tak, jednostka nie), 1 nietknięta (P1.12).

---

## Znaleziska POZA listą tez (wyszły przy odtwarzaniu)

1. **Cały moduł RMA jest martwy.** `outbox_events_event_type_check` nie zawiera ani jednego z
   `shipping.rma.created/approved/received/processed`, a `emitOutbox` wstawia bez `on conflict`.
   Każda z czterech akcji rzuca `23514` → `withOrgContext` wycofuje transakcję → `persistence_failed`.
   `shipping.rma.*` nie występuje **w żadnej migracji** ani w `packages/outbox/src/events.enum.ts`
   (źródło prawdy dla CHECK-a). To nie jest brak funkcji „restock" — to brak przejść stanu w ogóle.
2. **Wielo-co-produktowy demontaż jest strukturalnie niewykonalny.** `registerDisassemblyOutput`
   wymaga KOMPLETU co-produktów z BOM-u (`co-product-mismatch`), ale **każdy** wiersz `wo_outputs`
   dostaje `ext_jsonb.disassembly_input_lp_id = inputLpId`
   ([register-disassembly-output.ts:440](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts) i
   [:523](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts)),
   a unikalny indeks `uq_wo_outputs_disassembly_input (org_id, wo_id, disassembly_input_lp_id)`
   (migracja 411) dopuszcza **jeden** taki wiersz. BOM z 3 co-produktami → `23505` na pierwszym wywołaniu.
   Dowód działa dopiero po zredukowaniu BOM-u do jednego co-produktu.
3. **Ironia bramki kosztowej.** Output 103 kg przy 100 kg konsumpcji **surowca bez WAC** jest
   blokowany przez `wac_un_costed`. Output 100 kg przy ZEROWEJ konsumpcji przechodzi — bo nie ma
   czego wycenić. Konsumpcja realnego materiału utrudnia rejestrację outputu bardziej niż jej brak.
4. **PILNE — `pick-actions.ts` NIE PARSUJE SIĘ w bieżącym drzewie.** Plik
   [pick-actions.ts](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts>)
   zmieniony o **00:08** (równolegle, przez inny tor) ma błąd składni w linii 69: w komentarzu SQL
   wewnątrz template literala otwartego w linii 55 są **backticki**, które ten literal zamykają:
   ```
   69:  -- session's. `expiry_date < current_date` compared a
   ```
   Potwierdzone kompilatorem TypeScriptu (`sf.parseDiagnostics` → 1 błąd, `line 69: ',' expected`),
   nie tylko parserem vitest/oxc. **Zgodnie z zakresem zadania NIE naprawiałem tego** — ale dopóki
   backticki nie zostaną wymienione na apostrofy, cały moduł shipping nie przechodzi typecheck,
   builda ani testów.
   Mój wynik **P1.13 pozostaje ważny** — zmierzyłem go o 00:00, przed tą edycją, a sama edycja
   dotyczy strefy czasowej przy `expiry_date` w bramce QA, nie `reserved_qty`.

5. **Baza `monopilot_qty` miała nieaktualny `outbox_events_event_type_check`** (15 wartości zamiast
   ~190 z migracji 482). Naprawiłem to w swojej bazie **przed** rozstrzygnięciem P0.5 (repo-wy gate
   `apps/web/tests/pg/schema-drift.pg.test.ts` przechodzi 18/18). Warto sprawdzić, czy inne klony
   i prod nie mają tego samego dryfu — to by tłumaczyło ciche `persistence_failed` w wielu modułach.

---

## Pełne zapisy przed/akcja/po

### P0.1a — DECYZJA PRODUKTOWA (nie błąd)

```
PRZED:  LP surowca 100 kg; brak ruchów
AKCJA:  recordDesktopConsumption(100 kg)  → ok, LP 100→0, consume_to_wo +100
AKCJA:  registerOutput({ qty_kg: '103' }) → ok, mass_balance_warning{ warn_pct: 0.02 }
PO:     nowe LP 103 kg (received) + receipt +103; moveSum 100 → 203
```
**Ale** — po jawnym włączeniu progu:
```
AKCJA:  tenant_variations.feature_flags = {"massbalance_threshold_pct":"1"}
AKCJA:  registerOutput({ qty_kg: '103' }) przy 100 kg konsumpcji
        → ProductionActionError: insufficient_input_for_output
PO:     brak nowego LP, brak nowego ruchu
```
Bramka blokująca jest **działającą konfiguracją** (`register-output.ts` — `cfg.block_pct` z
`tenant_variations.feature_flags->>'massbalance_threshold_pct'`, domyślnie 0, a warunek `block`
wymaga `block_pct > 0`). Domyślne „ostrzegaj, nie blokuj" to świadomy kontrakt, nie przeoczenie.
**Do rozstrzygnięcia przez ownera:** czy zakład mięsny ma mieć ten próg domyślnie włączony.

### P0.1b — POTWIERDZONA

```
PRZED:  tenant_variations.feature_flags = {"massbalance_threshold_pct":"1"}  (próg WŁĄCZONY)
        WO bez ani jednej konsumpcji; LP produktu: brak
AKCJA:  registerOutput({ qty_kg: '100' })
        → ok, output_id + lp_id, BEZ ostrzeżenia i BEZ blokady
PO:     nowe LP 100 kg (received) + stock_move receipt +100
WERDYKT: 100 kg powstało z niczego mimo skonfigurowanego progu — POTWIERDZONE
```
Przyczyna: `evaluateMassBalanceGate` robi `if (!gate || gate.posted_consumption_kg === '0' || ...) return undefined;`,
a sam SQL warunkuje `block` przez `posted_consumption_kg > 0`. Zero konsumpcji = brak bramki, niezależnie od konfiguracji.

### P0.2 — POTWIERDZONA

```
PRZED:  LP wejściowe 100 kg → skonsumowane (consume_to_wo +100); moveSum 100
AKCJA:  registerDisassemblyOutput({ inputLpId, outputs: [{ coA, qtyKg: '105' }] })
        → { ok: true, mass_balance_warning: { input_kg: 100, output_kg: 105, warn_pct: 0.02 } }
PO:     nowe LP co-produktu: 105.000000 kg, status=received, LICZBA RUCHÓW = 0
        stock_moves całej org: wyłącznie consume_to_wo +100 (moveSum 100)
WERDYKT: 5 kg rozmnożone; 105 kg zapasu bez kanonicznego receipt — POTWIERDZONE
```

### P0.3 — POTWIERDZONA

```
PRZED:  konsumpcja 100 kg, registerOutput 100 kg → output LP 100.000000 (received)
                                                 + stock_move receipt +100
        completeWo → ok, wo_executions.status = 'completed'
AKCJA:  cancelWo({ reasonCode: 'entry_error' })
        → { ok: true, status: 'cancelled' }
PO:     output LP: quantity = 0.000000, status = 'destroyed'
        ruchy tego LP: [ receipt +100.000000, status 'completed' ]  ← JEDYNY wpis
WERDYKT: 100 kg zniknęło ze stanu, księga nadal twierdzi że przyjęto 100 — POTWIERDZONE
```
Uwaga o zakresie: przy WO w `in_progress` ta sama akcja **odmawia**
(`live_output_lps_present` — „void each output before cancelling"). Dziura dotyczy wyłącznie
ścieżki `previousStatus === 'completed'`, dokładnie tak jak w tezie.

### P0.4 — POTWIERDZONA

```
PRZED:  wo_outputs: [ +10.000 (lp_id = LP-X) ];  LP-X = 10.000000 kg (received)
        ruchy LP-X: [ receipt +10 ]
AKCJA:  voidWoOutput({ reasonCode: 'wrong_quantity', signature: PIN, replacement: { qtyKg: '8' } })
        → { ok: true }
PO:     wo_outputs: [ +10.000 (LP-X), −10.000 (lp_id NULL, correction_of), +8.000 (lp_id NULL) ]
        LP-X: quantity = 0.000000, status = 'destroyed'
        ruchy LP-X: [ receipt +10, adjustment −10 (output_voided) ]
        license_plates dla produktu: BRAK LP na 8 kg
WERDYKT: logicznie 10−10+8 = 8 kg, fizycznie 0 kg — POTWIERDZONE
```

### P0.5 — POTWIERDZONA

```
PRZED:  RMA status 'approved', linia quantity_expected 5, quantity_received 0
        license_plates: {} ; stock_moves: [] ; moveSum 0
AKCJA:  receiveRma({ lines: [{ lineId, quantityReceived: '5' }] })
        → { ok: false, error: 'persistence_failed' }
        (przyczyna z logu: 23514 outbox_events_event_type_check, emitOutbox('shipping.rma.received'))
AKCJA:  processRma({ disposition: 'restock' })
        → { ok: false, error: 'invalid_state' }  (bo nagłówek nadal 'approved')
PO:     license_plates: {} ; stock_moves: [] ; quality_holds: 0
        rma_lines.quantity_received = 0.000 (transakcja wycofana)
WERDYKT: zwrot nie wraca do magazynu — POTWIERDZONE (i to mocniej: akcja w ogóle nie kończy się sukcesem)
```

Częściowy commit — osobny pomiar:
```
PRZED:  RMA 'approved', linia A quantity_received = 0
AKCJA:  receiveRma({ lines: [ {A, '5'}, {nieistniejące-uuid, '3'} ] })
        → { ok: false, error: 'not_found' }
PO:     linia A quantity_received = 5.000  ← UTRWALONE
        nagłówek RMA nadal 'approved'
WERDYKT: `withOrgContext` commituje przy zwykłym `return` — POTWIERDZONE
```

### P0.6 — POTWIERDZONA

```
PRZED:  LP 20.000000 kg; stock_moves: [] ; wo_waste_log: puste
AKCJA:  recordWaste({ qty_kg: '5', shift_id: 'A' })            (bez lp_id)
        → { waste_id, qty_kg: '5' }
AKCJA:  recordDesktopConsumption({ qty: '4', reasonCode: 'silo_draw' })  (bez lpId)
        → { ok: true, consumedQty: '8.000', lpId: null }
PO:     LP nadal 20.000000 kg ; stock_moves: [] ; moveSum 0
        wo_waste_log: [ { qty 5.000, lp_id null } ]
        wo_material_consumption: [ ..., { qty 4.000, lp_id 00000000-0000-0000-0000-000000000000 } ]
WERDYKT: bilans „stan + strata" = 25 kg z wejścia 20 kg; konsumpcja 4 kg bez ubytku — POTWIERDZONE
```
Zastrzeżenie: nie ustaliłem, czy `silo_draw` ma być rejestrowany w zewnętrznym rejestrze silosu.
Zmierzony fakt to rozjazd zapas↔proces; **intencja wymaga decyzji ownera**.

### P0.7 — POTWIERDZONA

```
PRZED:  LP 10.000000 kg; stock_moves: []
AKCJA:  recordWaste({ qty_kg: '4', lp_id }) → { waste_id, qty_kg: '4' }
PO(1):  LP 6.000000 kg ; stock_moves: [ adjustment −4.000000 (production_waste) ]
        wo_waste_log: [ +4.000 ]
AKCJA:  voidWasteEntry({ reasonCode: 'entry_error' }) → { ok: true }
PO(2):  LP nadal 6.000000 kg  ← BEZ ZMIANY
        stock_moves nadal: [ adjustment −4.000000 ]  ← brak +4
        wo_waste_log: [ +4.000 (lp_id X), −4.000 (correction_of, lp_id NULL) ]  → netto strata 0
WERDYKT: strata anulowana księgowo, 4 kg towaru nadal nie ma — POTWIERDZONE
```

### P0.8 — POTWIERDZONA

```
PRZED:  LP 10.000000 kg; stock_moves: []
AKCJA:  recordDesktopConsumption({ qty: '4', lpId }) → ok
PO(1):  LP 6.000000 ; ruchy: [ consume_to_wo +4.000000 (production_consume) ]
AKCJA:  reverseConsumption({ reasonCode: 'entry_error', signature: PIN }) → { ok: true }
PO(2):  LP 10.000000  ← stan poprawny
        ruchy: [ consume_to_wo +4.000000, adjustment −4.000000 (consumption_reversed) ]
        agregat: consume_to_wo suma +4 (n=1) | adjustment suma −4 (n=1)
WERDYKT: LP wzrosło o 4, a zapisano UJEMNY adjustment — POTWIERDZONE
```
Konwencja potwierdzona w kodzie referencyjnym, nie z pamięci:
[direct-adjust-actions.ts](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts>) —
`const signedQuantity = input.direction === 'increase' ? input.quantity : microToDecimal(-toMicro(input.quantity));`
Dodatkowo `stock_moves_quantity_sign_check` wymusza `quantity >= 0` dla WSZYSTKICH typów poza
`adjustment`, więc dla `adjustment` znak jest jedynym nośnikiem kierunku — i tu jest odwrócony.

### P0.9 — POTWIERDZONA (oba scenariusze)

Scenariusz B (duplikacja):
```
PRZED:  brak ruchów
AKCJA:  registerOutput({ qty_kg: '100' })
PO:     w bazie: stock_moves = [ receipt 100.000000 ], lp_state_history = [ null→received, production_output ]
        listStockMoves({ limit: 100 }) → total: 2, oba dla TEGO SAMEGO lpId i timestampu:
          { source: 'stock_move', moveType: 'receipt',    quantity: '100.000000' }
          { source: 'lp_state',   moveType: 'production', quantity: '100.000000' }
WERDYKT: jedno zdarzenie fizyczne, dwie pozycje = 200 kg wejścia dla LP o stanie 100 kg — POTWIERDZONE
```
Scenariusz A (historia zmienia przeszłość):
```
PRZED:  output LP 100 kg; unified: [ stock_move/receipt 100, lp_state/production 100 ]
AKCJA:  recordWaste({ qty_kg: '40', lp_id: outputLp })  → ok
PO:     LP 60.000000
        unified: [ stock_move/adjustment −40, lp_state/production 60.000000, stock_move/receipt 100 ]
                                                              ↑ historyczna pozycja spadła ze 100 na 60
WERDYKT: syntetyczny wpis historyczny czyta bieżące `lp.quantity` — POTWIERDZONE
```

### P0.10 — POTWIERDZONA

```
PRZED:  LP 10.000000 kg (reserved 6); stock_moves: [] ; moveSum 0
AKCJA:  generateBol(...) → { ok: true, bolRef }
AKCJA:  shipShipment(shipmentId) → { ok: true }
PO(1):  LP 4.000000 ; ruchy: [ issue 6.000000 (shipment_dispatch, status completed) ] ; moveSum 6
AKCJA:  cancelShipment({ reasonCode: 'operator_error', signature: PIN }) → { ok: true }
PO(2):  LP 10.000000  ← stan przywrócony
        ruchy: [ issue 6.000000 ] ← BEZ ZMIAN, brak return/adjustment, issue nadal 'completed'
        agregat: issue suma +6.000000 (n = 1)
WERDYKT: księga twierdzi, że 6 kg wyjechało; towar stoi na półce — POTWIERDZONE
```

### P1.11a — POTWIERDZONA

```
AKCJA:  registerOutput({ qty_kg: '1.2345' }) → ok
PO:     wo_outputs.qty_kg      = 1.235       (numeric(12,3) — ZAOKRĄGLONE)
        license_plates.quantity = 1.234500   (numeric(18,6))
        stock_moves.quantity    = 1.234500   (numeric(18,6))
WERDYKT: ta sama operacja zapisana jako dwie różne liczby, różnica 0.0005 kg/operację — POTWIERDZONE
```

### P1.11b — OBALONA

```
AKCJA:  registerOutput({ qty_kg: '300', uom: 'box' })
        → ProductionActionError: uom_mismatch          (nic nie zapisane)
AKCJA:  registerOutput({ qtyUnits: '2', unitsUom: 'box', uom: 'box' })
        → ProductionActionError: uom_conversion_unavailable  (nic nie zapisane)
WERDYKT: OBALONE — serwer odrzuca jednostkę sprzeczną z pozycją/WO; scenariusz „300 pudeł
         zamiast 300 kg" nie odtworzył się.
```

### P1.13 — POTWIERDZONA

```
PRZED:  LP quantity 20.000000, reserved_qty 10.000000
        inventory_allocations: [ 10.000 'allocated' ]
        pick_list_lines: [ quantity_to_pick 10.000 ]
AKCJA:  pickLine(lineId, { quantityPicked: '6', shortPickReason: 'damaged' }) → { ok: true }
PO:     LP quantity 20.000000, reserved_qty 10.000000   ← reserved BEZ ZMIANY
        inventory_allocations: [ 6.000 'picked' ]        ← jedyna alokacja, zmniejszona
WERDYKT: 4 kg zarezerwowane bez żywej alokacji — zapas niedostępny dla nikogo — POTWIERDZONE
```

### P1.14 — POTWIERDZONA

```
PRZED:  site A = site WO ; site B = site LP ; LP(B) = 10.000000 kg
AKCJA:  recordWaste(ctx, woId /*site A*/, { qty_kg: '4', lp_id: LP(B) })
        → { waste_id, qty_kg: '4' }   (bez ostrzeżenia o niezgodności zakładu)
PO:     LP(B).quantity = 6.000000        ← ubytek w zakładzie B
        stock_moves.site_id = site A     ← ruch −4.000000 w zakładzie A
WERDYKT: B traci 4 kg bez własnego ruchu, A ma ruch −4 bez zmiany stanu — POTWIERDZONE
```

---

## Czego NIE sprawdziłem

- **P1.12** (częściowo zarezerwowane LP przenoszone w całości przez `scanner/movement.ts`) —
  nietknięta, brak czasu na postawienie ścieżki skanera.
- Nie sprawdzałem współbieżności (lost update) — wszystkie sondy jednowątkowe.
- Nie sprawdzałem WAC/FIFO ani wartości finansowej poza minimum potrzebnym do przejścia bramki
  `wac_un_costed`.
- Ścieżka PO → GRN → LP (`receive-po-line-core.ts`) — nie odpalona; teza o braku kanonicznego
  `receipt` przy przyjęciu PO pozostaje nieweryfikowana (P0.9 potwierdzone na ścieżce outputu, nie GRN).

## Zastrzeżenia do własnej metody (żeby nie przeszacować)

- Sondy działają na roli `admin`, dla której `hasPermission` przepuszcza wszystko
  (`r.code = any('{owner,admin,org_admin}')`). Nie unieważnia to wyników — wszystkie znalezione
  defekty leżą **za** kontrolą uprawnień, w księgowaniu ilości.
- `next/cache` jest zaślepiony (`probes/next-cache-stub.ts`), bo poza scope'em requestu Next
  `revalidatePath` **rzuca**, a rzut wewnątrz `withOrgContext` wycofuje całą transakcję — bez
  zaślepki mierzyłbym artefakt harnessu. Zaślepka upodabnia test do produkcji, nie odwrotnie;
  błąd P0.5 reprodukuje się identycznie z zaślepką i bez niej.
- W bazie `monopilot_qty` naprawiłem zdryfowany `outbox_events_event_type_check` (do wersji
  z migracji 482) **przed** rozstrzygnięciem P0.5, żeby nie zgłosić własnego dryfu jako błędu kodu.
- W trakcie pracy dwa razy pomyliłem się we własnych sondach (zły `reasonCode`, zły status SO) —
  oba objawiały się jak błąd aplikacji (`invalid_input`, `invalid_state`) i oba okazały się moje.
  Wyniki powyżej pochodzą z przebiegów po naprawieniu sond.
