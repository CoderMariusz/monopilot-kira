# FALA 4 / FIX-ROUTING — raport z rundy poprawek (R-1 … R-10)

Branch `main`, bez uruchamiania testów/buildów/migracji (bramkę odpala orchestrator).

## Zmienione pliki

| Plik | Znaleziska |
|---|---|
| `packages/db/migrations/523-routing-setup-time-numeric-scale.sql` | R-1, R-4 |
| `packages/db/migrations/525-routing-reference-counts-security-definer.sql` **(nowy)** | R-6 |
| `technical/routings/_actions/list-routings.ts` | R-2 |
| `technical/routings/_actions/shared.ts` | R-2, R-4 |
| `technical/routings/_actions/delete-routing.ts` | R-6, R-7 |
| `technical/routings/_actions/list-routing-items.ts` | R-8 |
| `technical/routings/_components/routings-manager.client.tsx` | R-2, R-9, R-10 |
| `technical/routings/_components/routings-labels.ts` + `i18n/{en,pl,uk,ro}.json` (**tylko** `technical.routings.manager.fLineUnknownSite`) | R-10 |
| `technical/eco/_actions/shared.ts` (**wyłącznie** insert linii ECO + docstring wyjątku) | R-7 |
| testy: `routing-numeric-precision.unit.test.ts`, `routing-delete.unit.test.ts`, `routing-line-site-options.unit.test.ts`, `routings-manager.test.tsx`, **nowe** `routing-eco-line-lock.unit.test.ts`, **nowy** `packages/db/__tests__/525-routing-reference-guard.test.ts` | — |

Nie tknięte: `technical/bom/**`, `technical/factory-specs/**`, `planning/**`, `lib/production/**`,
`lib/technical/bom/**`, `packages/db/__expected__/schema.sql` (R-5), pozostałe klucze i18n.

---

## [R-1 · P1] Post-check migracji 523 — pełna nowa treść

**Co było źle:** probe brał `select id from routing_operations limit 1` **bez `order by`** i robił na tym
wierszu UPDATE. Trigger `routing_operations_guard_locked_routing` (mig 496) rzuca
`routing_operations_immutable (V-TEC-64)` gdy rodzic jest `approved`/`active`; handler re-raise'ował
wszystko poza wartownikiem → **rollback całej migracji → deploy pada**. Na prodzie leżą operacje
`draft`, `active` i `superseded`, a `limit 1` bez `order by` to loteria — dokładnie tak wyszło
w Twoim dowodzie (raz zielono na `draft`, drugi raz wiersz `superseded`).

**Co teraz:** probe **buduje własny materiał** — swój routing w statusie `draft` (a więc trigger
z 496 jest no-opem) i własną operację, na której wykonuje UPDATE na `12.345678` i odczyt. Żaden
wiersz biznesowy nie jest ruszany. Sprzątanie: całość siedzi w **zagnieżdżonym
`begin … exception … end`** (to JEST subtransakcja w PL/pgSQL; `SAVEPOINT` byłby błędem składni),
a `raise exception 'ROLLBACK_523_PROBE'` wywala tę subtransakcję — czyli oba inserty znikają,
a `ALTER TABLE` sprzed bloku zostaje. Nic nie kasuję ręcznie i nie polegam na CASCADE.
Ścieżka „brak danych" (świeża baza lokalna/CI: `items` puste, więc nie ma legalnej pary
`(org_id, item_id)`) **nie jest cichym skipem** — dowodzi tego samego na klonie kolumny
(`like public.routing_operations including defaults including constraints`), więc każda ścieżka
kończy się realnym round-tripem 6 miejsc po przecinku albo `raise exception`.

Pełna treść post-checku:

```sql
do $$
declare
  v_probe constant numeric := 12.345678;
  v_scale integer;
  v_org uuid;
  v_item uuid;
  v_routing uuid;
  v_stored numeric;
begin
  select numeric_scale into v_scale
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'routing_operations'
     and column_name = 'setup_time_min';
  if v_scale is distinct from 6 then
    raise exception 'migration 523 FAILED: setup_time_min scale is % (expected 6)', v_scale;
  end if;

  -- routings is NOT NULL + FK on org_id and item_id, so the scaffold borrows an
  -- existing (org, item) pair — READ ONLY, and deterministic (ORDER BY id).
  select i.org_id, i.id
    into v_org, v_item
    from public.items i
   order by i.id
   limit 1;

  if v_item is null then
    -- Fresh database with no org data yet (local `pnpm db:up`, CI). There is no
    -- legal (org_id, item_id) to hang a routing on — but a silent skip would be
    -- a post-check that proves nothing, so prove the behaviour on a clone of the
    -- real column instead. Same type, same CHECK constraints, no business table.
    create temp table routing_setup_time_probe_523
      (like public.routing_operations including defaults including constraints)
      on commit drop;
    insert into routing_setup_time_probe_523
      (org_id, routing_id, op_no, op_code, op_name, setup_time_min)
    values (gen_random_uuid(), gen_random_uuid(), 1, 'PROBE-523', 'migration 523 write probe', v_probe);
    select setup_time_min into v_stored from routing_setup_time_probe_523;
    if v_stored is distinct from v_probe then
      raise exception 'migration 523 FAILED: setup_time_min stored % (expected %)', v_stored, v_probe;
    end if;
    drop table routing_setup_time_probe_523;
    raise notice 'migration 523: 6 dp round-trip proven on a clone of routing_operations (no org data yet)';
    return;
  end if;

  begin
    insert into public.routings (org_id, item_id, version, status, effective_from)
    values (
      v_org,
      v_item,
      (select coalesce(max(r.version), 0) + 1
         from public.routings r
        where r.org_id = v_org and r.item_id = v_item),
      'draft',
      current_date
    )
    returning id into v_routing;

    insert into public.routing_operations
      (org_id, routing_id, op_no, op_code, op_name, setup_time_min)
    values (v_org, v_routing, 1, 'PROBE-523', 'migration 523 write probe', 0);

    -- The app writes setup minutes with UPDATE (update-routing replaces the set),
    -- so the probe exercises UPDATE, not just INSERT.
    update public.routing_operations
       set setup_time_min = v_probe
     where routing_id = v_routing
       and op_no = 1;
    if not found then
      raise exception 'migration 523 FAILED: probe operation was not written';
    end if;

    select setup_time_min into v_stored
      from public.routing_operations
     where routing_id = v_routing
       and op_no = 1;
    if v_stored is distinct from v_probe then
      raise exception 'migration 523 FAILED: setup_time_min stored % (expected %)', v_stored, v_probe;
    end if;

    raise notice 'migration 523: setup_time_min keeps 6 decimal places on write (probe routing %, rolled back)', v_routing;
    raise exception 'ROLLBACK_523_PROBE';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_523_PROBE' then
        raise;
      end if;
  end;
end
$$;
```

**Dlaczego to naprawia:** jedyny status rodzica, jaki probe widzi, to `draft` — a `draft` nie jest
w `('approved','active')`, więc wartownik z 496 nie ma jak rzucić. Determinizm nie zależy od danych:
nie wybieram wiersza operacji, tylko go tworzę. Każda inna niż wartownik awaria (w tym asercje
`migration 523 FAILED`) leci dalej przez `raise;` i **słusznie** zatrzymuje migrację.

## [R-2 · P1] Ścieżka odczytu — szósta warstwa

- `list-routings.ts`: w `jsonb_build_object` jest teraz `'setup_time_min', o.setup_time_min::text`,
  typ w `RoutingRow` to `string`, a `mapRow` przepisuje wartość **bez `Number()`**.
- `shared.ts`: `RoutingSummary.operations[].setupTimeMin: string` (jak `runTimePerUnitSec`/`costPerHour`).
- `routings-manager.client.tsx`: `opFormFromRouting` bierze `op.setupTimeMin` wprost, bez `String(...)`.

**Dlaczego to naprawia:** JSONB *number* jest parsowany sterownikiem przez `JSON.parse` → JS double
(≈15 cyfr znaczących), a `numeric(18,6)` trzyma 18. `999999999999.123456` gubił końcówkę **zanim**
ktokolwiek cokolwiek edytował, a że zapis draftu **podmienia cały zestaw operacji**, samo wejście
w edycję i „Zapisz" utrwalało zaokrągloną wartość. Po zmianie łańcuch jest tekstowy end-to-end:
`numeric → ::text → string → input → NumericString → $6::numeric`.
Test cyklu: `routing-numeric-precision.unit.test.ts` (`R-2 — setup_time_min survives read → open → save`,
z asercją `String(Number(EXACT)) !== EXACT`, żeby test był RED na starym kodzie) + UI-owa połowa
w `routings-manager.test.tsx` („an 18-digit setup time survives being opened and saved unchanged").

## [R-3 · P2] Test wartości ujemnej

Było `expect(parsed.success).toBe(false)` — zielone także na starym `z.number().int().min(0)`
(string `'-1'` odpadał jako „expected number"). Teraz `it.each(['-1', -1, '-0.5'])` asertuje
**nazwany komunikat** `must be a non-negative decimal`, który emituje wyłącznie nowy refine
`NumericString`. Wariant liczbowy `-1` dokłada przypadek, w którym stary walidator dawał zupełnie
inny komunikat (`greater than or equal to 0`) — więc test rozróżnia walidatory, a nie tylko „odrzucone".

## [R-4 · P2] Korekta opisu `$6::integer`

Poprawione miejsca (to jest zmiana opisu, `::numeric` zostaje):

- `packages/db/migrations/523-*.sql` — nagłówek mówi teraz jasno: kolumny z mig 503 (`numeric(10,2)`)
  faktycznie **zaokrąglały**, ale `integer` `setup_time_min` nigdy tam nie dochodził. `pg` wysyła
  parametry **tekstowo**, więc `'12.345'` na bindzie `$6::integer` to **błąd wejścia `int4`**,
  a z UI wartość i tak nie przechodziła wcześniej (`type="number"` bez `step` → `stepMismatch`,
  potem Zod `.int()`).
- `routings/_actions/shared.ts` — komentarz przy `setupTimeMin` mówił „silently rejecting (server)
  or truncating (DB)". Teraz: każda warstwa **blokowała**, żadna nie zmieniała po cichu.
- `routing-numeric-precision.unit.test.ts` — komentarz przy asercji `$6::numeric` mówił
  „an ::integer bind rounds the value away". Teraz nazywa bind **trzecim blokerem**, nie zaokrąglaczem.

Dowód zachowania Postgresa zostaje tam, gdzie ma być: w realnym post-checku migracji (R-1).

## [R-5 · —] Snapshot schematu

Nie tknięty — zgodnie ze specem. `packages/db/__expected__/schema.sql` dalej mówi
`setup_time_min integer`; to zadanie infrastrukturalne (martwa bramka `check:drift` za mig 279).

## [R-6 · P1] Site-RLS nie zaślepia już guardu — migracja 525

Definicja funkcji (pełna, z `search_path` i grantami):

```sql
create or replace function public.routing_reference_counts(p_routing_id uuid)
returns table (work_order_count integer, change_order_line_count integer)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select
    (select count(*)::integer
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.routing_id = p_routing_id),
    (select count(*)::integer
       from public.technical_change_order_lines ecol
      where ecol.org_id = app.current_org_id()
        and ecol.target_type = 'routing'
        and ecol.target_id = p_routing_id);
$$;

revoke all on function public.routing_reference_counts(uuid) from public;
grant execute on function public.routing_reference_counts(uuid) to app_user;
```

`delete-routing.ts` woła teraz `select work_order_count, change_order_line_count from
public.routing_reference_counts($1::uuid)` zamiast dwóch podzapytań, a brak wiersza z guardu
= `persistence_failed` (nigdy „zero referencji").

**Dlaczego to naprawia:** `work_orders` ma restrykcyjną politykę `work_orders_site_visibility`
(mig 383), `routings` tylko RLS organizacyjne — więc użytkownik z site A widział routing, ale nie
widział WO z site B i liczył `wo_count = 0`. Funkcja działa jako właściciel, więc polityka site'owa
jej nie zasłania, a **jedynym** wejściem tenantowym jest `app.current_org_id()` (GUC sesji, nie
parametr) + twardy filtr `org_id` w obu gałęziach — zwraca liczby, nigdy wiersze, więc nie da się
przez nią niczego wyliczyć spoza własnej organizacji.

Post-check **wywołuje** funkcję (`select … from public.routing_reference_counts(gen_random_uuid())`,
oczekiwane `(0,0)`), a dodatkowo sprawdza w katalogu `prosecdef` i obecność `search_path=`
w `proconfig` — żeby przyszłe `create or replace` nie zdjęło hardeningu po cichu.

⚠ **Świadoma zależność, wypisana w migracji i asertowana:** `public.work_orders` ma
`FORCE ROW LEVEL SECURITY`, a wszystkie jej polityki są `to app_user`. Rola definiująca musi więc
omijać RLS (superuser albo `BYPASSRLS`) — inaczej funkcja widziałaby zero wierszy i guard puszczałby
wszystko. To dokładnie ten sam zakład, który od mig 383 robi `app.user_can_see_site` czytając
`FORCE`-RLS-owe `public.user_sites`. Post-check **asertuje** to (`rolsuper or rolbypassrls`), więc
brak uprawnienia wywala bramkę migracyjną, zamiast wysłać na prod guard, który zawsze mówi
„brak referencji".

Dowód behawioralny: `packages/db/__tests__/525-routing-reference-guard.test.ts` — user przypisany
tylko do site A, WO w site B: bezpośredni `count(*)` jako `app_user` = `'0'`, a
`routing_reference_counts` = 1. Drugi test: WO w **innej organizacji** wskazujące ten sam routing
nadal nie jest liczone.

## [R-7 · P1] TOCTOU z zapisem ECO

W `technical/eco/_actions/shared.ts`, **wyłącznie przed insertem linii**, dla `targetType === 'routing'`
z niepustym `targetId`:

```sql
select r.id
  from public.routings r
 where r.org_id = app.current_org_id()
   and r.id = $1::uuid
 for key share
```

Brak wiersza → `EcoCloseAbort('not_found', …)` (istniejąca klasa „przerwij i wycofaj transakcję"
z tego modułu — bez nowych klas i bez dotykania callerów), więc insert nie powstaje.

**Dlaczego to naprawia:** `FOR KEY SHARE` konfliktuje z `FOR UPDATE`, które trzyma `deleteRouting`
na nagłówku routingu. Oba przeploty są teraz zserializowane:
- kasujący pierwszy → pisarz ECO czeka, po commicie widzi **0 wierszy** i odmawia (zamiast urodzić sierotę);
- ECO pierwszy → kasujący czeka na commit, a potem **liczy** tę linię i odmawia `version_referenced`.

`KEY SHARE`, nie `UPDATE`, bo dwa ECO wskazujące ten sam routing nie mają powodu się blokować —
blokować ma tylko kasowanie tego routingu.

Testy: dwie równoległe transakcje na realnym PG (`525-routing-reference-guard.test.ts`:
„an ECO line insert waits for a delete…", „a delete waits for an in-flight ECO line and then sees it";
oba asertują, że druga strona faktycznie **czeka**, a nie tylko kończy się „jakoś") + protokół
w kodzie (`routing-eco-line-lock.unit.test.ts`: lock jest brany **przed** insertem, na routingu,
org-scoped, i nie jest brany dla linii nie-routingowych).

## [R-8 · P2] `LIMIT` przed filtrem site

Z zapytania o linie w `list-routing-items.ts` **usunięty jest twardy limit** (stała przemianowana na
`OPERATION_NAME_LOOKUP_LIMIT`, bo dotyczy już tylko nazw operacji).

**Dlaczego akurat tak, a nie „predykat site przed LIMIT":** predykatu nie ma jak wsadzić do tego
zapytania w sposób **osiągalny** — `listRoutingItems()` jest akcją ładowania **strony**, a strona
listuje wiele routingów, każdy z własnym (albo żadnym) pinem site'u; site edytowanego routingu jest
znany dopiero w modalu. Parametr, którego nikt nie podaje, byłby martwym kodem. Usunięcie limitu jest
przy tym **mocniejsze** niż per-site predykat z limitem: przy `limit 200` per site duży zakład dalej
by się ucinał, a bez limitu nie ucina się nic i klientowy filtr po `siteId` operuje na komplecie.
Zbiór jest ograniczony fizycznie (linie produkcyjne), a identyczne, nielimitowane zapytanie o
`production_lines` **już jest na prodzie** w pickerze NPD
(`(npd)/pipeline/[projectId]/pilot/_actions/list-production-lines.ts`). Zostawiłem komentarz
`ponytail:` z sufitem: gdyby kiedyś organizacja miała tysiące linii — **wyszukiwanie serwerowe**,
nie cap (cap odtwarza ten sam bug).

Test: `routing-line-site-options.unit.test.ts` — zapytanie o linie nie zawiera `limit` i nie ma parametrów.

## [R-9 · P2] `boundLineIds` per operacja

`lineOptions` (jedna lista na cały formularz) zastąpione funkcją `lineOptionsFor(currentLineId)`,
wołaną **w mapie operacji**: linie site'u routingu **plus wyłącznie `op.lineId` tego wiersza**.

**Dlaczego to naprawia:** wcześniej `boundLineIds` zbierał linie **wszystkich** operacji, więc jedna
odziedziczona operacja na linii spoza pinu publikowała tę linię do selektorów pozostałych operacji —
picker obiecywał, a zapis padał `v_tec_64_cross_site_lines`. Wyjątek należy do wiersza, który
faktycznie tę linię trzyma.

### Dlaczego R-8/R-9 nie wprowadzają over-blockingu pustego routingu

1. **Brak pinu = brak zawężania.** `routingSiteId` jest `null` dla nowego routingu i dla draftu jeszcze
   nieprzypiętego → warunek `!routingSiteId || …` przepuszcza **każdą** aktywną linię, w **każdej**
   operacji (także w świeżo dodanej, pustej). Pierwsza operacja pierwszego routingu ma z czego wybierać.
2. **Zawężanie tylko tam, gdzie serwer i tak odmówi.** Przy pinie V-TEC-64 wymaga dokładnego
   dopasowania site'u (org-wide też odpada), więc lista pokrywa się z tym, co przejdzie zapis.
3. **Wiersz nigdy nie zostaje z pustą kontrolką.** Aktualna linia operacji jest zawsze na jej własnej
   liście, nawet spoza pinu — czyli rekord do naprawy jest widoczny, a nie wygaszony.
4. **R-8 tylko dodaje opcje.** Usunięcie limitu wyłącznie zwiększa zbiór wejściowy; nie ma ścieżki,
   w której picker po tej zmianie ma mniej pozycji niż przed nią.

Testy anty-over-blocking: `routings-manager.test.tsx` — „R-9 anti-over-blocking: an unpinned routing
still offers every line in every operation" (dokłada drugą, pustą operację i sprawdza pełną listę)
oraz zachowany „PF-R06-07 anti-regression".

## [R-10 · P2] Osierocony `site_id` ≠ „All sites"

Etykieta liczona jest teraz przez `siteQualifier(line)`:
`siteId === null` → `fLineOrgWideSite` („All sites"); `siteId` nie-NULL bez rozwiązanego wpisu →
`${fLineUnknownSite} ${siteId}` („Unknown site <uuid>"). Nowy klucz dodany do
`ROUTINGS_DEFAULT_LABELS` i do `technical.routings.manager.fLineUnknownSite` w `en/pl/uk/ro`
(pl: „Nieznany zakład") — żadnych innych kluczy i18n nie ruszałem.

**Dlaczego to naprawia:** `production_lines.site_id` to miękka referencja bez FK, więc nie-NULL id
z usuniętym site'em przychodził z `siteCode`/`siteName` = NULL, identycznie jak linia org-wide.
Operator czytał „All sites", wybierał, a baza dalej traktowała linię jako site-specific i zapis
przypinał routing do niewidocznego UUID. Linia zostaje wybieralna (żeby nie blokować), ale jest
**nazwana** i pokazuje UUID do naprawy danych.

Test: „R-10: a line whose site_id does not resolve is named, not passed off as org-wide".

---

## Czego NIE jestem pewien

1. **`BYPASSRLS` roli deployującej (R-6).** Nie wolno mi było odpalić psql, więc nie zweryfikowałem
   na prodzie, czy rola migrująca ma `rolsuper`/`rolbypassrls`. Jeśli **nie ma**, nowa asercja
   w post-checku 525 **zatrzyma migrację** (świadomie: alternatywą jest guard, który zawsze mówi
   „brak referencji"). To deterministyczne, więc wyjdzie w PREPARE bramki, nie na deployu — ale to
   pierwsza rzecz do sprawdzenia: `select rolsuper, rolbypassrls from pg_roles where rolname = current_user;`.
2. **Seed testu 525 pisze do `work_orders` i `user_sites`** (obie `FORCE` RLS) jako owner — lokalnie
   działa, jeśli test-DB łączy się superuserem. Jeśli bramka używa innej roli, test padnie na seedzie,
   nie na asercji (ten sam warunek co punkt 1).
3. **Nie uruchamiałem niczego** — testy pisane, nie odpalane. Ryzyko literówek/typów jest realne,
   szczególnie w: `routings-manager.test.tsx` (nowy helper `openListboxOptions` opiera się na
   `aria-controls` triggera i portalowanym `role="listbox"`) oraz w teście dwóch transakcji
   (asercja „druga strona czeka" ma 300 ms okna — na wolnym CI to nadal powinno trzymać, bo tam
   czeka blokada, nie timer, ale to jedyna asercja czasowa w paczce).
4. **`create temp table … on commit drop` w migracji 523** — jeśli runner nie owija plików w transakcję,
   temp table i tak znika z końcem instrukcji `DO`; jawny `drop table` mam, więc obie ścieżki są
   posprzątane. Nie zweryfikowałem tego wykonaniem.
5. **R-8 a rozmiar payloadu.** Przyjąłem, że liczba aktywnych linii w organizacji jest rzędu
   dziesiątek (i że nielimitowane zapytanie z NPD już to udowadnia na prodzie). Nie policzyłem tego
   na produkcyjnych danych.
6. **`EcoCloseAbort('not_found')` w `create-change-order.ts`** nie jest mapowane na nazwany błąd
   (caller zwróci `persistence_failed`). Świadomie nie ruszałem callera (limit „tylko ten insert");
   transakcja i tak się wycofuje, więc to kwestia komunikatu w wyścigu 1-na-milion, nie integralności.
7. **R-5** zostawiony bez zmian zgodnie ze specem — drift snapshotu nadal istnieje.
