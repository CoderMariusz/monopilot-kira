# Fala 11 — tor T5 FIX (recenzja FIX-FIRST)

## Definicja „kompletnie spakowana" (wyprowadzona z danych)

Wysyłka jest gotowa do plombowania wtedy i tylko wtedy, gdy:
1. **Istnieje co najmniej jedna** linia SO z `quantity_picked > 0` (numeric 14,3), oraz
2. **Dla każdej linii** (również z zerowym pickiem, jeśli ma zawartość w boxach) suma `shipment_box_contents.quantity` w nieusuniętych boxach **równa się dokładnie** `quantity_picked` w jednostce magazynowej pozycji (`items.uom_base`).

Pusta wysyłka (boxy bez dodatnich `quantity_picked`) **nie przechodzi** warunku 1.

---

## PF-R18-04 — guard plombowania (za luźny + za ciasny)

### Przyczyna źródłowa
`assessPackCompleteness` startował od `complete = true` i budował listę wymaganych linii wyłącznie z `quantity_picked > 0`. Gdy ta lista była pusta (boxy istniały, pick = 0), zwracał `complete=true`. Równolegle mock testowy dla `sum(sbc.quantity)` był przechwytywany przez szerszy matcher `shipShipment` → test poprawnego plombowania dostawał `packed=0` i fałszywie zwracał `incomplete_pack`.

### Zmiany
| Plik | Linie | Co / dlaczego |
|------|-------|----------------|
| `lib/shipping/shipment-pack-completeness.ts` | 71–175 | Warunek kompletności: wymóg ≥1 linii z pick>0 + równość per linia (wymagane ∪ spakowane); pozostałość grupowana per `uom_base`, bez sumowania różnych jednostek |
| `ship-actions.ts` | 298–345 | `readLockedShipmentStatus` (FOR UPDATE) przed i po sprawdzeniu kompletności; usunięte `currentStatus: 'packing'` omijające ponowny odczyt |
| `ship-actions.test.ts` | 157–165, 201–225, 764–800 | Matcher `as line_id` przed ogólnym `shipped_qty`; test pustego pick; test wyścigu z anulowaniem |
| `pack-actions.ts` / `pack-actions-types.ts` | 322–350 | Mapowanie `*Display` + `skippedLineCount` |
| `shipment-pack-view.tsx` | 101–103, 178–188, 248–250 | Tooltip z per-UoM `{remaining}` + licznik pominiętych linii bez UoM |

### Testy — co by je wywróciło bez poprawki
| Plik | Test | Mechanizm |
|------|------|-----------|
| `shipment-pack-completeness.test.ts` | `rejects a shipment with boxes but no positive quantity_picked lines` | `complete=false` przy `[]` required + packed orphan |
| `shipment-pack-completeness.test.ts` | `groups remaining quantity per UoM` | `remainingDisplay='2.000 ea'`, nie fałszywe `2.000 kg` |
| `ship-actions.test.ts` | `transitions a packing shipment with at least one box to packed` | Matcher `packed_qty` osiągalny → `{ok:true}` |
| `ship-actions.test.ts` | `returns incomplete_pack when boxes exist but no line has quantity_picked > 0` | Seal odrzuca pusty pick mimo boxów |
| `ship-actions.test.ts` | `returns invalid_state when the shipment is cancelled before the status write` | Drugi `FOR UPDATE` widzi `cancelled` → brak zapisu `packed` |

---

## PF-R18-03 — stary total na liście SO

### Przyczyna źródłowa
`listSalesOrders` preferował zapisane `so.total_amount_gbp` przez `coalesce(stored, computed)` — detal liczył sumę zaokrąglonych linii, lista pokazywała starą wartość kolumny.

### Zmiany
| Plik | Linie | Co / dlaczego |
|------|-------|----------------|
| `so-actions.ts` | 558–572 | Lista **zawsze** liczy `sum(round(line_fact, 2))` — ta sama polityka co detal i create/update |

### Test
| Plik | Test | Mechanizm |
|------|------|-----------|
| `so-actions.test.ts` | `computes list total from rounded line sums instead of stored total_amount_gbp` | SQL listy nie zawiera `so.total_amount_gbp`, zawiera `sum(round(` |

---

## P2 — i18n (4 języki)

Dodano brakujące klucze `pack.summary.packedQty/requiredQty`, `pack.control.sealIncompletePack` (bez hardcoded `kg`), `sealIncompletePackSkipped`, `pack.errors.incomplete_pack` w:
- `apps/web/i18n/en.json`
- `apps/web/i18n/pl.json`
- `apps/web/i18n/ro.json`
- `apps/web/i18n/uk.json`

Shipping nie używa osobnego staging bundle (`_meta/i18n-staging/*`) — jedyny katalog produkcyjny to `apps/web/i18n/`.

---

## Świadomie NIE ruszone
- **Backfill SQL** `total_amount_gbp` na istniejących wierszach — lista i detal teraz zgadzają się bez migracji; kolumna aktualizuje się przy następnym edit/create.
- **`so-list-view.tsx` `money()` przez `Number()`** — poza minimalnym zakresem; wartości są już 2 dp z SQL.
- **Jawne odstępstwo od pełnego pakowania (e-sign)** — wymaga decyzji produktowej; pozostaje twarda blokada.

## Znaleziska poza zakresem (nie naprawiane)
- `pack-lp-into-box.ts` — porównania qty przez `Number()` (ryzyko skrajnych numeric 14,3).
- `customers/[customerId]/page.tsx` — lista zamówień klienta korzysta z tego samego `listSalesOrders`; naprawa listy obejmuje ten ekran pośrednio.
