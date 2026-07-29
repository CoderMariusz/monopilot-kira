# 🔴 BLOKER: utworzenie organizacji jest niemożliwe — na OBU wersjach indeksu

Data ustalenia: 2026-07-29. Zmierzone, nie wywnioskowane.

## Objaw
Wstawienie wiersza do `public.organizations` odpala kaskadę ~50 triggerów zasiewających.
Jeden z nich (`trg_seed_npd_dynamic_catalog` → `seed_npd_dynamic_catalog_on_org_insert()`
→ `seed_npd_brief_unit_fields(uuid)`) narusza unikalny indeks semantyczny na `npd_field_catalog`.

## Dwa NIEZALEŻNE defekty, jeden objaw

### Pod indeksem z migracji 504 — to jest stan DZISIEJSZEJ PRODUKCJI
```
ERROR: duplicate key value violates unique constraint "npd_field_catalog_active_semantic_code_uidx"
DETAIL: Key (org_id, lower(regexp_replace(TRIM(BOTH FROM code), '[^a-z0-9]+','','g')))=(<org>, ox) already exists.
```
Klasa znaków `[^a-z0-9]` **nie obejmuje wielkich liter**, więc `regexp_replace` je USUWA, zanim
`lower()` zdąży je zmniejszyć. Kody sklejają się do klucza `ox`.

### Pod indeksem z migracji 543 (naprawiona kolejność, jeszcze niewdrożona)
```
DETAIL: Key (..., runsperweek) already exists.
```
Przyczyna **inna i niezależna**: przy tworzeniu organizacji zasiewane są DWA warianty tego samego pola:

| kod | źródło |
|---|---|
| `runs_per_week` | `427-npd-unit-foundation-fields.sql` |
| `Runs_Per_Week` | `095-dept-columns-apex-seed.sql` |

Pod ZEPSUTĄ normalizacją te dwa kody się **rozchodziły** — czyli defekt danych był maskowany
przez defekt indeksu. Po naprawie kolejności zaczynają kolidować, bo semantycznie **są** tym samym polem.

## Wniosek operacyjny
**Migracja 543 jest konieczna, ale NIE wystarczająca.** Wdrożenie samego 543 zamieniłoby jedną
blokadę na drugą. Potrzebna jest migracja towarzysząca (544), usuwająca duplikat z seedu.

To także powód, dla którego wstrzymano push commita `739f9223`: `PREPARE` migracji 543 na
produkcji przechodził **trzykrotnie**, bo transakcja PREPARE nie tworzy organizacji.
Dowód „migracja się aplikuje" ≠ dowód „funkcja, której dotyczy, działa".

## Zasięg — dlaczego to jest najcięższe znalezisko kampanii
- **66 plików testowych** w `apps/web` tworzy organizację w swoich fixture'ach.
- W standardowej bramce (bez `DATABASE_URL`) te testy się **nie wykonują**, więc awaria jest
  **niewidoczna dla CI**. Dopiero przebieg przeciw prawdziwej bazie — czyli cel tej kampanii —
  ujawnia, że padają na starcie.
- Potwierdzone bezpośrednio na dwóch: `wo-lifecycle.integration.test.ts` (kontrakty `PRD-001/008/009/014`)
  i `mwo-loto-signing.pg.test.ts` (kontrakty `SFQ-164/166`). **Sześć z 55 FAIL-i Fazy 1 jest
  zablokowanych jednym defektem.**
- 7 z 39 czerwonych plików suity rdzenia tworzy organizację.

## Konsekwencja produktowa
Jeśli to samo zachowanie występuje na produkcji (indeks 504 tam jest — zweryfikowany),
to **onboarding nowej organizacji jest niewykonalny**. Nie zweryfikowano tego wstawieniem
na produkcji — świadomie, bo to tworzyłoby dane. Weryfikacja wymaga transakcji z `rollback`
albo środowiska stagingowego.

## Klasa błędu (do wzorców kampanii)
**Defekt maskowany przez inny defekt.** Zepsuta normalizacja przypadkiem rozdzielała dwa kody,
które są duplikatem. Naprawa jednego odsłania drugi. Dlatego naprawa nie może być uznana
za zamkniętą na podstawie tego, że „migracja się aplikuje" — dopiero wykonanie realnej operacji
(tu: utworzenie organizacji) rozstrzyga.

Do tego druga klasa: **bramka, która pomija testy, ukrywa awarię**. 66 plików pomijanych
bez `DATABASE_URL` = 66 plików, o których CI twierdzi, że nie ma problemu.
