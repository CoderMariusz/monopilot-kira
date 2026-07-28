# FALA 5 / FIX-B — raport (identity + routing CTA)

Zakres: 9 znalezisk [B-1]…[B-9] z cross-review. Wszystkie naprawione.
**Nie uruchamiałem** testów, builda, `tsc`, migracji ani psql — bramka jest po stronie orchestratora.

---

## [B-1 · P1] `resendInvitation` — ścieżka sukcesu nieosiągalna na produkcji

**Plik:** `apps/web/actions/users/invitations-lifecycle.ts`

### Czy w tym repo istnieje realna wysyłka maila? **NIE.**

Zbadane wprost, nie na wyczucie:

| ścieżka | wysyła? | dowód |
|---|---|---|
| `resend` (`^6.12.4`, zadeklarowany w `apps/web/package.json`) | **nie — kod martwy** | jedyne `resend.emails.send()` jest w `apps/web/actions/email/test-provider.ts:141`, za `import` przez zmienną (`RESEND_MODULE`). Nie da się tam dojść: `loadResendConfig` (`:107-116`) pyta o kolumny `api_key_vault_ref`, `secret_ref`, `vault_ref`, których **żadna z 503 migracji nie tworzy** (`072-integration-settings.sql:14-23` ma tylko `id, org_id, category, provider, config, is_active, …`). Postgres rzuca `42703`, `withOrgContext` to wypuszcza, akcja zawsze zwraca `PERSISTENCE_FAILED`. Dodatkowo `:121` czyta z `app.vault_secrets` — tabeli nieistniejącej w żadnej migracji. |
| konsumenci `outbox_events` | **nie** | `apps/worker/src/jobs/outbox-consumer.ts:43-59` = `logger.info`; `apps/web/app/api/internal/cron/outbox/route.ts:236-238` rejestruje wyłącznie `dispatchCascade`. Zero handlerów mailowych. |
| `email_delivery_log` (mig 066) | tabela jest, producenta brak | jedyny INSERT: `apps/worker/src/jobs/compliance-docs-expiry.ts:237-246`, wpisuje `'sent'` przy `messageId === null` (sender nigdy nie wstrzyknięty — `index.ts:82` woła `registerComplianceDocsExpiryScan(registry)` bez opcji, wygrywa `queueOnlyEmailSender`). **Loguje dostarczenie, które się nie odbyło.** |
| Supabase SMTP | **tak, ale tylko auth** | `resetPasswordForEmail` (`login/_actions/auth.ts:88`), `signInWithOtp` (`app/(auth)/actions.ts:203`). |
| `auth.admin.inviteUserByEmail` | nigdy nie wołane | jedyne wystąpienie to string w regexie testu |

**Dlaczego Supabase SMTP też tu nie pomoże (kluczowe):** akceptacja zaproszenia w tej apce **nie idzie przez magic link GoTrue**. Idzie przez własny endpoint `apps/web/app/api/auth/invite/accept/route.ts`, który szuka `where invite_token = $1` w `public.users`. `inviteUserByEmail` wysłałby list z linkiem GoTrue, którego ten endpoint nie obsługuje, i z tokenem, którego nie znamy (nie zwraca `hashed_token`) — czyli maila „udanego", który nie działa. Dlatego **nie** poszedłem tą drogą.

### Co naprawiłem

1. **Root cause (P1):** `createServerSupabaseClient()` (anon) → **`createSupabaseAuthAdmin()`** (service role), ten sam factory, którego używa pierwotne zaproszenie (`invite.ts` → `mintInviteLink`). To odblokowuje UPDATE + audyt + outbox + rewalidację, które dotąd były nieosiągalne (`not_admin` → `invite_failed`).
2. **Fail-closed:** `createSupabaseAuthAdmin()` rzuca przy braku `SUPABASE_SERVICE_ROLE_KEY`. Opakowane w `try/catch` **przed** UPDATE-em → `invite_failed`, nigdy częściowy zapis.
3. **Nie udaję, że „resent" zadziałało.** Sukces zwraca `delivery: 'none'` (typ `InvitationDelivery`), a ekran renderuje na tej podstawie **alert**, nie „status": „Odnowiono link zaproszenia dla {email}, ale nie wysłano e-maila…". UI czyta pole, nie ma zaszytej treści — gdy pojawi się realny transport i akcja zwróci co innego, komunikat sam wróci do zwykłego „wysłano ponownie".

### Test
`invitations-lifecycle.test.ts` mockuje teraz **`./supabase-admin`** (właściwy klient), a na `createServerSupabaseClient` zostawia szpiega, który **rzuca** — powrót do klienta anon wywali test głośno. Asercje: `_mockCreateSupabaseAuthAdmin` wołany, `_mockCreateServerSupabaseClient` **nie**, `data.delivery === 'none'`. Nowy test: brak service-role → `invite_failed` i **zero** updates/outbox/audit.

> Uczciwie: to jest naprawa *wykonalności i prawdomówności* akcji, a nie dostarczenia. Realny resend wymaga transportu, którego w repo nie ma. Przycisk rotuje token, przedłuża ważność i audytuje — i wprost mówi operatorowi, żeby przekazał link sam.

---

## [B-2 · P2] Invited dostawał Deactivate bez uprawnienia invite

**Plik:** `settings/users/users-screen.client.tsx`

Rozgałęzienie idzie teraz **bezwarunkowo po `isInvited`**. Bez `canManageInvitations` renderuje się stan read-only (`data-testid="invitation-actions-readonly"`, label `settings.invitations.noActions`) — a **nie** fallback do domyślnej gałęzi z Deactivate.

Potwierdzam też, że twierdzenie z poprzedniego raportu („invited → Resend/Revoke, brak Deactivate") **było nieprawdziwe** — trzymało się wyłącznie dlatego, że jedyny test tej ścieżki miał `canInviteUsers: true`.

**Testy:** `invited + canInviteUsers=false` → brak Resend/Revoke/**Deactivate**, jest read-only. Drugi wariant: akcje serwerowe niepodpięte → to samo.

---

## [B-3 · P2] Wygasłe zaproszenia — dwie niewykonalne akcje

**Pliki:** `settings/users/page.tsx`, `users-screen.client.tsx`, `actions/invitations/get-invitation-lifecycle-token.ts`

- `SettingsUser` dostał `invitationState: 'pending' | 'expired' | null` (helper `invitationState()` w `page.tsx` czyta `is_active` + `invite_token` + `invite_token_expires_at`). Pole jest **opcjonalne** — brak = `pending`, więc istniejące fixture'y kompilują się bez zmian.
- **Revoke tylko dla `pending`** — jego UPDATE wymaga `invite_token_expires_at > now()`, więc na wygasłym wierszu mógł wyłącznie failować.
- **Resend dla `pending` i `expired`**, z kontrolowanym dostępem do wygasłego tokenu: `getInvitationLifecycleToken` przyjmuje `allowExpired?: boolean`. Flaga **nie** poszerza kręgu uprawnionych (org scope + `settings.users.invite` bez zmian) ani nie wskrzesza cofniętego zaproszenia (brak `invite_token` → dalej `non_pending`); poszerza wyłącznie stan cyklu życia, a fakt użycia ląduje w audycie (`expired: true`). Domyślka bez zmian → ekran invitations działa jak dotąd.

**Testy:** expired → jest Resend, nie ma Revoke; resend expired woła `{ allowExpired: true }`, revoke zawsze `{ allowExpired: false }`. W `get-invitation-lifecycle-token.test.ts` dołożone 4 przypadki — dotychczasowy test „accepted, revoked, or expired" **w ogóle nie sprawdzał wygasłego** (leciał tylko `is_active: true`), i stąd ta dziura.

---

## [B-4 · P2] Angielskie kontrolki na polskim ekranie

**Plik:** `settings/users/page.tsx`

`buildLabels` bierze drugi translator `settings.invitations` i mapuje: `resend`, `revoke`, `revokeDialog.title`, `confirmRevoke`, `resentFeedback`, `revokedFeedback`, `noActions`. `{auditResult}` rozwiązywane serwerowo przez `inv('recorded')` (klient interpoluje już tylko `{email}`) — ten sam trik co istniejące `summary`.

Dołożone **2 klucze** (reszta to czyste reuse):
- `revokeDialog.confirmPlain` — `revokeDialog.confirm` zawiera `<strong>` i wymaga `t.rich`, a ten ekran interpoluje zwykły tekst;
- `resentNoEmailFeedback` — komunikat z [B-1].

**Weryfikacja programowa (`json.load`, nie grep):** 4/4 locale mają komplet kluczy lifecycle. Diff sprawdzony leaf-po-leafie względem HEAD: **dropped=0, changed=0**, dodane 53/locale = moje 2 + 51 od równoległych rund (`settings.units`, `technical…createCta` itd.) — nic nie nadpisałem. `ro`/`uk` w podgałęzi `invitations` są w całości angielskimi placeholderami (`recorded` = "recorded", `resend` = "Resend"), więc nowe klucze też są tam po angielsku — spójnie ze stanem bundla; tłumaczenie całej gałęzi to nie zakres tej rundy.

---

## [B-5 · P2] Ręczny modal Revoke bez a11y

**Plik:** `users-screen.client.tsx`

Zamieniony na **`@monopilot/ui/Modal`** (Radix Dialog: focus trap, Escape, przywrócenie fokusu, tło wyłączone z tab-order). Ubyło ~12 linii ręcznego overlaya.

Sprawdziłem ryzyko zanim to zrobiłem: `_components/DeactivateUserDialog.tsx` ma komentarz o świadomym omijaniu Radixa („React 19 vs @radix React-18 peer crash"). **Nie dotyczy tego ekranu** — `_components/InviteDialog.tsx`, w tym samym katalogu i renderowany przez ten sam komponent, już używa `@monopilot/ui/Modal`, a suita `users-screen.client.test.tsx` sama mockuje ten moduł (`Modal.Header/Body/Footer`, `role="dialog"`). W repo używają go 134 pliki, `packages/ui` deklaruje peer `react ^18 || ^19`.

**Test:** po kliknięciu Revoke jest `role="dialog"` z `aria-modal="true"`, nazwany tytułem, z poprawnie zinterpolowanym e-mailem.

---

## [B-6 · P1] `?item=` — wybrana droga: **(a) skonsumować**

**Pliki:** `technical/routings/page.tsx`, `_actions/list-routing-items.ts`, `_components/routings-manager.client.tsx`, `items/[item_code]/page.tsx`

**Uzasadnienie wyboru (a) zamiast (b):** intencja CTA to „utwórz marszrutę **dla tej pozycji**". Wariant (b) kasuje tę intencję i zostawia operatora na ekranie, który i tak auto-wybiera pierwszą pozycję alfabetycznie — czyli dokładnie ta sama pułapka o jedno kliknięcie dalej, tylko bez śladu w URL-u. (a) jest też jedynym wariantem, który rozwiązuje drugą połowę znaleziska: pozycję poza limitem 500. Koszt: ~40 linii w 4 plikach, zero nowych zależności.

Realizacja:
1. `page.tsx` przyjmuje `searchParams`, wyciąga `item` (tablica → pierwszy element), rozwiązuje kod → id.
2. `listRoutingItems(ensureItemCode?)` **przypina** żądany wiersz przez `UNION` z gałęzią `item_code = $2::text limit 1` obok listy z `limit $1`. Gdy `$2` jest NULL, gałąź daje 0 wierszy i zapytanie degraduje się do poprzedniego. `items.item_code` to `text` (mig `153-items-master.sql:9`), więc `::text` jest jednoznaczny. **Pozycja spoza pierwszych 500 jest teraz wybieralna.**
3. `RoutingsManager` dostał `initialItemId?: string`, gdzie sygnałem jest **obecność**, nie truthiness: `''` = „podano pozycję, której nie umiemy rozwiązać" → **nic nie jest wybrane** (ekran pokazuje prompt „wybierz pozycję" i **chowa „New routing"**); `undefined` = brak deep-linka → stara domyślka `items[0]`.
4. Fałszywy komentarz w `items/[item_code]/page.tsx` zastąpiony opisem tego, co faktycznie się dzieje.

**Brak stanu pośredniego:** parametr jest albo honorowany, albo prowadzi do jawnie pustego wyboru — nigdy do cudzej pozycji.

---

## [B-7 · P2] Za wąska bramka CTA

**Plik:** `items/[item_code]/page.tsx`

`resolveCanCreateBom()` deleguje teraz do centralnego **`hasPermission`** (`lib/auth/has-permission`) ze stałą **`ROUTING_WRITE_PERMISSION`** importowaną z `technical/routings/_actions/shared` — czyli dokładnie tym, czego używa `createRouting()`. Znika rozjazd: role `owner`/`admin`/`org_admin` oraz platform admin (`app.current_user_is_platform_admin()`) widzą CTA dla akcji, którą serwer i tak by wykonał. Ubyło 12 linii własnego SQL-a.

Uwaga: ten sam resolver zasila też CTA „+ New BOM" — obie akcje siedzą na `technical.bom.create`, więc poprawka leczy oba miejsca jednym podejściem.

---

## [B-8 · P2] Dwuznaczność `state:'empty'`

**Pliki:** `[item_code]/_actions/tab-data.ts`, `[item_code]/page.tsx`

`RoutingTabData` dostał `itemResolved?: boolean`: `false` gdy `resolveItem()` nie trafił (i w gałęzi błędu), `true` po udanym odczycie. Strona gatuje CTA przez `canCreateBom && routingData.itemResolved === true` — **`undefined` traktowane jako „nie wiadomo, nie zakładaj"**, nie jako sukces. Pole opcjonalne, żeby istniejące fixture'y się kompilowały.

---

## [B-9 · P2] Testy omijały logikę, którą miały chronić

Zgadza się z opisem: pozytywny test wstrzykiwał własny `<a>`, negatywne po prostu go nie podawały, a „unresolved item" był bajt w bajt tym samym co „brak uprawnienia". Cztery zielone testy przy dowolnym zachowaniu strony.

Dodane:
- **`items/[item_code]/__tests__/routing-cta.page.test.tsx`** — uruchamia **prawdziwą funkcję strony** (mocki `getItem`, `loadRoutingTab`, `hasPermission`, `withOrgContext`; komponenty potomne zredukowane do panelu routingu, żeby badanym był gate, nie chrom zakładek). 7 przypadków: CTA jest / href z locale `pl` i `en` / `hasPermission` wołane z `technical.bom.create` / brak uprawnienia → brak CTA / `itemResolved: false` → brak CTA / `itemResolved` nieobecne → brak CTA / loader `error` → brak CTA. **Element CTA jest tym, który buduje strona.**
- **`routings/__tests__/routings-item-deeplink.page.test.tsx`** — ekran docelowy: deep-link wybiera **właściwą** pozycję (i jawnie *nie* alfabetycznie pierwszą), `listRoutingItems` dostaje kod do przypięcia, nierozwiązywalny `?item=` → `''`, brak parametru → stara domyślka, powtórzony parametr → pierwszy.
- **`routings/_components/__tests__/routings-manager-deeplink.test.tsx`** — manager faktycznie działa na `initialItemId`; przy `''` nie ma ani wyboru, ani przycisku „+ New routing".
- Zwodniczy duplikat w `item-data-tabs.test.tsx` usunięty i zastąpiony wskazaniem, gdzie ta decyzja jest naprawdę testowana (komponent renderuje tylko to, co dostanie — tam się tego nie da sprawdzić).

Plus testy identity opisane przy [B-1]…[B-5].

---

## Czego NIE jestem pewien

1. **Nie uruchomiłem niczego.** Zero `tsc`, testów, builda — zgodnie z zasadami rundy. Poprawność typów i przejście testów weryfikuje bramka. Miejsca, gdzie stawiałbym na problem jako pierwsze: typ `linkResponse` w `invitations-lifecycle.ts` (celowo przepisany na `let` + `try/catch`, żeby uniknąć unii, której TS mógłby nie zawęzić) oraz nowa 23-mockowa suita strony item-detail (wszystkie ścieżki mocków sprawdziłem na dysku, ale kolejności `vi.mock`/`resetModules` nie odpaliłem).
2. **`UNION` w `list-routing-items.ts` nie był wykonany na żywej bazie.** Składniowo poprawny (obie gałęzie w nawiasach, `order by` po całości, `item_code` to `text`), ale to wciąż tylko przegląd kodu — a z pamięci projektu wiem, że `PREPARE` i tak nie waliduje wszystkiego.
3. **Kolizja na plikach locale.** `apps/web/i18n/*.json` edytują równolegle inne rundy. Zrobiłem jeden atomowy read-modify-write i udowodniłem brak strat (dropped=0/changed=0, 51 cudzych kluczy nietkniętych) — ale jeśli inna runda zapisze te pliki **po** mnie tym samym wzorcem, moje 2 klucze mogą zniknąć. Warto sprawdzić przy merge'u.
4. **`delivery: 'none'` to decyzja produktowa, nie tylko techniczna.** Uznałem, że lepiej powiedzieć operatorowi prawdę (alert) niż pokazać zielony „wysłano". Jeśli owner woli, żeby przycisk zniknął całkowicie do czasu transportu — to jedna linia w `renderMembershipControls`, ale nie podejmowałem tego sam.
5. **Nie surfacuję wygenerowanego linku w UI.** Byłoby to „dostarczenie zastępcze", ale token to bearer credential do endpointu accept; wrzucanie go do DOM/toasta to osobna decyzja bezpieczeństwa (i osobny wpis audytowy). Świadomie pominięte.
6. **Poza zakresem, ale znalezione po drodze** (nie ruszałem): `compliance-docs-expiry.ts:237` zapisuje `email_delivery_log.status = 'sent'` przy `messageId = null` — loguje niewysłane maile; `actions/users/reset-password.ts:93` mintuje link recovery i **nigdy nie czyta `action_link`**, kasując przy tym sesje użytkownika (`:105-112`) — admin „resetuje hasło", a user zostaje zamknięty na zewnątrz bez linku. Oba to żywe błędy niezależne od braku transportu; sugeruję osobne findingi.
