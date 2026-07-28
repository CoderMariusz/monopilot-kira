# FALA 5 / TOR T5 — R06-13 Routing empty-state CTA

**Task:** `[R06-13 · P2]` Zakładka Routing mówi „utwórz", ale nie daje czym  
**Evidence item:** `NIGHT-R06-FG-1138`  
**Date:** 2026-07-28

## Zmiana

Dodano CTA „+ New routing" w pustym stanie zakładki Routing na ekranie szczegółów pozycji (`item-data-tabs.tsx` + `page.tsx`), wzorując się na istniejącym szwie `SupplierSpecsTab` → `EmptyCard action={…}`.

## 1. Dwuznaczność `state: 'empty'` w loaderze

**Wybór:** CTA wstrzykiwane **tylko ze strony**, gdy `getItem()` już zwrócił sukces — **bez** zmiany `loadRoutingTab()` w `tab-data.ts`.

**Uzasadnienie:**

- `page.tsx` renderuje `RoutingTab` wyłącznie po przejściu bramki `not_found` / `error` (L140–165). Jeśli użytkownik widzi zakładki, pozycja **na pewno istnieje** w kontekście tej strony.
- `loadRoutingTab()` nadal zwraca `{ state: 'empty' }` zarówno dla braku routingu, jak i dla `resolveItem() === null`, ale w praktyce na trasie item-detail drugi przypadek nie występuje (ten sam `itemCode`, ten sam org context).
- `RoutingTab` jest prezentacyjny: pokazuje `action` tylko w `EmptyCard`. Brak `action` = brak CTA — test „nierozwiązany item" symuluje scenariusz, w którym strona **nie wstrzykuje** akcji (jak przy `not_found` lub gdyby loader i `getItem` się rozjechały).

**Ryzyko:** teoretyczny race (item usunięty między `getItem` a `loadRoutingTab`) — CTA mogłoby na chwilę pokazać link do tworzenia routingu dla nieistniejącej pozycji. Nie rozstrzygaliśmy tego w loaderze (poza scope); wymagałoby `itemResolved` w `RoutingTabData`.

## 2. URL i locale

```ts
const createRoutingHref = `/${locale}/technical/routings?item=${encodeURIComponent(item.itemCode)}`;
```

- **Locale:** jawny prefiks `/${locale}/` z `params.locale` strony — nie polegamy na middleware redirect z locale-less href (znany bug gubienia prefiksu przy względnych / prefetch ścieżkach; BOM używa locale-less `/technical/bom?new=…`, ale tu wymaganie audytu to jawny locale).
- **Kontekst itemu:** query `?item=<item_code>` — gotowy do konsumpcji przez `RoutingsManager` (obecnie **nie czyta** tego parametru; użytkownik ląduje na liście marszrut i musi wybrać pozycję ręcznie).

## 3. Gating uprawnieniem

- Użyto istniejącego `resolveCanCreateBom()` → `technical.bom.create` (ten sam gate co tworzenie BOM i routingu w module technical).
- `routingAddAction` budowane **tylko** gdy `canCreateBom === true`; w przeciwnym razie `undefined` → `RoutingTab` renderuje goły empty state (jak `SupplierSpecsTab` bez `canEdit`).
- Wzorzec jak sąsiednie zakładki: BOM (`canCreateBom` + href na stronie), supplier (`canEdit` w komponencie modalnym).

## 4. i18n

Dopisano punktowo `detail.dataTabs.routing.createCta` w `en` / `pl` / `ro` / `uk` + fallback w `item-data-tab-labels.ts`. Bez przestawiania kluczy.

## Pliki

| Plik | Zmiana |
|------|--------|
| `item-data-tabs.tsx` | `RoutingTab` przyjmuje `action?: ReactNode` |
| `page.tsx` | `routingAddAction` + locale-prefixed href |
| `item-data-tab-labels.ts` | `createCta` w DEFAULTS |
| `i18n/{en,pl,ro,uk}.json` | `createCta` pod `routing` |
| `__tests__/item-data-tabs.test.tsx` | 4 nowe przypadki RoutingTab |

## Testy (napisane, nie uruchamiane)

1. Pusty routing + `action` → CTA z `href` `/pl/technical/routings?item=…`
2. Brak `action` → brak CTA (brak uprawnienia)
3. Pusty stan bez `action` → brak CTA (nierozwiązany item / brak wstrzyknięcia ze strony)
4. `state: 'ready'` + `action` → tabela routingu, bez CTA

## Czego NIE jestem pewien

- Czy `RoutingsManager` powinien w osobnym torze czytać `?item=` i auto-selekcjonować pozycję (jak BOM `?new=`). Bez tego CTA prowadzi do właściwej strony, ale nie otwiera od razu modala tworzenia.
- Czy `technical.bom.create` to w 100% właściwy permission dla routingu w przyszłych zmianach RBAC (obecnie spójny z BOM tab i `listRoutingItems.canWrite`).
