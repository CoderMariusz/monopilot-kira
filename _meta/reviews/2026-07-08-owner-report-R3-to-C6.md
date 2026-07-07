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
