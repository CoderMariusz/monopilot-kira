# NPD browser-walk findings — 2026-07-08

Metoda: prawdziwa przeglądarka, tworzenie produktów różnymi ścieżkami, klikanie w różnej
kolejności. Cel: blokery flow w NPD (recipe → production detail → packaging → FG).

## Zgłoszone przez ownera (do reprodukcji + fix)
- B1: "Could not save the component" — nie da się zapisać production component/packaging po utworzeniu itemu (packaging 0.12).
- B2: Zamknięcie modala przenosi na Finished Good — powinno zostać na Recipe.
- B3: Ekran "Finish WIP (production components)" FG0017/RM0017 nie powinien być w NPD/FG.
- Pytanie modelowe: "Add production component" = 2. gałąź drzewa (2 procesy różniące się tylko mąką, reszta wspólna)?

## Znaleziska z walk (żywe)

### CONFIRMED + FIXED (browser repro)
- **B1 ✓** (febdbb75): packaging save crashed on EVERY supplier pick — ux3 supplier-FK query filtered phantom `suppliers.deleted_at` (column doesn't exist) → undefined_column → persistence_failed → "Could not save the component". Fix: drop phantom predicate. Reprodukowane na NPD-004: wybór WEB → fail; bez suppliera → OK.
- **B2 ✓**: onFgCreated pushował /fg/{code} → wyrzucał z recipe. Fix: zostaje na recipe + refresh.
- **B3 ✓**: FormulationWipPanel usunięty z etapu Recipe (owner: całkiem z recipe). Zostaje w Finished Good/Production detail.
- **Model potwierdzony**: "+ Add production component" = nowy prod_detail (gałąź drzewa); procesy w komponencie tworzą łańcuch WIP; 2 komponenty = 2 gałęzie (wariant różniący się mąką OK).

### B1 VERIFIED na prodzie (deploy 0852d7b4)
Dodanie packaging component z supplierem WEB → zapis OK, supplier_id ustawiony, 0 błędu. Regresja zamknięta end-to-end.
