# Faza 0 — ustalenia i ograniczenia kampanii

Data: 2026-07-29. Dokument opisuje, **czego środowisko testowe dowodzi, a czego nie**.
Czytaj przed interpretacją jakiegokolwiek werdyktu z tej kampanii.

---

## 1. Środowisko — stan zamknięty

Lokalny PostgreSQL **16.13** (Homebrew), baza `monopilot` + trzy klony `monopilot_t1..t3`.
`docker` **nie istnieje** na tej maszynie — `pnpm db:up` jest martwe, nie próbuj go używać.
Skrypt: `scripts/test-db.sh {up|recreate|migrate|verify|clone|reset|urls|down|all}`.

**Produkcja to 17.6 — jest delta major wersji.** Zachowania zależne od 17.x nie są tu dowodzone.

Dowód kompletności: 506 plików migracji, najwyższy numer 543, **zbiory** nazw zgodne
(nie tylko liczby), 281 tabel w `public`.

### Dlaczego łańcuch nie przechodził i co to znaczy dla produkcji
1. **`pgcrypto` — zależność, której żadna migracja nie zakłada.** Migracja 517 woła gołe
   `digest()`. Na Supabase rozszerzenie leży w schemacie `extensions` obecnym w `search_path`,
   więc przechodzi **przypadkiem**. Każde inne świeże środowisko (nowy projekt Supabase, baza CI,
   odtworzenie po awarii) pada na 517 z `function digest(text, unknown) does not exist`.
   Migracja 521 przechodzi później na wbudowane `sha256` — czyli to już raz bolało, ale
   przyczyny nie usunięto. **Shim to odtwarza; defekt zostaje otwarty.**
2. **Schemat `storage` (Supabase Storage)** — wymaga go **wyłącznie migracja 279**
   (`storage.buckets`, `storage.objects`, `storage.foldername`, rola `authenticated`, `auth.uid()`).
   Wstępne oszacowanie „12 migracji" było błędne — pozostałych 11 trafień to słowo „storage"
   w komentarzach.
3. **Migracja 000 nie przechodzi rolą nieuprzywilejowaną, gdy `app_user` już istnieje w klastrze.**
   PG16, zmierzone: `NOSUPERUSER` wymaga bycia superuserem, `NOBYPASSRLS` wymaga `BYPASSRLS` —
   **także żeby ustawić je na „nie"**. `ADMIN OPTION` nie wystarcza. Dlatego `migrate()` podnosi
   rolę tylko na czas przebiegu i degraduje ją po nim.

### Role — i moja pomyłka warta zapamiętania
Wstawiłem asercję „rola właścicielska nie może mieć `BYPASSRLS`". **Była błędna.** Repo tego
wprost wymaga: migracja 525 podnosi wyjątek, gdy rola definiująca nie omija RLS
(`public.work_orders` jest FORCE RLS z politykami tylko dla `app_user`), a `packages/db/src/clients.ts`
opisuje tę pulę jako „owner/superuser role". Architektura ma **dwie pule**:
- `DATABASE_URL_APP` → `app_user`, RLS **egzekwowany** ← tym testujemy uprawnienia,
- `DATABASE_URL_OWNER` → omija RLS **z założenia**, inaczej `withOrgContext` nie odczyta
  `public.users` i każda Server Action padnie.

Bez tej korekty zbudowałbym sobie środowisko, w którym każda Server Action pada, i szukałbym
defektów aplikacji tam, gdzie był defekt mojego guardu.

### Konta
**Łańcuch migracji nie zakłada żadnego konta zdatnego do logowania** — świeża baza ma jednego
użytkownika: nieaktywny sentinel anonimizacji GDPR, i zero przypisań ról.
- `packages/db/seeds/test-personas.ts` — pięć person (wymaga roli z `rolsuper`/`rolbypassrls`).
- `scripts/seed-e2e-user.sql` — użytkownik harnessu `1111…1111`.

Persony zaseedowane z dowodem: `single_site_operator` = 9 uprawnień + dokładnie jeden zakład
(`SITE-DEMO-01`); `second_signer` = `mnt.loto.apply` + `mnt.calib.record`;
`no_asset_deactivate` bez `mnt.asset.deactivate`.

---

## 2. ⚠️ OGRANICZENIA DOWODOWE — czego NIE wolno uznać za udowodnione lokalnie

### 2.1. E-podpis
Fałszywy serwer auth harnessu **zwraca 200 na dowolne hasło**, a `packages/e-sign/src/sign.ts:143-160`
weryfikuje podpis właśnie przez ten endpoint. **Każdy kontrakt oparty na weryfikacji hasła przy
e-podpisie musi być dowodzony przeciw Supabase.** Lokalne „przeszło" nic tu nie znaczy.

### 2.2. Supabase Storage
`scripts/supabase-shim.sql` to atrapa. Uploady, polityki na `storage.objects`, podpisane URL-e,
limity MIME/rozmiaru — **nie są dowodzone**. Przechodzący test lokalny nie mówi o nich nic.

### 2.3. Bramki uprawnień w przeglądarce
Harness wstrzykuje ciasteczko **jednej stałej tożsamości**. Persony istnieją w bazie, ale bez
rozszerzenia harnessu o wybór tożsamości **testy przeglądarkowe dalej idą z konta admina** —
czyli dokładnie ta luka, dla której persony powstały. Do zrobienia.

### 2.4. Logowanie formularzem
Niemożliwe lokalnie: hasła żyją w schemacie `auth` GoTrue, `public.users` nie ma kolumny na hash.
Specy używają wspólnego `signIn` z rozgałęzieniem: `E2E_LOCAL=1` → bypass harnessu, inaczej → formularz.

---

## 3. 🔴 Defekt, który podważał wiarygodność KAŻDEGO wcześniejszego dowodu E2E

`resolveWebRoot()` (`apps/web/e2e/_helpers/shell-parity.ts`) uznawał za katalog aplikacji każdy
katalog mający `e2e/` i `package.json`. **Korzeń repo ma oba** (`e2e/artifacts`). Uruchomiony
z korzenia zwracał więc korzeń, a `resolveRepoRoot()` — dwa poziomy wyżej — wskazywał
**KATALOG DOMOWY UŻYTKOWNIKA**.

Skutek: `pnpm --filter web dev` skanował **71 projektów z całego `~`**, znajdował dwa pasujące
i startował dwa serwery na jednym porcie. Objawiało się jako „Shell parity Next server exited
early" / `EADDRINUSE` — czyli **objaw wskazywał na porty, a przyczyna była w wykrywaniu katalogu**.
Harness mógł uruchamiać serwer deweloperski z **cudzego repozytorium**, a `evidenceDir()` zapisywał
dowody do korzenia repo (`e2e/artifacts` prawdopodobnie tak powstał).

Naprawa: znacznikiem jest `e2e/_helpers`, istniejący wyłącznie w `apps/web`.

**Wniosek dla kampanii:** dowody E2E sprzed tej naprawy należy traktować jako niepewne co do tego,
którą aplikację testowały.

---

## 4. Wzorzec przewijający się przez całą Fazę 0
**Dopasowanie po zbyt słabym znaczniku łapie więcej, niż autor zakładał** — trzy wystąpienia
w jednej godzinie:
- grep po `storage.` → 11 z 12 trafień to komentarze,
- `pnpm --filter web` → dwa projekty zamiast jednego,
- `e2e/` + `package.json` jako znacznik katalogu aplikacji → katalog domowy.

Za każdym razem objaw wskazywał gdzie indziej niż przyczyna.
Do tego czwarte, tej samej rodziny: `data-testid="app-shell"` w `loading.tsx` **i** w `layout.tsx` —
podczas strumieniowania oba są w DOM, więc każda asercja o powłoce trafiała na dwa elementy.

---

## 5. Otwarte defekty produkcyjne znalezione przy okazji
| Defekt | Stan |
|---|---|
| Trzy crony nigdy się nie wykonały (Vercel woła GET, one eksportują tylko POST) — **outbox nigdy się nie opróżnia** | naprawione, czeka na bramkę |
| `42P08` w liście ruchów magazynowych — COUNT dostaje 4 parametry, referuje 1 | naprawione, czeka na bramkę |
| `pgcrypto` nieinstalowany przez żadną migrację | **otwarte** |
| Brak konta zdatnego do logowania po świeżej migracji | **otwarte** |
| Rozjazd enum uprawnień vs baza: 46 kodów tylko w bazie, 4 tylko w enumie | **otwarte** |
| `email_delivery_log` zapisywał `sent` dla listów, które nie wyszły | naprawione, czeka na dowód |
