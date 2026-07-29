# Fala 12 — tor T1 (utrzymanie ruchu: rejestr aktywów + przeglądy PM)

## PF-R20-01 — rejestr aktywów: korekta i wycofanie

### Przyczyna źródłowa
UI rejestru (`asset-register.client.tsx`) eksponował wyłącznie „Add asset”; serwer (`asset-actions.ts`) implementował tylko `createEquipment`. Tabela `public.equipment` miała kolumnę `active`, ale brakowało śladu wycofania (kto/kiedy/dlaczego) — migracja 201 nie definiowała `deactivated_*`.

### Zmiany
| Plik | Co i dlaczego |
|---|---|
| `packages/db/migrations/542-maintenance-equipment-withdrawal-audit.sql` (+ mirror `src/`) | Dodaje `deactivated_at`, `deactivated_by`, `deactivation_reason` + CHECK — wycofanie bez kasowania wiersza, z audytowalnym powodem. |
| `packages/db/schema/maintenance.ts:130-133` | Drizzle zsynchronizowany z migracją 542. |
| `assets/_types/asset-schemas.ts` | Schematy `update` / `deactivate` / `reactivate`; `AssetPermissions.canDeactivate`. |
| `assets/_actions/asset-actions.ts` | `updateEquipment` (mnt.asset.edit), `deactivateEquipment` (mnt.asset.deactivate → `active=false`, kolumny audytu, dezaktywacja harmonogramów PM, wpis `maintenance_history`), `reactivateEquipment` (czyści ślad wycofania). |
| `assets/_components/asset-form-modal.tsx` | Tryb create/edit; wycofanie z wymaganym powodem; reaktywacja. |
| `assets/_components/asset-register.client.tsx:147-195` | Kolumna Actions + modal edycji. |
| `assets/page.tsx` | Przekazanie `canDeactivate` i nowych etykiet i18n. |
| `mwo-actions.ts:922-970` | `createMwo` odrzuca wycofane urządzenie (`active=false`) — serwerowa bramka obok istniejącego filtra w `listEquipmentForMwo`. |
| `_meta/i18n-staging/maintenance-assets.json`, `apps/web/i18n/en.json` | Etykiety edit/withdraw/reactivate. |

### Testy dodane / rozszerzone
| Test | Co wywróciłby się bez poprawki |
|---|---|
| `asset-actions.test.ts` — `updateEquipment` sprawdza UPDATE bez zmiany kodu | Brak `updateEquipment` → test nie znalazłby wywołania UPDATE z `name`. |
| `asset-actions.test.ts` — `deactivateEquipment` wymaga `deactivation_reason` w SQL i INSERT do `maintenance_history` | Samo `active=false` bez kolumn audytu/historii → asercje na `deactivated_at` i history padłyby. |
| `asset-register.test.tsx` — `asset-edit-MIX-01` otwiera modal z readonly kodem | Brak kolumny Actions → przycisk Edit nie istnieje. |

---

## PF-R20-03 — harmonogramy PM: cykliczność i generowanie MWO

### Przyczyna źródłowa
Zakładka PM (`mwo-pm-schedule-list.tsx` + i18n `pm.subtitle`) deklarowała „read-only / engine later”, mimo że silnik `pm-mwo-generate.ts` + cron `pm-schedule-due` już istniały. Brakowało Server Actions i UI do zapisu reguł w `maintenance_schedules`.

### Zmiany
| Plik | Co i dlaczego |
|---|---|
| `_types/pm-schedule-schemas.ts` | Walidacja create/update (calendar_days, `intervalValue >= 1`). |
| `mwo-actions.ts` — `createPmSchedule` / `updatePmSchedule` | Gate `mnt.pm.create`; INSERT z `next_due_date = coalesce($anchor, pg_catalog.now()::date)` (bez `CURRENT_DATE`); walidacja aktywnego equipment. |
| `mwo-actions.ts` — `getMwoPermissions` | Flaga `canManagePm`. |
| `_components/pm-schedule-form-modal.tsx` | Modal create/edit reguły cykliczności. |
| `_components/mwo-pm-schedule-list.tsx` | Przyciski Create/Edit; usunięty komunikat „stub”. |
| `_components/mwo-list.client.tsx`, `page.tsx` | Podpięcie akcji i uprawnień. |
| `lib/maintenance/pm-mwo-generate.ts:151-153` | Generator MWO wymaga `e.active = true` — wycofane maszyny nie rodzą zleceń PM. |
| `_meta/i18n-staging/maintenance-mwo.json` | Nowe klucze `pm.createSchedule`, `pm.form.*`, zaktualizowany `pm.subtitle`. |

Generator: **istniejący** `generateMwoFromPmScheduleCore` + cron `runPmScheduleDueEngine` — bez duplikatu silnika.

### Testy dodane / rozszerzone
| Test | Co wywróciłby się bez poprawki |
|---|---|
| `mwo-actions.test.ts` — `createPmSchedule` wymaga INSERT z `pg_catalog.now()::date` | Brak akcji create → brak INSERT do `maintenance_schedules`; test pada na `result.ok`. |
| `mwo-actions.test.ts` — forbidden bez `mnt.pm.create` | Brak gate RBAC → akcja zwróciłaby `ok: true` mimo braku uprawnienia. |
| `mwo-list.test.tsx` — `pm-schedule-create-open` otwiera modal | Stub UI → brak przycisku create. |
| `pm-mwo-generate.test.ts` — withdrawn equipment → `not_found` | Bez filtra `e.active` generator nadal tworzyłby MWO dla wycofanej maszyny. |

---

## Świadomie NIE ruszone
| Obszar | Powód |
|---|---|
| PF-R20-02 LOTO single-signer | Poza zakresem T1 (inny tor). |
| PF-R20-04/05 kalibracja | Poza zakresem T1. |
| `usage_hours` / `usage_cycles` w silniku PM | Schema-ready, engine nadal calendar_days only (zgodnie z MON-domain-maintenance P1). |
| Widoki kalendarza PM z prototypu (`pm-schedules.jsx` week/month) | Poza minimalnym AC — lista + reguła cykliczności wystarcza do planowania. |
| Hard delete equipment | FK `on delete restrict` + wymaganie audytu — tylko soft withdraw. |
| `ro`/`uk` i18n maintenance.assets | Strona assets czyta `en.json`; MWO używa staging bundle en/pl (istniejący wzorzec lane W8). |

## Znaleziska poza zakresem (zgłoszone, nie naprawiane)
| ID | Opis |
|---|---|
| PF-R20-02 | LOTO apply jednym podpisem — P0 life-safety (`mwo-actions.ts` verifyLotoLockout). |
| PF-R20-04 | Odwrócony zakres kalibracji akceptowany przez serwer. |
| PF-R20-05 | Formularz kalibracji wymaga ręcznego UUID recenzenta. |

## Migracja
`542-maintenance-equipment-withdrawal-audit.sql` — wymagana na prod przed użyciem `deactivateEquipment` (kolumny audytu). Reszta PM działa na istniejącej tabeli `maintenance_schedules` (migracja 201).
