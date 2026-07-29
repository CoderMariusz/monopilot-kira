# FALA-09 / Tor T3 — raport (MRP lead-time + transfer mixed-UoM)

## PF-R09-05 — time-phased BUY ukrywa spóźnienie lead-time

### Przyczyna źródłowa
`computeMrpPhased` poprawnie liczył `releaseDate` / `isLate` i pierwszy kubełkowy BUY (np. 12 kg zamiast horyzontowych 4 kg), ale **wiersz podsumowania** (`summaryAction`) przenosił tylko `qty` + `dueDate`. UI (`mrp-view.tsx`) nie renderowało kubełka, daty wydania, flagi spóźnienia ani kontekstu PAB — planner widział `BUY 12` przy horyzontowej pozycji 12.375 vs min 15.875 i uznał to za błąd arytmetyczny.

### Zmiany
| Plik | Linie (orientacyjnie) | Co i dlaczego |
|---|---|---|
| `mrp-compute.ts` | typ `MrpSuggestedAction` + ~805 | Pola `bucketDate`, `actionScope: 'next_bucket'`, `netAtBucket`, `scheduledReceiptsAtBucket`, `earliestReceiptDate`, `leadTimeDays` na pierwszym kubełkowym `summaryAction` — eksponują logikę time-phased bez zmiany silnika nettingu |
| `mrp-view.tsx` | ~59–66, ~251–310 | Etykieta „Next bucket action”, kubełek, release, badge Late, earliest receipt, hint `{net} + receipts {receipts} vs min {min}` |
| `mrp/page.tsx` | ~54–60 | Podpięcie nowych kluczy i18n |
| `i18n/{en,pl,ro,uk}.json` | sekcja `Planning.mrp` | Teksty UI |

### Testy dodane
| Plik | Co weryfikuje | Co by padło bez poprawki |
|---|---|---|
| `mrp-compute.test.ts` — `PF-R09-05: summary row exposes next-bucket BUY context…` | Scenariusz R09: on-hand 7.125, PO 5.250 w kubełku 2, min 15.875, lot 4 → BUY 12 w kubełku 1 + `actionScope`/`netAtBucket` na summary | `summaryAction` bez `actionScope`/`netAtBucket` — asercje `toMatchObject` |
| `mrp.test.tsx` — `PF-R09-05: surfaces next-bucket scope, release/late…` | RTL: `mrp-action-scope-*`, `mrp-late-*`, `mrp-earliest-*`, `mrp-calc-*` | Brak elementów DOM — `getByTestId` throw |

---

## PF-R10-01 — mixed-UoM transfer nie może ship

### Przyczyna źródłowa
`shipTransferOrder` filtrował LP po **dokładnej równości** `lp.uom = line.uom` (`actions.ts` ~875). Linia w `g` nie widziała zapasu w `kg`, mimo że fizycznie wystarczał.

### Zmiany
| Plik | Linie (orientacyjnie) | Co i dlaczego |
|---|---|---|
| `transfer-uom-base.ts` | nowy | `qtyToBaseMicro6` / `baseMicro6ToQty` — konwersja g↔kg i each/box na **micro-6** (zgodnie z `numeric(18,6)`), bez `Number()` i bez 3-dp `toBaseQtyFromDecimal` (RECON-FACTS P3) |
| `actions.ts` — `shipTransferOrder` | ~858–990 | Pobranie `items.uom_base`; alokacja FEFO w bazie UoM; pick zapisuje `takeLpMicro` (UoM LP) i `recordMicro` (UoM linii) na junction; stock_move w UoM LP |

**Świadoma decyzja o skali:** nie używamy `toBaseQtyFromDecimal` (3 dp) do walidacji TO — przy 3875 g utrata 6. dp mogłaby odrzucić pokryty transfer. Konwersja g→kg to dokładne `/1000n` na micro-6.

### Testy dodane
| Plik | Co weryfikuje | Co by padło bez poprawki |
|---|---|---|
| `transfer-uom-base.test.ts` | 3875 g → 3.875 kg base; null dla `pcs` | Złe micro lub brak null |
| `ship-mixed-uom.test.ts` — `ships 6.125 kg + 3875 g when…` | `transitionTransferOrderStatus` → `ok: true` z jednym LP 20 kg | `ok: false`, `insufficient_stock` |
| `ship-mixed-uom.test.ts` — `still rejects when only 10 kg…` | 6.125+3.875 kg przy 10 kg LP → `insufficient_stock` | Fałszywe `ok: true` gdy walidacja zbyt luźna |
| `ship-holds.test.ts`, `actions.test.ts` | Mocki `items` + `lp.uom` po zmianie zapytania | Istniejące testy ship bez mocka itemów |

---

## Świadomie NIE ruszone
| Obszar | Powód |
|---|---|
| PF-R09-01..04, PF-R09-02 (summary MAKE 9 vs 24.345) | Inne tory / poza T3 |
| PF-R10-02 (re-receive), PF-R10-03 (cancel partial) | Inne tory |
| `toMicro6`/`microToText6` w `actions.ts:783–800` | Dług techniczny — nie propagowany; nowa logika w `transfer-uom-base.ts` + kanoniczny `toMicro` tam, gdzie importowany |
| Migracja `530-*.sql` | Brak zmian schematu — fix czysto aplikacyjny |
| `to-conservation.ts` (per `(item,uom)` scalar) | Poza ship-allocation; zmiana wymagałaby osobnego toru |

---

## Znaleziska poza zakresem (zgłoszone, nie naprawiane)
1. **PF-R09-02** — `summaryAction` nadal pokazuje tylko pierwszy kubełek MAKE/BUY; ten tor dodał etykietę `next_bucket` i metadane, ale nie sumę horyzontową ani listę wszystkich kubełków.
2. **PF-R10-02 / PF-R10-03** — terminalny Received bez materializacji linii po reversal + niemożliwy Cancel na Partially received.
3. **`mrp-compute.test.ts`** zawiera już test PF-R09-04 (`preferredSupplierIneligible`) z innego toru — nie modyfikowany.
