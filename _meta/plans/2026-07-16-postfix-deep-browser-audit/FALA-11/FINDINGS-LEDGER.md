# FALA 11 — rejestr znalezisk cross-review

Cztery tory FIX-FIRST, **tor T3 CZYSTY**. 24 znaleziska.

### Tor T1
- [P1] Porównanie dziesiętne może nadal zapisać wynik OOS jako PASS
- [P1] Pominięcie lub zmiana nazwy obowiązkowego parametru omija cały guard
- [P1] Kontrole final/in-process używają wyłącznie specyfikacji incoming
- [P1] Wiele aktywnych specyfikacji daje arbitralny werdykt
- [P1] Podpisany Fail dla WO output nadal nie tworzy żadnego zabezpieczenia
- [P1] Nowa automatyczna blokada zafałszowuje ilość lub jednostkę LP
- [P2] Test deklarujący serwerową derivację przeszedłby bez poprawki
- [P2] Istniejący test jest deterministycznie czerwony po zmianie kolejności guardów

### Tor T2
- [P1] Rozszerzony typ `SOURCE_REF_TYPES` blokuje kompilację strict TypeScript
- [P1] Funkcja inline przekazywana z RSC wywraca stronę NCR
- [P1] Serwer zapisze produkt sprzeczny z wybraną kontrolą lub LP
- [P1] Nowy guard blokuje legalne referencje `batch` i `supplier`
- [P2] Dwa raportowane testy przechodzą również bez tej poprawki
- [P2] Nowe pola linkowania nie mają polskich tłumaczeń

### Tor T3

### Tor T4
- [P1] Migracja odcina istniejące ograniczenia alergenowe od kanonicznego słownika
- [P1] Kolizja klucza między organizacjami powoduje fail-open idempotencji SO
- [P1] Nowy test importuje nieistniejący moduł
- [P2] Implementacje UUID w SQL i TypeScript generują różne identyfikatory
- [P2] Test idempotencji nie odtwarza współbieżnego podwójnego żądania

### Tor T5
- [P1] Guard plombowania przepuszcza wysyłkę, gdy brak dodatnich ilości `quantity_picked`
- [P1] Plombowanie może nadpisać równoległe anulowanie i wskrzesić wysyłkę bez zawartości
- [P1] Pozostała ilość sumuje różne jednostki i zawsze opisuje wynik jako kilogramy
- [P1] Istniejące zamówienia nadal pokazują stary, niezgodny total na liście
- [P1] Mock nowego zapytania jest nieosiągalny, więc test plombowania jest deterministycznie błędny
- [P2] Nowe komunikaty istnieją tylko po angielsku

### Czerwone testy wykryte przez bramkę
- `lib/shipping/shipment-pack-completeness.test.ts` — **importuje nieistniejący moduł**
- `shipping/customers/_actions/customer-allergen-reference.test.ts` — **importuje nieistniejący moduł**
- `shipping/_actions/ship-actions.test.ts` — „transitions a packing shipment with at least one box to packed" → `incomplete_pack` zamiast `ok` (**przeblokowanie**)
- `quality/_actions/__tests__/inspection-actions.test.ts` — **7 czerwonych**, rozjechany kształt obiektu (12 pól)
- `shipping/customers/_actions/customer-allergen-actions.test.ts` — zapytanie odeszło od `reference."allergens"`
- `shipping/__tests__/sales-orders.test.tsx` — „blocks a synchronous double submit" → akcja wołana **0 razy** zamiast 1 (**przeblokowanie**)

### Najcięższe: tor T1 (jakość) — główny finding NIE naprawiony
PF-R16-01 („wynik poza specyfikacją zapisany jako PASS") to najcięższa klasa w całej kampanii:
fałszywy zapis jakości w zakładzie spożywczym. Recenzja mówi, że porównanie dziesiętne **nadal
może zapisać OOS jako PASS**, a dodatkowo:
- **fail-open**: pominięcie albo zmiana nazwy obowiązkowego parametru **omija cały guard**,
- kontrole `final`/`in-process` używają **specyfikacji `incoming`** — czyli złych granic,
- przy wielu aktywnych specyfikacjach werdykt jest **arbitralny**,
- PF-R16-02 (podpisany Fail ma założyć blokadę/NCR) **też nie zadziałał**.

### Potwierdzenie mojej własnej obawy — tor T4
Zanim przeczytałem recenzję, zauważyłem w teście, że zapytanie odeszło od `reference."allergens"`
w stronę własnej tabeli. Recenzja nazwała to wprost: **migracja odcina istniejące ograniczenia
alergenowe od kanonicznego słownika**. PF-R18-01 wymagał PODPIĘCIA danych referencyjnych,
a nie zbudowania równoległego źródła prawdy. Alergeny to bezpieczeństwo żywności — dwa
rozjeżdżające się słowniki są groźniejsze niż jeden brakujący.
