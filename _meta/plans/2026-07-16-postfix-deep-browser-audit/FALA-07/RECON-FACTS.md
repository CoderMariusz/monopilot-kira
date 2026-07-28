# FALA 7 — fakty ustalone przez orchestratora PRZED delegacją

## PF-R07-04 — kierunek naprawy UDOWODNIONY na produkcji
Raport audytu podaje przyczynę co do błędu Postgresa i wprost zaznacza, że
**mocki zapytań tego nie wykryją**. Zweryfikowałem na żywej bazie:

```sql
-- OBECNY KSZTAŁT (receipt-corrections-actions.ts)
select gi.id from public.grn_items gi
  left join public.grns g on g.id = gi.grn_id
 where gi.id = … for update of gi, g;
--> ERROR:  FOR UPDATE cannot be applied to the nullable side of an outer join   ⛔

-- PROPONOWANA NAPRAWA
select gi.id from public.grn_items gi
  join public.grns g on g.id = gi.grn_id
 where gi.id = … for update of gi, g;
--> OK (0 rows, bez błędu)                                                        ✅
```

**Czy INNER JOIN coś zgubi? NIE:**
```
grn_items.grn_id  →  is_nullable = NO
wierszy z grn_id IS NULL  →  0
```
**LEFT JOIN nigdy nie był semantycznie potrzebny.** Zamiana na INNER jest bezpieczna
i nie zmienia zbioru wyników.

⚠️ **Wymagany test na ŻYWYM Postgresie** — to reguła planera, nie kontrakt aplikacji;
test na mockach przejdzie niezależnie od tego, czy join jest LEFT czy INNER.

## Baseline regresji
Ustalany równolegle (`f7/base-core-fail.txt`, `f7/base-ui-fail.txt`) na `main @ 3fe05f37`.

## Uwaga o klasie błędów tej fali
Cztery z dziesięciu findingów to **precyzja liczbowa** (cena, ilość, konwersja UoM).
Lekcja z Fali 5: poprawka wymuszająca `> 0` przy kolumnie `numeric(10,4)` **unieważniała samą
siebie**, bo `0.00001` przechodziło walidację i zapisywało się jako `0.0000`.
**Każdy tor dotykający liczb ma podać TYP I SKALĘ kolumny, do której pisze.**
