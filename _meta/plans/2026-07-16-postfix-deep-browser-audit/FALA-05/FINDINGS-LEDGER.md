# FALA 5 — rejestr znalezisk cross-review (arbitraż orchestratora)

Legenda: **[F]** = naprawa w tej fali · **[R]** = korekta raportu · **[N]** = backlog

## Ustalenia orchestratora PRZED delegacją (weryfikacja na prodzie)
| Ustalenie | Wynik |
|---|---|
| Hipoteza zwiadu: 500-tki w Units powodowane brakiem partycji `audit_log` | ⛔ **OBALONA.** Partycje istnieją **do `audit_log_2026_12`**; `now()` mieści się w `audit_log_2026_07`. Odtworzyłem **pełną sekwencję zapisu** (`unit_of_measure` → `audit_log` → `outbox_events`) w transakcji z rollbackiem — **wszystkie trzy INSERT-y przeszły**. Granty `app_user` i polityki RLS poprawne na wszystkich czterech tabelach. Typy `unit_of_measure.*` **są** dozwolone przez `outbox_events_event_type_check` |
| Kolumny catch-weight w `items` | ✅ `nominal_weight`, `gross_weight_max`, `tare_weight`, `variance_tolerance_pct` **już istnieją** → R03-02 **nie wymaga migracji**, brakuje tylko pól w kreatorze |
| Rejestr UoM vs selektory itemów | ✅ Apex 22 ma **12 jednostek** (`mg`, `t`, `box`, `EACH`, `pallet`…), a selektory oferują **7** z hardkodowanej stałej → R03-05 potwierdzone na danych |
| Pułapka route-group przy rewalidacji | ✅ **NIE występuje** — `(app)`/`(admin)` nie wnoszą segmentu, realny URL `/{locale}/settings/users` = to, co produkuje helper. Defekt to **cztery akcje, które nie rewalidują niczego** |

⚠️ **OPÓŹNIONA BOMBA (zastane, [N]):** partycje `audit_log` tworzy **wyłącznie** migracja 043
(`audit_log_create_partitions(12)`) i **nic ich nie dosypuje** — brak crona, brak joba. Dziś sięgają
grudnia 2026. Po ich wyczerpaniu **każdy zapis z audytem w całej aplikacji** zacznie padać.

## Recenzja T5 (routing empty-state CTA) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T5-1 | **P1** | **`?item=` jest martwy I SZKODLIWY.** Strona routingów nie przyjmuje `searchParams`, a manager zawsze ustawia `selectedId = items[0]`. Klik CTA z pozycji X → ekran wybiera **pierwszą alfabetycznie** → „New routing" tworzy marszrutę dla **innej pozycji**. Dodatkowo picker ładuje tylko pierwsze **500** pozycji, więc item źródłowy może być w ogóle niewybieralny. Komentarz „pre-selected via `?item=`" jest nieprawdziwy | **[F]** — albo skonsumować parametr, albo go **usunąć** wraz z fałszywym komentarzem. Parametr, który cicho kieruje na cudzy obiekt, jest gorszy niż jego brak |
| T5-2 | P2 | **Gate CTA za wąski (over-blocking w drugą stronę).** `resolveCanCreateBom()` uznaje tylko jawny wpis `technical.bom.create`, a `createRouting()` używa centralnego `hasPermission`, który dopuszcza też `owner/admin/org_admin` i platform admina → CTA ukryte przed kimś, komu backend pozwala | **[F]** |
| T5-3 | P2 | Dwuznaczność `state:'empty'` **nie została faktycznie rozstrzygnięta** — CTA zależy tylko od uprawnienia, nie od tego, czy loader rozwiązał item | **[F]** |
| T5-4 | P2 | **Nowe testy omijają logikę, którą miały chronić** — test pozytywny sam wstrzykuje gotowy `<a>`, negatywne po prostu go pomijają. Strona może zawsze pokazywać CTA, mieć zły locale albo zły gate — wszystkie cztery testy dalej zielone | **[F]** |

**Czyste w T5:** `technical.bom.create` faktycznie jest wymagane przez `createRouting`; href jawnie
zachowuje `/{locale}` i koduje `itemCode`; klucze `createCta` są we wszystkich 4 bundlach; CTA
pokazuje się tylko dla `state:'empty'`.

## Recenzja T4 (identity: rewalidacja + fałszywa dezaktywacja) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T4-1 | **P1** | **Ścieżka sukcesu `resendInvitation` jest w PRODUKCJI NIEOSIĄGALNA.** `auth.admin.generateLink` woływane przez `createServerSupabaseClient`, który używa klucza **anon**; endpoint administracyjny wymaga **service role** → Supabase zwraca `not_admin` → akcja kończy się `invite_failed`, a UPDATE, audyt, outbox i nowa rewalidacja **nigdy się nie wykonują**. **Test to maskuje**, mockując metodę admin na kliencie anon. Dodatkowo `generateLink` **tylko generuje link — nie wysyła maila** | **[F]** — tor podpiął „Resend" na ekranie users do akcji, która zawsze pada. Fix: `createSupabaseAuthAdmin()` + realna wysyłka; test ma mockować właściwy klient |
| T4-2 | P2 | **Invited nadal dostaje Deactivate**, gdy operator nie ma uprawnienia invite — gałąź to `isInvited && canManageInvitations`, więc bez tego uprawnienia kod spada do domyślnego Deactivate. **Twierdzenie raportu toru („invited → Resend/Revoke, brak Deactivate") jest nieprawdziwe** | **[F]** — rozgałęziać najpierw bezwarunkowo po `isInvited` |
| T4-3 | P2 | **Wygasłe zaproszenia pokazują dwie niewykonalne akcje** — strona klasyfikuje każde nieaktywne konto z tokenem jako `invited`, ignorując `invite_token_expires_at`; `getInvitationLifecycleToken` odrzuca wygasły token jako `non_pending`, choć `resendInvitation` dopuszcza stan `expired` | **[F]** |
| T4-4 | P2 | **Nowe kontrolki są zawsze po angielsku poza ekranem invitations** — `buildLabels` nie ustawia żadnego z nowych pól lifecycle, więc `/pl/settings/users` pokazuje polski ekran z angielskimi `Resend`/`Revoke` i angielskimi błędami | **[F]** |
| T4-5 | P2 | Ręczny modal Revoke bez semantyki dostępności — brak pułapki fokusu, brak obsługi Escape, tło dostępne z klawiatury. Istnieje `@monopilot/ui/Modal` | **[F]** — użycie gotowego komponentu usuwa też ~10-15 linii |

**Czyste w T4 (potwierdzone przez recenzenta):** prawdziwy aktywny członek dalej daje się dezaktywować
(**brak over-blockingu** — akceptacja zaproszenia czyści token); **`pending_invitation` JEST osiągalne**,
to obrona w głębi, nie martwy kod; rewalidowane trasy poprawne; `router.refresh()` nie czyta stanu
sprzed COMMIT-u. Recenzent potwierdził też opis starego buga: fałszywa dezaktywacja **nie czyściła
tokenu ani terminu**, więc zaproszenie pozostawało możliwe do wykorzystania.

## Tor T3 (Units 500) — wynik DIAGNOSTYCZNY, nie tylko naprawczy
**PF-R03-04: bug NIE został naprawiony od czasu audytu, ale też NIE dał się odtworzyć — i to jest
uczciwa odpowiedź, nie wykręt.**

| Dowód | Treść |
|---|---|
| A | Audyt szedł na `2eb57cf7`. `git diff 2eb57cf7..HEAD` po `settings/units/**` + `with-org-context.ts` + `revalidate-localized.ts` jest **pusty**. Ostatnia zmiana w units to `0ea80488` z 16.07 — **przed** audytem. Żaden fix nie wszedł |
| B | Na prodzie brak śladu po `N17R03U` i `N17R03 PCS to Box` (także soft-deleted) → zapisy naprawdę nie doszły |
| **C — sedno** | Wszystkie cztery akcje owijają **całe** ciało w `try/catch` i zwracają typowany wynik. **Nie potrafią odrzucić promise'a**, a Server Action zwracający wynik daje **HTTP 200, nie 500**. Więc 500 powstaje **POZA ciałami akcji** — w dispatchu Server Actions albo re-renderze RSC. **Nie w SQL-u jednostek** |

**Wykluczone z dowodem:** partycje `audit_log`; `isUnitCodeInUse` (**35/35 par tabela/kolumna istnieje**);
`hasManagePermission` (to samo zapytanie działa przy każdym GET strony); pliki `.bak`; skew deploya;
błąd ładowania modułu (jedyny import spoza grafu strony ma 210 innych konsumentów).
**Domknięcie wymaga jednego kliknięcia na prodzie z runtime-logami** — tor dołożył logowanie
`code`/`constraint`/`detail`, żeby następne wystąpienie było diagnozowalne.

**Naprawione mimo braku odtworzenia (realne defekty):**
- **Wywracanie trasy ma konkretną przyczynę:** `AddUnitDialog` miał `try/catch`, a `AddConversionDialog`
  i **oba** handlery w `UnitRowActions` — **nie**. Odrzucenie rzucone w `startTransition` ucieka do
  `(app)/error.tsx` i podmienia całą trasę. Stąd audytowe „not reliably contained".
- **Martwa gałąź potwierdzona EKSPERYMENTALNIE na żywej bazie:** brak partycji to SQLSTATE **23514** —
  ten sam kod co prawdziwy CHECK (`ERROR: 23514: no partition of relation ... found for row`).
  Warunek `23514` stał przed testem partycji, więc awaria audytu pokazywała się jako
  *„Conversion factor must be greater than zero."* Naprawione wspólnym mapperem: **najpierw** test partycji.
- `softDeleteUnit` mapuje kody (FK → `in_use`), koniec wycieku zrzutu zoda do UI, rewalidacja poza transakcją.

## ⛔ ZNALEZISKA POBOCZNE (poza zakresem fali, do zgłoszenia ownerowi)
| # | Znalezisko |
|---|---|
| N-1 | **Partycje `audit_log` kończą się `2027-01-01`.** `audit_log_create_partitions(12)` woła **wyłącznie** migracja 043 — zero crona. Od tej sekundy padnie **każdy zapis z audytem w całej aplikacji**. Rekomendacja: cron **+ partycja `DEFAULT` jako bezpiecznik** (sam cron zamienia jedną cichą awarię na inną) |
| N-2 | **Cron `pm-schedule-due` PADA NA PRODZIE dla 3 organizacji od 8.07 — nadal.** 117 wystąpień, ostatnie 2026-07-27, błąd `42P01 missing FROM-clause entry for table "pg_catalog"` |
| N-3 | Bramka migracyjna CI martwa od mig 279 (przeniesione z Fali 4) |

## Recenzja T1 (item master: trzy niezmienniki) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T1-1 | **P1** | **Poprawka unieważnia samą siebie.** `OptionalNumeric` sprawdza tylko `> 0`, a kolumny to `numeric(10,4)`. `nominalWeight='0.00001'` + `grossWeightMax='0.00001'` przechodzą walidację → **Postgres zaokrągla obie do `0.0000`** → powstaje dokładnie to zerowe odniesienie, które R03-02 miało wyeliminować | **[F]** — trzymać wagi jako stringi dziesiętne, odrzucać >4 miejsc i wartości poniżej `0.0001` |
| T1-2 | **P1** | **Import aktualizacyjny NADAL zeruje poprawną kopertę catch-weight.** `commit-import.ts` pobiera z istniejącego itemu tylko ID/kod/typ/nazwę/status; gdy CSV pomija opcjonalny `weight_mode`, przekazuje `fixed` i **żadnych wag**, a `updateItem` bezwarunkowo zapisuje `NULL`. **Naprawa seedów kreatora TEGO callera nie obejmuje.** CSV zmieniający samą nazwę wyciera całą kopertę wagową | **[F]** — import update musi mieć semantykę patch/merge |
| T1-3 | **P1** | **Jawny `catch` w CSV kończy się ZIELONYM „Applied" bez błędu wiersza.** Parser nie obsługuje nowych pól, preview nie waliduje koperty, a przy commitcie `invalid_input` tylko zwiększa licznik — `rowErrors` obsługuje wyłącznie zmianę statusu. UI pokazuje „Applied … 1 errors" bez wskazania wiersza i pola. **Twierdzenie raportu toru, że odmowa jest widoczna per wiersz, jest niezgodne z kodem** | **[F]** — to potwierdza moją obawę o over-blocking importu, ale przyczyna jest gorsza: nie odmowa, tylko **cicha** odmowa |
| T1-4 | P2 | Pusty tekst tolerancji uznawany za świadome `0%` — `z.coerce.number()` zamienia `''` na `0`, a `superRefine` sprawdza tylko `undefined` | **[F]** |
| T1-5 | P2 | Kreator wpuszcza do Review tolerancję spoza zakresu (`101`, `-1`) — `catchComplete` sprawdza tylko niepusty tekst, a Next nie odpala natywnej walidacji | **[F]** |

**Czyste w T1:** reguła `uomBase !== uomSecondary` działa **po normalizacji** (`szt`/`ea` → `pcs`),
legalne pary `kg/g`, `l/ml` przechodzą, pusty secondary przechodzi; **oba seedy kreatora zachowują
`tareWeight`/`grossWeightMax`** — defekt został wyłącznie w callerze importowym; jawne `0` tolerancji
przechodzi; shelf life zachowuje się zgodnie ze specyfikacją; **4 zmiany istniejących testów są
merytorycznie poprawne i nie osłabiają asercji**.

## Recenzja T3 (Units 500) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T3-1 | P1 | **Testy kontenerowania symulują odrzucenie AKCJI, nie błąd renderu RSC.** `mockRejectedValue` to zwykłe odrzucenie promise'a — prawdziwy błąd RSC jedzie w payloadzie Flight, a Next 16.2.7 najpierw rozwiązuje promise akcji, potem aplikuje Flight data → błąd trafia do globalnego `(app)/error.tsx`, **nie do tego `catch`**. Czyli naprawa kontenerowania może nie łapać realnego trybu awarii | **[F]** — zachować `catch`, ale dodać test przez prawdziwy runtime Next |
| T3-2 | P1 | **Obsługa `23503` przy soft-delete jest MARTWA, a test fabrykuje niemożliwy stan.** `softDeleteUnit` robi `UPDATE deleted_at`, nie `DELETE`, a `unit_of_measure` **nie ma inbound FK** (potwierdza mig 449 — konsumenci trzymają kod jako **tekst**). Taki update nie może dostać `23503` | **[F]** — mapować tylko rozpoznany `constraint`, reszta `persistence_failed` |
| T3-3 | P2 | „Akcyjne" fallbacki Zoda **nieosiągalne** (nieudany `safeParse` zawsze ma ≥1 issue), a nowe komunikaty **omijają i18n** → `/pl/settings/units` pokazuje angielskie domyślki Zoda | **[F]** — stabilne podkody (`name_required`, `audit_partition_missing`) mapowane na 4 locale |
| **T3-4** | **P1** | **Cron PM naprawdę pada przez `pg_catalog.current_date`.** `CURRENT_DATE` to konstrukcja SQL, **której nie da się kwalifikować schematem** — Postgres czyta `pg_catalog` jako tabelę/alias → dokładnie `42P01`. Całe przetwarzanie organizacji kończy się `status: error`, żaden MWO nie powstaje | ✅ **NAPRAWIONE PRZEZ ORCHESTRATORA** — patrz niżej |

**Czyste w T3:** rewalidacja wykonywana dopiero po `withOrgContext` i wyłącznie dla `result.ok`;
detekcja braku partycji stoi **przed** `switch` na `23514` i wymaga **obu** fragmentów komunikatu,
więc zwykły CHECK nie wpada w gałąź partycji; wyniki akcji zawierają wyłącznie wartości serializowalne.

### ✅ Naprawa wykonana bezpośrednio przez orchestratora (2 linie, z dowodem na prodzie)
`apps/web/lib/maintenance/pm-mwo-generate.ts` linie **165** i **248**:
`pg_catalog.current_date` → `pg_catalog.now()::date`.

**Dowód wykonany na produkcji przed zmianą:**
```
select (current_date + make_interval(days => 7));              -- ✅ 2026-08-03
select (pg_catalog.current_date + make_interval(days => 7));   -- ⛔ ERROR: missing FROM-clause entry for table "pg_catalog"
select (pg_catalog.now()::date + make_interval(days => 7));    -- ✅ 2026-08-03
```
Sprawdziłem też **cały repozytorium** pod kątem innych schema-kwalifikowanych słów kluczowych SQL
(`current_time`, `current_timestamp`, `localtime`, `current_user`, `session_user`) — **zero wystąpień**.
Skutek: cron `pm-schedule-due` padał dla **3 organizacji od 8.07**, 117 wystąpień, ostatnie 2026-07-27.
