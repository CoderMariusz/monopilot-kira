# FALA-09 — Transfer Orders bramka (rep-FIX-TO)

## Anty-regresja ship-mixed-uom — **NAPRAWIONE**

**Bramka:** `still rejects when only 10 kg exists for a 10 kg physical order` — `expected true to be false` (ship przeszedł przy dokładnym pokryciu).

**Analiza liczb:** 6.125 + 3.875 = **10.000000 kg** przy LP 10 kg to **legalny** ship — test był błędny, nie poprawka. Konwersja micro-6 nie zawyża: `toMicro('10')` = 10_000_000; alokacja FEFO odejmuje dokładnie 10_000_000 µkg.

**Poprawka testu:** LP `9.999999 kg` — niedobór 1 µkg (`remainingBase = 1n` po picku) → `insufficient_stock`. Zachowana intencja anty-regresji (nie przepuszcza faktycznie niepokrytego transferu).

**Poprawka kodu (współdzielona z T3):** conservation base-UoM + mocki conservation w `ship-mixed-uom.test.ts` (wcześniej guard wyłączony pustym `distinct item_id`).

---

## `actions.test.ts` — trzy czerwone przejścia statusu — **NAPRAWIONE**

| Test | Kod błędu (diagnoza) | Przyczyna | Poprawka |
|---|---|---|---|
| `in_transit → received` | `persistence_failed` (conservation) | Mock nie obsługiwał `select … group by lp.product_id, lp.uom` → onHand=0 po receive | Handler `group by lp.product_id, lp.uom` → `mockMatterOnHand()` |
| `cancel remainder partial` | `persistence_failed` (conservation) | Ten sam brak mocka + baseline ≠ post-cancel snapshot | Idem; `mockMatterOnHand` / `mockMatterInTransit` już modelują 8+received+pending=20 |
| `cancel fully un-received` | `persistence_failed` (conservation) | Idem | Idem; po `remainderCancelled` source 20 + inTransit 0 |

**Przeblokowanie:** Nie było zaciśnięcia guarda w `actions.ts` — legalne ścieżki `received` / `cancelled` padały wyłącznie na conservation assert po zmianie SQL snapshotu (per-item base). Warunki transition (`TO_TRANSITIONS`, `anyPending`, `resolveTransferOrderStatusFromLines`) nie zmieniane.

---

## Współdzielone poprawki T3/T4

- `to-conservation.ts` — matter w bazowej UoM per item (mixed g+kg nie false-tripuje)
- `transfer-uom-base.ts` — each/box inverse scale, sub-gram reject
- `actions.test.ts:200` — mock grouped LP on-hand dla conservation

---

## Nie uruchamiano (zakaz lane)

`vitest`, `pnpm test`, `tsc`, `build` — weryfikacja sucha: grep eksportów, analiza ścieżek mock/SQL, arytmetyka bigint.
