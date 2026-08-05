# Czy znaleziska z 30 lipca zostały naprawione? (Codex, 2026-08-06 00:15)

Weryfikacja **z kodu**, znalezisko po znalezisku. Punkt odniesienia: HEAD `48f1918f`.

## Rozkład werdyktów

| werdykt | ile |
|---|---|
| **NAPRAWIONE CZĘŚCIOWO** | **21** |
| NAPRAWIONE | 7 |
| NIENAPRAWIONE | 4 |

**Wniosek autora raportu:** *błędy nie zostały tylko opisane, ale kampania naprawcza jest
daleka od zamknięcia. Najczęstszy stan to „naprawiono przypadek główny, pozostawiono
sąsiedni wariant".*

| znalezisko z 30.07 | werdykt | dowód (plik:linia) |
|---|---|---|
| P0 anulowania wysyłki / `bigint` | **NAPRAWIONE w kodzie**; czerwonego testu nie zweryfikowano | [`audit-event-id.ts:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/audit-event-id.ts:1>), [`cancelShipment.ts:369`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:369>) |
| Cztery bramki fail-open | **NIENAPRAWIONE** | [`holds-guard.ts:111`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/holds-guard.ts:111>), [`movement.ts:794`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:794>), [`lp-detail-actions.ts:501`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-detail-actions.ts:501>) |
| Bramka QC meldująca zieleń bez danych | **NIENAPRAWIONE** | [`shared.ts:403`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/shared.ts:403>), [`rm-usability.ts:375`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/rm-usability.ts:375>) |
| Skaner: przenoszenie palet między zakładami | **NAPRAWIONE CZĘŚCIOWO** | [`movement.ts:470`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:470>) |
| Skaner: pobranie w pełni zarezerwowanego LP z ruchem `0` | **NAPRAWIONE** | [`movement.ts:595`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:595>) |
| Doba zakładu / sześć ścieżek przeterminowania LP | **NAPRAWIONE** w obecnym `HEAD` | [`pick-actions.ts:73`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts:73>), [`pack-lp-into-box.ts:176`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/pack-lp-into-box.ts:176>) |
| `revalidatePath('/npd/...')` / grupy tras | **NAPRAWIONE CZĘŚCIOWO** — literalnych `/npd/` już 0, ale zostały 4 inne no-op | [`promote-to-production.ts:216`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/promote-to-production.ts:216>), [`generate-production-bom.ts:196`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/generate-production-bom.ts:196>) |
| Rewalidacja wewnątrz `withOrgContext` | **NAPRAWIONE CZĘŚCIOWO** — 78 wystąpień nadal wewnątrz callbacków, 40 może rzucić w produkcji | [`reset-user-mfa.ts:193`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/reset-user-mfa.ts:193>), [`revalidate-localized.ts:19`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/i18n/revalidate-localized.ts:19>) |
| Ślepe sumowanie walut | **NAPRAWIONE** | [`get-po-aging.ts:44`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/actions/get-po-aging.ts:44>), [`report-read-actions.ts:1047`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:1047>) |
| Dwa wyścigi numeracji | **NAPRAWIONE w schemacie/kodzie** | [`564-complaint-box-number-uniqueness.sql:94`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/564-complaint-box-number-uniqueness.sql:94>), [`pack-lp-into-box.ts:232`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/pack-lp-into-box.ts:232>) |
| Import danych — 3 defekty | **NAPRAWIONE CZĘŚCIOWO** — 1/3 | [`import-csv.ts:220`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/reference/import-csv.ts:220>), [`po-import-validator.ts:50`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/import/po-import-validator.ts:50>) |
| Spójność Supabase Auth ↔ DB — 3 defekty | **NAPRAWIONE CZĘŚCIOWO** — 1/3 | [`invite.ts:289`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/invite.ts:289>), [`reactivate.ts:127`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/reactivate.ts:127>) |
| Izolacja zakładów / RLS | **NAPRAWIONE CZĘŚCIOWO** | [`551-site-visibility-hardening.sql:71`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/551-site-visibility-hardening.sql:71>), [`reporting/_actions/shared.ts:95`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/shared.ts:95>) |
| Testy-wydmuszki / anty-testy | **NAPRAWIONE CZĘŚCIOWO** | [`guard.pg.test.ts:21`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/scanner/__tests__/guard.pg.test.ts:21>), [`worker.e2e.test.ts:144`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/outbox/src/__tests__/worker.e2e.test.ts:144>) |
| Funkcje bez wykonawcy: lab/QC | **NIENAPRAWIONE** | [`quality-bridge-client.ts:57`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/lab/quality-bridge-client.ts:57>), [`lab-results/route.ts:107`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/technical/lab-results/route.ts:107>) |
| Funkcje bez wykonawcy: worker/outbox/D365 | **NAPRAWIONE CZĘŚCIOWO** | [`apps/worker/src/index.ts:64`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/worker/src/index.ts:64>), [`vercel.json:11`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/vercel.json:11>) |
| Dryf schematu — 17 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 15/17 w `HEAD`, 16/17 w drzewie roboczym | [`advanceCohort.ts:79`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/upgrade/_actions/advanceCohort.ts:79>), [`changeover-data.ts:139`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/changeover/_actions/changeover-data.ts:139>) |
| Walidacja wejścia — 6 pozycji | **NAPRAWIONE CZĘŚCIOWO** | [`fa-cell-shared.ts:116`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/schema/fa-cell-shared.ts:116>), [`technical/bom/_actions/shared.ts:207`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/shared.ts:207>) |
| Obliczenia WAC/UoM/koszty — 8 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 4 naprawione, 2 częściowo, 2 nie | [`resolve-output-wac.ts:50`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/resolve-output-wac.ts:50>), [`upsert-wac.ts:468`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/upsert-wac.ts:468>) |
| Scheduler/MRP/jakość — 10 pozycji | **NAPRAWIONE CZĘŚCIOWO** | [`sequence-solver.ts:328`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/planning/scheduler/sequence-solver.ts:328>), [`mrp-compute.ts:442`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/planning/mrp-compute.ts:442>) |
| Ruchy zapasu — 7 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 6/7 | [`to-conservation.ts:93`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/to-conservation.ts:93>), [`lp-split-merge-actions.ts:796`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/lp-split-merge-actions.ts:796>) |
| Skaner/GS1 — 6 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 2/6 | [`build.ts:70`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/gs1/src/build.ts:70>), [`code128.ts:148`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/gs1/src/code128.ts:148>) |
| Identyfikowalność/OEE — 11 grup | **NAPRAWIONE CZĘŚCIOWO** | [`output-genealogy.ts:14`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output-genealogy.ts:14>), [`trace-actions.ts:970`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/traceability/_actions/trace-actions.ts:970>) |
| Finanse końca łańcucha — 6 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 3/6 | [`so-actions.ts:622`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:622>), [`costing/compute.ts:690`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/npd/costing/compute.ts:690>) |
| Skala zapytań — 8 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 2/8 | [`561-rls-context-functions-stable.sql:48`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/561-rls-context-functions-stable.sql:48>), [`list-where-used.ts:60`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/where-used/list-where-used.ts:60>) |
| Wielozakładowość — 4 pozycje | **NAPRAWIONE CZĘŚCIOWO** — 3 pełne/częściowe, RLS nadal niepełne | [`560-org-default-site-seed.sql:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/560-org-default-site-seed.sql:1>), [`assert-site-in-org.ts:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/site/assert-site-in-org.ts:1>) |
| Integralność danych — 15 pozycji | **NAPRAWIONE CZĘŚCIOWO** — 3 naprawione, 12 pozostaje | [`556-audit-log-partition-safety.sql:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/556-audit-log-partition-safety.sql:1>), [`transition-output-qa.ts:147`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/transition-output-qa.ts:147>) |
| Główny łańcuch biznesowy | **NAPRAWIONE CZĘŚCIOWO** — logika główna poprawiona, wykonawcy eventów nadal brak | [`correct-ledger-entry.ts:70`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/corrections/correct-ledger-entry.ts:70>), [`outbox/route.ts:330`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/cron/outbox/route.ts:330>) |
| Uprawnienia i dual-sign | **NAPRAWIONE** na aktywnych ścieżkach opisanych 30.07 | [`save-org-profile.ts:103`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/onboarding/save-org-profile.ts:103>), [`materialize-npd-bom.ts:1645`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:1645>) |

Punkt odniesienia: `HEAD 48f1918f21c06a5f5729c6e6c31acbc222a4cd43`. Drzewo nie jest czyste. Jedyna istotna dla werdyktów zmiana źródłowa poza `HEAD` to poprawka Changeover w `changeover-data.ts`; pozostałe zmiany to głównie raporty i artefakty. Niczego nie zmodyfikowałem.

Wniosek ownera: **błędy nie zostały tylko opisane, ale kampania naprawcza jest daleka od zamknięcia**. Najczęstszy stan to „naprawiono przypadek główny, pozostawiono sąsiedni wariant”.

## NAPRAWIONE CZĘŚCIOWO

### 1. Skaner: zakład sprawdzany tylko dla nie-NULL

Przy ruchu skaner odrzuca znany, obcy zakład:

```ts
if (lp.site_id && lp.site_id !== destination.siteId)
```

Dowód: [`movement.ts:478`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:478>).

Pełne rozliczenie:

- LP z `site_id=A` → lokacja zakładu B: objęte, blokowane.
- LP z `site_id=A` → lokacja zakładu A: objęte, dozwolone.
- LP z `site_id=NULL` → lokacja dowolnego zakładu: **pominięte**, a późniejszy update przypisuje nowy zakład i magazyn w [`movement.ts:951`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:951>).
- Pick do WO ma osobną kontrolę dwóch znanych zakładów w [`movement.ts:570`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:570>).

### 2. NPD: naprawiono literal `/npd`, pozostawiono 4 ścieżki z grupą tras

Bezpośrednich `revalidatePath('/npd/...')` w kodzie produkcyjnym jest dziś **0**. Pozostały jednak cztery wywołania z wewnętrzną nazwą grupy tras:

1. `promote-to-production.ts:216`
2. `generate-production-bom.ts:196`
3. `generate-production-bom.ts:201`
4. `release-to-factory.ts:81`

Dowody: [`promote-to-production.ts:216`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/promote-to-production.ts:216>), [`generate-production-bom.ts:196`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/generate-production-bom.ts:196>), [`release-to-factory.ts:81`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/release-to-factory.ts:81>).

Każdy przekazuje `"/[locale]/(app)/(npd)/..."` do helpera, który dopisuje jeszcze locale w [`revalidate-localized.ts:8`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/i18n/revalidate-localized.ts:8>). To nadal nie jest publiczna ścieżka URL.

### 3. Rewalidacja w transakcjach

Statyczne zliczenie callbacków `withOrgContext` zawierających zapis i rewalidację dało:

- **78** wywołań rewalidacji fizycznie wewnątrz transakcji;
- **40** używa helpera, który może rzucić w produkcji;
- **38** lokalnie połyka błąd, lecz nadal wykonuje pracę cache przed `COMMIT`.

Wzorzec poprawny istnieje: bezpieczne wywołanie po wyjściu z transakcji w [`pick-actions.ts:230`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts:230>) i [`so-actions.ts:913`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:913>).

Pełna lista 40 nadal rzucających miejsc:

```text
actions/authorization/policy-actions.ts:141
actions/flags/set-core.ts:114
actions/modules/toggle.ts:123
actions/schema/add-column.ts:219,273
actions/security/upsert-policy.ts:175
actions/tenant/start-upgrade.ts:115
actions/users/assign-role.ts:234
actions/users/assign-user-sites.ts:175
actions/users/reset-user-mfa.ts:193

(npd)/fa/docs/_actions/upload-doc.ts:177
(npd)/fa/risks/_actions/create-risk.ts:107
(npd)/fa/risks/_actions/update-risk.ts:158
(npd)/pipeline/_actions/delete-project.ts:186
(npd)/pipeline/[projectId]/handoff/_actions/toggle-handoff.ts:85
(npd)/packaging/_actions/delete-packaging.ts:65
(npd)/packaging/_actions/upsert-packaging.ts:197,261
(npd)/pilot/_actions/delete-pilot.ts:92
(npd)/pilot/_actions/toggle-pilot.ts:91
(npd)/pilot/_actions/material-actions.ts:159
(npd)/pilot/_actions/run-actions.ts:188
(npd)/trial/_actions/delete-trial.ts:111
(npd)/trial/_actions/log-trial.ts:190
(npd)/trial/_actions/release-trial.ts:101
(npd)/trial/_actions/void-trial.ts:182

admin/quality/_actions/set-require-quality-release.ts:99
settings/roles/_actions/role-admin-actions.ts:207,324
warehouse/scanner-auth/_actions/scanner-auth.ts:155
technical/signoff/_actions/signoff-actions.ts:282,357
settings/tenant-rules/page.tsx:306,307
maintenance/_actions/mwo-actions.ts:1709

planning/purchase-orders/_actions/actions.ts:791,977
planning/transfer-orders/_actions/actions.ts:670,822
planning/work-orders/_actions/releaseWorkOrder.ts:574
```

Przykładowy helper PO łapie błąd wyłącznie pod Vitestem, a w produkcji rzuca: [`purchase-orders/_actions/actions.ts:473`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:473>). Analogicznie TO: [`transfer-orders/_actions/actions.ts:360`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:360>).

### 4. Import: 1/3

- **Naprawione:** import referencji ma preflight konfliktów przed pierwszym zapisem oraz rzuca przy CAS-miss w środku pętli: [`import-csv.ts:220`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/reference/import-csv.ts:220>), [`import-csv.ts:257`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/reference/import-csv.ts:257>).
- **Pominięte:** preview PO nie waliduje dziedziny UoM ani poprawności ceny; niepoprawna/pusta cena staje się `'0'`: [`po-import-validator.ts:59`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/import/po-import-validator.ts:59>), [`po-import-validator.ts:81`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/import/po-import-validator.ts:81>).
- **Pominięte:** pusty katalog enum nadal znaczy „przyjmij wszystko”: [`row-validation.ts:40`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/reference/_shared/row-validation.ts:40>).

### 5. Spójność Auth ↔ DB: 1/3

- `inviteUser`: ma kompensacyjne usunięcie tożsamości Auth po błędzie DB: [`invite.ts:289`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/invite.ts:289>), helper usuwający w [`invite.ts:418`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/invite.ts:418>). Nie cofnie już wysłanego e-maila, więc jest to kompensacja best-effort.
- `reactivateUser`: nadal najpierw commit DB, potem `unban`; błąd zwraca `ok:false`, chociaż użytkownik jest już aktywny w DB: [`reactivate.ts:127`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/reactivate.ts:127>), [`reactivate.ts:175`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/reactivate.ts:175>).
- `resetUserMfa`: nadal kasuje faktory w Supabase przed audytem DB; potem jeszcze rewaliduje wewnątrz transakcji: [`reset-user-mfa.ts:122`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/reset-user-mfa.ts:122>), [`reset-user-mfa.ts:173`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/reset-user-mfa.ts:173>).

### 6. Dryf schematu: 16/17 tylko w bieżącym drzewie

Naprawione A1–A5, A7–A12 i B2–B5:

- A1 [`ncr-actions.ts:205`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:205>)
- A2 [`SCIM Users route.ts:157`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/scim/v2/Users/route.ts:157>)
- A3 [`upsert-config.ts:223`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/email/upsert-config.ts:223>)
- A4 [`set-core.ts:77`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/flags/set-core.ts:77>)
- A5 [`so-shipment-release.ts:95`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/so-shipment-release.ts:95>)
- A7 [`record-sensory-evaluation.ts:232`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/sensory/_actions/record-sensory-evaluation.ts:232>)
- A8 [`checklist-template-mutations.ts:259`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/checklists/_actions/checklist-template-mutations.ts:259>)
- A9 [`draft.ts:384`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/schema-driven/src/actions/draft.ts:384>)
- A10 [`quality-signoff.ts:102`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/quality/quality-signoff.ts:102>)
- A11 [`last-changed.ts:21`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(admin)/settings/tenant/rules/last-changed.ts:21>)
- A12 [`add-column.ts:157`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/schema/add-column.ts:157>)
- B2 [`create.ts:102`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/orgs/create.ts:102>)
- B3 [`grant.ts:343`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/rbac/src/grant.ts:343>)
- B4 [`manufacturing-ops-lookup.ts:97`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/cascade/manufacturing-ops-lookup.ts:97>)
- B5 [`start-upgrade.ts:53`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/tenant/start-upgrade.ts:53>)

A6 Changeover jest naprawione **tylko w niezacommitowanej zmianie roboczej**: [`changeover-data.ts:139`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/changeover/_actions/changeover-data.ts:139>).

B1 nadal używa nieistniejącego modelu `tenant_id/cohort/failure_reason`: [`advanceCohort.ts:79`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/upgrade/_actions/advanceCohort.ts:79>), [`recordMigrationRun.ts:77`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/upgrade/_actions/recordMigrationRun.ts:77>).

### 7. Testy: poprawiono niektóre atrapy, klasa problemu została

- Direct DB test guardu skanera powstał: [`guard.pg.test.ts:21`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/scanner/__tests__/guard.pg.test.ts:21>).
- Stara bramka po nazwie `monopilot_t3` została zastąpiona zwykłym wymaganiem `DATABASE_URL`: [`hold-disposition-safety.pg.test.ts:38`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/__tests__/hold-disposition-safety.pg.test.ts:38>).
- Test `hasPermission` sprawdza dziś `org_id`: [`has-permission.test.ts:100`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/__tests__/has-permission.test.ts:100>).
- RLS-live nadal jest opt-in przez `RLS_LIVE_TESTS`: [`rls-public-exposure-remediation.test.ts:21`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/rls-public-exposure-remediation.test.ts:21>), [`516-npd-sensory-project-integrity.test.ts:24`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/516-npd-sensory-project-integrity.test.ts:24>).
- Evidence testy nadal istnieją bez sensownej asercji albo tylko z `innerHTML.length > 0`: [`costing-screen.evidence.test.tsx:145`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/__tests__/costing-screen.evidence.test.tsx:145>), [`nutrition-screen.evidence.test.tsx:111`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/__tests__/nutrition-screen.evidence.test.tsx:111>).
- Test błędnego eventu outbox nadal akceptuje dwa sprzeczne rezultaty: [`worker.e2e.test.ts:144`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/outbox/src/__tests__/worker.e2e.test.ts:144>).
- Statyczny skan bieżącego drzewa znalazł **220 plików** zawierających `describe.skip` lub `skipIf(`.

### 8. Izolacja zakładów

Naprawiono:

- `site_id IS NULL` jest fail-closed w helperze RLS: [`551-site-visibility-hardening.sql:71`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/551-site-visibility-hardening.sql:71>).
- Predykaty polityk zostały przepisane pod wydajniejsze wywołanie kontekstu: [`563-site-rls-hoist-context.sql:104`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/563-site-rls-hoist-context.sql:104>).
- Magazyn i linia sprawdzają przynależność zakładu do organizacji: [`warehouse.ts:109`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/infra/warehouse.ts:109>), [`line.ts:75`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/infra/line.ts:75>).

Pominięto:

- użytkownik z zerem przypisań `user_sites` nadal ma nieograniczony dostęp: [`551-site-visibility-hardening.sql:98`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/551-site-visibility-hardening.sql:98>);
- raportowanie traktuje brak bieżącego zakładu jako „wszystkie zakłady”: [`reporting/_actions/shared.ts:95`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/shared.ts:95>);
- statycznie polityki site-scope nadal obejmują tylko część tabel z `site_id`; dokładny stan wdrożonej bazy wymaga pomiaru katalogów PostgreSQL.

### 9. Integracje i wykonawcy

- F1 zaproszenia: naprawione przez `inviteUserByEmail`: [`invite.ts:391`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/invite.ts:391>).
- F3 D365 pull: cron jest zarejestrowany, istnieją `POST` i `GET`: [`vercel.json:11`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/vercel.json:11>), [`d365-pull/route.ts:123`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/cron/d365-pull/route.ts:123>), [`d365-pull/route.ts:155`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/cron/d365-pull/route.ts:155>).
- F2 `apps/worker`: kod rejestruje sześć jobów, ale repo nadal nie zawiera drogi wdrożenia długowiecznego procesu; Vercel konfiguruje tylko crony webowe: [`apps/worker/src/index.ts:64`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/worker/src/index.ts:64>), [`vercel.json:6`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/vercel.json:6>).
- F4 D365 sync config nadal jest zapisywany, lecz brak produkcyjnego konsumenta: [`sync-config.ts:221`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/d365/sync-config.ts:221>).
- F5 push nadal nie rozróżnia kierunku/rodzaju w pobranym rekordzie i traktuje każdy jako potwierdzenie WO: [`push.ts:290`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/integrations/d365/push.ts:290>).
- F7 cron outbox bierze maksymalnie 1000 rekordów, ale faktycznie obsługuje tylko zdarzenia cascade: [`outbox/route.ts:197`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/cron/outbox/route.ts:197>), [`outbox/route.ts:330`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/internal/cron/outbox/route.ts:330>).
- F8 eksport PO nadal ma niewidoczne `limit 200`: [`create-export-job.ts:81`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-export-job.ts:81>).
- F9 reporting-refresh obejmuje `mv_reporting_%`, nie materializowane widoki OEE.

### 10. Rozliczenie pakietów domenowych

- **OBLICZENIA 8:** naprawione #1 net anulowanych outputów [`resolve-output-wac.ts:66`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/resolve-output-wac.ts:66>), #2 odwrócone konsumpcje [`resolve-output-wac.ts:50`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/resolve-output-wac.ts:50>), #6 brak wagi pack [`compute-waterfall.ts:202`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/compute-waterfall.ts:202>), #8 błędny yield WIP [`wip-cost.ts:340`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/wip-cost.ts:340>). Częściowo #3/#5: live resolver korzysta z katalogu, snapshot nadal ma tylko kg/g/pack [`upsert-wac.ts:264`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/upsert-wac.ts:264>). Nienaprawione #4 brak snapshotu WAC i #7 pomijany reversal fallback [`upsert-wac.ts:468`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/upsert-wac.ts:468>).

- **Scheduler/MRP/jakość 10:** naprawione #1, #2, #5–#10; #4 tylko częściowo, bo wybiera jedną marszrutę, ale nadal wycina operacje innej linii [`scheduler-actions.ts:344`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/scheduler-actions.ts:344>). #3 nadal nie sprawdza przezbrojenia względem PM [`sequence-solver.ts:328`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/planning/scheduler/sequence-solver.ts:328>).

- **Ruchy zapasu 7:** naprawione #1–#4, #6 znany-site i #7; #5 nadal porównuje conservation w skali całej organizacji [`to-conservation.ts:93`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/to-conservation.ts:93>). #6 ma opisaną wyżej lukę `site_id=NULL`.

- **GS1 6:** naprawione Z1 GTIN-8/12/13/14 [`build.ts:70`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/gs1/src/build.ts:70>) i Z2 dopuszczenie znaków partii + kontrolowany błąd HTTP [`print-label/route.ts:103`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/scanner/print-label/route.ts:103>). Z3 fizyczny druk nadal nie istnieje [`print-label/route.ts:149`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/scanner/print-label/route.ts:149>); Z4 wewnętrzny separator GS nadal nieobsługiwany [`code128.ts:148`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/gs1/src/code128.ts:148>); Z5 skaner pomija `best_before` [`print-label/route.ts:69`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/scanner/print-label/route.ts:69>); Z6 receive PO nadal bez advisory locka [`receive-po.ts:338`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/receive-po.ts:338>).

- **Trace/OEE 11:** naprawione Z1–Z4, Z6, Z7. Z5 recall drills nadal mają wyłącznie odczyt [`trace-actions.ts:970`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/traceability/_actions/trace-actions.ts:970>). Z8 filtry UoM weszły do kodu TS, ale stare MV nadal sumują jednostki. Z9 nadal rzuca `uom_mismatch` [`output-genealogy.ts:47`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output-genealogy.ts:47>). Z10 kod operacyjny używa doby zakładu, ale migration 213 nadal tworzy dobowe MV w UTC. Z11 nadal obejmuje średnią nieważoną, sort tekstowy yield, stare OEE Andon, rozjazd klucza odpadu oraz liczenie planned downtime jak downtime produkcyjnego.

- **Finanse końca łańcucha 6:** naprawione #1 waluty SO [`so-actions.ts:622`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:622>), #2 wycena RMA [`rma-actions.ts:345`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/rma-actions.ts:345>), #5 cena × ilość zamówieniowa [`so-actions.ts:832`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:832>). Nienaprawione #3 sumowanie NPD w różnych walutach [`compute.ts:690`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/npd/costing/compute.ts:690>), #4 rollup tylko `raw_cost_eur` [`get-costing-rollup.ts:35`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/costing/_actions/get-costing-rollup.ts:35>), #6 blokowanie darmowej linii [`so-status-write.ts:66`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/so-status-write.ts:66>).

- **Skala 8:** naprawione Z1 `STABLE` [`561-rls-context-functions-stable.sql:48`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/561-rls-context-functions-stable.sql:48>) i Z5 sygnalizowanie truncation [`list-where-used.ts:60`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/where-used/list-where-used.ts:60>). Z2–Z4 oraz Z6–Z8 pozostają: pełne sorty audytu/ruchów, `%ilike%` bez `pg_trgm`, brak indeksu catch-weight `(org_id,captured_at)`, sekwencyjne odświeżanie bez `maxDuration`, brak retencji outbox i ciche `limit 100`.

- **Integralność danych 15:** naprawione #1 partycje audytu [`556-audit-log-partition-safety.sql:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/556-audit-log-partition-safety.sql:1>), #4 seed pierwszego zakładu/magazynu [`560-org-default-site-seed.sql:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/560-org-default-site-seed.sql:1>), #7 atomowe zwolnienie rezerwacji [`reservation-actions.ts:132`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/reservation-actions.ts:132>). Pozostają #2 brak writerów `report_access_audits`, #3 brak update `wo_operations`, #5 brak aktora decyzji QA [`transition-output-qa.ts:147`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/transition-output-qa.ts:147>), #6 brak `approved_by/at` [`supplier-spec-actions.ts:203`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/supplier-spec-actions.ts:203>), #8 dwie niepełne historie WO, #9 martwe pola forensyczne audytu, #10 brak producenta `last_login_at`, #11 ryzykowne hard-delete zakładu, #12 hard-delete genealogii przy korekcie, #13 różne skale numeric, #14 stan życia magazynu w `address`, #15 brak linku e-sign do zasobu.

## NIENAPRAWIONE

### Cztery jawne gałęzie fail-open

Wszystkie cztery nadal istnieją:

1. `holds-guard.ts:111–118`: błąd `42P01` → `null`.
2. `holds-guard.ts:168–172`: błąd `42P01` → `{ok:true}`.
3. `scanner/movement.ts:774–800`: błąd `42P01` jest ignorowany.
4. `lp-detail-actions.ts:501–516`: błąd `42P01` jest ignorowany.

Dowody: [`holds-guard.ts:111`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/holds-guard.ts:111>), [`holds-guard.ts:168`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/holds-guard.ts:168>), [`movement.ts:774`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:774>), [`lp-detail-actions.ts:501`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-detail-actions.ts:501>).

### Zielona bramka QC bez odczytu

- Producent BOM ustawia `qcRelease.required=false`: [`shared.ts:403`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/shared.ts:403>).
- Konsument przy `required=false` zwraca zielone `OK` bez odpytania danych jakościowych: [`rm-usability.ts:375`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/rm-usability.ts:375>).
- Bridge nie ma zarejestrowanego adaptera: [`quality-bridge-client.ts:57`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/technical/lab/quality-bridge-client.ts:57>).
- Endpoint zapisu wyników laboratoryjnych nadal odpowiada 501: [`lab-results/route.ts:107`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/technical/lab-results/route.ts:107>).

To jest nadal funkcja „namalowana”: tabela/API/typy istnieją, ale działająca ścieżka zapisu nie.

## NAPRAWIONE

### P0 anulowania wysyłki

`toAuditEventId()` istnieje i obsługuje `string`, `bigint` oraz `number`, odrzucając wartości niebezpieczne: [`audit-event-id.ts:1`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/audit-event-id.ts:1>).

Pokrycie:

- `cancelShipment` → wspólny `writeAuditEvent` → konwersja: [`cancelShipment.ts:738`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:738>), [`cancelShipment.ts:369`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:369>).
- `unpackShipment` → ten sam writer: [`cancelShipment.ts:869`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:869>).
- `voidPod` → ten sam writer: [`cancelShipment.ts:985`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:985>).
- zapis POD i BOL w `ship-actions`: [`ship-actions.ts:208`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:208>), [`ship-actions.ts:255`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:255>).

Czyli helper obejmuje **3 fizyczne miejsca konwersji**, które obsługują **5 operacji biznesowych**, w tym wszystkie trzy wskazane przez ownera.

Niezależny czerwony test zwracający `not_found` nie wygląda na dowód nieskuteczności tej poprawki: `not_found` powstaje przy wcześniejszym locku wysyłki w [`cancelShipment.ts:158`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:158>) i jest mapowany w [`cancelShipment.ts:618`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:618>), zanim nastąpi insert audytu. Fixture testu tworzy shipment bez `site_id`: [`wave8-shipping-integrity.pg.test.ts:155`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/__tests__/wave8-shipping-integrity.pg.test.ts:155>), a obecne RLS ukrywa taki wiersz. To jest wniosek z kodu, nie wynik ponownego uruchomienia.

### Pobranie całkowicie zarezerwowanej palety

Skaner oblicza `available_qty` i odrzuca wartość `<= 0` przed ruchem; zapis ruchu używa tej samej dodatniej ilości: [`movement.ts:595`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:595>), [`movement.ts:617`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:617>).

### Wszystkie sześć ścieżek bezpieczeństwa daty ważności

Nocny, niezależny pomiar był prawdziwy dla wcześniejszego stanu drzewa, ale obecny `HEAD` zawiera już wszystkie sześć podmian:

1. [`lp-safety-guard.ts:46`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/lp-safety-guard.ts:46>)
2. [`scanner/movement.ts:747`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:747>)
3. [`shipping/pick-actions.ts:73`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts:73>)
4. [`shipping/ship-actions.ts:464`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:464>)
5. [`shipping/so-actions.ts:1404`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:1404>)
6. [`pack-lp-into-box.ts:176`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/pack-lp-into-box.ts:176>)

Wszystkie używają `expiredBySiteDaySql`. Surowe `current_date` w `so-actions.ts:1379` zostało tylko w obliczeniu kolejności/liczby dni, nie w bramce dopuszczającej LP.

### Trzy błędy walutowe

- PO aging grupuje po walucie: [`get-po-aging.ts:44`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/actions/get-po-aging.ts:44>).
- Ranking dostawców zwraca walutę, a przy miksie daje `NULL`: [`report-read-actions.ts:1047`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:1047>).
- UI formatuje rzeczywistą walutę, nie USD: [`reporting-overview.client.tsx:235`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_components/reporting-overview.client.tsx:235>).

### Wyścigi numeracji

Migration 564 dodaje unikalność numeru reklamacji i numeru kartonu w wysyłce: [`564-complaint-box-number-uniqueness.sql:94`](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/564-complaint-box-number-uniqueness.sql:94>). Pakowanie ma savepoint i retry po konflikcie: [`pack-lp-into-box.ts:232`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/pack-lp-into-box.ts:232>).

### Uprawnienia

- wszystkie trzy akcje onboardingu sprawdzają uprawnienie przed mutacją: [`save-org-profile.ts:103`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/onboarding/save-org-profile.ts:103>), [`create-first-warehouse.ts:80`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/onboarding/create-first-warehouse.ts:80>), [`create-first-location.ts:52`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/onboarding/create-first-location.ts:52>);
- materializacja NPD tworzy draft `source=npd_builder`, nie fałszywe `approved_for_factory`: [`materialize-npd-bom.ts:1645`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:1645>);
- NCR, hold i CCP mają stany oczekiwania na drugi podpis: [`ncr-actions.ts:1040`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:1040>), [`hold-actions.ts:830`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:830>), [`ccp-deviation-actions.ts:272`](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/ccp-deviation-actions.ts:272>).

## WYMAGA URUCHOMIENIA

Nic nie zostało uruchomione: żadnego testu, builda, bazy, migracji, serwera ani żądania HTTP. Nie ma więc stdout testów do zacytowania.

Potrzebne pomiary:

1. **P0 shipping:** poprawić fixture `wave8-shipping-integrity` tak, by shipment miał ważny `site_id` widoczny dla aktora, następnie uruchomić test DB. To oddzieli RLS-owe `not_found` od konwersji `bigint`.
2. **Migracje 551/560/561/563/564:** uruchomić migracje na klonie, sprawdzić `schema_migrations`, `pg_policies`, `pg_proc.provolatile`, duplikaty numerów i konflikt równoległych insertów.
3. **Bramki fail-open:** usunąć/odebrać dostęp do relacji w transakcji testowej i potwierdzić, że obecny kod faktycznie przepuszcza. Odczyt kodu wskazuje jednoznacznie fail-open, ale skutku transakcyjnego nie mierzyłem.
4. **RLS cross-site:** test jako `app_user` dla użytkownika z jednym zakładem, zerem przypisań i dla rekordów `site_id=NULL`; zmierzyć rzeczywistą liczbę tabel/polityk w katalogu bazy.
5. **Testy:** pełne CI z `DATABASE_URL` oraz osobny przebieg z `RLS_LIVE_TESTS=1`; obecność testu w repo nie dowodzi, że faktycznie jest wykonywany.
6. **Worker/integracje:** sprawdzić infrastrukturę poza repo — aktywny proces `apps/worker`, heartbeat, DLQ, email retry i D365 sync. Sam kod repo nie może potwierdzić zewnętrznego deployu.
7. **Skala:** `EXPLAIN (ANALYZE, BUFFERS)` na realistycznych wolumenach dla audytu, stock movements, wyszukiwania, catch-weight i refresh MV.
8. **UI/i18n:** Playwright dla NPD po mutacji, by potwierdzić, że cztery błędne rewalidacje rzeczywiście pozostawiają stary ekran.

Dowód drzewa: `git diff --stat` na końcu odczytu pokazał dokładnie:

```text
94 files changed, 246 insertions(+), 108 deletions(-)
```

`stdout` testów: **brak — zgodnie ze zleceniem nie zostały wykonane**.
