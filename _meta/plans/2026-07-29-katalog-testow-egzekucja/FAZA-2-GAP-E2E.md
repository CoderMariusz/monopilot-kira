# FAZA 2 — inwentarz GAP: Warianty E2E (`E2E`) — 51 pozycji

Wygenerowane 2026-07-29. Indeks i metodyka: [`FAZA-2-GAP-INWENTARZ.md`](FAZA-2-GAP-INWENTARZ.md).

`kat:N` = linia w `_meta/plans/2026-07-18-full-test-catalog/FULL-TEST-CATALOG.md`.
Kolumna **test dziś** pochodzi z klasyfikacji dowodu z 18-19.07 — patrz ostrzeżenie o wieku werdyktu w indeksie.

Rozkład: brak testu 3 · brak (tylko źródło) 1 · czerwony/pominięty 1 · zielony 46 · przeglądarka 1 · persona 9


## Łańcuch XC-049: PO → GRN → putaway → WO → konsumpcja → output → SO → pick → pack → ship → POD

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-049-05` | **Over-receipt 100–110% — scanner przepuszcza CICHO** —  | kat:8360 | Scanner over-receive behavior is covered at the action seam; no end-to-end GRN/LP proof. | zielony | nie | nie | P1 |
| `E2E-049-06` | **Over-receipt >110% — HARD block (obie ścieżki)** —  | kat:8366 | 110% cap/error branches are covered at the action seam; no prod-like persisted receipt. | zielony | nie | nie | P0 |
| `E2E-049-09` | **UoM kg — konsumpcja z konwersją, 6dp** —  | kat:8384 | Quantity scale/conversion/WAC helpers are green; full receipt→consume→output chain was not executed. | zielony | nie | nie | P0 |
| `E2E-049-19` | **Cancel shipment po pack (przed ship) — WAC credits** —  | kat:8444 | Shipment cancellation test exists but its ship prerequisite is red with `invalid_state`; exact pre-ship WAC-credit chain remains unexecuted. | czerwony/pominięty | nie | nie | P0 |
| `E2E-049-25` | **Qty na granicy — split całego available zablokowany** —  | kat:8480 | Strict split boundary is covered by focused action tests; not a prod-like LP mutation. | zielony | nie | nie | P1 |
| `E2E-049-32` | **Insufficient input dla output — gate wydajności** —  | kat:8522 | Strict-yield helpers/gates are covered; override branch still needs PIN, permission and DB state. | zielony | nie | tak | P0 |

## Łańcuch XC-050: NPD → Technical → Planning → Production

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-050-02` | **Skok gate G0→G3 — GATE_SEQUENCE_VIOLATION** —  | kat:8562 | Non-adjacent gate validation has focused action coverage; no persisted E2E project. | zielony | nie | nie | P0 |
| `E2E-050-03` | **G0+brief → gate-only advance G1 (stage zostaje brief)** —  | kat:8568 | Gate-only transition logic has focused coverage; no prod-like persisted transition. | brak testu | nie | nie | P1 |
| `E2E-050-04` | **HARD blocker — brak składników recepty** —  | kat:8574 | Hard blocker is covered at the action seam; full E2E gate context absent. | zielony | nie | nie | P0 |
| `E2E-050-09` | **GATE_MISMATCH — approve złym gateCode** —  | kat:8604 | Gate mismatch validation is covered without a full persisted chain. | brak testu | nie | nie | P1 |
| `E2E-050-11` | **FG conflict — FG_ALREADY_LINKED** —  | kat:8616 | FG conflict guard is covered at the action seam; persisted cross-project conflict absent. | zielony | nie | nie | P1 |
| `E2E-050-12` | **Launch compliance — required pending blokuje, warn nie** —  | kat:8622 | Launch-compliance blocker logic is covered; no end-to-end launch transition. | zielony | nie | nie | P1 |
| `E2E-050-13` | **C7 forced przy 0 valid docs mimo not_required** —  | kat:8628 | C7 forcing logic is covered; document persistence path was not exercised. | zielony | nie | nie | P2 |
| `E2E-050-14` | **releaseToFactory → WO release, non-DRAFT blok** —  | kat:8634 | WO release state/pack guards have focused coverage; full factory-to-WO chain absent. | zielony | nie | nie | P0 |

## Łańcuch XC-051: Recall / trace — forward i backward

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-051-07` | **Mass-balance forward — Σin ≈ Σout (ε=0.001kg)** —  | kat:8703 | Mass-balance helpers are covered; no persisted completed-chain balance query. | zielony | nie | nie | P0 |

## Łańcuch XC-052: Hold cascade — hold na batchu blokuje wszystkie ścieżki wyjścia

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-052-03` | **Hold blokuje konsumpcję WO** —  | kat:8802 | Held-consume guards are green at action seams; no persisted hold/outbox chain. | zielony | nie | nie | P0 |
| `E2E-052-04` | **Hold blokuje ship (re-assert po pack)** —  | kat:8808 | Ship hold re-assertion has focused coverage; no disposable packed shipment. | zielony | nie | nie | P0 |
| `E2E-052-05` | **Hold blokuje pack** —  | kat:8814 | Pack hold guard has focused coverage; no persisted pick→hold→pack chain. | zielony | nie | nie | P0 |
| `E2E-052-06` | **Hold blokuje split** —  | kat:8820 | Split hold guard is green in focused action tests; no prod-like LP mutation. | zielony | nie | nie | P0 |
| `E2E-052-07` | **Hold blokuje merge** —  | kat:8826 | Merge hold guard is green in focused action tests; no prod-like sibling LPs. | zielony | nie | nie | P0 |
| `E2E-052-08` | **Hold blokuje register-output (produkcja)** —  | kat:8832 | Production hold/output seams are green; no persisted blocked event proof. | zielony | nie | nie | P0 |
| `E2E-052-09` | **Hold blokuje destroy** —  | kat:8838 | Destroy hold/reservation guard is covered at the action seam. | zielony | nie | nie | P1 |
| `E2E-052-14` | **Idempotencja release — hold już released** —  | kat:8868 | Idempotent release guard has focused action coverage; no signed persisted release. | zielony | nie | nie | P1 |
| `E2E-052-16` | **Hold zakłada od razu qa_status=on_hold na LP** —  | kat:8880 | Hold creation/LP status logic has focused coverage; no persisted FEFO query. | zielony | nie | nie | P1 |
| `E2E-052-18` | **Hold w środku WO — outputy →ON_HOLD, release przywraca snapshot** —  | kat:8892 | WO-hold output inheritance/restore seams are green; no persisted snapshot chain. | zielony | nie | nie | P1 |
| `E2E-052-20` | **Hold po alokacji ale przed pick — re-assert łapie** —  | kat:8904 | Pick re-assertion is covered at the action seam; no live allocated LP. | zielony | nie | nie | P0 |

## Łańcuch XC-053: Multi-site — separacja operacyjna

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-053-03` | **Pick LP z obcego site — lp_wrong_site** —  | kat:8937 | Wrong-site pick guards are covered; no real cross-site pick attempt. | zielony | nie | tak | P0 |
| `E2E-053-05` | **Receive do warehouse spoza site PO — odmowa** —  | kat:8949 | Receipt site mismatch guard has focused coverage; no persisted GRN. | zielony | nie | tak | P0 |
| `E2E-053-06` | **LP site_id=NULL PRZECHODZI pick-guard (edge)** —  | kat:8955 | Source/action seam confirms NULL-site LP bypass condition; no prod-like edge row. | zielony | nie | tak | P1 |
| `E2E-053-07` | **Warehouse site_id=NULL — receive omija site-guard (edge)** —  | kat:8961 | Source/action seam confirms NULL-site warehouse bypass condition; no prod-like edge row. | zielony | nie | tak | P1 |
| `E2E-053-08` | **Pick context — tylko site widoczny + linia z tego site** —  | kat:8967 | Scanner context site pre-check has focused route coverage. | zielony | TAK | nie | P1 |
| `E2E-053-12` | **Valuation z filtrem site (`app.current_site_id()`)** —  | kat:8991 | Valuation query is site-filtered and focused valuation tests are green; no persisted A/B totals. | zielony | nie | tak | P1 |
| `E2E-053-13` | **Ship z site A — shipment route site-scoped** —  | kat:8997 | Shipment route scoping has focused coverage; no second-site authenticated read. | zielony | nie | tak | P1 |
| `E2E-053-14` | **Konsumpcja FEFO nie sięga LP innego site** —  | kat:9003 | FEFO site filtering is covered at seams; no real competing A/B LPs. | zielony | nie | nie | P0 |
| `E2E-053-15` | **Split/merge cross-site odrzucony** —  | kat:9009 | Split/merge site guards have focused coverage; no persisted cross-site LP pair. | zielony | nie | tak | P1 |
| `E2E-053-17` | **Scanner pick — context site pre-check przed FEFO** —  | kat:9021 | Scanner context pre-check is covered; no foreign-site session. | zielony | nie | nie | P1 |
| `E2E-053-18` | **Adjust/count na LP obcego site odmówiony** —  | kat:9027 | Adjust/count site guards are covered; no real foreign-site LP mutation. | zielony | nie | nie | P1 |

## Łańcuch XC-054: Cancel-cascade — WO z rezerwacjami i częściową konsumpcją

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-054-01` | **Cancel WO DRAFT/RELEASED bez konsumpcji** —  | kat:9048 | Basic cancel action path is green; no persisted outbox terminal check. | zielony | nie | nie | P0 |
| `E2E-054-03` | **Rezerwacje przy cancel — zwolnione LUB udokumentowane że NIE (PLN-024/025)** —  | kat:9060 | Current cancellation seam is inspected, but per-WO reservation release is not proven end-to-end. | brak (tylko źródło) | nie | nie | P0 |
| `E2E-054-04` | **Cancel WO z LIVE output LP — blok, najpierw void** —  | kat:9066 | Green focused tests block live output LPs on cancel. | zielony | nie | nie | P0 |
| `E2E-054-05` | **Void output LP → destroyed + WAC reversal** —  | kat:9072 | Green focused tests void output LPs and exercise WAC reversal seams. | zielony | nie | nie | P0 |
| `E2E-054-06` | **Output LP z downstream usage — void ZABLOKOWANY** —  | kat:9078 | Green focused tests block downstream-used output LPs. | zielony | nie | nie | P0 |
| `E2E-054-13` | **Cancel a stan RM-LP po częściowej konsumpcji** —  | kat:9120 | Partial RM-LP preservation logic has focused cancellation coverage. | zielony | nie | nie | P1 |

## Łańcuch XC-055: Onboarding → pierwszy pełny obieg

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-055-03` | **Kolejność warehouse przed location** —  | kat:9158 | Default routing/order UI tests are green; no fresh session persistence. | zielony | nie | nie | P1 |
| `E2E-055-04` | **Redirect przy próbie wejścia poza bieżący krok** —  | kat:9164 | Step redirect tests are green; no disposable live onboarding session. | zielony | nie | nie | P1 |
| `E2E-055-07` | **Idempotencja complete + post-commit chain** —  | kat:9182 | Completion timestamp/session seams are green; full two-call post-commit chain absent. | zielony | nie | nie | P2 |

## Łańcuch XC-056: Spójność księgowa po dniu operacji (property-based)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `E2E-056-01` | **Invariant reserved — Σ LP.quantity ≥ Σ reserved** —  | kat:9219 | Reservation/adjust constraints have focused green coverage; no day-end aggregate. | zielony | nie | nie | P1 |
| `E2E-056-02` | **Valuation = Σ(qty_kg × avg_cost) per item×currency** —  | kat:9225 | Valuation grouping/math tests are green; no live item×currency dataset. | zielony | nie | nie | P1 |
| `E2E-056-07` | **Korekta ledgera — storno + wpis korygujący** —  | kat:9255 | Append-only correction/e-sign seam tests are green; no persisted final balance. | brak testu | nie | tak | P0 |
| `E2E-056-08` | **Adjust variance stock-count wpięty w bilans** —  | kat:9261 | Count variance and WAC application tests are green; no live final reconciliation. | zielony | nie | nie | P1 |
| `E2E-056-09` | **LP z brakiem WAC/currency/base_qty_kg — flagowany w raporcie** —  | kat:9267 | Valuation warning-panel/action tests are green; no real unvalued LP fixture. | zielony | nie | nie | P2 |
