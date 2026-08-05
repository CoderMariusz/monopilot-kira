# Triage niezacommitowanej fali z 30.07 (Codex, 2026-08-05 22:59)

Klasyfikacja 66 plików kodu: **64 realne poprawki / 1 celowe uszkodzenie / 1 szum**.
Mutacja z kategorii B została cofnięta przeze mnie o 00:44.

Wynik: **64 pliki to realne poprawki (A), 1 plik zawiera pozostawioną mutację (B), 1 jest szumem generowanym (C), 0 nierozstrzygniętych (D)**.

Nie modyfikowałem plików i nie uruchamiałem testów ani buildów.

| kategoria | plik | uzasadnienie |
|---|---|---|
| A | `apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts` | Korekta outputu może teraz dopisać replacement, precyzyjnie przelicza jego wartość i odtwarza WAC w tej samej transakcji. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts` | Ilości linii TO są normalizowane do bazowej jednostki produktu przed zapisem, wysyłką i odbiorem. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.test.ts` | Dodano testy normalizacji `g → kg`, odrzucenia błędnej jednostki przed zapisem oraz odbioru starszych danych. |
| A | `apps/web/lib/uom/convert.ts` | Dodano współdzieloną, org-scoped i dokładną do 6 miejsc funkcję normalizującą ilość do bazowego UOM produktu. |
| A | `packages/outbox/src/worker.ts` | Błąd handlera jest ponawiany do limitu zamiast natychmiastowego DLQ, a nieudany DLQ nie oznacza już zdarzenia jako skonsumowanego. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.test.ts` | Testy potwierdzają normalizację ręcznie dodawanej linii PO i brak zapisów po błędzie UOM. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-purchase-order-core.test.ts` | Testy wymagają normalizacji wszystkich linii przed utworzeniem nagłówka PO. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ncrs/[ncrId]/_components/ncr-detail.client.tsx` | Widok synchronizuje stan z RSC, wymaga utrwalonej root cause i pokazuje oczekujący drugi podpis. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts` | Dodawanie i edycja linii PO zapisują ilość w bazowym UOM, odrzucając niekonwertowalne dane przed zapisem. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/warehouse-actions.test.ts` | Mock transakcji odzwierciedla commit przy zwykłym returnie i rollback przy throw oraz sprawdza błąd rewalidacji po udanym zapisie. |
| A | `apps/web/lib/uom/convert.test.ts` | Dodano test dokładnej konwersji jednostki dodatkowej oraz brakującej lub niedozwolonej jednostki bazowej. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ncrs/[ncrId]/_components/ncr-close-modal.client.tsx` | Modal obsługuje sekwencyjne podpisy, zamraża decyzję po pierwszym podpisie i mapuje błędy polityki. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/__tests__/actions.test.ts` | Testy zostały dopasowane do normalizacji i odrzucają starszą, swobodną jednostkę `case`. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-detail.client.tsx` | LP pozostaje zablokowany po pierwszym podpisie, a modal pokazuje oczekującego sygnatariusza. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/_components/__tests__/ccp-deviations.test.tsx` | Testuje stan oczekiwania po pierwszym podpisie i zamrożenie decyzji CCP. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/__tests__/ship-mixed-uom.test.ts` | Fikcyjne side-effecty zastąpiono śledzeniem rzeczywistych parametrów i asercją zapisu w bazowym UOM. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/__tests__/lp-detail.test.tsx` | Test potwierdza, że LP nie zostaje odblokowany przed drugim podpisem. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/__tests__/lp-detail-actions.test.ts` | Test akcji wymaga stanu `blocked/on_hold` podczas oczekiwania na drugi podpis. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/holds/[holdId]/_components/hold-detail.client.tsx` | Dodano stan oczekującego podpisu, utrwalanie pól decyzji i ukrycie zwolnienia krytycznego holdu przed jego twórcą. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/_components/deviation-resolve-modal.client.tsx` | Modal obsługuje drugi podpis i nie pozwala zmienić decyzji lub disposition po pierwszym podpisie. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_components/create-to-modal.tsx` | Lista UOM jest ograniczona do wybranego produktu, bez niebezpiecznego domyślnego `kg`. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-detail-actions.ts` | Akcja rozróżnia zakończone odblokowanie od oczekiwania na drugi podpis i nie zwraca przedwcześnie `available`. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_components/to-line-modal.tsx` | UOM zależy od produktu i jest resetowany przy zmianie lub wyczyszczeniu produktu. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/_components/deviations-list.client.tsx` | Lista pokazuje oczekującego sygnatariusza i pozwala wykonać drugi podpis bez utraty wybranego odchylenia. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/create-transfer-order-core.ts` | Wszystkie linie są normalizowane przed utworzeniem nagłówka TO, więc błąd UOM nie pozostawia częściowego zapisu. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-purchase-order-core.ts` | Wszystkie linie są normalizowane przed pierwszym zapisem PO. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/po-line-modal.tsx` | Formularz linii PO oferuje wyłącznie UOM dozwolone dla danego produktu. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-detail-labels.ts` | Dodano etykiety oczekującego i drugiego podpisu dla odblokowania LP. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/_components/labels.ts` | Rozszerzono typowane etykiety o stan drugiego podpisu i błędy polityki podpisu. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/__tests__/transfer-orders.test.tsx` | Test sprawdza brak globalnego `pallet` oraz obecność właściwego dla produktu `g`. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/__tests__/purchase-orders.test.tsx` | Test potwierdza, że opcje UOM pochodzą z definicji produktu. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/create-po-modal.tsx` | Nowe linie PO mają UOM ograniczony do produktu i resetowany przy zmianie produktu. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/_actions/procurement-shared.ts` | Dodano wspólny błąd `line_uom_not_convertible` i wykorzystano kanoniczną funkcję normalizacji. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/formulation/page.tsx` | Etykiety ICU i surowe placeholdery są pobierane przez `messageTemplate`, więc nie wyświetlają kluczy i18n. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/to-form-data.ts` | Dane formularza zawierają org-scoped bazowy, dodatkowy i wyjściowy UOM produktu. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/approval/page.tsx` | Szablony komunikatów approval/compliance/risk używają właściwego API `messageTemplate`. |
| A | `apps/web/lib/integrations/d365/push.ts` | Bramka `assertD365Enabled` jest wykonywana przed mutacją joba i wywołaniem transportu. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts` | Usunięto zduplikowaną normalizację na rzecz współdzielonej, dokładnej i org-scoped implementacji. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/costing/_lib/page-loader.ts` | Etykiety scalar i kroków kosztowych są pobierane jako szablony ICU. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/_actions/quality-signoff.ts` | Zapytanie ról używa istniejących kolumn `name/code` zamiast nieistniejącej `display_name`. |
| A | `apps/web/app/[locale]/(app)/(admin)/account/profile/profile-data.ts` | „Wyloguj wszędzie” usuwa także kontekst sesji i impersonacji po pomyślnym sign-out. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/to-conservation.ts` | Ilości w tranzycie są grupowane według rzeczywistego `tll.uom`, a nie etykiety z linii TO. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/adjustments/_components/direct-adjust-form.client.tsx` | Formularz korzysta ze współdzielonego generatora dozwolonych UOM zamiast lokalnej kopii. |
| A | `packages/db/schema/factory-specs.ts` | Constraint Drizzle został zsynchronizowany z istniejącą migracją 559 i jej modelem dowodu e-sign. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/products/new/page.tsx` | Komunikaty z placeholderami używają `messageTemplate`. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/trial/page.tsx` | Komunikaty trial używają `messageTemplate`. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/sensory/page.tsx` | Komunikaty sensory używają `messageTemplate`. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/pilot/page.tsx` | Komunikaty pilot używają `messageTemplate`. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/packaging/page.tsx` | Komunikaty packaging używają `messageTemplate`. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/nutrition/_lib/page-loader.ts` | Loader nutrition zwraca poprawnie przetworzone szablony komunikatów. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/handoff/page.tsx` | Komunikaty handoff używają `messageTemplate`. |
| A | `apps/web/app/[locale]/(app)/(modules)/(npd)/pipeline/[projectId]/_lib/build-stale-wip-banner-labels.ts` | Etykiety bannera stale-WIP zachowują placeholdery do późniejszego podstawienia. |
| A | `apps/web/app/[locale]/(app)/(admin)/settings/npd-checklist/_actions/checklist-template-mutations.ts` | Parametry PostgreSQL są jawnie rzutowane na `int`, co usuwa błąd operatora `unknown + unknown`. |
| A | `apps/web/app/api/warehouse/scanner/ship/shipments/route.ts` | Próby listowania przesyłek bez uprawnienia są rejestrowane w audycie przed odpowiedzią 403. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/_components/ccp-deviations-contracts.ts` | Kontrakt klienta przenosi dane o oczekującym podpisie. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_components/supplier-types.ts` | Typ błędów formularza obejmuje nowy błąd niekonwertowalnego UOM. |
| A | `apps/web/app/[locale]/(app)/_actions/sign-out.ts` | Wylogowanie czyści sesję Supabase i kontekst act-as przed przekierowaniem. |
| A | `apps/web/app/[locale]/(app)/layout.tsx` | Layout używa osobnej Server Action i nie połyka już błędu w inline `catch`. |
| C | `apps/web/next-env.d.ts` | Zmiana `.next/types/routes.d.ts` na `.next/dev/types/routes.d.ts` jest generowanym przez Next.js artefaktem trybu dev. |
| A | `apps/web/lib/cascade/manufacturing-ops-lookup.ts` | Poprawiono kwalifikację PostgreSQL z jednego identyfikatora na prawidłowe `"Reference"."ManufacturingOperations"`. |
| A | `apps/web/app/[locale]/(app)/(modules)/production/changeover/_actions/changeover-data.ts` | Join obsługuje tekstowe UUID i starszy kod linii, usuwając błąd porównania `uuid = text`, choć wymaga jeszcze doprecyzowania site. |
| A | `apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_components/count-client-result.ts` | `count_uom_ambiguous` jest mapowany na właściwy błąd wejścia zamiast ogólnej awarii. |
| A | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-deviations/page.tsx` | Strona przekazuje stan pending-signoff z backendu do klienta. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_components/edit-supplier-modal.tsx` | Modal edycji obsługuje nowy typ błędu UOM bez obchodzenia typów. |
| A | `apps/web/app/[locale]/(app)/(modules)/planning/suppliers/_components/create-supplier-modal.tsx` | Modal tworzenia obsługuje nowy typ błędu UOM. |
| B | `apps/web/app/api/warehouse/scanner/pick/lps/route.ts` | Usunięto filtr wykluczający przeterminowane LP z listy kandydatów do pobrania. |

## B — DO NATYCHMIASTOWEGO COFNIĘCIA

### `apps/web/app/api/warehouse/scanner/pick/lps/route.ts`

Fragment odbierający poprawność:

```diff
-              and (lp.expiry_date is null or lp.expiry_date::date >= current_date)
```

Skutek: endpoint GET skanera zaczyna prezentować przeterminowane LP jako kandydatów do pickingu. Jest to sprzeczne z kontraktem WH-055, według którego lista ma zawierać tylko LP released, nieprzeterminowane i bez holdu.

Końcowa operacja ruchu nadal posiada osobną blokadę `lp.expired` i zwraca 409, więc mutacja nie umożliwia skutecznego pobrania przeterminowanego zapasu. Psuje jednak listę wyboru: operator zobaczy niedozwolony LP, wybierze go, a dopiero zapis zostanie odrzucony.

## A — WARTE COMMITU, POGRUPOWANE TEMATYCZNIE

1. Normalizacja jednostek PO, TO i korekt magazynowych  
   Obejmuje wspólny konwerter, akcje PO/TO, konserwację ilości w tranzycie, formularze UOM i testy.  
   Commit: `fix(planowanie): normalizuj ilości PO i TO do bazowych jednostek produktów`

2. Sekwencyjne podpisy NCR, CCP, holdów i LP  
   Obejmuje stany pending-signoff, zamrożenie decyzji, drugi podpis, SoD i poprawkę zapytania ról.  
   Commit: `fix(jakość): obsłuż sekwencyjny drugi e-podpis w procesach jakościowych`

3. Korekta outputu produkcyjnego  
   Obejmuje replacement output, dokładne wartościowanie, WAC i zapis w audycie.  
   Commit: `fix(produkcja): odtwarzaj output i WAC podczas korekty produkcyjnej`

4. Outbox i D365  
   Obejmuje ponawianie handlerów, bezpieczny DLQ oraz bramkę integracji przed mutacją joba.  
   Commit: `fix(integracje): ponawiaj błędy outboxu i egzekwuj bramkę D365`

5. Wylogowanie i kontekst impersonacji  
   Obejmuje wspólną Server Action i czyszczenie kontekstu act-as.  
   Commit: `fix(auth): usuwaj kontekst sesji i act-as przy wylogowaniu`

6. Szablony ICU w NPD  
   Obejmuje formulation, approval, costing, trial, sensory, pilot, packaging, nutrition, handoff i stale-WIP.  
   Commit: `fix(npd): pobieraj komunikaty ICU przez messageTemplate`

7. Poprawki SQL i zgodność schematu  
   Obejmuje constraint factory specs, rzutowania checklisty, nazwę tabeli ManufacturingOperations i join changeover.  
   Commit: `fix(sql): zsynchronizuj constrainty i popraw zapytania runtime`

8. Bezpieczeństwo i diagnostyka magazynu  
   Obejmuje audyt odmowy skanera, poprawne mapowanie błędu count UOM i realistyczne testy semantyki transakcji.  
   Commit: `fix(magazyn): audytuj odmowy skanera i popraw obsługę błędów operacji`

## RYZYKA

1. **Changeover nadal jest niedokończony dla wielu site’ów.** Nowy warunek:

```ts
and (pl.id::text = ce.line_id or pl.code = ce.line_id)
```

naprawia błąd `uuid = text`, ale fallback po `pl.code` filtruje tylko po `org_id`. Po zniesieniu org-wide unikalności kodu linii ten sam kod może wystąpić w wielu site’ach, co może zduplikować wiersze lub przypisać złą nazwę. Przed commitem trzeba powiązać fallback również przez `site_id`, uwzględniając starsze rekordy z `NULL`.

2. **Korekta outputu nie jest podłączona do UI.** Backend przyjmuje `replacement`, ale formularz `void-correction-modal.tsx` nie wystawia pola poprawionej ilości i nie przekazuje replacement. Nowa ścieżka jest pokryta kontraktem testowym, lecz operator nie może jej uruchomić z interfejsu.

3. **Część A zależy od zmienionych plików spoza listy 66.**

   - `apps/web/components/forms/uom-select.tsx` dostarcza nowy `itemUomOptions`; bez wspólnego commita importy formularzy PO/TO nie będą kompletne.
   - `apps/web/app/[locale]/(app)/(modules)/quality/_components/pending-quality-signoff.tsx` jest nowym, niezacommitowanym komponentem importowanym przez zmiany jakościowe.
   - `_meta/i18n-staging/quality-ncrs.json` i `_meta/i18n-staging/warehouse-lp.json` zawierają wymagane nowe etykiety.

   Zacommitowanie wyłącznie plików z badanej listy pozostawiłoby zmiany UOM i podpisów niekompletne.

4. `packages/db/schema/factory-specs.ts` **nie wymaga nowej migracji**: odpowiada już istniejącej migracji `559-factory-spec-esign-evidence.sql`.

5. Zgodnie z zakazem nie wykonywałem testów ani builda, więc raport potwierdza semantykę diffów, ale nie stan wykonawczy całego drzewa.
