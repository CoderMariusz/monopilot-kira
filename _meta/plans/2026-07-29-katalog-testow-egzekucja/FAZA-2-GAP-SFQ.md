# FAZA 2 — inwentarz GAP: Shipping / Finance / Quality / Maintenance (`SFQ`) — 72 pozycji

Wygenerowane 2026-07-29. Indeks i metodyka: [`FAZA-2-GAP-INWENTARZ.md`](FAZA-2-GAP-INWENTARZ.md).

`kat:N` = linia w `_meta/plans/2026-07-18-full-test-catalog/FULL-TEST-CATALOG.md`.
Kolumna **test dziś** pochodzi z klasyfikacji dowodu z 18-19.07 — patrz ostrzeżenie o wieku werdyktu w indeksie.

Rozkład: brak testu 28 · czerwony/pominięty 1 · zielony 43 · przeglądarka 3 · persona 27


## Sales Orders — lifecycle i przejścia (shipping/[soId])

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-003` | **draft→confirmed wymaga ship.so.confirm** — Mapowanie uprawnień na przejścia. *Kroki:* 1) user bez `ship.so.confirm` próbuje confirm; 2) user z uprawnieniem. | kat:5415 · `permissionForTransition` (`so-actions.ts:138-142`): confirm→`ship.so.confirm`, cancel→`ship.so.cancel`, inne→`ship.so.… | UI permission-disable behavior and generic forbidden reads pass, but no targeted server assertion covers both sides of `draft→confirmed` specifically with/without `ship.so.confirm`. | zielony | nie | tak | P0 |
| `SFQ-006` | **Walidacja qty linii > 0** — Odrzucenie zerowych/ujemnych ilości linii. *Kroki:* 1) utwórz/edytuj linię z qty=0 i qty<0. | kat:5433 · `normalizeSoLineQty` wymusza qty>0 (`so-actions.ts:684-687`). | Zero and malformed quantity are asserted; the catalog's explicit negative-quantity branch is not directly asserted. | zielony | nie | nie | P0 |
| `SFQ-008` | **Derywacja statusu z postępu (deriveSalesOrderStatusFromProgress)** — Priorytet derywacji delivered→…→confirmed po operacjach cząstkowych. *Kroki:* 1) doprowadź SO do mieszanych stanów (część spakowana, część picked); 2) porównaj status z oczekiwaną derywacją. | kat:5445 · precedencja `so-transitions.ts:127-152`; liczy tylko „żywe" alokacje (`LIVE_ALLOCATION_SQL` `so-transitions.ts:29-30`,… | Status derivation covers shipped sibling, picked, partially-picked, and allocated precedence; the complete delivered→partially-delivered→packing/packed→confirmed precedence matrix is not asserted. | zielony | nie | nie | P1 |

## Alokacja / FEFO (shipping/[soId] → Allocate)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-021` | **Konwersja UoM linii zamówienia → jednostki magazynowe** — Przeliczenie box/each/kg przez pack-hierarchy. *Kroki:* 1) linia w `box` (each_per_box, net_qty_per_each); 2) allocate; 3) porównaj kg. | kat:5527 · `L/shipping/order-line-uom.ts:134-148`; nierozwiązywalny UoM → błąd `unresolved_uom`. | Case/box conversion and unresolved hierarchy are asserted; the catalog's complete box/each/kg conversion matrix is not. | zielony | nie | nie | P0 |
| `SFQ-022` | **Near-expiry WARN — soft, nieblokujący** — Ostrzeżenie dla LP w oknie near-expiry (feature flag). *Kroki:* 1) `near_expiry_warn_days=7` (default), LP expiry za 3 dni; 2) allocate; 3) flag=0 → brak warn. | kat:5533 · `readNearExpiryWarnDays` z `tenant_variations.feature_flags` (`so-actions.ts:136,157-175`); `nearExpiryWarning` addytyw… | Near-expiry warning, earliest date, multiple affected legs, outside-window, null-expiry, and flag-zero branches pass; the warning was not observable on a controlled production allocation. | zielony | nie | nie | P1 |

## Pick (shipping/[soId]/pick)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-025` | **Utworzenie pick listy — uprawnienie ship.pick.execute** — Gate na `createPickList`/`pickLine`/`reassign`. *Kroki:* 1) bez uprawnienia; 2) z uprawnieniem. | kat:5553 · `pick-actions.ts:31,118,233,505,607`. | UI gating and successful create-pick-list assertions pass; no targeted action assertion proves the forbidden branch for `ship.pick.execute` across create/pick/reassign. | zielony | nie | tak | P0 |
| `SFQ-026` | **Zero-pick i over-pick odrzucone** — Guard ilości picku. *Kroki:* 1) pick qty=0; 2) pick qty > alokowane. | kat:5559 · `invalid_input` (`pick-actions.ts:312`). | Short/sub-scale validation is covered, but explicit zero-pick and over-pick branches are not both asserted. | zielony | nie | nie | P0 |
| `SFQ-029` | **Pick LP zablokowanego (hold/QA/expiry) — lp_blocked_for_pick** — Re-assert food-safety w momencie picku (hold założony PO alokacji). *Kroki:* 1) allocate; 2) załóż hold na LP; 3) pick. | kat:5577 · `assertLpPickable` przez `assertNoActiveHoldForLp` + qa_status/expiry → `lp_blocked_for_pick` (`pick-actions.ts:43-77,3… | A batch-level active-hold rejection is asserted; distinct QA-unreleased and expired-at-pick branches are not. | zielony | nie | nie | P0 |

## Shipments — pack / seal / ship (shipping/shipments, [shipmentId])

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-032` | **Drugi otwarty shipment zablokowany — open_shipment_exists** — Jeden otwarty shipment na SO. *Kroki:* 1) shipment w `packing`; 2) create drugi. | kat:5597 · `BLOCKING_SHIPMENT_STATUSES=[pending,packing,packed,manifested,shipped,delivered]` → `open_shipment_exists` (`pack-acti… | A second shipment is rejected when an existing shipment is packed, but the full blocking-status set is not asserted. | brak testu | nie | nie | P0 |
| `SFQ-034` | **Double-pack i over-pack LP** — Guard `already_packed`/`invalid_input` (qty > remaining). *Kroki:* 1) spakuj LP; 2) spakuj ponownie; 3) spakuj qty>remaining. | kat:5609 · `pack-lp-into-box.ts:143-151`. | No targeted test directly asserts both repeat-pack `already_packed` and quantity-over-remaining. | brak testu | nie | nie | P0 |
| `SFQ-036` | **SSCC boxa z generate_sscc — GS1 mod-10** — Mintowanie SSCC przy packu + walidację prefixu. *Kroki:* 1) org z prefixem GS1 — pack, sprawdź SSCC-18 (check digit); 2) org bez prefixu; 3) prefix o złej długości. | kat:5621 · `public.generate_sscc($org,0)` (mig 459); `missing_gs1_prefix` / `invalid_gs1_prefix` (`pack-lp-into-box.ts:196-240`);… | A fresh production detail shows an 18-digit SSCC with a valid mod-10 digit; unit tests cover successful minting and invalid prefix, but the missing-prefix branch is not directly asserted. | zielony | nie | nie | P0 |
| `SFQ-039` | **Ship — wymagania wstępne: packed, ≥1 box, ≥1 LP, SO obecne** — Prewalidacje shipShipment. *Kroki:* 1) ship w statusie `packing`; 2) ship bez LP. | kat:5639 · `ship-actions.ts:383-394`; perm `ship.ship.confirm`. | Wrong status and no-box cases are asserted, but missing packed LP and missing SO prerequisites are not separately exercised. | zielony | nie | tak | P0 |
| `SFQ-041` | **Ship przeterminowanego LP — blokada** — Wariant expiry guardu z SFQ-040 (LP przeterminował się po packu). *Kroki:* 1) LP z expiry=jutro, pack; 2) przesuń datę/expiry; 3) ship. | kat:5651 · `lp_blocked_for_ship` (`ship-actions.ts:424-449`). | The combined food-safety pack/ship guards exist, but the catalog's distinct “expired after pack” clock/expiry scenario is not asserted. | brak testu | nie | nie | P0 |

## POD, cancel shipment, void POD, delivery note

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-047` | **Duplicate POD — invalid_state** — Guard podwójnego POD. *Kroki:* 1) recordPod; 2) recordPod ponownie. | kat:5689 · wymagany status `shipped` (`ship-actions.ts:814-816`); po pierwszym POD shipment=`delivered` → drugi = `invalid_state`;… | UI disables POD after delivery, but no targeted server test performs `recordPod` twice and asserts the second `invalid_state`. | brak testu | nie | nie | P0 |
| `SFQ-053` | **Delivery note — stały numer, read-only, site-scope** — Dokument WZ. *Kroki:* 1) pobierz dokument 2×; 2) user bez `ship.dashboard.view`. | kat:5725 · używa istniejącego `shipments.delivery_note_number` (nigdy nie mintuje), org+site scope (`delivery-note-document-action… | Stable delivery-note number plus org/site not-found behavior pass; the explicit missing `ship.dashboard.view` branch is not directly asserted. | zielony | nie | tak | P1 |

## RMA (shipping/rma, mig508)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-060` | **Uprawnienia per krok RMA** — create=`ship.so.create`, approve/receive/close=`ship.so.confirm`, process=`ship.rma.disposition`. *Kroki:* 1) każdy krok userem bez właściwego uprawnienia. | kat:5771 · `rma-actions-types.ts:118-120`; `rma-actions.ts:547`. | Create and approve paths are covered, but the full create/approve/receive/process/close permission matrix is not. | zielony | nie | tak | P0 |
| `SFQ-061` | **Walidacja tworzenia RMA — reason code, spójność klient/SO/shipment** — Odrzucenie RMA z nieaktywnym reason code lub shipmentem innego klienta/SO. *Kroki:* 1) RMA z shipmentem nienależącym do wskazanego SO; 2) nieaktywny reason. | kat:5777 · walidacje `rma-actions.ts:294-436`. | Unknown reason-code rejection is asserted; customer/SO/shipment relationship mismatch branches are not. | zielony | nie | nie | P0 |
| `SFQ-062` | **RMA na nieistniejący shipment** — Edge case — obce/nieistniejące ID. *Kroki:* 1) create RMA z random UUID shipmentu. | kat:5783 · not_found/validation error (spójność w `rma-actions.ts:294-436`); nigdy 500. | No targeted test passes a random nonexistent shipment UUID and verifies a non-500 response. | brak testu | nie | nie | P1 |
| `SFQ-063` | **Wycena RMA — total_value_gbp = Σ qty×unit_price** — Ceny linii z najnowszej `sales_order_lines.unit_price_gbp` i sumę nagłówka. *Kroki:* 1) RMA 2 linie; 2) porównaj sumę. | kat:5789 · `rma-actions.ts:397-410`. | RMA creation persists header/lines, but no exact two-line `Σ qty×unit_price` assertion proves the header total. | brak testu | nie | nie | P1 |
| `SFQ-064` | **Receive RMA — quantity_received per linia** — Zapis przyjętych ilości (approved\|receiving→received). *Kroki:* 1) receive z częściowymi ilościami. | kat:5795 · `rma-actions.ts:476-538`. | No targeted test asserts partial per-line `quantity_received` through approved/receiving→received. | brak testu | nie | nie | P1 |
| `SFQ-065` | **Process RMA — dispositions restock\|scrap\|quality_hold** — Zapis dyspozycji nagłówka i linii + audit/outbox. *Kroki:* 1) process z każdą dyspozycją. | kat:5801 · enum `rma-actions-types.ts:15,113-116`; audit `shipping.rma.processed` (`rma-actions.ts:549-585`). | The three dispositions and their processed audit/outbox payloads are not exercised by the current RMA test file. | brak testu | nie | nie | P0 |
| `SFQ-066` | **RMA disposition NIE dotyka stanów ani WAC (udokumentowany brak)** — Że `restock` NIE tworzy LP/ruchu magazynowego, `scrap` nie debetuje WAC. *Kroki:* 1) process disposition=restock; 2) sprawdź `license_plates`, movements, `item_wac_state`. | kat:5807 · brak jakiegokolwiek efektu inwentarzowego/WAC w `processRma` (`rma-actions.ts:549-585`) — dyspozycja jest tylko zapisem… | No regression assertion proves `restock`/`scrap` leave LPs, movements, and WAC untouched. | brak testu | nie | nie | P1 |

## Finance — WAC (L/finance)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-078` | **Cap kumulatywny kredytów outputu (druga rejestracja)** — `least(..., material_cost − prior_wac_booked)` przy wielu rejestracjach. *Kroki:* 1) zarejestruj output 2× tak, by druga przekraczała pozostały koszt. | kat:5883 · druga rejestracja przycięta do reszty (:147-154). | Two forward registrations totaling the material cost are asserted, but the catalog's second registration that exceeds the remaining cost is not. | zielony | nie | nie | P1 |

## Finance — valuation i koszty WO (finance/valuation, finance)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-081` | **Valuation — grand total per waluta, bez sum międzywalutowych** — `grandByCurrency`. *Kroki:* 1) itemy z WAC w GBP (i teoretycznie innej walucie); 2) raport. | kat:5903 · bucket per currency (:103-114); brak cross-currency sumy. | Grand totals are asserted for one GBP bucket, but no multi-currency result proves currencies are never summed together. | zielony | nie | nie | P1 |
| `SFQ-085` | **wo-cost-math — zaokrąglenia half-away-from-zero** — Deterministyczną arytmetykę mikro-skali. *Kroki:* 1) przypadki brzegowe dzielenia (`divMicro`). | kat:5927 · `wo-cost-math.ts:49-56`; brak floatów w torze pieniężnym. | Exact micro-unit cost arithmetic passes eight tests, but no direct positive/negative half-tie assertion isolates half-away-from-zero. | zielony | nie | nie | P2 |

## Finance — pricing / customer prices (settings/customer-prices + SO)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-088` | **Okno obowiązywania ceny — asOfDate = order_date** — `effective_from <= order_date <= effective_to`, wygrywa najnowsze effective_from. *Kroki:* 1) dwie ceny z różnymi oknami; 2) SO z order_date w środku. | kat:5947 · `fetchActiveCustomerItemPrices` (:157-194); `asOfDate` z `so-actions.ts:637-653`; walidacja `effectiveTo >= effectiveFr… | SQL ordering/window checks and expired-price fallback pass; overlapping effective windows with an `order_date` selecting the newest `effective_from` are not directly asserted end-to-end. | zielony | nie | nie | P0 |
| `SFQ-090` | **Ujemna cena — odrzucona na wejściu admina cen** — Guard non-negative. *Kroki:* 1) create customer price z `-5`; 2) z `abc`. | kat:5959 · regex `^\d+(\.\d+)?$` + `numeric(12,4)` (`customer-item-prices-actions.ts:66-72`); waluty tylko `GBP\|USD\|EUR\|PLN` (:… | Overscale and JS-number payloads are rejected, but exact `-5` and `abc` customer-price inputs are not both asserted. | brak testu | nie | nie | P0 |
| `SFQ-092` | **Uprawnienia admina cen — settings.org.read/update** — Gate list vs mutacje. *Kroki:* 1) list bez `settings.org.read`; 2) create/update/deactivate bez `settings.org.update`. | kat:5971 · `customer-item-prices-actions.ts:243,259` (read), `:278,332,386` (update). | Fresh action tests reject list without `settings.org.read` and create/deactivate without `settings.org.update`; the explicit unauthorized update branch is not directly asserted. | brak testu | nie | tak | P0 |

## Quality — Holds (quality/holds)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-094` | **Statusy aktywne holda i typy referencji** — `open\|investigating\|escalated\|quarantined` aktywne; ref `lp\|batch\|wo\|po\|grn`; batch jako TEKST. *Kroki:* 1) holdy każdego typu; 2) batch po batch_number (nie UUID). | kat:5985 · `hold-actions.ts:41,104`; batch w `reference_text` (:136-139,315,322 — guard 22P02). | Batch reference text and active-hold handling are asserted, but the full `lp | zielony | nie | nie | P1 |
| `SFQ-095` | **Release holda — e-sign + dyspozycje** — 4 dyspozycje i mapowanie na DB + skutki dla LP. *Kroki:* 1) release z każdą z `release\|scrap\|rework\|partial` + e-sign `qa.hold.release`. | kat:5991 · mapowanie na `release_as_is\|scrap\|rework\|other` (:746-753); LP: scrap→`rejected`, inne→`released` (:755); dispositio… | Release e-sign, history, permission, and LP restoration are green; all four catalog dispositions and their exact DB mapping are not separately asserted. | zielony | nie | tak | P0 |
| `SFQ-099` | **Warehouse LP unblock path** — `releaseHoldFromWarehouseLpUnblock`. *Kroki:* 1) LP `blocked`+`on_hold`; 2) unblock z e-sign; 3) LP tylko `on_hold` bez holda (oczekuj `no_open_hold`); 4) LP w złym stanie (`invalid_state`). | kat:6015 · `hold-actions.ts:1016-1081`; wymagane `quality.hold.release` (:1028); source `warehouse_lp_unblock`. | Permission denial and successful warehouse-unblock e-sign/hash are asserted; `no_open_hold` and `invalid_state` branches are not directly exercised. | zielony | nie | tak | P1 |
| `SFQ-100` | **Uprawnienia holdów — create/release/list** — `quality.hold.create` (:692), `quality.hold.release` (:992,1028), list/detail `quality.dashboard.view` (:460,544); probe UI `canReleaseHolds` fail-cl… *Kroki:* 1) każda akcja bez uprawnienia. | kat:6021 · forbidden; probe zwraca false, nie rzuca. | Server create/release/list gates and UI disabled controls are covered, but `canReleaseHolds` fail-closed behavior on a DB probe error has no targeted assertion. | zielony | TAK | tak | P0 |

## Quality — NCR (quality/ncrs)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-103` | **Investigation — draft\|open\|reopened → investigating** — Zapis root cause / immediate / corrective action. *Kroki:* 1) updateNcrInvestigation na open; 2) na closed (błąd). | kat:6041 · tylko nieterminalne (:685); przejście :701; corrective do `ext_jsonb.investigation.corrective_action` (:708-716). | Investigation persistence and the open→investigating update pass; no targeted action assertion rejects an update of a closed NCR. | zielony | nie | nie | P0 |
| `SFQ-104` | **Close NCR — e-sign qa.ncr.close + idempotencja** — Zamknięcie z podpisem, blokada double-close. *Kroki:* 1) close z e-sign; 2) close ponownie. | kat:6047 · FOR UPDATE (:805), reject closed/cancelled (:810), e-sign (:824), `closure_signature_hash` + resolution w ext_jsonb (:8… | Close e-sign and receipt-hash persistence pass, including rejection of a missing hash; double-close idempotence is not directly asserted. | brak testu | nie | tak | P0 |
| `SFQ-105` | **Close critical NCR wymaga quality.ncr.close_critical** — Split uprawnień zamykania. *Kroki:* 1) user z samym `quality.ncr.create` zamyka critical (fail); 2) minor (OK); 3) user z close_critical zamyka critical. | kat:6053 · any-of do wejścia (:788-792), critical wymaga close_critical (:814-818). | Critical/major/minor signed-close paths and permission sets are exercised, but the exact “create-only user closes critical→forbidden, minor→OK” matrix is not isolated. | zielony | nie | tak | P0 |

## Quality — Inspections (quality/inspections)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-108` | **Create inspection — pending, numeracja, gate assign** — `createInspection`. *Kroki:* 1) create dla ref `lp\|grn\|wo_output`. | kat:6073 · perm `quality.inspection.assign` (:810); `status='pending'`, numer z `next_quality_inspection_number` (:846). | Pending creation, numbering, assignment permission, site binding, and GRN reference resolution are covered; the complete `lp | zielony | nie | tak | P0 |
| `SFQ-110` | **Record result — pending\|in_progress → in_progress** — Gate `quality.inspection.execute` i status. *Kroki:* 1) record na `passed` (błąd); 2) na pending. | kat:6085 · `inspection-actions.ts:895,904`. | Recording results and transition to `in_progress` pass; rejection of result recording on a terminal `passed` inspection is not directly asserted. | zielony | nie | nie | P0 |

## Quality — CCP monitoring (quality/ccp-monitoring)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-118` | **Granice limitów — dokładne porównanie dziesiętne** — value==min i value==max są W limicie; null-bound otwarty; brak błędów floatów (np. 7.999999 vs 8). *Kroki:* 1) odczyty na granicach i tuż za nimi. | kat:6135 · `value<min`→false, `value>max`→false (:317-321); `compareDecimalStrings` BigInt (:299-315). | Decimal-string comparison is exercised for ordinary bilateral/min-only values, but exact min, exact max, `7.999999`, and open-null-bound edges are not all asserted. | brak testu | nie | nie | P0 |
| `SFQ-120` | **Breach bez woId / bez LP w oknie — noty fallback** — Ścieżki bez auto-holdu. *Kroki:* 1) breach bez WO; 2) breach z WO bez outputów w oknie. | kat:6147 · nota "Auto-hold not created…" / "work-order level only…" (:748-752); deviation.hold_id = pierwszy hold LP else hold WO… | Breach without `woId` and null `hold_id` pass; the distinct WO-with-no-output fallback note/WO-only hold branch is not directly asserted and adjacent WO breach cases are red. | czerwony/pominięty | nie | nie | P1 |
| `SFQ-121` | **Upsert CCP — min ≤ max, tylko plan_edit** — Walidację limitów i gate. *Kroki:* 1) upsert min=8 max=2 (fail zod refine); 2) upsert bez `quality.haccp.plan_edit`; 3) deactivate. | kat:6153 · refine (:81-87); gate upsert :439, deactivate :535. | UI validation rejects min>max and server tests enforce plan-edit-only upsert; CCP deactivation and its gate are not directly asserted. | brak testu | nie | nie | P0 |
| `SFQ-122` | **recordMonitoring — CCP nieaktywny / gate deviation_override** — Guardy zapisu odczytu. *Kroki:* 1) record na deaktywowanym CCP; 2) bez `quality.ccp.deviation_override`. | kat:6159 · "CCP not found or inactive" (:627-637, FOR UPDATE); gate :618. | General permission gates are covered, but no isolated assertion records against an inactive CCP and checks the exact “not found or inactive” result. | zielony | nie | tak | P0 |

## Quality — CCP deviations (quality/ccp-deviations)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-124` | **Resolve deviation — e-sign + dyspozycje** — `open→resolved` z dispositions `corrected\|product_held\|disposed`. *Kroki:* 1) resolve z e-sign `qa.haccp.ccp.deviation`; 2) resolve ponownie ("already resolved"). | kat:6173 · `ccp-deviation-actions.ts:203-283`; FOR UPDATE (:233), reject resolved (:238), `esign_ref=signatureId` (:269), UPDATE g… | Resolve e-sign, open→resolved guard, permission denial, and double-resolve rejection pass; all three catalog dispositions are not separately asserted. | zielony | nie | tak | P0 |

## Quality — Cold chain (quality/cold-chain)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-127` | **Upsert zakresu temperatur — min ≤ max, jeden per item** — `product_temp_ranges`. *Kroki:* 1) upsert min>max (`invalid_input`); 2) upsert 2× (conflict-update, nie duplikat). | kat:6193 · `cold-chain-actions.ts:184-191`; on conflict `(org_id,item_id)` (:197-207); perm `quality.coldchain.manage` (:195). | Cold-chain UI renders configured ranges, but no targeted action test covers min>max rejection plus `(org_id,item_id)` conflict-update idempotence. | brak testu | nie | tak | P0 |
| `SFQ-128` | **Condition check — logika inRange** — inRange gdy: brak zakresu, `requires_check=false`, brak bounds, lub min≤measured≤max. *Kroki:* 1) każdy wariant, w tym równość z granicą. | kat:6199 · `cold-chain-actions.ts:235-239`; breach = `!inRange && hasBounds` (:240); perm `quality.coldchain.record` (:228). | In-range, out-of-range, max-only, and no-temperature-config branches pass; `requires_check=false`, fully unbounded, and exact-boundary cases are not all isolated. | brak testu | nie | tak | P0 |
| `SFQ-130` | **Dedup holda cold-chain w oknie 24h** — `findExistingColdChainHold`. *Kroki:* 1) 2 breache tego samego LP w <24h; 2) po 24h. | kat:6211 · aktywny hold lp z reason `Cold-chain breach:%` <24h → reuse (:135-151); po 24h nowy hold. | Reuse of a recent active cold-chain hold passes; creation of a fresh hold after the 24-hour boundary is not asserted. | zielony | nie | nie | P1 |
| `SFQ-131` | **invalid_input — brak itemId / NaN temperatura** — Walidację wejścia. *Kroki:* 1) check bez itemId; 2) measured=NaN/Infinity. | kat:6217 · `cold-chain-actions.ts:220`. | No targeted test covers missing `itemId` and non-finite measured temperature as separate `invalid_input` cases. | brak testu | nie | nie | P1 |
| `SFQ-132` | **Widok cold-chain — tier odczytu i limit 50** — READ = record OR manage; recent checks ≤50; fail-closed `load_failed`. *Kroki:* 1) user z każdym uprawnieniem; 2) >50 checków. | kat:6223 · `list-cold-chain.ts:46,48,80-96,137,174`. Uwaga: `hasReadPermission` NIE ma fallbacku super-ról (patrz SFQ-171). | Production renders the read-only cold-chain page and fresh UI tests cover populated/empty states; any-of read permissions, the 50-row cap, and fail-closed load error are not all asserted. | brak testu | nie | tak | P1 |

## Quality — Complaints + CAPA (quality/complaints)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-134` | **Convert complaint → NCR — mapowanie severity + idempotencja** — `convertComplaintToNcr`. *Kroki:* 1) convert (critical→critical, high→major, low/medium→minor); 2) convert 2×; 3) convert już converted. | kat:6237 · :397-532; FOR UPDATE (:429); already-linked → istniejący ncr_id (:434); `already_converted` (:435); reuse NCR ref compl… | Atomic complaint→NCR conversion, major severity mapping, linking, and outbox pass; all severity mappings and retry/already-converted branches are incomplete. | zielony | nie | nie | P0 |
| `SFQ-135` | **CAPA create — corrective\|preventive, source complaint\|ncr** — Model CAPA. *Kroki:* 1) CAPA dla complaint i dla NCR. | kat:6243 · `capa_actions` insert `status='open'` (:566); gate `quality.ncr.create` (:545). | Complaint-sourced corrective CAPA creation is green; preventive and NCR-sourced variants are not both asserted. | zielony | nie | nie | P1 |
| `SFQ-136` | **CAPA resolve — e-sign qa.capa.close + double-close** — Zamknięcie CAPA. *Kroki:* 1) resolve z e-sign; 2) resolve 2× (`already_closed`); 3) złe hasło (`esign_failed`). | kat:6249 · :640-738; FOR UPDATE (:677), reject closed (:682), `esign_ref=subjectHash` (:686-701), `esign_failed` (:703), guard `st… | CAPA close signs, stores the receipt, and rejects missing/bad credentials; the catalog's explicit second-close `already_closed` case is not asserted. | brak testu | nie | tak | P0 |

## Quality — HACCP plans (quality/haccp)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-137` | **Plan create — draft v1; aktywacja tylko z draft + e-sign** — Lifecycle planu. *Kroki:* 1) upsert nowego planu; 2) activate z e-sign `qa.haccp.plan.activate`; 3) activate ponownie (fail — już active). | kat:6257 · insert `status='draft',version=1` (`haccp-plan-actions.ts:276-279`); activate: FOR UPDATE (:320), `status!=='draft'`→th… | Draft v1 create, signed activation, and plan-edit gating pass; repeat activation of the already-active plan is not directly asserted. | zielony | nie | tak | P0 |
| `SFQ-139` | **Nowa wersja planu — tylko z active, kopiuje CCP z suffiksem** — `newPlanVersion`. *Kroki:* 1) newVersion z draft (fail); 2) z active; 3) sprawdź CCP `ccp_code-vN`. | kat:6269 · source active + lock (:401-404); draft v+1 (:410-431); kopiowanie CCP (:450-486). | Active-plan versioning and CCP cloning with version increment pass; rejection when the source is still draft is not directly asserted. | zielony | nie | nie | P1 |

## Quality — Specifications (quality/specifications)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-140` | **Create spec — draft, wersjonowanie per product+spec_code, ≥1 parametr** — `createSpec`. *Kroki:* 1) create bez parametrów (fail); 2) create 2× ten sam spec_code (v1, v2); 3) równoległe create (advisory lock). | kat:6277 · `spec-actions.ts:318-413`; lock (:338); version=max+1 (:341-349); ≥1 param (:86); sort_order=index (:368-406); wszystki… | Next-version creation, ordered parameter inserts, and minimum-one schema behavior have coverage, but concurrent advisory-lock numbering is not executed against Postgres. | zielony | nie | nie | P0 |
| `SFQ-141` | **Edycja/usuwanie parametrów tylko w draft** — `requireDraftSpec` + re-sekwencja sort_order. *Kroki:* 1) update/delete parametru w active (fail); 2) delete w draft → sprawdź sort_order. | kat:6283 · :138-150 (throw), enforce :430,561; resekwencja :602-617; audit :508,619. | UI draft-only edit/delete controls and parameter actions are exercised; server rejection on active plus post-delete sort-order resequencing are not both directly asserted. | brak testu | nie | nie | P0 |
| `SFQ-142` | **Flow zatwierdzenia — draft→under_review→active z e-sign** — `submitSpecForReview` + `approveSpec`. *Kroki:* 1) approve z draft (fail — musi być under_review); 2) submit; 3) approve z e-sign `qa.spec.approve`. | kat:6289 · submit guard `status='draft'` (:655); approve: FOR UPDATE (:682), musi być under_review (:687), e-sign (:689-698), `app… | Submit→under-review→signed active and evidence columns pass; direct approval from draft rejection is not isolated. | zielony | nie | tak | P0 |
| `SFQ-143` | **Supersede spec** — `status='superseded'` + `superseded_by`, bez e-sign, idempotencja. *Kroki:* 1) supersede active; 2) supersede 2×. | kat:6295 · :721-744, guard `status<>'superseded'` (:728-733). | Superseding during approval is covered, but the standalone active→superseded action, `superseded_by`, and second-call idempotence are not completely asserted. | zielony | nie | tak | P1 |

## Quality — Trace + mass balance (quality/trace)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-144` | **Trace forward/backward/both — filtr kierunkowy genealogii** — `includeGenealogyNode`: self zawsze; ancestor tylko backward\|both; descendant tylko forward\|both. *Kroki:* 1) run trace w 3 kierunkach dla LP z przodkami i potomkami. | kat:6303 · `trace-actions.ts:174-178`; graf nodes/edges (`buildTraceReport` :700-968): supplier→PO→GRN→input_lp→WO→output_lp→shipm… | Fresh trace tests build 2- and 3-level genealogy with shipment/customer edges; forward/backward/both filtering is not tested as a three-way matrix. | brak testu | nie | nie | P0 |
| `SFQ-145` | **Seed resolution — lp/batch/item + limity truncation** — Wyszukiwanie seedów i warstwę truncation. *Kroki:* 1) trace po lp_code, batch_number, item_code; 2) >200 LP / >500 batch. | kat:6309 · `resolveSeedLpIds` (:201-250); limity LP=200, BATCH=500, ITEM=500 (`trace-mass-balance.ts:12-14`); over-limit → warstwa… | LP seed truncation and cap propagation pass; batch/item seed resolution and their distinct 500-row limits are incomplete. | zielony | nie | nie | P1 |
| `SFQ-146` | **Mass balance — deltaKg per node i epsilon** — Wzory bilansu masy. *Kroki:* 1) WO: input 100 kg → output 95 + waste 4 + remaining 1; 2) input 100 → 90 (delta 10). | kat:6315 · **deltaKg = inputKg − (outputKg + wasteKg + remainingKg)** (`trace-mass-balance.ts:112`); balanced gdy \|delta\| ≤ 0.00… | BigInt mass-balance node and total formulas, positive delta, and balanced examples pass; exact epsilon boundary and six-decimal percentage behavior are not separately asserted. | zielony | nie | nie | P0 |
| `SFQ-147` | **Mass balance — non-kg do unreconciled, item-trace bez bilansu** — Partycjonowanie kg-only i skip dla item. *Kroki:* 1) trace z LP w `each`; 2) trace po item. | kat:6321 · non-kg → `unreconciled`, nie sumowane (:69-88, :22-24); item → `resolveMassBalanceScope` null (`trace-actions.ts:512`). | Non-kg rows are excluded into `unreconciled`; item-trace balance suppression is not directly asserted. | brak testu | nie | nie | P1 |
| `SFQ-150` | **Trace permission + summary** — Gate `quality.dashboard.view` (TODO split) i sumy raportu. *Kroki:* 1) bez uprawnienia (throw `forbidden`); 2) sprawdź `lpCount, woCount, shipmentCount, customersAffected, totalKg` (kg-only). | kat:6339 · `TRACE_PERMISSION` (`trace-actions.ts:144-150`, apply :974,982,1008); summary :958-964; affected customers z shipmentów… | Summary construction is exercised by forward traces, but explicit permission denial and every summary counter/total are not all asserted. | zielony | nie | tak | P0 |

## Quality — Recall drills (quality/recall-drills)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-151` | **KPI drilla — 4h target** — Status within/over/in_progress. *Kroki:* 1) drill duration 3h59m; 2) 4h01m; 3) completed_at=null. | kat:6347 · `RECALL_TARGET_MS = 4*60*60*1000` (`labels.ts:305`); `durationMs <= target` → within; null → in_progress (list :43-46;… | Fresh UI tests cover within-target, over-target, and in-progress badges; exact 4-hour inclusivity (`<=`) is not tested at the boundary. | zielony | nie | nie | P1 |
| `SFQ-152` | **Drill = snapshot, nie re-run** — Panel raportu renderuje `result_jsonb` bez ponownego trace. *Kroki:* 1) otwórz drill; 2) zmień dane inwentarzowe; 3) odśwież drill. | kat:6353 · `drill-report-panel.tsx:6-10,66-99` — raport niezmienny. | No targeted drill-detail test proves `result_jsonb` remains a snapshot after inventory data changes. | brak testu | TAK | nie | P2 |
| `SFQ-154` | **Drill detail — forbidden/not-found panele** — Obsługę braku uprawnień i złego ID. *Kroki:* 1) bez `quality.dashboard.view`; 2) random UUID. | kat:6365 · denied panel / not-found (`[drillId]/page.tsx:80-123`). | List RSC handoff and production empty state are healthy, but drill-detail forbidden and random-UUID not-found panels lack targeted assertions. | brak testu | nie | tak | P2 |

## Maintenance — Assets (maintenance/assets)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-155` | **Create equipment — walidacja i typy** — Pola `equipmentCode(1-64)`, `name(1-200)`, typ z `mixer\|oven\|packer\|scale\|thermometer\|conveyor\|other`, flagi `requiresLoto`/`requiresCalibratio… *Kroki:* 1) create poprawny (active=true); 2) puste code (validation_error). | kat:6373 · `asset-schemas.ts:15-21`; insert active=true (`asset-actions.ts:126`); zod fail → `validation_error` (:153-155); perm `… | Valid create, `active=true`, read/edit permission gates, UI required fields, and production assets are covered; action-level empty-code validation and the complete equipment-type matrix are not. | zielony | nie | tak | P0 |
| `SFQ-156` | **Duplikat kodu equipmentu → conflict** — `equipment_org_code_uq`. *Kroki:* 1) create 2× ten sam kod. | kat:6379 · `{reason:'conflict'}` (`asset-actions.ts:146-148`). | No fresh targeted assertion creates a duplicate equipment code and verifies `{reason:'conflict'}`. | brak testu | nie | nie | P1 |

## Maintenance — MWO (maintenance, mwos/[id])

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-158` | **Graf przejść MWO** — `requested→cancelled`, `approved→cancelled`, `open→in_progress\|cancelled`, `in_progress→completed\|cancelled`; completed/cancelled terminalne. *Kroki:* 1) każde nielegalne przejście (np. open→completed). | kat:6393 · `LEGAL_TRANSITIONS` (`mwo-actions.ts:105-112`); enforce `transitionMwo` (:1283-1400) FOR UPDATE (:1314) + re-assert fro… | Fresh tests reject completed→in-progress and open→completed and exercise normal start/complete/cancel; the complete requested/approved/open/in-progress/terminal matrix is not enumerated. | brak testu | nie | nie | P0 |
| `SFQ-159` | **Timestampy przejść — started_at / completed_at / actual_duration_min** — Side-effecty transition. *Kroki:* 1) start; 2) complete z completion_notes; 3) cancel innego z reason. | kat:6399 · in_progress→`started_at` (:1349); completed→`completed_at`+duration z started_at (:1350-1355)+notes (:1356); cancelled→… | Start, complete-with-note, and cancel-with-reason pass; exact `actual_duration_min` calculation and all timestamp writes are not directly asserted. | zielony | nie | nie | P1 |
| `SFQ-162` | **Uprawnienia MWO — execute vs cancel** — start/complete=`mnt.mwo.execute`, cancel=`mnt.mwo.cancel`, create/update=`mnt.mwo.request`, read=`mnt.asset.read`. *Kroki:* 1) każda akcja bez właściwego uprawnienia. | kat:6417 · `mwo-actions.ts:62-67, 1291-1293, 538, 598`. | Read/request and the execute-vs-cancel SoD split are exercised; every action's missing-permission branch is not covered as a full matrix. | zielony | nie | tak | P0 |

## Maintenance — Kalibracje (maintenance/calibration)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-167` | **Instrument CRUD — walidacje i gate'y** — Pola (`instrumentCode` 1-64, typ `scale\|thermometer\|ph_meter\|other`, standard, interval 1-3650 dni, range regex), dup→conflict, deactivate/reactiv… *Kroki:* 1) create/update/deactivate/reactivate; 2) dup kod; 3) interval=0 i 4000. | kat:6451 · `calibration-schemas.ts:3-4,12-16,24-32`; create/update/reactivate `mnt.asset.edit` (:281,342,433), deactivate `mnt.ass… | Create/deactivate/reactivate gates and states are covered; successful update, duplicate conflict, interval limits, and complete schema validation are not all asserted. | zielony | nie | nie | P1 |
| `SFQ-171` | **Przeterminowana kalibracja NIE blokuje inspekcji/CCP (udokumentowany brak)** — Brak runtime-gate'u na overdue instrument w quality. *Kroki:* 1) instrument overdue; 2) wykonaj inspekcję/odczyt CCP. | kat:6475 · przechodzi — zero referencji do `calibration_*`/`requires_calibration` w quality (grep-verified); overdue widoczne tylk… | Fresh zero-match search confirms no calibration runtime gate in scoped quality code, but the requested overdue-instrument→inspection/CCP execution was not safely mutable in production and has no targeted test. | brak testu | nie | tak | P1 |

## Cross-cutting — RLS, uprawnienia, spójność

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `SFQ-179` | **Fail-closed wszystkich probe'ów uprawnień** — Probes zwracają false przy błędzie DB, nie rzucają do renderu. *Kroki:* 1) symuluj błąd zapytania roli. | kat:6527 · `can-release.ts:16-38` i analogiczne; `getMwoPermissions`/`getAssetPermissions`/`getCalibrationPermissions` fail-closed. | Several permission helpers return false without grants and production renders safely, but DB-error fail-closed behavior is not targeted across every listed quality/maintenance probe. | brak testu | TAK | tak | P1 |
