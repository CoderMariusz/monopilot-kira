# Izolacja między ZAKŁADAMI — 30.07, 19:15

**Premisa, którą dałem torowi, była błędna. To jest najważniejszy wynik tego audytu.**

Zleciłem sprawdzenie **13 tabel** stojących poza predykatem zakładu („wdrożenie etapowe").
Tor policzył to z katalogu Postgresa zamiast grepem i wyszło: predykat zakładu istnieje
na **11 tabelach**. Poza nim stoi **116 tabel bazowych z kolumną `site_id`**, nie trzynaście.

Liczba „124 pokryte" z wcześniejszego audytu to **artefakt grepa** — dokładnie ta pułapka,
przed którą sam ostrzegałem w zleceniu (grep łapie aliasy kolumn i filtry po stronie aplikacji).

## Co ma predykat zakładu — pełna lista, 11 pozycji

`grns` · `inter_site_transfer_orders` · `license_plates` · `lp_state_history` · `ncr_reports`
`purchase_orders` · `quality_inspections` · `schedule_outputs` · `shipments` · `stock_moves`
`work_orders`

## Dowód empiryczny — 6 z 6 badanych tabel przecieka

Warunki: świeża organizacja, zakłady A i B, użytkownik przypisany **wyłącznie do B**,
dane w zakładzie A. Kontekst przez `app.set_org_context` + `app.set_site_context`,
`SET ROLE app_user`, wymuszone RLS. Transakcja + ROLLBACK.

| tabela | ma pojęcie zakładu | widoczna z obcego zakładu | osiągalna z ekranu |
|---|---|---|---|
| **KONTROLA — `grns`, wiersz zakładu A** | tak | **0 wierszy — szczelna** | tak |
| **KONTROLA+ — `grns`, wiersz zakładu B** | tak | 1 wiersz — własny widoczny | tak |
| `warehouses` | tak | **WYCIEK** | tak |
| `grn_items` | tak | **WYCIEK** — rodzic filtrowany, **dziecko nie** | tak |
| `sales_orders` | tak | **WYCIEK** | tak |
| `maintenance_work_orders` | tak | **WYCIEK** | tak — lista MWO **bez zakładu w WHERE** |
| `quality_holds` | tak | **WYCIEK** | tak |
| `downtime_events` | tak | **WYCIEK** | tak |

**Kontrola przeciwna zaliczona w obie strony** i to czyni z tego dowód: ta sama sesja,
ten sam użytkownik, tabela z predykatem → **zero wierszy** dla obcego zakładu **i jeden wiersz**
dla własnego. Harness potrafi pokazać zarówno wyciek, jak i jego brak — więc „widzi wszystko"
nie znaczy tu „źle ustawiony kontekst".

Przypadek „słownik wspólny dla organizacji, predykat niepotrzebny" **nie występuje**:
wszystkie 116 tabel mają kolumnę `site_id` wprost. Słowniki (`roles`, `tax_codes`,
`unit_of_measure`) tej kolumny nie mają i nie były liczone jako braki.

## To nie jest decyzja projektowa, tylko porzucone wdrożenie

Rejestr `public.operational_tables`: **22 wpisy, wszystkie `scoping_status='pending'`** —
nic nigdy nie zostało aktywowane. **Cztery wpisy dotyczą tabel, które nie istnieją**
(`stock_movements`, `wip_balances`, `inventory_cost_layers`, `wo_consumptions`), a flagi
`site_id_present` są przestarzałe (`downtime_events` ma `f`, choć kolumna istnieje).

## Okoliczność, która decyduje o priorytecie

`user_can_see_site` jest **opt-in**: restrykcja bierze się z wpisów w `user_sites`, a komentarz
w samej funkcji mówi, że dziś **żaden użytkownik nie ma przypisań** — czyli nikt nie jest
ograniczony i **dziś nic realnie nie wycieka**.

**Wyciek materializuje się w chwili, gdy ktoś zacznie przypisywać użytkowników do zakładów —
czyli dokładnie wtedy, gdy klient uwierzy, że izolacja działa.** To jest najgorszy możliwy
moment i dlatego to znalezisko nie może zginąć w backlogu.

Dodatkowo: filtr po stronie aplikacji istnieje tylko wyspowo i jest **fail-open** —
`reporting/_actions/shared.ts` przy braku kontekstu zakładu pokazuje **wszystko**.

## Dlaczego NIE naprawione

Dołożenie predykatu do 116 tabel to nie jest praca na trzydzieści minut, a **złe zawężenie
zamraża pracę użytkownikom** — ten wzorzec wystąpił w tej kampanii dwanaście razy. Wymaga
decyzji: czy izolacja zakładów ma być domyślnie szczelna (fail-closed), czy pozostać opt-in.

## Czego audyt NIE ustalił

- Przetestowano empirycznie **6 ze 116** tabel. Pozostałe 110 mają identyczny kształt polityk
  (`org_id` bez zakładu), ale bez testu wstawiającego to **inferencja, nie dowód**
- Nie przeczytano warunku WHERE każdego ekranu — „defekt na ekranie" wykazany twardo
  **tylko dla listy MWO**; dla reszty wykazano osiągalność, nie kompletność ich filtrów
- Nie zbadano, czy aplikacja realnie wypełnia `site_id` przy zapisach. Gałąź fail-open
  (`site_id IS NULL` → widoczny dla wszystkich) sprawia, że **nawet tabele Z predykatem
  przeciekają** dla wierszy bez wypełnionego zakładu
- Nie zbadano 10 widoków `v_*` ani dojścia do zakładu przez klucz obcy w tabelach bez kolumny
