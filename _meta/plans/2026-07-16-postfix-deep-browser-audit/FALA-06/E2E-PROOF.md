# FALA 6 — dowód behawioralny na PRODUKCJI

**Cel:** https://monopilot-kira.vercel.app · org **Apex 22** (`00000000-0000-0000-0000-000000000002`)
**Commit:** `efeabd09` (main) · **Data:** 2026-07-28 ~02:35–03:02 UTC
**Metoda:** akcja w przeglądarce (Playwright) **+** weryfikacja stanu w bazie (`psql`, `DATABASE_URL_OWNER`).
Samo wyrenderowanie ekranu **nie** było traktowane jako dowód — z wyjątkiem znaleziska 1, gdzie „ekran w ogóle się ładuje" **jest** naprawą.

> **Uwaga:** poprzednie podejście weryfikacyjne trafiło na **zły build** (pierwszy deploy fali,
> commit `0ff4080d`, nie skompilował się — na produkcji stała Fala 5 `124e6b71`).
> Tamte wnioski są nieważne. Ta sesja startuje od zera na `efeabd09`.

---

## 0. Potwierdzenie builda (bramka wejściowa)

**Settings → Printers** (`/en/settings/infra/printers`) — ekran, który wcześniej w całości
zastępowany był globalnym error-boundary (ref `3974216983`).

**Renderuje się poprawnie.** Pełny nagłówek „Printers / SET-PRN", przycisk `+ Add printer`,
tabela `Printers` z kolumnami Name/Type/Address/Location/Site/Status/Actions i 2 wierszami
(`CODEX-R14 PRINTER EDITED`, `SOL-R02 Printer 0555 Edited`), komplet przycisków
Edit / Activate / Deactivate / Delete Printer. **Zero błędów w konsoli.**
Bramka zaliczona → reszta weryfikacji ma sens.

---

## 1. Tabela wyników

| # | Znalezisko | Werdykt | Dowód (konkretne wartości) |
|---|---|---|---|
| 1 | **PF-R02-02** Printers (P1, ekran 100% martwy) | ✅ **PROVEN** | Ekran renderuje się w całości (patrz §0). **Mutacja CREATE:** utworzono `FALA6-VERIFY-PRINTER` → DB: `id=92fe3f10-aaee-4022-a2a2-63d0cc542be2, printer_type=pdf, address=pdf://fala6-verify, location=FALA6 Test Bay, is_active=t, created_at=2026-07-28 02:37:04.475797+00`. **Mutacja DELETE** (to jest dokładnie ta server action `removePrinter`, która wcześniej wysypywała RSC): Delete Printer → dialog potwierdzenia → Confirm Delete → DB: wiersz **zniknął**, zostały 2 pierwotne. |
| 2 | **PF-R01-06** atrybucja zaproszeń | ⚠️ **PARTIAL** | Ekran **ładuje się** (brak `persistence_failed` — błąd SQL T4-1 naprawiony) i **nigdzie nie ma zmyślonego „System"**. ALE `Invited By` **nigdy** nie rozwiązuje się na realnego użytkownika — 5/5 wierszy pokazuje `Unknown`, w tym zaproszenie utworzone **przeze mnie 20 sekund wcześniej**. Szczegóły + dowód rozstrzygający: §2. |
| 3 | **PF-R01-07** nazwa wyświetlana | ✅ **PROVEN** | `auth.users.raw_user_meta_data = {"full_name": "Apex Admin", ...}` (stare źródło), `public.users.name='Admin'`, `display_name='Admin'` (wartość utrwalona). Powłoka renderuje **`Admin`** — `aria-label="Open user menu for Admin"`, awatar `A`. Ciąg **`"Apex Admin"` nie występuje nigdzie na stronie** (`document.body.innerText.includes('Apex Admin') === false`). Metadane wciąż trzymają starą wartość, więc gdyby błąd istniał, byłby widoczny — to kontrola dowodu. |
| 4 | **PF-R01-05** odkrywalność | ✅ **PROVEN** | W nawigacji **Settings → grupa „Access"** widnieje pozycja **`Invitations`** → `/en/settings/invitations` (obok `Users & roles`, `Security`, `Audit logs`). Osiągalna klikiem, nie tylko przez wpisanie URL-a. |
| 5 | **PF-R02-06** duplikat site | ✅ **PROVEN** | Istniejący kod `CR14`. (a) `CR14` + nazwa `Fala6 Dup Test` → **„That site code is already in use in this organisation. Choose a different one."** (b) **wariant lowercase** `cr14` + `Fala6 Dup Lower` → **ten sam komunikat o duplikacie**. W żadnym przypadku nie pojawiło się „This field is required". DB: nadal tylko `CR14 / CODEX-R14 SITE`, **żaden `Fala6*` site nie powstał**. |
| 6a | **PF-R02-03** klamrowanie dziecka | ✅ **PROVEN** | Fikstury utworzone (org miała 6/6 aktywnych lokalizacji, zero nieaktywnych). Pod **nieaktywnym** `F6PARENT` utworzono `F6CLAMP`. Dialog z góry informuje: *„The parent location is inactive, so this location is saved as inactive. Reactivate the parent first to keep it active."*, checkbox `Is active` **disabled + odznaczony** (blokada bezpieczeństwa — **nie obchodziłem jej**). DB: `F6CLAMP, parent_id=2e006270…, is_active=f` → **utworzony i sklamrowany, NIE odrzucony**. |
| 6b | **PF-R02-04** nieaktywna lokalizacja jako wyjście linii | ✅ **PROVEN** | Magazyn `Bakery` zawiera **dokładnie 3 lokalizacje: `F6PARENT`, `F6CHILD`, `F6CLAMP` — wszystkie `is_active=f`**. Aktywna linia `BAKE` (status `active`, magazyn `Bakery`) → dropdown **„Default output location"** oferuje **wyłącznie `— none —`**. Żadna z 3 nieaktywnych lokalizacji nie jest proponowana. |
| 6c | **Anty-regresja** (edycja węzła pod nieaktywnym rodzicem) | ⚠️ **PARTIAL** | W osiągalnym wariancie **przechodzi**: `F6CHILD` (pod nieaktywnym `F6PARENT`) — zmieniono **wyłącznie nazwę** → zapis **udany**, DB: `Fala6 Child Active` → **`Fala6 Child RENAMED`**, `is_active` bez zmian, zero błędu `has_active_children`. **Nie udało się** odtworzyć ścisłego przypadku T2-3 (**aktywny** węzeł pod **nieaktywnym** rodzicem) — powód w §3.1. |
| 7 | **PF-R02-05** adres magazynu | ✅ **PROVEN** | (a) Edycja adresu aktywnego magazynu `CR14WH` → DB: `{"line1": "FALA6 Address Step1"}`. (b) **Dezaktywacja** → DB: `{"line1": "FALA6 Address Step1", "deactivated_at": "2026-07-28T02:58:22.018795+00:00", "deactivated_by": "31fe18af-43f7-4c05-a078-db23a9a5bd3e"}`. (c) **Edycja adresu magazynu zdezaktywowanego** → DB: `{"line1": "FALA6 Address Step2 AfterDeactivate", "deactivated_at": "2026-07-28T02:58:22.018795+00:00", "deactivated_by": "31fe18af-…"}` → **`deactivated_at` PRZEŻYŁ** prawdziwą ścieżkę UI, nie tylko izolowany SQL. |
| 7b | **T5-1** (regresja wprowadzona przez tę falę) | ✅ **PROVEN** | Utworzono `F6WH` z adresem `FALA6 Original Address` → **bez odświeżania** otwarto edycję: pole Address **poprawnie wypełnione** wartością (wcześniej byłoby puste) → zmieniono **tylko nazwę** → DB: `name='Fala6 WH RENAMED'`, `address={"line1": "FALA6 Original Address"}` → **adres nie zniknął**. |
| 8 | **PF-R02-01** domyślne wyjście linii | ✅ **PROVEN** | Round-trip na `Oven Line` (`LINE02`): `RECV` → **`— none —`** → DB: `default_location_id=NULL, default_output_location_id=NULL` → z powrotem **`RECV`** → DB: obie kolumny `9284b072-a8f0-4074-9d7e-7cc94288470b`. Kolumna kanoniczna i legacy **pozostają zsynchronizowane**. Stan pierwotny przywrócony. |

---

## 2. PF-R01-06 — dowód rozstrzygający (dlaczego PARTIAL)

**Co jest naprawione:** ekran żyje (T4-1 — błędny join `text = uuid` + nieistniejąca kolumna
`al.created_at` — już nie wywala `persistence_failed`), i **nie ma fabrykowanego „System"**.

**Co nadal nie działa:** atrybucja **nigdy** się nie rozwiąże. Nie jest to „uczciwe unknown" —
dane w bazie **są**, a UI i tak pokazuje `Unknown`.

Odczyt (`apps/web/actions/users/invitations-lifecycle.ts:54`) filtruje:

```sql
and al.resource_type = 'user_invitation'
and al.action        = 'settings.user.invited'
```

Zapis (`apps/web/actions/users/invite.ts:420`) wstawia:

```sql
values ($1::uuid, $2::uuid, 'user', $3, 'users', $4, null, $5::jsonb, 'security')
--                                          ^^^^^^^ resource_type = 'users'
```

Weryfikacja na produkcji:

```
liczba wierszy pasujących do filtra ODCZYTU
  (resource_type='user_invitation' AND action='settings.user.invited')  →  0

faktyczne resource_type dla action='settings.user.invited':
  users                  | 4
  org_security_policies  | 2      (osobny, zastany błąd zapisu)

akcje faktycznie pod resource_type='user_invitation':
  settings.user.invitation_resent   | 1
  settings.user.invitation_revoked  | 2
```

**Test rozstrzygający — świeże zaproszenie wykonane przeze mnie jako Admin:**

- utworzono `fala6-attr-check@monopilot.test` (`d622ada7-b0f0-434b-b2fc-101b668f3dcf`)
- audyt zapisany: `action=settings.user.invited, actor_type=user, actor_user_id=31fe18af-43f7-4c05-a078-db23a9a5bd3e` (**= Admin**), `resource_type=users`
- UI po odświeżeniu: `Invited By` = **`Unknown`**

Wszystkie 5 wierszy dosłownie tak, jak widać na ekranie:

| Email | Rola | **Invited By** | Status |
|---|---|---|---|
| `fala6-attr-check@monopilot.test` | Viewer | **Unknown** | Pending |
| `f5v-invite-20260728@monopilot.test` | NPD Manager | **Unknown** | Revoked |
| `night-r01-20260717-0548@monopilot.test` | Viewer | **Unknown** | Revoked |
| `sol-r01-20260715-0511-inv@monopilot.test` | NPD Manager | **Unknown** | Expired |
| `e2e-f4r-inv@test.local` | Viewer | **Unknown** | Expired |

Dla 4 z 5 wierszy audyt **zawiera** `actor_user_id = 31fe18af…` (Admin). Uczciwe `Unknown` należy
się wyłącznie `e2e-f4r-inv@test.local` (brak jakiegokolwiek wpisu audytowego).

**Naprawa jednoliniowa:** zrównać `resource_type` po obu stronach (albo poszerzyć filtr odczytu o `'users'`).

**Przy okazji potwierdzone jako naprawione (T4-7):** Revoked pokazuje **tylko**
„Revoked invitation is immutable.", Expired **tylko** „Lifecycle action unavailable" — nie oba naraz.

---

## 3. Nie udowodnione i dlaczego

### 3.1. Ścisły przypadek anty-regresji T2-3 — **NIEOSIĄGALNY PRZEZ UI**

Wymagany stan to **aktywny** węzeł pod **nieaktywnym** rodzicem. Nie da się go dziś zbudować:

- **Dezaktywacja rodzica z aktywnymi dziećmi jest blokowana.** Próba wyłączenia `F6PARENT`,
  gdy `F6CHILD` był aktywny → **„This location still has active child locations. Deactivate them
  first, or leave this location active."**, DB bez zmian (`F6PARENT.is_active` nadal `t`).
- **Utworzenie aktywnego dziecka pod nieaktywnym rodzicem jest klamrowane** (§1 poz. 6a) —
  checkbox `Is active` jest *disabled*.

Niezmiennik domknięty z obu stron, więc `aktywny-pod-nieaktywnym` może pochodzić już wyłącznie
z **danych zastanych** — a **Apex 22 takich nie ma** (przed sesją: 6/6 lokalizacji aktywnych,
żadna nie miała rodzica).

Zgodnie z twardą regułą **nie obchodziłem blokady** (żadnego wymuszania kliknięcia w disabled
control, żadnego wpisu do bazy „na skróty"). Przetestowałem wariant osiągalny — edycja nazwy
węzła pod nieaktywnym rodzicem — i **przechodzi** (§1 poz. 6c). Ryzyko over-blockingu z T2-3
pozostaje **niezweryfikowane dla tej organizacji**, ale też **niewyzwalane** dla nowych danych.

### 3.2. Root-cause defektu D-1 (reaktywacja magazynu) — **nie ustalony**

Zachowanie potwierdzone behawioralnie (§4, D-1), ale przyczyny nie potwierdziłem: dwa zapytania
diagnostyczne (dry-run `UPDATE` w transakcji z `rollback` oraz odczyt `pg_constraint` dla
`outbox_events`) zostały **zablokowane przez klasyfikator uprawnień**. Nie zgaduję — podaję samą
obserwację + poszlakę: `settings.warehouse.reactivated` **nigdy** nie pojawiło się w
`outbox_events`, podczas gdy `settings.warehouse.deactivated` tam jest.

### 3.3. Zakres nietknięty

Weryfikacja objęła wyłącznie 8 punktów z listy. Reszta powierzchni Fali 6 (m.in. wyścigi
`SELECT … FOR UPDATE` z T2-1, import CSV z T2-2, `register-output.ts` z T1-1, tłumaczenia
`ro`/`uk` z T4-6) **nie była sprawdzana**.

---

## 4. Nowe defekty

### D-1 · P1 · Magazynu **nie da się reaktywować** — dezaktywacja to droga w jedną stronę

**Kroki odtworzenia**
1. Settings → Warehouses → zaznacz `CR14WH` → **Bulk Deactivate** → działa (DB dostaje `deactivated_at`).
2. Zaznacz ten sam wiersz → **Bulk Activate** → ekran: **„Warehouse update failed. Try again or contact an administrator."**
3. Ten sam efekt daje przycisk per-wiersz **„Reactivate warehouse"** — również po pełnym przeładowaniu strony.

**Stan bazy po 3 próbach:** `deactivated_at` **nadal obecny**
(`2026-07-28T02:58:22.018795+00:00`), status w UI wciąż `Deactivated`.
Kod `reactivateWarehouse` (`apps/web/actions/infra/warehouse.ts:148-184`) *wygląda* poprawnie
(`address - 'deactivated_at' - 'deactivated_by'`), więc awaria jest gdzieś dalej — patrz §3.2.
**Skutek:** magazyn zdezaktywowany omyłkowo jest nie do odzyskania z poziomu UI.

### D-2 · P2 · Zaproszenie: `invalid_input` bez wskazania pola (Site de-facto wymagane)

**Kroki odtworzenia**
1. Settings → Invitations → **Invite User**.
2. Wpisz poprawny e-mail, wybierz rolę (np. `Viewer`), **zostaw pole `Site` puste** → **Send invitation**.
3. Ekran: **„Invitation failed: invalid_input"**. Bez wskazania winnego pola, bez podpowiedzi.
4. Uzupełnij `Site` = `Main Factory` → ten sam formularz **przechodzi** i tworzy użytkownika.

**Przyczyna** (`apps/web/actions/users/invite.ts:188-193`): gdy `inviteSiteId` jest puste,
a rola nie należy do `ALL_SITE_AUTHORITY_ROLE_SLUGS` → `invalid_input`. Pole `Site` nie jest
oznaczone gwiazdką ani wymagane w UI, a jest to zwykły textbox (nie lista wyboru), mimo że backend
dopasowuje po `id` / `name` / `site_code`.

### D-3 · P3 · Nieprzetłumaczone klucze w dialogu usuwania drukarki

Settings → Printers → **Delete Printer** — modal wyświetla surowe stringi:
nagłówek **„Delete Printer Title"**, treść **„Delete Printer Body"**.
(Sama operacja usuwania działa poprawnie — patrz §1 poz. 1.)

---

## 5. Mutacje wykonane na PRODUKCJI

| # | Obiekt | Operacja | Stan końcowy |
|---|---|---|---|
| 1 | Drukarka `FALA6-VERIFY-PRINTER` | create → **delete** | ✅ posprzątane, brak w bazie |
| 2 | Site: 2 próby duplikatu (`CR14`, `cr14`) | odrzucone | ✅ brak skutków ubocznych |
| 3 | **Fikstura** lokalizacja `F6PARENT` | create + deactivate | ⚠️ **zostaje** (`is_active=f`) |
| 4 | **Fikstura** lokalizacja `F6CHILD` | create + deactivate + rename | ⚠️ **zostaje** (`is_active=f`, `Fala6 Child RENAMED`) |
| 5 | **Fikstura** lokalizacja `F6CLAMP` | create (sklamrowana) | ⚠️ **zostaje** (`is_active=f`) |
| 6 | **Fikstura** magazyn `F6WH` | create + rename | ⚠️ **zostaje** (`Fala6 WH RENAMED`) |
| 7 | Magazyn `CR14WH` | adres ×2 + deactivate + 3× nieudana reaktywacja | ⚠️ **utknął jako `Deactivated`**, adres = `FALA6 Address Step2 AfterDeactivate` (przed sesją: `Active`, `CODEX R14 TEST`) |
| 8 | Linia `Oven Line` (`LINE02`) | output `RECV` → `none` → `RECV` | ✅ **stan pierwotny przywrócony** |
| 9 | **Fikstura** użytkownik `fala6-attr-check@monopilot.test` | invite (Viewer, Main Factory) | ⚠️ **zostaje** jako `Pending`, `is_active=f` |

**Do posprzątania przez właściciela:** pozycje 3–7 i 9. Pozycja **7 nie da się cofnąć przez UI**
— to właśnie defekt D-1; wymaga naprawy kodu albo ręcznego
`update warehouses set address = address - 'deactivated_at' - 'deactivated_by' where code='CR14WH'`.

---

## 6. Podsumowanie

- **Bramka:** Printers **żyje** — build `efeabd09` jest właściwy, weryfikacja miarodajna.
- **Udowodnione w pełni:** PF-R02-02, PF-R01-07, PF-R01-05, PF-R02-06, PF-R02-03, PF-R02-04, PF-R02-05 (+ regresja T5-1), PF-R02-01.
- **Częściowe (2):** PF-R01-06 (ekran naprawiony, atrybucja nadal martwa — jedna linia do poprawy), anty-regresja T2-3 (przypadek nieosiągalny przez UI).
- **Nowe defekty (3):** D-1 (P1, reaktywacja magazynu), D-2 (P2, `invalid_input` przy zaproszeniu), D-3 (P3, i18n dialogu drukarki).
