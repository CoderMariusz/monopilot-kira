# FALA 6 — rejestr znalezisk cross-review

## Recenzja T3 (Printers RSC) — Codex, FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T3-1 | P2 | Zadeklarowane artefakty (`page-rsc.test.ts`, `rep-T3.md`) są **nieśledzone** — diff obejmuje tylko `page.tsx` i `page.test.tsx` | **[F]** — dopilnować przy stagingu |
| T3-2 | P2 | **Testy nie wykonują rzeczywistej serializacji RSC.** `renderPage` woła `Page(props)` jak zwykłą funkcję → omija React Flight. Test „bez crashu boundary" **przeszedłby też ze starą wadliwą strzałką**. Test źródłowy sprawdza nazwę funkcji, ale nie wymaga dyrektywy `'use server'` ani poprawnego mapowania argumentu | **[F]** — przypiąć dyrektywę i mapowanie argumentu, przemianować test, żeby nie obiecywał więcej niż sprawdza |

**Czyste (potwierdzone):** Next 16 **wspiera** lokalną funkcję `async` z `'use server'` w Server
Component przekazaną przez referencję — **naprawa naprawdę działa**. `removePrinter` zwraca
`Promise<void>`, adapter zachowuje wynik i propaguje błędy. Pozostałe propy serializowalne.
**Nie znaleziono innej trasy z tym samym wzorcem** `?? ((...) => ...)`.

## Recenzja T4 (zaproszenia) — Codex, FIX-FIRST — 3×P1
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T4-1 | **P1** | **Nowy join audytowy NIE WYKONA SIĘ na prawdziwym schemacie.** `audit_log.resource_id` jest `text`, a kod porównuje go z `users.id uuid`; do tego sortuje po **nieistniejącej** kolumnie `al.created_at`. Błędy w **obu** miejscach (`LATERAL` i `EXISTS`). Każde `listInvitations`/`resendInvitation`/`revokeInvitation` → błąd SQL → `persistence_failed` → **cały ekran cyklu życia martwy**. Mock testowy wstrzykuje gotowe `invited_by*`, więc tego nie wykrywa | **[F]** — **POTWIERDZIŁEM NA PRODZIE**, patrz niżej |
| T4-2 | **P1** | **Cofnięte zaproszenie da się reaktywować i fałszywie zmienić na `accepted`.** Revoke zostawia expiry, ale zeruje token; ekran Users klasyfikuje każdy nieaktywny wiersz bez tokenu jako `disabled`; `reactivateUser` dopuszcza dokładnie `invite_token is null` → „Reactivate" → `is_active=true` → lista pokazuje `accepted` dla zaproszenia, które **cofnięto i nigdy nie zaakceptowano** | **[F]** |
| T4-3 | **P1** | Nowy test listy jest **deterministycznie czerwony** — fake klient nie emuluje `ORDER BY`, a asercja oczekuje innej kolejności | **[F]** |
| T4-4 | P2 | Zapytanie audytowe skaluje się z liczbą użytkowników **i wszystkimi partycjami** — `LATERAL … LIMIT 1` per user + `EXISTS`, bez predykatu `occurred_at`, bez `resource_type`, bez limitu listy. Istniejący indeks `(resource_type, resource_id, occurred_at)` **nie pasuje** do obecnego filtra | **[F]** — pobrać raz w CTE/`DISTINCT ON` |
| T4-5 | P2 | **Uprawnienie invite nie wystarcza, by zobaczyć pozycję nawigacji** — Invitations jest w grupie `admin: true`, a filtr usuwa całą grupę Access przy `canViewAdminSettings=false`, **zanim** uwzględni `canManageInvitations` | **[F]** |
| T4-6 | P2 | **Nowe komunikaty nie istnieją w `ro` i `uk`** — klucze dodane tylko do `en`/`pl`. Test opisany jako „all locales" iteruje **wyłącznie po `en` i `pl`** | **[F]** |
| T4-7 | P2 | Revoked pokazuje **jednocześnie** „immutable" i „lifecycle unavailable" — ogólny warunek obejmuje każdy status poza `accepted` | **[F]** |

### Dowód orchestratora na produkcji (T4-1)
```
information_schema: audit_log ma  occurred_at, resource_id  →  created_at NIE ISTNIEJE
select 'x'::text = gen_random_uuid();
  ERROR:  operator does not exist: text = uuid
```
**Ta poprawka położyłaby cały ekran zaproszeń.** Złapane przed deployem.

**Czyste w T4:** expired i revoked są logicznie rozróżnialne (expired zachowuje token, revoked ma
`null`); **endpoint akceptacji atomowo zużywa tylko istniejący, niewygasły token — stary token po
revoke nie aktywuje konta**; docelowy filtr wyklucza zwykłych aktywnych użytkowników; `System`
wybierany **tylko** dla `actor_type='system'`, brak aktora → `unknown`; wszystkie nowe odczyty
audytu zawierają `org_id`.

## Recenzja T2 (hierarchia lokalizacji) — Codex, FIX-FIRST — 4×P1
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T2-1 | **P1** | **Wyścig dezaktywacja-rodzica ↔ utworzenie-dziecka nadal łamie niezmiennik.** Odczyt rodzica i `count(active children)` **nie blokują wiersza**; osobne transakcje decydują na tym samym starym stanie → stan końcowy odtwarza R02-03. CSV bierze udział w tym samym wyścigu | **[F]** — `SELECT … FOR UPDATE` na rodzicu we **wszystkich** writerach + test dwóch transakcji |
| T2-2 | **P1** | `ON CONFLICT` importu może **przenieść** aktywną lokalizację pod nieaktywnego rodzica | **[F]** |
| T2-3 | **P1** | **OVER-BLOCKING MIMO WSZYSTKO — niezgodny aktywny węzeł POŚREDNI jest nieedytowalny.** `L1 nieaktywny → L2 aktywny → L3 aktywny`; użytkownik zmienia **samą nazwę L2** → serwer zwraca `has_active_children` → zapis odrzucony. **Wprost przeczy krytycznemu wymogowi anty-over-blockingu.** Test pokrywa tylko niezgodny **liść**, nie ten przypadek. Raport autora nazywa to „tarciem", choć rekord **nie daje się edytować** | **[F]** — przy niezmienionym powiązaniu zachować bieżącą flagę i pokazać ścieżkę naprawczą; dopisać test trzech węzłów |
| T2-4 | **P1** | Przy nieaktualnym stanie rodzica **ekran pokazuje inną aktywność niż baza** | **[F]** |
| T2-5 | P2 | Argument indukcyjny nie działa dla istniejących niezgodnych danych | **[F]** |

## Recenzja T5 (display name / adres magazynu / DialogTitle) — Codex, FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T5-1 | **P1** | **Nowo utworzony magazyn TRACI ADRES przy pierwszej edycji bez odświeżenia.** `createWarehouse` zwraca `address`, ale **nie** `addressLine1`; klient dodaje wiersz bez tego pola → dialog edycji wypełnia adres pustym stringiem → zapis wysyła `address: null` → **kasuje `line1`**. Utworzenie z adresem → edycja samej nazwy → adres znika z bazy | **[F]** — regresja **wprowadzona przez tę naprawę** |
| T5-2 | P2 | Tryb „act as" nadal ignoruje zapisany display name | **[F]** |
| T5-3 | **P1** | **Raport toru błędnie opisuje SCIM.** Twierdzi, że użytkownik SCIM dostaje `name` z NOT-NULL-owego defaultu — **taki default nie istnieje**. INSERT pomija **zarówno wymagane `name`, jak i wymagane `role_id`** | **[R]** korekta raportu + **[N] osobny P1** — patrz niżej |
| T5-4 | P2 | Raport nie zawiera wymaganego pełnego inwentarza czytelników | **[R]** |

## ⛔ ZNALEZISKA POBOCZNE (zastane, poza zakresem Fali 6)
| # | Znalezisko |
|---|---|
| N-1 | **SCIM CREATE nie może utworzyć użytkownika.** `api/scim/v2/Users/route.ts:145` — INSERT pomija wymagane `name` **i** wymagane `role_id` → poprawny SCIM POST kończy się naruszeniem `NOT NULL`. Provisioning użytkowników przez SCIM jest **całkowicie niedziałający** |
| N-2 | Partycje `audit_log` kończą się **2027-01-01**, brak crona dosypującego (przeniesione z Fali 5) |
| N-3 | Bramka migracyjna CI martwa od mig 279 (przeniesione z Fali 4) |
| N-4 | `reset-password.ts` mintuje link recovery, **nigdy go nie czyta** i kasuje sesje; `compliance-docs-expiry.ts:237` zapisuje `'sent'` dla maili, które nie wychodzą (przeniesione z Fali 5) |
| N-5 | `promotions-screen.client.tsx:257` — `Modal` bez `Modal.Header`; ma nazwę dostępną, więc to ostrzeżenie w konsoli, nie realny brak a11y |

## Recenzja T1 (kolumna linii / nieaktywne cele / duplikat site) — Codex, FIX-FIRST — 6×P1
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T1-1 | **P1** | **Ścieżki rejestracji outputu IGNORUJĄ skonfigurowane wyjście linii.** `register-output.ts:679` i `register-disassembly-output.ts:360` biorą **pierwszą lokalizację magazynu** (`order by l.level asc, l.code asc limit 1`) i tylko **aliasują** ją jako `default_location_id`. Linia wskazuje `R02-ZONE`, ale LP outputu ląduje w `R02-BIN1` | **[F]** — rozwiązywać przez `work_orders.production_line_id → production_lines.default_location_id`, wybór magazynu tylko jako fallback |
| T1-2 | **P1** | **Backfill gubi zapisy z okna wdrożenia.** Migracja wykonuje się raz, a **stara wersja aplikacji nadal pisze do martwej kolumny** między migracją a przełączeniem ruchu → wartość trafia do martwej kolumny **po** backfillu | **[F]** — zgodność na czas rolloutu albo post-deploy sweep |
| T1-3 | **P1** | Znana lokalizacja przechodzi **bez magazynu** | **[F]** |
| T1-4 | **P1** | `updateSiteSettings` **nadal** może zatwierdzić wyczyszczenie domyślnego site'u — ten sam wzorzec `return` po pierwszym zapisie, tylko w innej funkcji | **[F]** |
| T1-5 | **P1** | Domyślny `UTC` może zatrzymać prawdziwy formularz **przed** kontrolą duplikatu | **[F]** |
| T1-6 | **P1** | Zmieniony kontrakt `invalid_input` zostawia istniejący test **na czerwono** | **[F]** — bramka |
| T1-7 | P2 | Uppercase nie chroni przed **istniejącym** lowercase site'em (brak backfillu) | **[F]** |
| T1-8 | P2 | Nowe komunikaty błędów linii **schowane za otwartym modalem** | **[F]** |
| T1-9 | P2 | Reguła „inactive tylko gdy niezmienione" ma wyścig między sprawdzeniem a zapisem | **[F]** |

### ⚠️ KOREKTA MOJEGO WŁASNEGO USTALENIA (orchestrator się pomylił)
Zapisałem wcześniej, że `default_location_id` czytają m.in. `register-output.ts`
i `register-disassembly-output.ts`. **To nieprawda** — one **aliasują** pierwszą lokalizację
magazynu tą nazwą. Mój grep trafił w **alias**, nie w odczyt.

**Zweryfikowane ponownie, precyzyjnie:**
| Plik | Czy naprawdę czyta `production_lines.default_location_id`? |
|---|---|
| `api/warehouse/scanner/pick/route.ts:45` | ✅ TAK — `line.default_location_id::text as staging_location_id` |
| `settings/infra/lines/page.tsx:234,244` | ✅ TAK |
| `register-output.ts:679` | ⛔ NIE — alias pierwszej lokalizacji magazynu |
| `register-disassembly-output.ts:360` | ⛔ NIE — j.w. |

**Wniosek: wybór kolumny kanonicznej STOI** (skaner i ekran czytają ją naprawdę), ale mój dowód
był przeszacowany — i właśnie ta pomyłka **przykryła prawdziwy P1 (T1-1)**: rejestracja produkcji
w ogóle nie respektuje skonfigurowanego wyjścia linii.
**Lekcja: grep po nazwie kolumny łapie też aliasy — sprawdzaj stronę FROM, nie samą nazwę.**
