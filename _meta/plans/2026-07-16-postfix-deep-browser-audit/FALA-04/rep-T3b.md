# FALA-04 / TOR T3b — Routing: kasowanie draftu + selektor linii (PF-R06-06 + PF-R06-07)

Status: **kod + testy napisane, NIE uruchamiane** (bramkę odpala orchestrator).
Nie ruszałem `technical/bom/**`, `technical/factory-specs/**`, `lib/production/**`,
`lib/technical/bom/**`. Plik `routings-manager.client.tsx` przeczytany w aktualnym stanie —
praca T3a (przestawianie operacji ↑/↓, ułamkowy setup, alert w `.modal-foot`) nietknięta;
mój alert kasowania świadomie powiela to samo umiejscowienie.

---

## PF-R06-06 — kasowanie wersji draft

### Decyzja: kasujemy tylko `draft`, dokładnie jak BOM

Polityka „never delete" chroni historię. Draft nigdy nie był jej częścią — nie był zatwierdzony,
nie produkował, nie ma podpisu. Nowa akcja `deleteRouting` przepuszcza **wyłącznie**
`status='draft'`; każdy inny status wraca nazwanym `not_draft` (nie gołym „error"),
a `delete ... and status = 'draft'` powtarza sprawdzenie **pod blokadą wiersza** (`for update`),
więc równoległy approve w drugiej karcie nie przepchnie zatwierdzonej wersji.

Komentarz polityki w `create-routing.ts:14` przestał kłamać — mówi teraz, że draft jest wyjątkiem
i dlaczego (odsyła do `delete-routing.ts`).

### Kaskada `routing_operations` — TAK, kasują się same (cytat z migracji)

`packages/db/migrations/163-routings.sql:91-99`:

```sql
-- routing_operations — ordered ops with resource binding + setup/run times + cost.
-- ON DELETE CASCADE from routings: deleting a routing removes its operations.
create table if not exists public.routing_operations (
  ...
  routing_id uuid not null references public.routings(id) on delete cascade,
```

**Nie kasuję operacji jawnie** i to nie jest lenistwo, tylko wybór bezpieczniejszej ścieżki:
migracja 496 wiesza na `routing_operations` trigger `routing_operations_guard_locked_routing`
(`BEFORE INSERT OR UPDATE OR DELETE`, `496-routing-cross-site-scope.sql:128-174`), który na gałęzi
DELETE dopytuje o status rodzica i rzuca `routing_operations_immutable (V-TEC-64)` (SQLSTATE 23514),
gdy rodzic jest `approved`/`active`. Przy kaskadzie FK wiersz rodzica jest już usunięty, więc
`v_status` = NULL, warunek `NULL in (...)` = NULL → trigger przechodzi. Jawny `delete from
routing_operations` przed usunięciem nagłówka trafiłby w ten trigger. Test
`never issues an explicit routing_operations delete` pilnuje, że nikt tego później nie „poprawi".

Na `public.routings` **nie ma triggera reagującego na DELETE** —
`routings_set_updated_at` to `BEFORE UPDATE` (163:87), a `routings_enforce_line_site_scope` to
`BEFORE INSERT OR UPDATE OF status, site_id` (496:119). Nie ma też `deleted_at` — kasowanie jest
twarde i nieodwracalne, stąd type-to-confirm w UI.

### Guard: co jeszcze może wskazywać na wersję

Routingi nie mają odpowiednika `bom_snapshots`. Przeszukanie migracji + kodu dało **dwa** miejsca
trzymające id routingu poza samym routingiem — i **żadne z nich nie jest prawdziwym FK**, więc baza
sama z siebie pozwoliłaby zrobić sieroty:

| Miejsce | FK? | Zapisywane przez |
|---|---|---|
| `work_orders.routing_id` | nie, gołe `uuid` (`176-planning-work-orders.sql:42`) | **nigdy** — oba INSERT-y WO pomijają kolumnę; import WO waliduje `routing_id`, po czym wrzuca go do notatki tekstowej |
| `technical_change_order_lines.target_id` przy `target_type='routing'` | nie, polimorficzne `uuid` (`229-...:133`) | tak — `technical/eco/_actions/shared.ts:235` |
| `audit_log.resource_id` | nie, `text` | tak, celowo — wpis audytowy ma przeżyć skasowany wiersz |

Guard liczy oba (jedno zapytanie, dwa podselekty) i odmawia nazwanym `version_referenced`
z liczbą referencji. `audit_log` świadomie **nie** blokuje kasowania — to ślad, nie zależność.

Uwaga na znaną pułapkę repo (przypinanie typu parametru): guard używa `$1::uuid` **dwa razy**,
ale obie kolumny (`work_orders.routing_id`, `technical_change_order_lines.target_id`) są `uuid`,
więc rzutowanie nie przypina sprzecznego typu i nie ma ryzyka 42883.

### RBAC i audyt

`ROUTING_WRITE_PERMISSION` = `technical.bom.create` (bez nowych stringów, Wave0 enum-lock).
Audyt idzie przez istniejący `writeAudit` (tabela `public.audit_log`, `resource_type='routing'`),
akcja `routing.deleted`, `before_state` = snapshot nagłówka (id/item/wersja/status/site/daty),
`after_state` = null. BOM pisze do `audit_events` — nie ujednolicałem, bo w module routingów
kanonem jest `writeAudit`, a mieszanie tabel audytu w jednym module byłoby gorsze niż różnica
między modułami.

### UI

Przycisk `Delete` w wierszu **tylko przy `status='draft'` i `canWrite`** → dialog potwierdzenia
wzorowany na `bom/_components/delete-version-modal.tsx`: czerwony alert „nieodwracalne" +
przepisanie etykiety wersji (`v4`) do włączenia przycisku `btn-danger`. Odmowa serwera **nie zamyka**
dialogu — pokazuje nazwany powód w `.modal-foot` (to samo miejsce co alert T3a, z tego samego
powodu: `.modal-body` to jedyny scrollujący region, alert w nim ląduje pod zgięciem).
Dialog renderuję jako **rodzeństwo** `<span>` z akcjami, nie jego dziecko — `.modal-overlay` to
`<div>`, a `<span>` nie może zawierać treści blokowej.

### Świadome odstępstwo od BOM

BOM ma dodatkowy guard `only_version` (nie skasujesz jedynej wersji). **Nie przeniosłem go.**
Zgłoszony bug to „błędnie utworzony draft zostaje na zawsze" — a błędnie utworzony draft prawie
zawsze **jest** jedyną wersją. `only_version` skasowałby całą wartość tej naprawy.

---

## PF-R06-07 — selektor linii

To naprawa **selektora**, nie walidacji. `validateOperationLineSiteScope` (V-TEC-64),
`assertRoutingSiteScopeForApproval`, back-fill `routings.site_id` i migracja 496 zostały nietknięte.

### 1. Tożsamość site w danych

`listRoutingItems` dokłada `left join public.sites` i zwraca `siteId` / `siteCode` / `siteName`
dla każdej linii, `order by s.site_code nulls last, pl.code`. Kształt zapytania i typu 1:1 z
istniejącym pickerem linii w NPD (`(npd)/pipeline/[projectId]/pilot/_actions/list-production-lines.ts`)
— nie wymyślałem drugiego wzorca. **LEFT, nigdy INNER** — linia org-wide (`site_id is null`) to
legalny zasób routingu i musi zostać na liście (osobny test tego pilnuje).

`listRoutings` zwraca dodatkowo `siteId` nagłówka routingu — na tym filtruje modal.

### 2. Etykieta

`KOD · Nazwa — SITECODE`, np. `LINE-A · Line A — WAW` vs `LINE-A · Line A — KRK`.
Dwie linie o tym samym kodzie w różnych zakładkach są rozróżnialne wzrokiem.
`site_code` jest unikalny w orgu (`sites_org_code_uq`), więc sam wystarcza do jednoznaczności;
`siteName` jest w payloadzie jako fallback, gdy site nie ma kodu.

### 3. Decyzja ws. linii org-wide (`site_id IS NULL`) — pytanie ze specyfikacji

| Stan routingu | Co pokazuje picker | Dlaczego |
|---|---|---|
| `site_id = A` (przypięty) | **tylko** linie site'u A | `validateOperationLineSiteScope(..., routingSiteId=A)` odrzuca każdą linię, której `site_id ≠ A` — **łącznie z org-wide (NULL ≠ A)**. Oferowanie ich to obietnica bez pokrycia (jest na to test) |
| `site_id = null` (nowy / jeszcze nieprzypięty) | **wszystkie** aktywne linie, site'owe i org-wide | Oba komplety są poprawne: routing wyłącznie z linii org-wide przechodzi (`canonicalSiteId = null`), routing wyłącznie z linii jednego site'u też. Zakaz dotyczy **mieszania** — i zostaje tam, gdzie już działa, na serwerze |

Świadomie **nie** zawężam listy dynamicznie po pierwszej wybranej linii („wybrałeś site'ową, więc
chowam org-wide"). Powód: to zamraża formularz w połowie edycji (żeby zmienić zdanie, trzeba by
najpierw wyczyścić wybór), a realny problem — że operator nie widział, iż miesza — rozwiązuje sufiks
site'u w etykiecie. Serwer i tak odrzuci mieszankę nazwanym `v_tec_64_cross_site_lines`, który ma
już swoją lokalizowaną kopię.

### 4. Anty-over-blocking — jak się zabezpieczyłem

Trzy warstwy, w kolejności ważności:

1. **Filtr jest warunkowy na prawdzie z serwera, nie na heurystyce:**
   `.filter((l) => !routingSiteId || l.siteId === routingSiteId || boundLineIds.has(l.id))`.
   `routingSiteId` bierze się wyłącznie z `existing?.siteId`. Dla **tworzenia** `existing` to `null`,
   więc `routingSiteId` jest `null` i filtr degeneruje się do „przepuść wszystko". Pusty routing
   nie ma jak zostać zablokowany — to nie jest deklaracja, to kształt wyrażenia.
2. **Linia już przypięta do operacji zawsze zostaje na liście** (`boundLineIds`), nawet jeśli wypada
   poza site nagłówka (dane sprzed back-fillu 496). Bez tego kontrolka pokazałaby placeholder i
   ukryła dokładnie ten wiersz, który wymaga poprawki.
3. **Testy:** `anti-regression: a routing with no site pinned still offers every active line`
   asserta `toHaveLength(LINES.length)` — czyli ten, który przy nadgorliwym zawężeniu spadnie
   pierwszy. To jedyny test w pakiecie, który z definicji przechodzi także przed naprawą (na starym
   kodzie nie skompilowałby się przez brak pól site w `ResourceOption`) — bo taka jest rola anty-regresji;
   pozostałe padają na obecnym kodzie.

Zawężenie do **aktywnego kontekstu site** (istnieje gotowy `PRODUCTION_LINES_SITE_FILTER_SQL`)
świadomie **pominięte**: to trzecie, nieproszone zawężenie, które ukryłoby linie akceptowane przez
serwer (operator w kontekście „Warszawa" edytujący routing krakowski zobaczyłby pustą listę).
Kryterium jest nagłówek routingu, bo to jego pilnuje V-TEC-64 — nie kontekst przeglądania.

---

## Zmienione / nowe pliki

**Nowe**

| Plik | Co |
|---|---|
| `technical/routings/_actions/delete-routing.ts` | akcja serwerowa (RBAC + `not_draft` + guard + kaskada + audyt) |
| `technical/routings/_actions/__tests__/routing-delete.unit.test.ts` | 9 testów PF-R06-06 |
| `technical/routings/_actions/__tests__/routing-line-site-options.unit.test.ts` | 2 testy PF-R06-07 (warstwa serwerowa) |

**Zmienione**

| Plik | Co |
|---|---|
| `_actions/shared.ts` | `DeleteRoutingInput`/`DeleteRoutingResult`, kody `not_draft` + `version_referenced`, `RoutingSummary.siteId` |
| `_actions/list-routing-items.ts` | `ResourceOption` + site, `left join public.sites`, sort po site |
| `_actions/list-routings.ts` | `r.site_id` w SELECT + w mapowaniu |
| `_actions/create-routing.ts` | **tylko komentarz polityki** (był fałszywy) |
| `_components/routings-labels.ts` | 8 kluczy: `delete`, `deleteTitlePrefix`, `deleteWarning`, `deleteConfirmLabel`, `deleteConfirmButton`, `fLineOrgWideSite`, `errNotDraft`, `errVersionReferenced` |
| `_components/routings-manager.client.tsx` | `DeleteRoutingDialog`, przycisk Delete przy draftach, site-aware `lineOptions`, 2 gałęzie w `errorLabel` |
| `_components/__tests__/routings-manager.test.tsx` | fixture LINES (2× ten sam kod w 2 site'ach + org-wide), 2 fixture'y routingów, 7 nowych testów |
| `_components/__tests__/routings-parity.test.tsx` | fixture LINES + mock `delete-routing` (bez tego import server action wysypuje test) |
| `apps/web/i18n/{en,pl,uk,ro}.json` | te same 8 kluczy dopisane punktowo w `technical.routings.manager`; pl przetłumaczone, uk/ro angielskie jak reszta bloku. JSON zwalidowany (82 klucze w każdym locale) |

Migracji **nie ma** i nie jest potrzebna — `site_id` istnieje od 163, kaskada od 163, tabele guardu
od 176/229.

---

## Czego NIE jestem pewien

1. **`work_orders` pod RLS site-visibility.** Guard liczy WO przez `app.current_org_id()`, ale na
   `work_orders` działa też polityka widoczności per-site (383/466). Użytkownik zawężony do site'u A
   może nie zobaczyć WO z site'u B i guard policzy 0. Praktycznie nieszkodliwe, bo
   `work_orders.routing_id` **nigdy nie jest zapisywane** (sprawdzone: oba INSERT-y WO pomijają
   kolumnę), ale gdyby kiedyś zaczęło być — guard jest tak dokładny, jak widoczność wołającego.
2. **`only_version` pominięty świadomie** (uzasadnienie wyżej) — jeśli cross-review uzna, że produkt
   musi zawsze mieć ≥1 wersję routingu, to jedna linijka do dołożenia, ale wtedy pierwszy błędny
   draft znów jest nieusuwalny.
3. **Type-to-confirm** wymaga wpisania `v4`. Jeśli to za dużo tarcia dla draftu, do wycięcia zostaje
   sam input — reszta dialogu (ostrzeżenie + `btn-danger` + nazwana odmowa) niesie właściwą wartość.
   Zostawiłem, bo DELETE jest twardy (brak `deleted_at`).
4. **Nie odpalałem niczego** — ani vitest, ani tsc, ani builda (zakaz w brief-ie). Testy klienckie
   zależą od tego, że `@monopilot/ui/Select` renderuje `role="option"` po kliknięciu triggera
   (sprawdzone w źródle: portal do `document.body`, `role="listbox"`/`role="option"`, przy zamkniętym
   nie renderuje nic) — ale to jedyne miejsce, gdzie zgadywałem zachowanie runtime zamiast je zobaczyć.
5. **Sufiks etykiety to `siteCode`.** Jeśli operatorzy nie znają kodów zakładów na pamięć, zmiana na
   `siteName` to jedna linijka w `routings-manager.client.tsx` (pole już jest w payloadzie).
