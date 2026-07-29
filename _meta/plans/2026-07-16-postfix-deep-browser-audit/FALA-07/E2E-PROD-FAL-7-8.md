# E2E na ŻYWEJ PRODUKCJI — Fale 7 + 8

**Commit:** `5b1a5187` · **Migracja:** 527 (zaaplikowana, kolumna `print_jobs.printer_type` + trigger `print_jobs_sync_printer_type` istnieją i są włączone, `tgenabled='O'`)
**Środowisko:** `https://monopilot-kira.vercel.app`, org **Apex 22** (`00000000-0000-0000-0000-000000000002`), site **Main Factory** (`7b72b4af-48d5-4da2-a3fe-d191d9e6ec19`)
**Data przebiegu:** 2026-07-28 23:43 → 2026-07-29 00:05 UTC
**Zasada:** żaden zapis do bazy poza interfejsem aplikacji; przez `psql` wyłącznie SELECT-y. Żadna bramka bezpieczeństwa nie została obejściona.

---

## Tabela wyników

| # | Punkt | Status | Twardy dowód |
|---|-------|--------|--------------|
| 1 | Rejestracja produkcji nie wywala się (regresja `toMicro(undefined)`) | ✅ **UDOWODNIONE** | 2 nowe wiersze w `wo_outputs` na WO-pilot-FG0015, oba z **pustym** polem „Actual weight" (= ścieżka `undefined`), 0 błędów w konsoli. Szczegóły niżej. |
| 2 | Sześć miejsc po przecinku przy przyjęciu linii ZZ | ✅ **UDOWODNIONE** | `grn_items.id = 5aad21ce-76b1-4aa5-bf15-c656e71dcd0d`, `received_qty = 0.000600` (bez zaokrąglenia). 7. miejsce odrzucone z komunikatem, bez wiersza w bazie. |
| 3a | Guard zapasu ODMAWIA dezaktywacji lokalizacji z nośnikami | ✅ **UDOWODNIONE** | RECV: „This location still holds **26** live license plate(s)…", `locations.is_active` dalej `t`. |
| 3b | Guard NIE blokuje dezaktywacji lokalizacji pustej | ✅ **UDOWODNIONE** | OUT (`7a934a57-…`, 0 LP) → `is_active = f` w bazie; następnie przywrócone do `t`. |
| 4 | Komunikat błędu na ekranie skanera pojawia się RAZ | ⛔ **ZABLOKOWANE PRZEZ BRAMKĘ** — i **ZNALEZIONY DEFEKT** | Trasa skanera wymaga PIN-u (redirect `/en/scanner/login`); nie obchodziłem. Przegląd kodu na HEAD: poprawka objęła **tylko ekran pozycji**, ekran listy linii (dokładnie ta trasa) dalej dubluje komunikat. |
| 5 | Druk etykiety LP — selektor drukarki + egzekwowanie + `printer_type` | ✅ **UDOWODNIONE** (z doprecyzowaniem źródła wartości) | 2 wiersze `print_jobs` z `printer_type` `pdf`/`zpl` zgodnym z wybraną drukarką + 1 reprint osieroconego wiersza rozstrzygnięty na `pdf`. |
| 6 | Brak dosłownych `{uom}` / `{item}` na ekranie | ✅ **UDOWODNIONE — wywołane naturalnie** | `wac_unresolved_uom` odpalony realnie na PM-BOX/pcs; obie instancje `{uom}` i `{item}` podstawione, na obu ścieżkach przyjęcia. |
| 7 | Skan ogólny na regresje | ✅ **UDOWODNIONE** | 11 ekranów bez 500 i bez pustego stanu błędu; konsola czysta poza jednym ostrzeżeniem hydratacji (niżej). |

---

## 1. Rejestracja produkcji — UDOWODNIONE

**Co odtworzyłem:** Production → WO-pilot-FG0015 (`4e8167c9-9a1e-4f69-a27b-2db3da7ecf71`, IN_PROGRESS) → zakładka Output → „Register output" → **pole „Actual weight (kg)" celowo puste** (to jest dokładnie wejście, które przed poprawką trafiało do `toMicro` jako `undefined` i wywracało `registerOutput`).

**Dowód trwały — dwa niezależne przebiegi:**

| `wo_outputs.id` | batch | `qty_kg` | `actual_weight_kg` | `lp_id` | `registered_at` |
|---|---|---|---|---|---|
| `fdcbb272-687f-4038-af9c-be491c102380` | `E2E-FAL78-OUT-01` | `0.123` | **NULL** | `b04c1aa7-4e98-47c5-9d8b-4fde715b75f1` (LP-1785282355490-BRZR) | 2026-07-28 23:45:55 |
| `bdb82a49-e8db-4fd7-942b-66f2c917b89d` | `E2E-FAL78-OUT-02` | `0.001` | **NULL** | `e3b269c3-171e-4e3d-978c-6a084ae5774a` | 2026-07-29 00:05:02 |

**Konsola przeglądarki:** drugi przebieg wykonany na czystej bazie konsoli — `0 errors, 0 warnings` **przed** submitem i `0 errors, 0 warnings` **po** submicie. Brak 500.

**Potwierdzenie na ekranie po zapisie:** nowy wiersz w tabeli „Registered output": `primary · FG0015 · 0.123 kg · E2E-FAL78-OUT-01 · 2026-08-27 00:00 · PENDING · LP-1785282355490-BRZR`.

**Kod, który to naprawia:** `apps/web/lib/shared/decimal.ts:34` — `if (value == null) return 0n;`

---

## 2. Sześć miejsc po przecinku przy przyjęciu linii ZZ — UDOWODNIONE

**Wybrana linia to dokładnie przypadek z opisu commita.** PO `NIGHT-R07-PO-1300` (`7969df57-e7c0-4aad-b551-5b84cf7ac9d7`), linia 1 (RM-BUTTER, `0f075185-5957-42e4-b2e8-6fa14676c7d1`):
zamówione `12.345600 kg`, przyjęte wcześniej `12.345000 kg` → **outstanding dokładnie `0.0006 kg`** — czyli „ostatnie 0.000600 linii", które przed poprawką było nie do przyjęcia.

**a) 7. miejsce po przecinku — DALEJ ODRZUCANE (walidacja nie rozluźniona):**
wpisane `0.0000001` → submit → dosłowny tekst z ekranu:

> **Use at most 6 decimal places — that quantity is finer than stock is recorded.**

W bazie po tej próbie: dalej tylko 2 historyczne wiersze `grn_items` dla tej linii (`2.346000`, `9.999000`). **Zero zapisu.**

**b) 4 miejsca po przecinku — PRZYJĘTE Z PEŁNĄ PRECYZJĄ:**
wpisane `0.0006` → submit → komunikat na ekranie:

> **Received 0.0006 kg — GRN GRN-20260728-0001, LP LP-1785282460261-ZMX3.**

Stan trwały:

```
grn_items.id       = 5aad21ce-76b1-4aa5-bf15-c656e71dcd0d
received_qty       = 0.000600      <-- pełna precyzja, NIE 0.001 ani 0.000
uom                = kg
lp_id              = 72390544-c7f4-4746-bdbf-71c10f372f66
created_at         = 2026-07-28 23:47:40
```

Linia po przeładowaniu ekranu: `Ordered 12.345600 kg · Received 12.345600 kg · Outstanding 0 kg · Full`.
Na ekranie GRN (`/en/warehouse/grns/60a4a84b-…`) pozycja renderuje się jako **`0.000600 kg`** — precyzja przechodzi też przez warstwę wyświetlania.

---

## 3. Guard zapasu na lokalizacji — UDOWODNIONE (oba kierunki)

### a) Dezaktywacja lokalizacji z żywym zapasem → ODMOWA

Settings → Infrastruktura → Locations → **RECV — Receiving Bay** (`9284b072-a8f0-4074-9d7e-7cc94288470b`, WH1 / Main Factory) → Edit → odznaczone „Is active" → Save changes.

Dosłowny tekst z ekranu (rola `alert`):

> **This location still holds 26 live license plate(s). Move or consume that stock first — an inactive location cannot be scanned as a move target.**

Liczba **26** jest w komunikacie (wymóg „i podać liczbę") i zgadza się z bazą co do sztuki:
`16 available + 6 received + 2 returned + 2 merged = 26` (guard wyklucza `consumed`, `shipped`, `destroyed`).

Stan trwały po odmowie: `locations.is_active` dla RECV **dalej `t`** — modal nie zamknął się, zapisu nie było.

### b) Dezaktywacja lokalizacji PUSTEJ → UDAŁA SIĘ

**OUT — out01** (`7a934a57-541c-46ac-9c3e-94a4c85b0c28`, WH01 / tester1, panel „LPs here: 0") → Edit → odznaczone „Is active" → Save changes → modal zamknięty bez błędu.

Stan trwały: `locations.is_active = f`. Następnie przywróciłem do `t` tą samą ścieżką (dowód, że reaktywacja też działa) — końcowy stan bazy `t`, bez trwałej zmiany na prodzie.

### c) Dodatkowy dowód braku przeblokowania

Zapis metadanych RECV **z zaznaczonym „Is active"** (lokalizacja z 26 nośnikami) przeszedł bez błędu — guard nie odpala na edycjach, które nie proszą o wyłączenie lokalizacji.
Potwierdza to kod: `apps/web/actions/infra/location.ts:199` — probe `license_plates` wykonuje się **tylko** dla `input.active === false`.

---

## 4. Komunikat na ekranie skanera — ZABLOKOWANE PRZEZ BRAMKĘ + ZNALEZIONY DEFEKT

### Dlaczego nieudowodnione runtime

`https://monopilot-kira.vercel.app/en/scanner/receive-po/11111111-2222-4333-8444-555555555555` → **twardy redirect na `/en/scanner/login`** (ekran PIN-a 4–6 cyfr).
Nie zgadywałem PIN-u, nie zakładałem PIN-u przez `/en/account/pin`, nie strzelałem w API z sesji webowej. **Bramka zatrzymała weryfikację — zgodnie z zasadą punkt zostaje nieudowodniony.**

### Co jednak znalazłem, patrząc w kod na HEAD `5b1a5187`

Poprawka objęła **tylko rodzeństwo**, nie tę trasę, o którą pyta ten punkt.

`components/shell/scanner-primitives.tsx:599-602` — `Banner` renderuje `title` **i** `children` w dwóch osobnych węzłach:

```tsx
{title && <div style={{ fontWeight: 700, … }}>{title}</div>}
<div>{children}</div>
```

**Naprawione** (ekran pozycji, `[poId]/[lineId]`) — `receive-po-item-screen.tsx:258,260`:
```tsx
{state === "not_found" && <Banner kind="err" title={L.poNotFound} />}
```

**NIENAPRAWIONE** (ekran listy linii, `[poId]` — czyli trasa „skaner przyjęcia z nieistniejącym ID zamówienia") — `receive-po-lines-screen.tsx:86-88`, **trzy wystąpienia**:
```tsx
{state === "denied"    && <Banner kind="err" title={L.permissionDenied}>{L.permissionDenied}</Banner>}
{state === "not_found" && <Banner kind="err" title={L.poNotFound}>{L.poNotFound}</Banner>}
{state === "error"     && <Banner kind="err" title={L.errorLoad}>{L.errorLoad}</Banner>}
```

Stan `not_found` został do tego pliku **dodany w tym samym commicie** (diff dokłada `case "not_found"` i mapowanie 404 → `po_not_found`) — czyli commit jednocześnie wprowadził poprawny stan „nie znaleziono" (zamiast ogólnego błędu ładowania) **i** powielił w nim ten sam defekt dublowania, który obok naprawiał.
Raport toru (`FALA-08/rep-FIX-UI.md` §2) wymienia w „Pliki:" wyłącznie `receive-po-item-screen.tsx`. Żaden test nie asertuje „dokładnie raz".

**Wniosek:** komunikat jest właściwy (`poNotFound`, nie ogólny błąd ładowania) — to część działa. Ale na ekranie listy linii pojawi się **dwa razy** (nagłówek + treść), czego nie mogłem potwierdzić wizualnie z powodu bramki PIN.

---

## 5. Druk etykiety LP — UDOWODNIONE

### Stan wyjściowy i egzekwowanie

Nośnik `LP-1784126398915-0YWV` (`307db505-3b67-4674-8938-e22fad76e35d`, RECV / Main Factory) → zakładka **Labels** → „Print label".

Przy zerowej liczbie aktywnych drukarek dla site'u modal nie oferuje żadnego wyboru i **blokuje druk**:
> „No active printers are configured for this site." · przycisk **Print** `[disabled]`

Żeby dojść dalej, założyłem przez normalny ekran konfiguracji (Settings → Infrastruktura → Printers → „+ Add printer") dwie drukarki dla Main Factory:

| `printers.id` | nazwa | `printer_type` | `is_active` |
|---|---|---|---|
| `a24bb421-bdcd-44bd-9ee7-bf28df2cce5a` | E2E-FAL78 PDF Printer | `pdf` | `t` |
| `c4e5f9ef-9071-4d96-890f-3d755890fd29` | E2E-FAL78 ZPL Printer | `zpl` | `t` |

### Selektor realnie istnieje i jest egzekwowany

Po ich dodaniu modal renderuje **combobox „Printer"** (`data-testid="lp-print-printer-trigger"`) z **dwiema realnymi opcjami** — to nie jest sam przycisk „Drukuj".

Submit **bez wyboru drukarki** → dosłownie:
> **Select a printer.**

Stan trwały po tej próbie: `select count(*) from print_jobs` = **2** (bez zmian) — nic nie wpadło do kolejki.

### Wiersze w `print_jobs`

| `print_jobs.id` | wybrana drukarka | `status` | `printer_type` | `result_url` |
|---|---|---|---|---|
| `c1eb3bd5-ab61-4b5c-83b8-6b3d44dde736` | E2E-FAL78 **PDF** | `sent` | **`pdf`** | jest (`data:text/plain;…`) |
| `d24795a5-c478-4a2c-a52e-c8ac28cff77b` | E2E-FAL78 **ZPL** | `queued` | **`zpl`** | NULL |

`printer_type` **śledzi wybraną drukarkę**, nie zgaduje z kształtu wiersza — dwa różne typy dały dwie różne wartości i dwa różne tryby wyjścia.

### Bonus: R08-06 (reprint osieroconego zadania) faktycznie naprawiony

Reprint historycznego wiersza z 2026-07-17, który ma `printer_id = NULL` i `printer_type = NULL` (drukarka usunięta, `ON DELETE SET NULL`), status `sent` + `result_url`:

```
nowy print_jobs.id = b31a7880-69bb-42df-8f72-76ea3c9e9fa5
status             = sent
printer_type       = pdf         <-- NIE 'zpl'
result_url         = jest        <-- jest co pobrać, nie wisi w kolejce
```

Czyli objaw z migracji („usunięta drukarka Direct PDF sprawiała, że reprint domyślał się `zpl` i wisiał w kolejce bez wyjścia") **nie występuje**.

### Doprecyzowanie — skąd faktycznie bierze się `printer_type` (uczciwie)

Punkt prosił o sprawdzenie, czy wartość wypełnił **trigger**. Sprawdziłem i **tak nie jest — i tak ma być**:

- kolumna jest **nullable, bez `default`**, z CHECK-iem `printer_type is null or printer_type in ('zpl','pdf')` — zgodnie z migracją;
- trigger `print_jobs_sync_printer_type` **istnieje i jest włączony** (`tgenabled = 'O'`);
- ale **nowa aplikacja wstawia `printer_type` JAWNIE** — `settings/infra/printers/_actions/printers.ts:337` wymienia kolumnę w insercie. Trigger ma klauzulę `if new.printer_type is not null then return new; end if;`, więc dla wierszy z tej ścieżki **w ogóle się nie odzywa**.
- Trigger jest fallbackiem na okno wdrożenia (stary bundle) oraz dla `app/api/scanner/print-label/route.ts`, który kolumny nie ustawia. **Tej ścieżki nie odtworzyłem** — wymagałaby albo INSERT-a przez `psql` (zakazane), albo starego bundla, albo skanera (bramka PIN). Poprawność tej gałęzi potwierdza wyłącznie post-check w samej migracji (blok `do $$` z asercją `old-app queued ZPL insert` → `zpl`), który przeszedł przy aplikacji.
- Dwa historyczne wiersze z 17.07 (`f500f5b3…`, `14cc63e8…`) mają `printer_type` **NULL** — zgodnie z intencją migracji („nie przepisujemy historii, nigdy nie zgadujemy `pdf`").

---

## 6. Brak dosłownych placeholderów `{uom}` / `{item}` — UDOWODNIONE (wywołane naturalnie)

**Udało się odpalić dokładnie ten komunikat.** Warunki znalazłem w danych: pozycja **PM-BOX „Cardboard Box"** ma `uom_base = 'pcs'`, linia 3 PO `NIGHT-R07-PO-1300` jest w `pcs` z `unit_price = 0.1234` (> 0), a tabela `uom_custom_conversions` dla org Apex 22 jest **pusta** — czyli brak przelicznika pcs → kg.

Próba przyjęcia tej linii daje dosłownie (identycznie na **obu** ścieżkach):

> **Receipt is blocked: PM-BOX has no unit conversion defined for pcs, so this receipt can't be valued. Add a conversion for pcs (or set the item's base unit) in the item's master data — retrying will not help until that is fixed.**

- ekran magazynowy `/en/warehouse/receive-po/7969df57-…` → helper `fill()` z regexem globalnym (`po-receive.client.tsx:41-43`)
- modal na `/en/planning/purchase-orders/7969df57-…` → `.replaceAll('{item}',…).replaceAll('{uom}',…)` (`receive-po-line-modal.tsx:196-197`)

**Oba wystąpienia `{uom}` podstawione na `pcs`** („…defined for **pcs**…" oraz „Add a conversion for **pcs**…"), `{item}` na `PM-BOX`. **Zero dosłownych `{…}`.**

Fail-closed potwierdzone: `select count(*) from grn_items where po_line_id = '43c73aed-…'` → **0**. Blokada nie zapisała nic.

**Skan pozostałych ekranów ZZ / przyjęcia** regexem `\{[a-zA-Z_]+\}` po snapshocie dostępności: **0 trafień** na liście ZZ, szczegółach ZZ, ekranie przyjęcia ZZ, liście i szczegółach GRN, liście i szczegółach LP, inwentaryzacji, przydatności, lokalizacjach, drukarkach, historii druku, inbound.

---

## 7. Skan ogólny na regresje

| Ekran | URL | Wynik | Konsola |
|---|---|---|---|
| Lista ZZ | `/en/planning/purchase-orders` | ✅ renderuje dane | czysta |
| Szczegóły ZZ | `/en/planning/purchase-orders/7969df57-…` | ✅ 3 linie, ceny, kwoty | ⚠ React #418 (hydratacja) |
| Przyjęcie ZZ (magazyn) | `/en/warehouse/receive-po/7969df57-…` | ✅ pełny flow zapisu | czysta |
| Inbound | `/en/warehouse/inbound` | ✅ | czysta |
| Lista GRN | `/en/warehouse/grns` | ✅ nowy GRN-20260728-0001 widoczny | czysta |
| Szczegóły GRN | `/en/warehouse/grns/60a4a84b-…` | ✅ `0.000600 kg` | ⚠ React #418 (hydratacja) |
| Lista LP | `/en/warehouse/license-plates` | ✅ | czysta |
| Szczegóły LP | `/en/warehouse/license-plates/307db505-…` | ✅ 7 zakładek, akcje, modal druku | czysta |
| Inwentaryzacja (lista) | `/en/warehouse/counts` | ✅ 3 sesje | czysta |
| Inwentaryzacja (szczegóły) | `/en/warehouse/counts/b3a814df-…` | ✅ | czysta |
| Przydatność | `/en/warehouse/expiry` | ✅ tier czerwony + bursztynowy (10 wierszy) | czysta |
| Lokalizacje | `/en/settings/infra/locations` | ✅ drzewo 9 lokalizacji, panel, edycja | czysta |
| Drukarki | `/en/settings/infra/printers` | ✅ CRUD działa | czysta |
| Historia druku | `/en/warehouse/print-history` | ✅ nowe i stare zadania, reprint działa | czysta |
| Jednostki i konwersje | `/en/settings/units` | ✅ renderuje (**500 z poprzedniej sesji NIE powtarza się**) | czysta |
| WO — szczegóły | `/en/production/wos/4e8167c9-…` | ✅ 8 zakładek, rejestracja wyjścia | czysta |

**Żaden ekran nie zwrócił 500 ani nie wyrenderował pustego stanu błędu.**

---

## Znalezione przy okazji

1. **[P2 — realny defekt] Ekran listy linii skanera dalej dubluje komunikat błędu.**
   `apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/_components/receive-po-lines-screen.tsx:86-88` — trzy Bannery (`denied`, `not_found`, `error`) przekazują ten sam tekst do `title` i do `children`, a `Banner` renderuje oba sloty. Poprawka Fali 8 objęła wyłącznie rodzeństwo (`[lineId]/…/receive-po-item-screen.tsx`). Jednolinijkowiec: skasować `children` w tych trzech miejscach (jak zrobiono obok). Warto przy okazji dodać asercję „dokładnie raz" — dziś żaden test tego nie pilnuje.

2. **[P3] React #418 (hydration text mismatch) na dwóch ekranach szczegółów.**
   `/en/planning/purchase-orders/[id]` oraz `/en/warehouse/grns/[grnId]` rzucają zminifikowany React #418 („text content does not match server-rendered HTML"). Listy i pozostałe ekrany są czyste — wygląda na renderowanie daty/czasu zależne od strefy klienta. Nie psuje funkcji, ale kosztuje re-render całego poddrzewa i będzie maskować prawdziwe błędy w konsoli.

3. **[P3] Guard zapasu liczy też nośniki w statusie `merged`.**
   `apps/web/actions/infra/location.ts:205` wyklucza `('consumed','shipped','destroyed')`. Na RECV daje to 26 = 16 `available` + 6 `received` + 2 `returned` + **2 `merged`**. Nośnik `merged` jest już wchłonięty w rodzica — to nie jest żywy zapas. Skutek jest kosmetyczny (zawyżona liczba w komunikacie i w kaflu „LPs here"), ale w skrajnym przypadku lokalizacja zawierająca *wyłącznie* wchłonięte nośniki nie da się wyłączyć bez powodu. Definicja jest celowo zduplikowana w `settings/infra/locations/page.tsx:287` i w `lib/warehouse/scanner/movement.ts` — jeśli zmieniać, to w trzech miejscach naraz (albo, lepiej, wyciągnąć jedną stałą).

4. **[P3] Licznik w nagłówku przyjęcia ZZ nie zgadza się z tabelą.**
   Po domknięciu linii 1 nagłówek pokazał „Lines to receive (**2**)", a tabela dalej renderuje **3** wiersze (linia zamknięta z akcją „—"). Nagłówek liczy tylko linie otwarte. Albo nazwać nagłówek inaczej, albo odfiltrować domknięte wiersze.

5. **[Dziura w danych pilota, nie regresja] Org Apex 22 nie ma ANI JEDNEJ konwersji jednostek.**
   `uom_custom_conversions` jest puste, więc każda pozycja, której jednostki nie da się przeliczyć wbudowanym przelicznikiem masy (np. `PM-BOX` w `pcs`), jest **twardo niemożliwa do przyjęcia** — dokładnie ta blokada, którą sprawdzałem w punkcie 6. Sam mechanizm działa poprawnie i fail-closed, ale w danych pilota przekłada się na trwale zablokowaną linię PO. Warto dodać konwersję dla `pcs` albo zdecydować, że pozycje opakowaniowe wyceniamy inaczej.

6. **Artefakty testowe zostawione na produkcji** (świadomie, wszystkie przez UI):
   - `printers`: `a24bb421-…` „E2E-FAL78 PDF Printer", `c4e5f9ef-…` „E2E-FAL78 ZPL Printer" — **nie da się ich usunąć przez UI** (`deletePrinter` rzuca `has_dependents`, bo mają zadania druku). Do posprzątania ręcznie albo do zostawienia jako pierwsze aktywne drukarki Main Factory.
   - `wo_outputs`: `fdcbb272-…` (0.123 kg), `bdb82a49-…` (0.001 kg) + 2 wygenerowane LP.
   - `grn_items`: `5aad21ce-…` (0.000600 kg) + GRN `GRN-20260728-0001` + LP `LP-1785282460261-ZMX3`.
   - `print_jobs`: `c1eb3bd5-…`, `d24795a5-…`, `b31a7880-…`.
   - `locations`: OUT dezaktywowana i **przywrócona** — stan końcowy bez zmian.

---

## Czego świadomie NIE robiłem

- Nie zakładałem ani nie zgadywałem PIN-u skanera (ani przez `/en/account/pin`, ani przez API) — punkt 4 zostaje nieudowodniony runtime.
- Nie klikałem wyłączonych kontrolek przez JS ani nie strzelałem w server actions z pominięciem UI.
- Nie wykonałem żadnego INSERT/UPDATE/DELETE przez `psql` — wszystkie zmiany stanu przeszły przez interfejs aplikacji.
- Nie odtworzyłem ścieżki triggera migracji 527 (wymagałaby zapisu spoza aplikacji lub starego bundla) — opisane wprost w punkcie 5 zamiast zaraportowania fałszywej zieleni.
