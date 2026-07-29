# FALA-12 / TOR T1 — raport FIX (cross-review)

**Data:** 2026-07-29  
**Recenzja wejściowa:** `out-rev-t1.md` (7× P1/P2 FIX-FIRST)

---

## Werdykt per znalezisko

| ID | Znalezisko | Status |
|---|---|---|
| P1 | Edycja harmonogramu bezwarunkowo nadpisuje `warning_days` | **NAPRAWIONE** |
| P1 | Reaktywacja niszczy audit wycofania + fałszywy `breakdown` w historii | **NAPRAWIONE** |
| P1 | Reaktywacja bez `mnt.asset.deactivate` | **NAPRAWIONE** |
| P1 | Guard aktywności TOCTOU (`createMwo` / `createPmSchedule`) | **NAPRAWIONE** |
| P1 | Test `createPmSchedule` — zły indeks binda | **NAPRAWIONE** |
| P2 | Aktywny harmonogram dla wycofanego urządzenia | **NAPRAWIONE** |
| P2 | Brak ścieżki korekty kodu urządzenia | **NAPRAWIONE** |
| P2 | Test withdrawn equipment nie weryfikuje SQL | **NAPRAWIONE** (przy okazji) |
| P2 | Etykiety assets tylko w `en.json` | **POMINIĘTE** — poza zakresem tego toru (osobny i18n staging) |
| P2 | Raport deklaruje nieistniejący mirror migracji | **ODRZUCONE** — to korekta dokumentacji `rep-T1.md`, nie kodu produkcyjnego |

---

## Zmiany i przyczyna źródłowa

### P1 — `warning_days` cicho resetowane do 7 przy edycji

| Plik | Co / dlaczego |
|---|---|
| `mwo-actions.ts:191-201,1827-1868` | `PmScheduleRow` + `listPmSchedules` zwracają `warningDays` z DB — modal edycji ma prawdziwą wartość startową. |
| `pm-schedule-form-modal.tsx:67-72,100-117` | Inicjalizacja z `schedule?.warningDays`; w trybie edit `warningDays` wysyłane **tylko gdy użytkownik zmienił pole** względem wartości początkowej. Serwer już miał `coalesce` — źródłem był klient zawsze wysyłający `7`. |

### P1 — audit wycofania + fałszywy typ zdarzenia

| Plik | Co / dlaczego |
|---|---|
| `asset-actions.ts:278-284` | Historia: `event_type='cancellation'` (decyzja lifecycle, nie awaria), `technician_id=$4` (aktor wycofania). |
| `asset-actions.ts:307-318` | Reaktywacja ustawia tylko `active=true` — **nie zeruje** `deactivated_at/by/reason` (ślad audytowy zostaje). |

### P1 — reaktywacja bez uprawnienia lifecycle

| Plik | Co / dlaczego |
|---|---|
| `asset-actions.ts:303-305` | `reactivateEquipment` wymaga `mnt.asset.deactivate` (symetria z wycofaniem). |
| `asset-form-modal.tsx:277-287` | Przycisk Reactivate widoczny tylko gdy `canDeactivate`. |

### P1 — TOCTOU na aktywności equipment

| Plik | Co / dlaczego |
|---|---|
| `mwo-actions.ts:922-970` | `createMwo`: `SELECT … FOR UPDATE` na equipment przed sprawdzeniem `active` i INSERT MWO. |
| `mwo-actions.ts:1629-1644` | `createPmSchedule`: ten sam wzorzec — blokada wiersza przed walidacją i INSERT harmonogramu. |

### P1 — czerwony test `createPmSchedule`

| Plik | Co / dlaczego |
|---|---|
| `mwo-actions.test.ts:1234` | `params[1]` = `equipmentId` (po `site_id` w `$1`); wcześniejszy `params[2]` trafiał w `scheduleType`. |

### P2 — re-aktywacja harmonogramu na wycofanym urządzeniu

| Plik | Co / dlaczego |
|---|---|
| `mwo-actions.ts:1731-1750` | `updatePmSchedule` przy `active=true` odrzuca gdy equipment `active=false`. |
| `pm-mwo-generate.ts:241-253` | `listDuePmScheduleIds` joinuje `equipment` z `e.active=true` — cron nie skanuje harmonogramów wycofanych maszyn. |

### P2 — korekta kodu urządzenia

| Plik | Co / dlaczego |
|---|---|
| `asset-schemas.ts:23-29` | `updateEquipmentSchema` — opcjonalny `equipmentCode`. |
| `asset-actions.ts:194-212` | `UPDATE` z `equipment_code = coalesce($2, e.equipment_code)` + obsługa konfliktu unique. |
| `asset-form-modal.tsx:126-132,192-199` | Kod edytowalny w trybie edit; wysyłany do `updateEquipment`. |

---

## Testy dodane / poprawione

| Plik | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `mwo-actions.test.ts:1234` | `insert` bind `params[1]===EQUIPMENT_ID` | porównanie `'preventive'` z UUID |
| `mwo-actions.test.ts:1258-1272` | `updatePmSchedule({active:true})` na withdrawn equipment → error | manager mógłby włączyć harmonogram na złomowanej maszynie |
| `asset-actions.test.ts:188-203` | historia `cancellation` + `technician_id` | wycofanie liczone jako awaria bez aktora |
| `asset-actions.test.ts:216-230` | reaktywacja bez `deactivated_at=null`; wymaga `mnt.asset.deactivate` | technik przywracał maszynę bez lifecycle perms |
| `pm-mwo-generate.test.ts:165-175,178-186` | SQL zawiera `e.active = true` | usunięcie filtra zostawiłoby test zielony |
| `asset-register.test.tsx:102` | kod edytowalny w edit modal | readonly blokował korektę |

Importy zweryfikowane (`grep export`): `reactivateEquipment`, `updatePmSchedule`, `updateEquipment`, `generateMwoFromPmScheduleCore`, `listDuePmScheduleIds`.

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| i18n `pl`/`ro`/`uk` dla nowych kluczy assets | Osobny tor staging i18n; `page.tsx` ładuje locale file — wymaga `_meta/i18n-staging` merge, nie logiki serwerowej |
| `rep-T1.md` mirror migracji | Korekta raportu closeout, nie bug runtime |
| Migracja nowa | Kolumny audit (542) już istnieją; zmiany wyłącznie w kodzie aplikacji |

---

## Pliki zmienione

- `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_actions/asset-actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_actions/asset-actions.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_types/asset-schemas.ts`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_components/asset-form-modal.tsx`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_components/__tests__/asset-register.test.tsx`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/__tests__/mwo-actions.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/_components/pm-schedule-form-modal.tsx`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/_components/__tests__/mwo-list.test.tsx`
- `apps/web/lib/maintenance/pm-mwo-generate.ts`
- `apps/web/lib/maintenance/__tests__/pm-mwo-generate.test.ts`
