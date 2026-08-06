# Producenci wierszy bez zakładu (Codex, 2026-08-05 23:06)

**Sprostowanie do liczb:** komunikat migracji mówił o 7 wierszach (baza `monopilot`),
a moja tabela w dzienniku o 11 (baza `monopilot_t1`). To były **dwie różne bazy** —
raport słusznie wytknął tę niespójność.

Najważniejszy wniosek: bieżące ścieżki tworzenia nowych `work_orders` i `license_plates` są już zasadniczo uszczelnione, ale system nadal nie jest fail-closed na poziomie danych. Surowe inserty mogą tworzyć WO/LP bez zakładu, a produkcyjne ścieżki `start-wo`, maszyny stanów, korekt oraz historii LP propagują istniejący `NULL`.

Nie udało mi się bezpośrednio odczytać 11 rekordów: sandbox odrzucił zarówno TCP, jak i lokalny socket Postgresa komunikatem `Operation not permitted`. Dlatego nie przypisuję im identyfikatorów ani pochodzenia bez dowodu.

## 1. PRODUCENCI PUSTEGO ZAKŁADU

| Tabela | Ścieżka zapisu | Plik:linia | Czy zawsze ustawia `site_id`? | Produkcja |
|---|---|---|---|---|
| `work_orders` | ręczne utworzenie WO | [create-work-order-core.ts:69](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-core.ts:69>), [insert:187](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-core.ts:187>) | Obecnie tak: `resolveWriteSiteId` odmawia przed insertem, a insert zawiera `site_id`. | Tak |
| `work_orders` | MRP → WO | [mrp.ts:1400](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:1400>), [insert:1451](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:1451>) | Obecnie tak; brak zakładu daje `skipped: missing site`. | Tak |
| `work_orders` | DB trigger dla surowych insertów | [384-trigger-user-default-site.sql:45](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/384-trigger-user-default-site.sql:45>) | Nie. `coalesce(line, user default, org default)` może zwrócić `NULL`, po czym trigger robi `return new`. | Tak — każdy raw insert/import/test |
| `work_orders` | stare ścieżki aplikacyjne | [379-work-orders-default-site-id-trigger.sql:3](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/379-work-orders-default-site-id-trigger.sql:3>) | Historycznie nie: komentarz migracji mówi wprost, że create/MRP/import nie ustawiały `site_id`. | Tak, historycznie |
| `work_orders` | demo seed 259 | [259-demo-wo-seed.sql:54](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/259-demo-wo-seed.sql:54>) | Nie; 5 WO bez kolumny `site_id`. Późniejsze migracje próbują je naprawić. | Jednorazowa migracja/demo |
| `work_orders` | testy PG/raw SQL | m.in. `packages/db/__tests__/*`, lista insertów potwierdzona przez `rg` | Część nie ustawia; polega na triggerze i sprzątaniu. | Nie, harness |
| `license_plates` | przyjęcie PO/skaner | [receive-po-line-core.ts:189](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/receive-po-line-core.ts:189>), [insert:571](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/receive-po-line-core.ts:571>) | Obecnie tak, fail-closed. Historycznie skaner mógł przekazać `NULL`; udokumentowane w [deepdive-bughunt.md:107](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/reviews/2026-07-08-deepdive-bughunt.md:107>). | Tak |
| `license_plates` | rejestracja outputu produkcji | [register-output.ts:662](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:662>), [resolution:732](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:732>) | Tak; `resolveWriteSiteId` odmawia przed zapisem. | Tak |
| `license_plates` | output z demontażu | [register-disassembly-output.ts:417](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:417>), [resolution:613](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:613>) | Tak. | Tak |
| `license_plates` | przyjęcie transferu | [actions.ts:1156](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:1156>), [insert:1237](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:1237>) | Tak; docelowy site jest wymagany. | Tak |
| `license_plates` | dodatnia inwentaryzacja | [count-actions.ts:1233](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:1233>), [insert:475](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:475>) | Tak; brak site kończy operację przed insertem. | Tak |
| `license_plates` | bezpośrednia korekta dodatnia | [direct-adjust-actions.ts:201](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts:201>), [insert:248](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts:248>) | Obecnie tak. Historycznie wynik `resolveSiteId` mógł być `NULL`. | Tak |
| `license_plates` | split LP | [lp-split-merge-destroy-actions.ts:359](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts:359>), [insert:410](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts:410>) | Tak; docelowy magazyn musi mieć site. | Tak |
| `license_plates` | raw SQL/manual fixture | [seed-e2e.sql:68](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/prod-audit-2026-07-12/seed-e2e.sql:68>), [seed-e2e.sql:129](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/prod-audit-2026-07-12/seed-e2e.sql:129>) | Nie; oba inserty pomijają kolumnę. `license_plates` nie ma triggera uzupełniającego site. | Nie, ręczny fixture |
| `license_plates` | test warehouse Wave B | [warehouse-waveb-schema.test.ts:46](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/warehouse-waveb-schema.test.ts:46>) | Nie; `makeLp` pomija site. Sprzątanie jest dopiero w `afterAll` [linia 86](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/warehouse-waveb-schema.test.ts:86>). | Nie, test; może zostać po przerwaniu |
| `wo_outputs` | materializacja przy `START` | [start-wo.ts:263](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/start-wo.ts:263>) | Nie. Komentarz wprost: „When the WO has no site, site_id stays NULL”; parametr to `wo.site_id` na linii 296. | Tak — najgroźniejsza aktywna ścieżka |
| `wo_outputs` | normalny output | [register-output.ts:732](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:732>), [insert:862](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:862>) | Tak; używa rozwiązanego `outputSiteId`. | Tak |
| `wo_outputs` | demontaż | [register-disassembly-output.ts:473](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:473>), [insert:493](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:493>) | Tak. | Tak |
| `wo_outputs` | korekta/replacement/counter-entry | [corrections-actions.ts:702](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:702>), [counter-entry:1127](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:1127>) | Nie; oba kopiują `original.site_id`, które jest nullable. | Tak |
| `wo_outputs` | demo seed 259 | [259-demo-wo-seed.sql:111](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/259-demo-wo-seed.sql:111>) | Nie; dokładnie 2 outputy bez kolumny site. | Jednorazowa migracja/demo |
| `wo_outputs` | ręczny E2E fixture | [seed-e2e.sql:35](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/prod-audit-2026-07-12/seed-e2e.sql:35>), [seed-e2e.sql:141](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/prod-audit-2026-07-12/seed-e2e.sql:141>) | Nie; dokładnie 2 inserty bez site. | Nie |
| `wo_events` | lifecycle state machine | [wo-state-machine.ts:237](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/wo-state-machine.ts:237>) | Nie; bierze site przez podzapytanie z WO bez warunku `site_id is not null`. | Tak — aktywna propagacja |
| `lp_state_history` | genesis nowych, poprawnych LP: PO/output/demontaż/dodatnia korekta/transfer | [receive:610](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/receive-po-line-core.ts:610>), [output:694](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-output.ts:694>), [disassembly:460](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/register-disassembly-output.ts:460>) | Te konkretne wywołania są bezpieczne, bo nadrzędny LP został właśnie utworzony z site; sam insert pomija jednak kolumnę. | Tak |
| `lp_state_history` | skaner move, QA transition, rezerwacja, korekta receipt, część transferów | [movement.ts:920](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/scanner/movement.ts:920>), [lp-qa-transition-core.ts:81](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/warehouse/lp-qa-transition-core.ts:81>), [reservation-actions.ts:188](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/reservation-actions.ts:188>), [receipt-corrections-actions.ts:326](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/receipt-corrections-actions.ts:326>) | Nie zawsze. Pomijają site i polegają na triggerze. Trigger może nadal zwrócić `NULL`. | Tak |
| `lp_state_history` | ścieżki jawnie kopiujące nullable site LP/outputu | [complete-cancel:606](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/complete-cancel-wo.ts:606>), [waste:235](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/waste/record-waste.ts:235>), [quality hold:1005](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:1005>), [ship:570](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:570>), [cancel shipment:412](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/cancelShipment.ts:412>) | Nie; przekazują `lp.site_id` bez odrzucenia `NULL`. | Tak |
| `lp_state_history` | LP detail, split/merge/destroy, direct-adjust decrease, count shrinkage | [lp-detail:289](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-detail-actions.ts:289>), [lp-detail:611](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-detail-actions.ts:611>), [split helper:185](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts:185>), [direct-adjust:412](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts:412>), [count:681](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:681>) | Nie; typ parametru/site źródłowego pozostaje `string \| null`. | Tak |
| `lp_state_history` | korekty output/consumption | [corrections-actions.ts:815](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:815>), [linia 936](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:936>) | Nie; używa `original.site_id` albo `lp.site_id ?? original.site_id`, więc oba mogą być puste. | Tak |
| `lp_state_history` | migracja 282 | [282-lp-lifecycle-expiry.sql:34](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/282-lp-lifecycle-expiry.sql:34>) | Nie; kopiuje `license_plates.site_id`, również gdy jest `NULL`. | Jednorazowa migracja |
| `lp_state_history` | test Wave B | [warehouse-waveb-schema.test.ts:180](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/warehouse-waveb-schema.test.ts:180>) | Nie; LP i historia powstają bez site. | Nie, test |

Trigger historii nie gwarantuje wartości: [384-trigger-user-default-site.sql:93](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/384-trigger-user-default-site.sql:93>) robi `coalesce(lp.site_id, user default, org default)` i bez kontroli zwraca rekord z `NULL`.

Nie znalazłem żadnego `COPY`, crona, workera ani funkcji DB tworzącej te pięć tabel. Funkcje bazodanowe 379/380/384 wyłącznie próbują stemplować inserty. Nie ma triggera dla `license_plates`.

## 2. POCHODZENIE 11 WIERSZY

Dowód dostępny z repo:

- Dziennik podaje rozkład `3 + 2 + 2 + 2 + 2` w [DZIENNIK-NOCY.md:29](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-08-05-noc/DZIENNIK-NOCY.md:29>).
- Odbudowa pustej bazy wyłącznie z migracji przeszła 551, więc sam deterministyczny łańcuch migracji nie pozostawia tych rekordów [DZIENNIK-NOCY.md:54](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-08-05-noc/DZIENNIK-NOCY.md:54>).
- Klon jest tworzony jako `TEMPLATE monopilot`, a następnie dostaje wyłącznie persony i użytkownika harnessu [test-db.sh:354](</Users/mariuszkrawczyk/Projects/monopilot-kira/scripts/test-db.sh:354>), [test-db.sh:393](</Users/mariuszkrawczyk/Projects/monopilot-kira/scripts/test-db.sh:393>). Te dwa seedy nie zapisują do pięciu badanych tabel.
- Test Wave B tworzy LP oraz historię bez site i sprząta dopiero w `afterAll`; przerwany proces może zostawić takie dane [warehouse-waveb-schema.test.ts:46](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/warehouse-waveb-schema.test.ts:46>), [linia 86](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/__tests__/warehouse-waveb-schema.test.ts:86>).
- Ręczny fixture `seed-e2e.sql` tworzy dokładnie 2 LP i 2 outputy bez site [linie 35, 68, 129, 141](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/prod-audit-2026-07-12/seed-e2e.sql:35>).
- Historyczna ścieżka skanera była realnym producentem LP bez site [deepdive-bughunt.md:107](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/reviews/2026-07-08-deepdive-bughunt.md:107>).

Wniosek: to nie jest standardowy seed person, ale nie da się rozstrzygnąć „test vs operacja aplikacji” dla konkretnych 11 rekordów bez ich ID, czasów i powiązań. Oba źródła są realne.

Jest też niespójność dowodowa: wyjątek zapisany w dzienniku mówi o `7` rekordach [linia 20](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-08-05-noc/DZIENNIK-NOCY.md:20>), podczas gdy tabela poniżej sumuje się do 11. To wymaga świeżego SELECT-a.

## 3. DLACZEGO 550 NIE POKRYŁA

Dla outputów migracja robi:

```sql
where output_row.site_id is null
...
and resolved.site_id is not null;
```

Źródło: [550-production-site-id-backfill.sql:13](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/550-production-site-id-backfill.sql:13>).

Analogicznie dla eventów [linia 31](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/550-production-site-id-backfill.sql:31>). `resolved.site_id` to wyłącznie:

```sql
coalesce(wo.site_id, wo_line.site_id)
```

Jeżeli zarówno WO, jak i linia mają `NULL`, output/event pozostaje pusty.

Post-check klasyfikuje ten przypadek jako `source_null` [linie 514–565](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/550-production-site-id-backfill.sql:514>), ale rzuca wyjątek tylko dla rekordów, które miały jednoznaczne źródło i mimo tego nie zostały zaktualizowane [linie 628–633](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/550-production-site-id-backfill.sql:628>). Brak źródła jest raportowany, lecz dozwolony przez 550.

Dodatkowo 550:

- nie aktualizuje `work_orders`,
- nie aktualizuje `license_plates`,
- nie aktualizuje `lp_state_history`.

Backfill LP istnieje dopiero w [557-license-plate-site-id-repair.sql:1](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/557-license-plate-site-id-repair.sql:1>). Jest jednak za blokującą 551, więc standardowy runner nigdy do niego nie dochodzi. To błąd kolejności migracji.

## 4. SQL NAPRAWCZY DLA KLONU

Poniższy skrypt nie zgaduje zakładu. Zbiera kandydatów z relacji operacyjnych, przerywa przy konflikcie lub braku dowodu i dzięki transakcji nie zostawia częściowego backfillu.

Nie został uruchomiony.

```sql
\set ON_ERROR_STOP on

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

lock table
  public.work_orders,
  public.wo_outputs,
  public.wo_events,
  public.license_plates,
  public.lp_state_history
in share row exclusive mode;

create temporary table _site_candidates (
  entity text not null,
  subject_id uuid not null,
  org_id uuid not null,
  site_id uuid not null,
  source text not null
) on commit drop;

-- 1. Work orders: tylko relacje operacyjne, bez "org default".
insert into _site_candidates (entity, subject_id, org_id, site_id, source)
select 'work_orders', wo.id, wo.org_id, pl.site_id, 'production_line'
from public.work_orders wo
join public.production_lines pl
  on pl.id = wo.production_line_id
 and pl.org_id = wo.org_id
where wo.site_id is null and pl.site_id is not null

union all
select 'work_orders', wo.id, wo.org_id, wh.site_id, 'production_line_warehouse'
from public.work_orders wo
join public.production_lines pl
  on pl.id = wo.production_line_id
 and pl.org_id = wo.org_id
join public.warehouses wh
  on wh.id = pl.warehouse_id
 and wh.org_id = pl.org_id
where wo.site_id is null and wh.site_id is not null

union all
select 'work_orders', wo.id, wo.org_id, outp.site_id, 'wo_output'
from public.work_orders wo
join public.wo_outputs outp
  on outp.wo_id = wo.id
 and outp.org_id = wo.org_id
where wo.site_id is null and outp.site_id is not null

union all
select 'work_orders', wo.id, wo.org_id, ev.site_id, 'wo_event'
from public.work_orders wo
join public.wo_events ev
  on ev.wo_id = wo.id
 and ev.org_id = wo.org_id
where wo.site_id is null and ev.site_id is not null

union all
select 'work_orders', wo.id, wo.org_id, lp.site_id, 'production_lp'
from public.work_orders wo
join public.license_plates lp
  on lp.wo_id = wo.id
 and lp.org_id = wo.org_id
where wo.site_id is null and lp.site_id is not null;

do $$
declare
  v_bad text;
begin
  select string_agg(entity || ':' || subject_id::text || ' via ' || source, ', ')
    into v_bad
    from _site_candidates c
   where not exists (
     select 1
       from public.sites s
      where s.id = c.site_id
        and s.org_id = c.org_id
   );

  if v_bad is not null then
    raise exception 'candidate site belongs to another org or no longer exists: %', v_bad;
  end if;

  select string_agg(entity || ':' || subject_id::text || '=' || sites::text, ', ')
    into v_bad
    from (
      select entity, subject_id, array_agg(distinct site_id order by site_id) sites
        from _site_candidates
       group by entity, subject_id
      having count(distinct site_id) > 1
    ) conflicts;

  if v_bad is not null then
    raise exception 'conflicting WO site evidence: %', v_bad;
  end if;
end
$$;

with resolved as (
  select subject_id,
         org_id,
         min(site_id) as site_id
    from _site_candidates
   where entity = 'work_orders'
   group by subject_id, org_id
  having count(distinct site_id) = 1
)
update public.work_orders wo
   set site_id = resolved.site_id
  from resolved
 where wo.id = resolved.subject_id
   and wo.org_id = resolved.org_id
   and wo.site_id is null;

truncate _site_candidates;

-- 2. License plates: ten sam zestaw dowodów co migracja 557.
insert into _site_candidates (entity, subject_id, org_id, site_id, source)
select 'license_plates', lp.id, lp.org_id, wh.site_id, 'warehouse'
from public.license_plates lp
join public.warehouses wh
  on wh.id = lp.warehouse_id and wh.org_id = lp.org_id
where lp.site_id is null and wh.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, wh.site_id, 'location_warehouse'
from public.license_plates lp
join public.locations loc
  on loc.id = lp.location_id and loc.org_id = lp.org_id
join public.warehouses wh
  on wh.id = loc.warehouse_id and wh.org_id = loc.org_id
where lp.site_id is null and wh.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, grn.site_id, 'grn'
from public.license_plates lp
join public.grns grn
  on grn.id = lp.grn_id and grn.org_id = lp.org_id
where lp.site_id is null and grn.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, gi.site_id, 'grn_item'
from public.license_plates lp
join public.grn_items gi
  on gi.lp_id = lp.id and gi.org_id = lp.org_id
where lp.site_id is null and gi.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, po.site_id, 'purchase_order'
from public.license_plates lp
join public.grns grn
  on grn.id = lp.grn_id and grn.org_id = lp.org_id
join public.purchase_orders po
  on po.id = grn.po_id and po.org_id = grn.org_id
where lp.site_id is null and po.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, adj.site_id, 'stock_adjustment'
from public.license_plates lp
join public.stock_adjustments adj
  on adj.lp_id = lp.id and adj.org_id = lp.org_id
where lp.site_id is null and adj.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, cs.site_id, 'count_session'
from public.license_plates lp
join public.stock_adjustments adj
  on adj.lp_id = lp.id and adj.org_id = lp.org_id
join public.count_lines cl
  on cl.id = adj.count_line_id and cl.org_id = adj.org_id
join public.count_sessions cs
  on cs.id = cl.session_id and cs.org_id = cl.org_id
where lp.site_id is null and cs.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, sm.site_id, 'stock_move'
from public.license_plates lp
join public.stock_moves sm
  on sm.lp_id = lp.id and sm.org_id = lp.org_id
where lp.site_id is null and sm.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, hist.site_id, 'lp_state_history'
from public.license_plates lp
join public.lp_state_history hist
  on hist.lp_id = lp.id and hist.org_id = lp.org_id
where lp.site_id is null and hist.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, wo.site_id, 'work_order'
from public.license_plates lp
join public.work_orders wo
  on wo.id = lp.wo_id and wo.org_id = lp.org_id
where lp.site_id is null and wo.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, outp.site_id, 'wo_output'
from public.license_plates lp
join public.wo_outputs outp
  on outp.lp_id = lp.id and outp.org_id = lp.org_id
where lp.site_id is null and outp.site_id is not null

union all
select 'license_plates', lp.id, lp.org_id, wh.site_id, 'transfer_destination'
from public.license_plates lp
join public.transfer_order_line_lps to_lp
  on to_lp.dest_lp_id = lp.id and to_lp.org_id = lp.org_id
join public.transfer_orders tr
  on tr.id = to_lp.to_id and tr.org_id = to_lp.org_id
join public.warehouses wh
  on wh.id = tr.to_warehouse_id and wh.org_id = tr.org_id
where lp.site_id is null and wh.site_id is not null;

do $$
declare
  v_bad text;
begin
  select string_agg(entity || ':' || subject_id::text || ' via ' || source, ', ')
    into v_bad
    from _site_candidates c
   where not exists (
     select 1
       from public.sites s
      where s.id = c.site_id
        and s.org_id = c.org_id
   );

  if v_bad is not null then
    raise exception 'invalid LP site evidence: %', v_bad;
  end if;

  select string_agg(entity || ':' || subject_id::text || '=' || sites::text, ', ')
    into v_bad
    from (
      select entity, subject_id, array_agg(distinct site_id order by site_id) sites
        from _site_candidates
       group by entity, subject_id
      having count(distinct site_id) > 1
    ) conflicts;

  if v_bad is not null then
    raise exception 'conflicting LP site evidence: %', v_bad;
  end if;
end
$$;

with resolved as (
  select subject_id,
         org_id,
         min(site_id) as site_id
    from _site_candidates
   where entity = 'license_plates'
   group by subject_id, org_id
  having count(distinct site_id) = 1
)
update public.license_plates lp
   set site_id = resolved.site_id
  from resolved
 where lp.id = resolved.subject_id
   and lp.org_id = resolved.org_id
   and lp.site_id is null;

-- 3. Historia LP dziedziczy naprawiony fizyczny LP.
update public.lp_state_history hist
   set site_id = lp.site_id
  from public.license_plates lp
 where hist.site_id is null
   and lp.id = hist.lp_id
   and lp.org_id = hist.org_id
   and lp.site_id is not null;

truncate _site_candidates;

-- 4. Outputy i eventy: po naprawieniu WO użyj WO/production line.
insert into _site_candidates (entity, subject_id, org_id, site_id, source)
select 'wo_outputs', outp.id, outp.org_id, wo.site_id, 'work_order'
from public.wo_outputs outp
join public.work_orders wo
  on wo.id = outp.wo_id and wo.org_id = outp.org_id
where outp.site_id is null and wo.site_id is not null

union all
select 'wo_outputs', outp.id, outp.org_id, pl.site_id, 'production_line'
from public.wo_outputs outp
join public.work_orders wo
  on wo.id = outp.wo_id and wo.org_id = outp.org_id
join public.production_lines pl
  on pl.id = wo.production_line_id and pl.org_id = wo.org_id
where outp.site_id is null and pl.site_id is not null

union all
select 'wo_events', ev.id, ev.org_id, wo.site_id, 'work_order'
from public.wo_events ev
join public.work_orders wo
  on wo.id = ev.wo_id and wo.org_id = ev.org_id
where ev.site_id is null and wo.site_id is not null

union all
select 'wo_events', ev.id, ev.org_id, pl.site_id, 'production_line'
from public.wo_events ev
join public.work_orders wo
  on wo.id = ev.wo_id and wo.org_id = ev.org_id
join public.production_lines pl
  on pl.id = wo.production_line_id and pl.org_id = wo.org_id
where ev.site_id is null and pl.site_id is not null;

do $$
declare
  v_bad text;
begin
  select string_agg(entity || ':' || subject_id::text || '=' || sites::text, ', ')
    into v_bad
    from (
      select entity, subject_id, array_agg(distinct site_id order by site_id) sites
        from _site_candidates
       group by entity, subject_id
      having count(distinct site_id) > 1
    ) conflicts;

  if v_bad is not null then
    raise exception 'conflicting child-row site evidence: %', v_bad;
  end if;
end
$$;

with resolved as (
  select subject_id, org_id, min(site_id) site_id
    from _site_candidates
   where entity = 'wo_outputs'
   group by subject_id, org_id
  having count(distinct site_id) = 1
)
update public.wo_outputs outp
   set site_id = resolved.site_id
  from resolved
 where outp.id = resolved.subject_id
   and outp.org_id = resolved.org_id
   and outp.site_id is null;

with resolved as (
  select subject_id, org_id, min(site_id) site_id
    from _site_candidates
   where entity = 'wo_events'
   group by subject_id, org_id
  having count(distinct site_id) = 1
)
update public.wo_events ev
   set site_id = resolved.site_id
  from resolved
 where ev.id = resolved.subject_id
   and ev.org_id = resolved.org_id
   and ev.site_id is null;

-- 5. Zero nierozwiązanych albo cały skrypt się wycofuje.
do $$
declare
  v_remaining bigint;
  v_detail jsonb;
begin
  select sum(n), jsonb_object_agg(table_name, n)
    into v_remaining, v_detail
    from (
      select 'license_plates' table_name, count(*) n
        from public.license_plates where site_id is null
      union all
      select 'lp_state_history', count(*)
        from public.lp_state_history where site_id is null
      union all
      select 'work_orders', count(*)
        from public.work_orders where site_id is null
      union all
      select 'wo_events', count(*)
        from public.wo_events where site_id is null
      union all
      select 'wo_outputs', count(*)
        from public.wo_outputs where site_id is null
    ) counts;

  if v_remaining <> 0 then
    raise exception
      'site repair refused: unresolved rows remain: %',
      v_detail;
  end if;
end
$$;

commit;
```

Jeżeli skrypt przerwie się na `unresolved rows remain`, nie należy dodawać fallbacku „default site”. Dla potwierdzonego fixture testowego można go usunąć po identyfikatorze; dla danych biznesowych potrzebne jest jawne mapowanie zatwierdzone przez właściciela danych.

## 5. CO NAPRAWIĆ W KODZIE

Kolejność od najgroźniejszej:

1. **P0 — migracje nie mogą być połykane.** Aktualny repozytoryjny [apps/web/vercel.json:3](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/vercel.json:3>) ma poprawne `migrate && build`. Dziennik dokumentuje inne polecenie z `|| echo` [DZIENNIK-NOCY.md:41](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-08-05-noc/DZIENNIK-NOCY.md:41>). Trzeba sprawdzić i usunąć override w ustawieniach projektu Vercel.

2. **P0 — naprawić kolejność backfillu.** Migracja 557 jest nieosiągalna, bo 551 blokuje wcześniej. Nie edytować zastosowanej 550. Dla środowisk, gdzie 551 nie została nigdzie zapisana w ledgerze, jej pre-audit powinien zawierać deterministyczną naprawę z 557. Jeżeli gdziekolwiek 551 została zastosowana, nie zmieniać jej checksumy — potrzebny jest osobny preflight wykonywany przed runnerem.

3. **P0 — baza ma odrzucać nowe korzenie bez site.**
   - `work_orders_default_site_id()` w [384:46](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/384-trigger-user-default-site.sql:46>) powinien rzucać wyjątek, jeśli po resolution site nadal jest `NULL`.
   - `set_site_id_from_lp()` w [384:94](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/384-trigger-user-default-site.sql:94>) również powinien odrzucać nierozwiązany zapis.
   - `license_plates` potrzebuje analogicznego `BEFORE INSERT` albo — po backfillu — `site_id NOT NULL`.
   - Docelowo wszystkie pięć tabel powinno mieć `site_id NOT NULL`; dziś schemat jawnie pozostawia je nullable, np. [license_plates:30](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/191-warehouse-license-plates-fefo.sql:30>) i [wo_outputs:36](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/181-production-wo-outputs-consumption.sql:36>).

4. **P0 — zatrzymać propagację starego NULL-a przed pierwszym zapisem.**
   - [start-wo.ts:263](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/start-wo.ts:263>): odrzucić start, jeśli `wo.site_id` jest pusty.
   - [wo-state-machine.ts:237](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/wo-state-machine.ts:237>): pobrać i zweryfikować site przed insertem eventu.
   - [corrections-actions.ts:702](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:702>) oraz [1127](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:1127>): nie kopiować nullable `original.site_id`; sprawdzić zgodność z WO i odmówić przy braku/konflikcie.

5. **P1 — wszystkie historie LP powinny mieć jeden fail-closed backstop.** Obecnie kilkanaście akcji kopiuje `lp.site_id` albo polega na triggerze. Po utwardzeniu triggera żadna z tych ścieżek nie zapisze `NULL`; aplikacja powinna dodatkowo zwracać czytelny błąd przed zmianą LP.

6. **P1 — poprawić fixture/testy.**
   - Dodać jawne site do 2 LP i 2 outputów w [seed-e2e.sql](</Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/prod-audit-2026-07-12/seed-e2e.sql:35>).
   - `warehouse-waveb-schema.test.ts` powinien seedować site i przekazywać go do `makeLp`.
   - Nie edytować zastosowanej migracji 259; jej dane naprawić migracją forward-only.

Dla produkcji historyczne dane należy wypełniać wyłącznie z jednoznacznych relacji. Jeśli WO nie ma site, linia/magazyn również nie mają site, a dzieci nie dostarczają zgodnego dowodu, poprawnego zakładu nie da się wywnioskować. Potrzebna jest decyzja właściciela danych; przypisanie „default site” byłoby zgadywaniem i może ujawnić dane niewłaściwemu zakładowi.

## 6. CZEGO NIE USTALIŁEM

- Nie mam ID, timestampów, `created_by`, `origin`, numerów WO/LP ani powiązań konkretnych 11 rekordów. Bezpośredni SELECT został zablokowany przez sandbox przed połączeniem z `monopilot_t1`.
- Nie rozstrzygnąłem, czy rekordy pochodzą z ręcznego `seed-e2e.sql`, przerwanego testu, historycznej operacji skanera/korekty, czy kombinacji tych źródeł.
- Nie zweryfikowałem rzeczywistego polecenia skonfigurowanego w projekcie Vercel; plik w repo jest bezpieczny, ale dziennik dokumentuje niebezpieczny override.
- Nie ustaliłem przyczyny rozbieżności `7` w wyjątku kontra `11` w późniejszym zestawieniu.
- Nie odpytywałem produkcji — zgodnie z zakresem.
- Niczego nie zmieniłem; nie uruchomiłem migracji, testów, buildów ani SQL naprawczego.
