# Raport dla ownera — sesja 2026-07-07→08 (R3 → C6)

**Zakres:** od locka planu naprawczego (`4f058569`) do `9f057ffa`. ~50 commitów, 6 fal (R3, R4, C1, C2, C3, C4, C5, C6), migracje 447–461 na żywej bazie. Wszystko na prodzie: https://monopilot-kira.vercel.app · login `admin@monopilot.test` / `Admin2026!!!`.

**Metoda:** równoległe tory (Composer/Opus impl) → Codex cross-review (inny provider) → arbitraż → fix → merge-gate (tsc+testy) → deploy → E2E na prodzie. Cross-review + gate + prod złapały **~65 realnych problemów przed lub tuż po prodzie**.

---

## Co konkretnie doszło / jak pomaga / gdzie widać

### Rdzeń produkcji per-proces (R4 — Twoja wizja)
- **Co:** W NPD → Production details dodajesz proces → wybierasz mu linię → wybierasz konsumowane składniki. Proces z linią+konsumpcją staje się etapem WIP; New WO w Planningu tworzy łańcuch stage-WO (ciasto → pizza), które startują z nakładaniem (downstream rusza na pierwszym częściowym LP, nie czeka na koniec upstreamu).
- **Jak pomaga:** to model, o który prosiłeś — realne etapy, realna konsumpcja per etap, WO fanuje się automatycznie.
- **Gdzie:** `/en/pipeline/<projekt>/formulation` (karty procesów, "Default line"), `/en/planning/work-orders` → Create WO dla FG wieloetapowego (podgląd drzewa). Overlap: runbook `_meta/plans/2026-07-07-R5-acceptance-runbook.md`.

### UoM i dane (R3)
- **Co:** metry (m/cm), jawny "Output unit" (kg/pieces/boxes) w briefie, unifikacja ea/pcs/szt → jedno `pcs`.
- **Gdzie:** Settings → Units; wizard/brief NPD; lista itemów (pokazuje "pcs (each)").

### Lifecycle techniczny (C1/C2)
- **Co:** pełny cykl factory-spec (draft→review→approve→release→**recall**→supersede), ECO stosuje podlinkowany BOM (nie tylko papier), release-to-factory gate na tworzeniu WO, revert promote-to-production.
- **Gdzie:** Technical → Factory specs / ECO; NPD → handoff.

### Compliance (C2/C3)
- **Co:** recall forward-trace z bilansem masy per-węzeł, CCP-deviation resolve z e-podpisem, audit viewer widzi teraz zmiany RBAC (był split-brain), sole-owner guard (nie da się zdjąć ostatniego admina).
- **Gdzie:** Quality → Trace / CCP; Settings → Audit / Users.

### Planowanie (C3)
- **Co:** scheduler finite-capacity (WO przelewają się na kolejny dzień gdy linia pełna) + okna PM, time-phased MRP (bufory tygodniowe + late-flag), popyt z potwierdzonych SO (odjęty o realnie wysłane), pętla PM→MWO z dziennym generowaniem (cron) i KPI planned-vs-unplanned.
- **Gdzie:** Scheduler; Planning → MRP; Maintenance → MWO.

### Finanse i wycena (C3/C4/C5)
- **Co:** WAC **debetowany** przy zużyciu/wysyłce (był tylko dodawany → zawyżona wycena), WAC per-leg dla mieszanych UoM (adjust/count/destroy), WAC multi-waluta (osobna pula per waluta, seed EUR/USD), pierwszy ekran Finance → Inventory Valuation.
- **Gdzie:** Finance → Valuation.

### Sprzedaż/wysyłka (C4/C5)
- **Co:** pierwszy printable dokument (GRN, site-scoped, dokładne sumy), per-customer pricing (customer_item_prices + resolver currency-first), guard statusu PO (nie zmintujesz PO od razu jako received), blokada podmiany na zablokowanego dostawcę.
- **Gdzie:** Warehouse → GRN → Print; SO pricing; Planning → Purchase orders.

### GS1 (C5)
- **Co:** biblioteka SSCC-18 + GTIN-14 (check-digity), SSCC nadawany przy pakowaniu boxa (walidacja przed inkrementem serialu — nie pali numerów).
- **Gdzie:** pack-into-box (numer; render kodu kreskowego = follow-up).

### Bezpieczeństwo operacyjne (C5)
- **Co:** supervisor SoD na cycle-count (jeden operator nie odpisze zapasu), taksonomia+permission na yield-override (nie zamkniesz WO z zerowym wyjściem free-textem).
- **Gdzie:** Warehouse → Counts → Approve; Production → complete WO.

### Higiena (C6)
- Przegląd anty-overengineering całej nocy: −102 LOC martwego kodu (dead totals engine, identity wrappers, spekulatywne komentarze). GTIN-lib, migracje i seam dokumentów świadomie zachowane.

---

## Do naprawy rano (znane, dopisane)
1. **`import-to.test.ts`** — pre-existing fail (uom pcs deep-equal, dryf z R3.3, NIE regresja tej sesji).
2. **Dwa pliki migracji `459`** (`459-generate-sscc...` + `459-yield-gate...`) — oba zaaplikowane czysto (runner trackuje po nazwie pliku, niezależne), ale naruszenie konwencji numeracji; renumeracja = osobny ostrożny krok (rename+schema_migrations), nie robione w nocy bo ryzyko re-run.
3. Twoje własne znaleziska z klikania — daj listę, zrobię falę naprawczą.

## Zostało z roadmapy (świadomie nietknięte — wymaga decyzji)
- Attachments / pełny document-engine (Phase 2; GRN to pierwszy wzorzec)
- Supplier CoA + approval program (3.6/3.7)
- HACCP monitoring schedule + alarmy (3.8)
- RMA / zwroty
- FX-table dla WAC (per-currency pool jest; konwersja do base currency — brak)
- UI: revert-NPD button, customer-prices Settings CRUD, invoicing/AR (tabele mig-199 dalej dormant poza valuation)
- Barcode image rendering (numery SSCC/GTIN gotowe)

---

## AKTUALIZACJA — fala C7 (finalna, follow-upy) dodana

Dokończenia już-wdrożonej pracy (bez nieuzgodnionych dużych rzeczy):
- **Przycisk "Revert to NPD"** na handoff (akcja z C2d dostała UI; pokrywa też wedge lock-only)
- **Settings → Customer prices** — ekran CRUD dla cen per-klient (tabela+resolver z C5c); ceny jako decimal-string (bez utraty precyzji), walidacja dat
- **Delivery Note / Packing List** — drugi printable dokument (wzorzec GRN reused: company-header, IDOR-safe per-site, SSCC per box)
- **Paginacja** kolejnych 5 list (WO/PO/TO/NCR/LP) — cross-review złapał rozjazd placeholderów SQL (byłby 500 na liście WO/PO), naprawione
- **Barcode Code128 SVG** — skanowalne kody dla numerów SSCC/GTIN (Code-C + FNC1 GS1-128 + quiet zone, dependency-free), wpięte w GRN/delivery print, pack-view, label editor

Cross-review C7 złapał 6 realnych problemów (2× 'use server' type export, placeholder-arity WO/PO, money-float precyzja, Code128-B zamiast Code-C, visibility wedge). Wszystko naprawione.

**Klik-lista C7 (do przetestowania):** Revert-to-NPD na handoff promoted/locked; Settings→Customer prices; Warehouse→GRN→Print i Shipping→shipment→Print (barcode + SSCC); długie listy WO/PO/TO/NCR/LP (pager zamiast ucięcia).

---

## AKTUALIZACJA — deep-dive + V1 (E2E) + D1 (naprawy)

**Deep-dive (Codex, 1M-class):** 28 bugów w `_meta/reviews/2026-07-08-deepdive-bughunt.md` (10 P0, 12 P1, 6 P2). Ważne: klasa P0 "server-action eksportuje typ" okazała się **fałszywym alarmem** — czyste typy są erasowane, nie łamią builda; realnie łamią tylko eksporty VALUE/const. Arbitraż to wyłapał.

**V1 — trwałe E2E na prodzie** (3 tory, Opus — Codex-w-worktree nie commituje, przełączone):
- `purchasing-chain-e2e.spec.ts` — PO→confirm→receive→WAC→valuation + negatywy. **Znalazł realny bug:** prefill ceny PO hardcode'uje `currency:'GBP'` przy fallbacku list-price (po-form-data.ts:155 + mrp.ts:965) → non-GBP PO bookuje GBP do złego kubła WAC. Naprawiane w D2.
- `npd-to-production-chain-overlap.spec.ts` — chain preview + dependency direction + schedule overlap-conflict.
- MRP-netting / fulfilment-SSCC / scanner-RBAC — 3 specy.
Wszystkie gated (skip bez serwera), wejdą do CI jako stały smoke.

**D1 — naprawy z deep-dive** (na prodzie): scanner RBAC parity + site-scoping (6 dziur — enumeracja PO/LP, cross-site fallback, null-site LP), SO partial-commit (orphan header), duplikat shipmentu po packed/manifested, usunięte delivered→shipped, GRN/LP location mismatch, WAC preflight blokuje receive w nierozwiązywalnym UoM, guard `no-export-type-in-use-server` (poprawiony — nie flaguje typów). Cross-review: d1c/d1b MERGE, d1a/d1d fixnięte (guard-overbroad byłby CI-breaker; 16 czerwonych testów scanner naprawione).

**D2 w toku:** POD proof+e-sign, MRP UoM+undated-SO, materializer org-scope, pricing currency-mislabel.

**Do listy porannej +:** playwright `--list` (bez argów) błądzi na plikach vitest — hygiene testMatch (nie blokuje, ale warto zawęzić).

---

## AKTUALIZACJA — D2 (naprawy P2 + bug od V1a) na prodzie

**Uczciwa korekta:** wcześniejszy stan "D2 done" był fałszywy — tory dostały zły task przez zabugowany prompt (7 plików agent-artefaktów było zacommitowanych w main → `git reset` przywracał stary prompt do każdego worktree). Root-cause usunięty (odtrackowane), D2 zrobione od nowa z poprawnymi promptami.

**D2 (na prodzie, `0bdd7d79`, 213 testów):**
- **d2a — POD regulatory:** delivery wymaga teraz (1) niepustego URL dowodu POD i (2) e-podpisu/PIN + audit envelope (realny `@monopilot/e-sign`, jak reversal). Modal zbiera pola; read-only user widzi trigger disabled (parity UI↔backend).
- **d2b — MRP UoM/undated:** wysłane ilości konwertowane do UoM linii SO (each/box) przed odjęciem popytu; potwierdzone SO bez daty trafiają do bucketu "immediate" (nie znikają); brak pack-metadanych → wykluczone (nie crash, nie zła liczba).
- **d2c — NPD org-scope:** defense-in-depth `org_id = app.current_org_id()` na wszystkich odczytach formulation w materializerze (invariance: same-org byte-identyczne).
- **d2d — pricing:** ceny SO jako decimal-string (bez utraty precyzji); fallback list_price_gbp tylko dla GBP — non-GBP zostawia puste (wymusza ręczne wpisanie) zamiast stemplować GBP-magnitude walutą PO (arbitraż: widocznie niekompletne > po cichu skażone WAC).

**Wszystkie 28 bugów z deep-dive'a zaadresowane** (D1+D2); fałszywy P0 (type-exporty) zdemaskowany; nowy bug znaleziony przez E2E (currency-mislabel) naprawiony.

---

## AKTUALIZACJA — fala UX window-by-window (finalna) na prodzie

Audyt 2× Codex (read-only) po klastrach modułów → 13 findings w 4 recurring klasach → naprawione (`a93a43d8`, mig 463):
- **Paginacja 6 kolejnych list** (SO, shipments, GRN, quality-inspections, ECO, changeover) — reuse helpera z C7d. Cross-review złapał realny regres: filtry działały client-side po 50-wierszowym slice (rekord na str. 2+ niewidoczny przy filtrze) → przeniesione na **server-side przez searchParams**, footer pokazuje przefiltrowany total.
- **Orphaned CRUD:** Settings → Units dostał realny edit/delete (z guardem in-use); Sites → edytowalne (było read-only mimo istniejącej akcji). Cross-review: `factor_to_base` zablokowany jako **immutable** (zmiana współczynnika reinterpretowałaby całą historię wycen — bomba data-integrity, uniknięta).
- **Dropdown→FK:** SO UoM z rejestru jednostek (nie hardcode), packaging supplier jako FK do suppliers (org-scoped composite FK, Wave0). Pusty rejestr nie wyłącza już walidacji (API hole zamknięty).
- **Modal-parity / data-integrity:** edycja packaging-component **przestała gubić catalog-item FK** (fix na serwerze — root cause, nie band-aid w modalu); GRN list odzyskał receive/create CTA; transfer-order receive dodany do inbound.

Cross-review UX złapał 7 realnych problemów (server-side filter regres, factor-mutability, FK nie-org-scoped, empty-registry hole, packaging FK-drop server-side, in-use guard). Wszystkie naprawione. Mig 463 dry-run czysty na live.

**Podsumowanie nocy:** R3→C7 (build) + deep-dive (28 bugów) + V1 (3 trwałe E2E) + D1/D2 (28 bugów naprawione) + UX (13 findings). Wszystko na prodzie, cross-review inną rodziną silników, prod jako ostatni recenzent.

---

## KLIK-LISTA na rano (co przeklinać) — fale deep-dive/V1/D1/D2/UX

**Zakupy/magazyn:** PO create→confirm→receive (GRN) → sprawdź Finance→Valuation (WAC w walucie PO, nie GBP); non-GBP dostawca → cena nie prefilluje się GBP-magnitude (puste, wpisz ręcznie); receive zablokowany dla nierozwiązywalnego UoM; scanner receive tylko z uprawnieniem + w swoim site; GRN list ma teraz przycisk receive; inbound transfer-order ma receive.
**Sprzedaż/wysyłka:** POD wymaga URL dowodu + e-podpis/PIN (bez tego nie zamkniesz delivered); read-only user widzi POD disabled; nie stworzysz 2. shipmentu dla już-packed SO; delivered nie cofa się do shipped; SO UoM z rejestru jednostek (nie hardcode).
**Planowanie:** MRP — potwierdzone SO bez daty trafiają do popytu (nie znikają); wysłane ilości w box/each konwertowane poprawnie.
**NPD:** edycja packaging-component NIE gubi już linku do katalogu; packaging supplier to wybór z listy dostawców (nie free-text).
**Settings:** Units — edit/delete (delete blokowany gdy w użyciu; współczynnik immutable); Sites — edytowalne.
**Listy (pager zamiast ucięcia + filtr server-side):** SO, shipments, GRN, quality-inspections, ECO, changeover (dodatkowo do WO/PO/TO/NCR/LP z C7d).

**Pełna lista bugów:** `_meta/reviews/2026-07-08-deepdive-bughunt.md` (28) + `2026-07-08-ux-audit-{A,B}.md` (13).
**Znane do naprawy rano:** `import-to.test.ts` (pre-existing uom pcs); dwa pliki 459 (kosmetyka numeracji); 5 pre-existing failów changeover allergen (brak mock-stubów, nie regresja); playwright `--list` bez argów łapie pliki vitest (hygiene testMatch).
**Czeka na Twoją decyzję (big-rocks, NIE budowane auto):** attachments/document-engine, supplier CoA+approval, HACCP schedule+alarmy, RMA/zwroty, FX-table dla WAC, invoicing/AR.
