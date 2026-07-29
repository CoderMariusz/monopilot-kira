# Recenzja migracji 543 (tor A) — otwarte ryzyko

**Status:** kod napisany, **niezweryfikowany empirycznie**. Codex nie miał dostępu do bazy
(`127.0.0.1:5432` nie odpowiadał — lokalny PG słucha tylko po sockecie), więc post-check
NIGDY SIĘ NIE WYKONAŁ. To dokładnie ten przypadek, w którym `PREPARE` daje fałszywą zieleń.

## Zweryfikowane statycznie — OK
- Nazwy indeksów zgadzają się z migracją 504 (`..._active_semantic_code_uidx`, `..._label_uidx`).
- Kolejność normalizacji poprawiona: `regexp_replace(lower(trim(x)), '[^a-z0-9]+', '', 'g')`.
- Pre-check kolizji grupuje po POPRAWNEJ normalizacji — czyli dokładnie po tym, na czym padłby
  nowy indeks unikalny. Nie rozwiązuje kolizji po cichu, tylko podnosi 23505 z listą wierszy.
- Kolumny INSERT-a (`id, org_id, code, label, data_type, active`) istnieją; `data_type = 'text'`
  jest w dozwolonym zbiorze CHECK-a (mig 333). Kolumny dodane w 374 mają domyślne wartości.
- Para fixture'owa jest dobrana poprawnie: `AB_MIG543_<HEX>` / `CD_MIG543_<HEX>` kolapsuje
  do tego samego klucza pod ZEPSUTĄ normalizacją, a jest różna pod poprawną. Migracja sprawdza
  tę własność w runtime, zanim cokolwiek wstawi — to dobry wzorzec.
- Organizacja istnieje na świeżej bazie: `030-apex-org-bootstrap.sql` zasiewa Apex, a 543 leci
  długo po niej. Ścieżka „brak organizacji → wyjątek" nie powinna się odpalić.

## ⚠️ RYZYKO GŁÓWNE — `FORCE ROW LEVEL SECURITY`
`packages/db/migrations/333-npd-dynamic-fields.sql:135`:
```sql
alter table public.npd_field_catalog force row level security;
```
`FORCE` oznacza, że **RLS obowiązuje także WŁAŚCICIELA tabeli**. Post-check wstawia wiersze
bez ustawionego kontekstu organizacji, a `app.current_org_id()` (mig `002-rls-baseline.sql:54`)
**nie czyta `current_setting`** — czyta z `app.active_org_contexts` złączonego z
`app.session_org_contexts`, czyli wymaga REALNEJ sesji założonej przez `app.set_org_context(uuid, uuid)`.

Wniosek: post-check przejdzie **tylko wtedy, gdy migracje lecą rolą z `SUPERUSER` albo `BYPASSRLS`**
(te omijają nawet FORCE). Na izolowanej bazie testowej z rolą bez tych atrybutów — a taka jest
cała idea Fazy 0.2 — INSERT zostanie odrzucony i **cały łańcuch migracji padnie na 543**.

543 jest przy tym **jedyną migracją w repo z post-checkiem wymagającym organizacji** — czyli
wprowadza wzorzec, którego dotąd nie było. Tym uważniej trzeba go sprawdzić.

## Rozstrzygnięcie
Empiryczne, nie teoretyczne: uruchomić pełny łańcuch na izolowanej bazie (tor B) **tą samą rolą,
którą lecą migracje** i zobaczyć, czy 543 przechodzi.
- przechodzi → zamknięte, mamy dowód behawioralny mocniejszy niż PREPARE,
- pada na RLS → runda naprawcza: post-check ma się wykonać w kontekście organizacji
  (`app.set_org_context`) albo zdegradować do `raise notice` z jawnym powodem —
  **nigdy do cichego pominięcia**, bo wtedy migracja kłamie, że coś udowodniła.

Czego NIE robić: uruchamiać tego post-checku przeciwko produkcji. Wstawia wiersze.
Dowód na prodzie ma być read-only (`PREPARE` w transakcji z `rollback`) albo z E2E.
