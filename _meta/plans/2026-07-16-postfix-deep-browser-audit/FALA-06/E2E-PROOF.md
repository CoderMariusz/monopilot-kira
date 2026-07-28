# FALA 6 — dowód behawioralny na produkcji

**Data:** 2026-07-28 01:42–01:52 UTC
**Cel:** https://monopilot-kira.vercel.app · org „Apex 22" (`00000000-0000-0000-0000-000000000002`)
**Commit fali:** `0ff4080d`
**Commit faktycznie na produkcji:** `124e6b71` (Fala 5)

---

## WNIOSEK NADRZĘDNY: fala NIE JEST na produkcji

Build deploymentu `dpl_HZkG497nex1XPE5Cg6d3PtBZNJrf` (commit `0ff4080d`) **padł**.

```
state: ERROR
errorCode: lint_or_type_error
errorMessage: Command "cd ../.. && pnpm --filter @monopilot/db migrate
              && cd apps/web && pnpm build" exited with 1
```

Log builda (01:43:51):

```
Failed to type check.
./app/[locale]/(app)/layout.tsx:205:13
Type error: Type '{ orgName: string; orgCode: string; actorLabel: string; ... }'
is not assignable to type 'IntrinsicAttributes & ActAsBannerProps'.
  Property 'actorLabel' does not exist on type 'IntrinsicAttributes & ActAsBannerProps'.
> 205 |             actorLabel={shellUser.name}
```

**Przyczyna źródłowa — poprawka NIE ZOSTAŁA ZACOMMITOWANA.**

`layout.tsx` trafił do commita z nowym call-site (`actorLabel={shellUser.name}`),
ale `act-as-banner.tsx` z pasującym typem propsów — nie. W commicie `0ff4080d`:

```
git show 0ff4080d:apps/web/components/shell/act-as-banner.tsx
export type ActAsBannerProps = {
  orgName: string;
  orgCode: string;
  actorEmail: string;      <-- brak actorLabel
  ...
```

Poprawka istnieje **wyłącznie w drzewie roboczym**, jako niezacommitowana zmiana:

```
git status --porcelain | grep -v _meta/
 M apps/web/components/shell/act-as-banner.tsx            <-- właściwy fix
 M apps/web/components/shell/__tests__/platform-switcher.test.tsx  <-- jego test
```

Weryfikacja, że to komplet: `pnpm exec tsc --noEmit` na drzewie roboczym →
**`TypeScript: No errors found`**. Zacommitowanie tych dwóch plików odblokowuje build.

### Stan rozjechany: baza POSZŁA DO PRZODU, kod NIE

Build command to `pnpm --filter @monopilot/db migrate && pnpm build` — **migracja
wykonuje się PRZED buildem**. Migracja 526 przeszła, build padł. Produkcja jest więc
w stanie: **DB @ mig 526 + kod aplikacji @ Fala 5**.

Potwierdzone w bazie:

```sql
select tgname from pg_trigger where tgrelid='public.production_lines'::regclass;
-- production_lines_sync_default_location   <-- mig 526 obecny
```

Ten rozjazd **nie jest w tym wypadku szkodliwy** — trigger 526 był zaprojektowany
dokładnie na okno wdrożenia i sprawia, że stary kod działa poprawnie (dowód: PF-R02-01
niżej). Ale to przypadek szczęśliwy, nie zasługa procesu.

---

## Tabela per-finding

| # | Finding | Wynik | Dowód |
|---|---------|-------|-------|
| 1 | **PF-R02-02 Printers** | **NOT PROVEN — regresja potwierdzona jako NADAL ŻYWA** | Ekran nadal pada do globalnego error boundary. Referencja na ekranie: **`3974216983`** — identyczna jak przed falą. Log runtime: `dep=dpl_2ksFvaTdDwfrivoZ8LM9UEXdHFKq`, `digest: '3974216983'`, `Error: Functions cannot be passed directly to Client Components ... {initialPrinters: ..., deletePrinter: function}`. To dokładnie ten inline-closure, który fala miała usunąć. Mutacji nie da się testować — ekran nie wstaje. |
| 2 | **Ekran Invitations** | **PARTIAL** | Ekran **ładuje się i listuje zaproszenia** (4 wiersze, m.in. `admin@monopilot.test` / Admin / Accepted / 2026-05-20T09:00:41.869Z, `sol-r01-20260715-0511-inv@monopilot.test` / NPD Manager / Expired). ALE: kolumna **„Invited By" pokazuje „System" w KAŻDYM wierszu** — czyli dokładnie ta fabrykacja, którą PF-R01-06 miał usunąć. To stan sprzed fali; poprawki nie ma na prodzie. Obawy cross-review (join audytowy `text = uuid` / nieistniejący `created_at`) **nie da się zweryfikować** — ten kod nie jest wdrożony. |
| 3 | **PF-R02-01 domyślne wyjście linii** | **PROVEN — ale zasługą migracji 526, nie kodu fali** | Patrz sekcja niżej. |
| 4 | **PF-R02-04 nieaktywne cele** | **NOT PROVEN** | Kod nie wdrożony. Dodatkowo brak danych: wszystkie 6 lokalizacji w Apex 22 ma `is_active = t` (`select is_active, count(*) from locations where org_id=... group by 1;` → `t|6`). Nie ma nieaktywnej lokalizacji, więc ani testu właściwego, ani anty-regresji nie da się wykonać bez fabrykowania danych. |
| 5 | **PF-R02-03 hierarchia lokalizacji** | **NOT PROVEN** | Kod nie wdrożony. Ten sam brak danych co wyżej — zero nieaktywnych rodziców w org. |
| 6 | **PF-R02-05 adres magazynu** | **NOT PROVEN** | Kod nie wdrożony. Krytycznego przypadku (przetrwanie `deactivated_at` w jsonb `address` na zdezaktywowanym magazynie) nie testowano — testowanie ścieżki zapisu na starym kodzie nic nie mówi o poprawce. |
| 7 | **PF-R02-06 duplikat site** | **NOT PROVEN** | Kod nie wdrożony. |
| 8 | **PF-R01-05 / R01-07** | **NOT PROVEN — obie regresje potwierdzone jako żywe** | R01-05: trasa `/en/settings/invitations` istnieje i odpowiada, ale odkrywalności z nawigacji Access nie weryfikowano na wdrożonym kodzie. R01-07: **obalone wprost** — w bazie `public.users` dla `admin@monopilot.test` jest `name='Admin'`, `display_name='Admin'`, a powłoka pokazuje **„Apex Admin"** (`button "Open user menu for Apex Admin"`), czyli wciąż czyta `user_metadata`. Fix nieżywy. |

---

## Finding 3 — PF-R02-01, jedyny realnie udowodniony

Jedyny element fali obecny na produkcji to migracja 526 (bo migracja biegnie przed
buildem). Trigger `production_lines_sync_default_location` lustruje obie kolumny:

```plpgsql
-- UPDATE: mirror whichever column the writer actually touched.
if new.default_output_location_id is distinct from old.default_output_location_id
   and new.default_location_id is not distinct from old.default_location_id then
  new.default_location_id := new.default_output_location_id;
elsif new.default_location_id is distinct from old.default_location_id then
  new.default_output_location_id := new.default_location_id;
end if;
```

To rozbraja pierwotny bug na *starym* kodzie: Fala 5 **zapisuje**
`default_output_location_id` (`actions/infra/line.ts:92,97,101,116`), a **czyta**
`default_location_id` (`settings/infra/lines/page.tsx:223,233`) — stąd „zapisz i zgub".
Trigger zasypuje tę dziurę.

**Odtworzenie w przeglądarce**

1. Settings → Infra → Production lines. `Oven Line / LINE02` miała `Default location = —`.
2. Edit → Warehouse `—` → wybrano `Main Warehouse`.
   *(Uwaga: pole „Default output location" było **disabled** dopóki Warehouse = `—`.
   To poprawna blokada zależnościowa, nie bug — nie obchodzona.)*
3. Default output location → `RECV - Receiving Bay (RECV)` → **Save changes**.
4. **Twarda nawigacja**: `/en/dashboard`, potem z powrotem `/en/settings/infra/lines`.
5. Wiersz `Oven Line / LINE02` pokazuje **`RECV`**.

**Stan trwały w bazie (obie kolumny, zgodnie z poleceniem)**

```sql
select code, name,
       coalesce(default_location_id::text,'NULL')         as canon,
       coalesce(default_output_location_id::text,'NULL')  as legacy,
       (default_location_id = default_output_location_id) as in_sync
from production_lines where org_id='...0002' and code='LINE02';

LINE02|Oven Line|9284b072-a8f0-4074-9d7e-7cc94288470b|9284b072-a8f0-4074-9d7e-7cc94288470b|t
```

`9284b072-a8f0-4074-9d7e-7cc94288470b` = lokalizacja `RECV`. **Obie kolumny równe,
`in_sync = t`.**

Dodatkowo backfill migracji 526 jest widoczny na `LINE1 / Packing Line 1`: przed
jakąkolwiek moją akcją miała już obie kolumny ustawione na `9284b072…` i ekran
renderował `RECV` — czyli osierocona wartość została przeniesiona do kolumny kanonicznej.

**Zastrzeżenie:** to dowodzi, że migracja 526 działa. **Nie** dowodzi, że aplikacyjna
część PF-R02-01 (jedna kolumna kanoniczna w kodzie) jest poprawna — ten kod nie jest
wdrożony.

---

## Nie udowodnione i dlaczego

1. **Findings 1, 2, 4, 5, 6, 7, 8 — kod fali nie istnieje na produkcji.** Build padł na
   błędzie typów, alias produkcyjny wciąż wskazuje `dpl_2ksFvaTdDwfrivoZ8LM9UEXdHFKq`
   (Fala 5). Każdy „pass" na tych ekranach byłby testem starego kodu i fałszywą zielenią.
   To nie jest ograniczenie narzędzia ani danych — po prostu nie ma czego weryfikować.

2. **Finding 1 (Printers) — mutacji nie da się nawet spróbować.** Ekran pada w render
   Server Componentu, więc nie ma formularza. Wiersze w `printers` dla Apex 22: `2`
   (stan niezmieniony, niczego nie tworzyłem ani nie kasowałem).

3. **Findings 4 i 5 — brak danych wejściowych, niezależnie od deploya.** W Apex 22 nie
   ma ANI JEDNEJ nieaktywnej lokalizacji (6/6 aktywnych). Zarówno test właściwy
   („nieaktywna nie jest oferowana", „dziecko pod nieaktywnym rodzicem"), jak i obie
   anty-regresje wymagają najpierw *stworzenia* nieaktywnego węzła. Nie robiłem tego:
   przy niewdrożonym kodzie byłaby to mutacja produkcyjna bez wartości dowodowej.

4. **Finding 6 — przypadek krytyczny nietestowalny.** Nie znalazłem zdezaktywowanego
   magazynu, a tworzenie go tylko po to, by sprawdzić przetrwanie `deactivated_at` w
   `address` **na starym kodzie**, nie powiedziałoby nic o poprawce.

5. **Obawa cross-review o join audytowy w Invitations** — nierozstrzygnięta. Ekran
   ładuje się dziś tylko dlatego, że działa na starym zapytaniu. Czy naprawiony join
   fali faktycznie nie rzuca `text = uuid`, okaże się dopiero po udanym deployu.

---

## Nowe defekty

### NEW-1 (P0, proces) — fala zacommitowana niekompletnie, build produkcyjny padł

- **Objaw:** deployment `dpl_HZkG497nex1XPE5Cg6d3PtBZNJrf` = ERROR; produkcja utknęła
  na Fali 5; wszystkie 10 findingów fali nieżywych.
- **Przyczyna:** `apps/web/components/shell/act-as-banner.tsx` (+ jego test
  `components/shell/__tests__/platform-switcher.test.tsx`) nie weszły do `0ff4080d`,
  mimo że zależny od nich `layout.tsx` — tak.
- **Odtworzenie:** `git show 0ff4080d:apps/web/components/shell/act-as-banner.tsx`
  → typ `ActAsBannerProps` bez pola `actorLabel`, podczas gdy
  `git show 0ff4080d:apps/web/app/'[locale]'/'(app)'/layout.tsx` w linii 205 przekazuje
  `actorLabel={shellUser.name}`.
- **Naprawa:** zacommitować te dwa pliki. `pnpm exec tsc --noEmit` na drzewie roboczym
  daje **`TypeScript: No errors found`**, więc to komplet.
- **Wniosek na przyszłość:** bramka `typecheck`/`build` przed pushem musiała być
  odpalona na **drzewie roboczym**, a nie na tym, co realnie wchodzi do commita.
  Zielona bramka lokalnie ≠ zielony build z commita, gdy `git add` jest selektywny.
  To ten sam wzorzec, co wcześniejsze „gate-false-green".

### NEW-2 (P1, wdrożeniowy) — migracja aplikuje się mimo padniętego builda

`buildCommand` = `pnpm --filter @monopilot/db migrate && pnpm build`. Migracja biegnie
**pierwsza**, więc nieudany build zostawia bazę wysuniętą do przodu względem kodu.
Tym razem skończyło się dobrze (trigger 526 był z założenia kompatybilny wstecz), ale
przy migracji zrywającej zgodność ten sam mechanizm dałby produkcję w stanie
nienaprawialnym bez rollbacku bazy.

---

## Mutacje produkcyjne wykonane

Jedna, na org Apex 22:

| Obiekt | Pole | Przed | Po |
|---|---|---|---|
| `production_lines` `LINE02` („Oven Line") | `warehouse_id` | NULL | `Main Warehouse` |
| `production_lines` `LINE02` („Oven Line") | `default_output_location_id` | NULL | `9284b072-…` (RECV) |
| `production_lines` `LINE02` („Oven Line") | `default_location_id` | NULL | `9284b072-…` (RECV, przez trigger 526) |

Wykonana przez UI (Settings → Infra → Lines → Edit → Save changes), konieczna do
dowodu PF-R02-01. Wartość jest spójna z `LINE1 / Packing Line 1`, która wskazuje na tę
samą lokalizację. **Nie cofnięto** — cofanie to kolejny zapis produkcyjny bez wartości
dowodowej; do cofnięcia na życzenie.

Poza tym: **żadnych** innych zapisów. Nie tworzono/nie kasowano drukarek, lokalizacji,
magazynów, sites ani zaproszeń. Nie omijano żadnej blokady bezpieczeństwa; pole
„Default output location" wyłączone przy pustym Warehouse zostało uszanowane jako
poprawne zachowanie.

---

## Co musi się wydarzyć przed ponowną weryfikacją

1. Zacommitować `act-as-banner.tsx` + `platform-switcher.test.tsx`, wypchnąć, doczekać
   deployu w stanie READY.
2. Potwierdzić, że alias produkcyjny wskazuje nowy deployment (nie `dpl_2ksFvaTd…`).
3. Dopiero wtedy powtórzyć findingi 1, 2, 4, 5, 6, 7, 8 — łącznie z założeniem
   nieaktywnej lokalizacji i zdezaktywowanego magazynu, których dziś w danych nie ma.
