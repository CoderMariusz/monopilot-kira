# Fala 11 — tor T5 (PF-R18-03 + PF-R18-04)

## PF-R18-03 — kwoty linii SO nie sumują się do totalu

### Przyczyna źródłowa
Dwie różne polityki zaokrąglania w UI:
- **Linie** — `formatSoCurrencyDisplay` formatował surowe `line_total_gbp` (numeric **14,4**) przez `Intl` → **2 dp** niezależnie (4.3750 → £4.38, 3.0788 → £3.08).
- **Nagłówek / lista** — suma na **4 dp** (`4.3750 + 3.0788 = 7.4538`) potem format → £7.45.

Błąd leżał po stronie **wyświetlania totalu** (suma wysokiej precyzji), nie w obliczeniu linii. Linie i `computeSoLineTotal` były spójne z Postgresem.

### Zmiany
| Plik | Linie | Co / dlaczego |
|------|-------|----------------|
| `sales-line-price.ts` | 19–21, 79–108 | `SO_CURRENCY_DISPLAY_DP=2`, `roundSoMoneyToDisplayDp`, `sumSoLineTotalsForDisplay`; `formatSoCurrencyDisplay` zaokrągla przez `Dec` przed formatowaniem |
| `so-detail-view.tsx` | 43, 225–227 | Total zamówienia = `sumSoLineTotalsForDisplay` (suma linii po 2 dp) |
| `so-actions.ts` | 552–567, 787–805, 1050–1062 | `total_amount_gbp` = `sum(round(line_fact, 2))` przy create/update i w fallbacku listy |

Polityka: **faktura** — każda linia zaokrąglana do grosza, total = suma zaokrąglonych linii (zgodne z `numeric(14,4)` w migracji `211-shipping-schema-foundation.sql`).

### Testy dodane
| Plik | Test | Co by go wywróciło bez poprawki |
|------|------|----------------------------------|
| `sales-line-price.test.ts` | `reconciles PF-R18-03 audit lines with the display order total` | Asercja `sumSoLineTotalsForDisplay → 7.46` i `formatSoCurrencyDisplay` linii + total = £7.46; przy starej sumie 4 dp total byłby £7.45 przy liniach £4.38+£3.08 |

---

## PF-R18-04 — plombowanie niekompletnej wysyłki + kontynuacja pakowania

### Przyczyna źródłowa
1. **`sealShipment`** (`ship-actions.ts`) sprawdzał tylko `status=packing` i `box_count >= 1` — brak porównania `quantity_picked` (SO) vs suma `shipment_box_contents.quantity` (numeric **14,3**).
2. **UI** włączało Seal przy dowolnym boxie (`shipment-pack-view.tsx` ~174–181).
3. **Kontynuacja pakowania** — `packLpAction` na stronie nie przekazywał `quantity`; `getShipment` nie zwracał `boxId` (wybór istniejącego boxa był no-op); po `router.refresh()` submit czytał pusty stan React `lp` mimo widocznego tekstu w polu (kontrolowany input vs odświeżenie).

### Zmiany
| Plik | Linie | Co / dlaczego |
|------|-------|----------------|
| `lib/shipping/shipment-pack-completeness.ts` | nowy | `assessPackCompleteness` + `fetchShipmentPackCompleteness` — porównanie per linia SO (`quantity_picked`) vs spakowane, arytmetyka `toMicro`/`microToFixed(3)` |
| `ship-actions.ts` | 11, 299–337 | `sealShipment` odrzuca `incomplete_pack` gdy picked ≠ packed |
| `pack-actions.ts` / `pack-actions-types.ts` | 311–348, typy | `getShipment` zwraca `packing{…}` i `boxId` na boxach |
| `shipment-pack-view.tsx` | 146–150, 174–182, 183–217, 232–240, 273–300, 444–461 | Seal disabled + tooltip z `{remaining}`; ref na input LP/qty; przekazanie `boxId` i `quantity` |
| `shipments/[shipmentId]/page.tsx` | 49–53, 137–139, 169–172, 180, 393 | Adapter `packLpAction` z `quantity`; etykiety i `packing` w detail |
| `i18n/en.json` | pack.summary / control / errors | Teksty `sealIncompletePack`, `incomplete_pack`, qty summary |

Migracja **542** — niepotrzebna (logika aplikacyjna, istniejące kolumny).

### Testy dodane
| Plik | Test | Co by go wywróciło bez poprawki |
|------|------|----------------------------------|
| `shipment-pack-completeness.test.ts` | `flags PF-R18-04 partial pack (1.000 of 3.625 kg)` | `complete=false`, `remainingTotal=2.625` |
| `shipment-pack-completeness.test.ts` | `accepts a fully packed shipment` | `complete=true` gdy picked=packed |
| `ship-actions.test.ts` | `returns incomplete_pack when picked quantity is not fully boxed` | Seal zwraca błąd zamiast `{ ok: true }` |
| `shipments.test.tsx` | `disables seal when picked quantity is not fully packed` | Przycisk Seal enabled bez bramki UI |
| `pack-actions.test.ts` | `getShipment` (rozszerzony) | Oczekuje `boxId` + `packing.packComplete` |

---

## Świadomie NIE ruszone
- **PF-R18-01** (allergeny), **PF-R18-02** (double-submit SO) — inne tory.
- **i18n pl/ro/uk** dla nowych kluczy pack — tylko `en.json` (uniknięcie kolizji z równoległymi torami i18n).
- **`pack-lp-into-box.ts` `Number()` na qty** — poza minimalnym zakresem; seal gate blokuje wysyłkę niekompletnej.
- **Unpack / korekta boxów** — brak kontrolki w prototypie/feedzie; zgłoszone w audycie jako BLOCKED.
- **Backfill `total_amount_gbp`** na istniejących SO — total zaktualizuje się przy następnym edit/create path; jednorazowy SQL poza zakresem.

## Znaleziska poza zakresem (nie naprawiane)
- `so-list-view.tsx:176–179` — `money()` nadal używa `Number(value)` na stringu z DB; po backfillu 2 dp jest bezpieczne, ale idealnie formatować przez `formatSoCurrencyDisplay`.
- `pack-lp-into-box.ts:143–150` — porównania qty przez `Number()` (ryzyko na skrajnych wartościach 14,3).
- Brak ścieżki **jawnego odstępstwa** (e-sign + powód) przy seal niekompletnego — wymaga product decision; zaimplementowano twardą blokadę z komunikatem pozostałej ilości.
