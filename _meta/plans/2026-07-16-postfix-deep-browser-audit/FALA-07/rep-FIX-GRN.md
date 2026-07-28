# FALA 7 / FIX-GRN — raport po cross-review

## Zmiany w kodzie

| Plik | Zmiana |
|------|--------|
| `receipt-corrections-actions.ts` | Site-scope na mutacjach `cancelGrnLine` + `updateLpMetadata` (GRN `site_id`, LP `site_id` vs `getActiveSiteId({ client })`); `not_found` gdy brak aktywnego site lub cross-site |
| `grn-actions.ts` | `getGrnDetail` — usunięty bypass `g.site_id IS NULL`; twardy filtr jak `listGrns` |
| `grn-detail.client.tsx` | `data-testid` na kolumnie Supplier batch (testy) |
| `grn-line-for-update-outer-join.test.ts` | Obowiązkowy test PG — `throw` bez `DATABASE_URL` zamiast `describe.skip` |
| Testy akcji/UI | Site-scope mutacji, anulowana linia w liczniku, All sites z pełnym dostępem, dokładny `—` w Supplier batch |
| `rep-T5.md` | Usunięta błędna uwaga o niespójności licznika druku |

Testy **napisane, nie uruchamiane** (zgodnie z instrukcją toru).

---

## [G-1] Site-scope na mutacjach (ten tor)

**Zabezpieczone w tym diffie:**

| Akcja | Plik | Mechanizm |
|-------|------|-----------|
| `cancelGrnLine` | `receipt-corrections-actions.ts` | `grn_site_id` + `lp_site_id` muszą równać się `getActiveSiteId({ client })`; brak site → `not_found` |
| `updateLpMetadata` | `receipt-corrections-actions.ts` | `lp.site_id` jak wyżej |

**Odczyty już zabezpieczone wcześniej:** `getLpDetail`, `getGrnDetail`, `listGrns`, `getGrnDocument`, `createStockMove` (`withSiteContext`).

### Pełna lista mutacji LP/GRN nadal BEZ site-scope (do osobnego toru)

| Akcja | Plik | Uwaga |
|-------|------|-------|
| `splitLp` | `license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts` | Fala 8 — świadomie poza diffem |
| `mergeLps` | j.w. | Fala 8 |
| `destroyLp` | j.w. | Fala 8 |
| `blockLp` | `license-plates/[lpId]/_actions/lp-detail-actions.ts` | Stempluje `site_id`, nie porównuje z aktywnym |
| `unblockLp` | j.w. | |
| `reserveLp` | j.w. | |
| `releaseLpQa` / `releaseLpQaForContext` | `_actions/lp-qa-actions.ts` | Używane z GRN detail — brak `getActiveSiteId` |
| `applyDirectAdjustment` | `_actions/direct-adjust-actions.ts` | Rozwiązuje site z LP/magazynu, nie z cookie |
| `releaseReservation` | `_actions/reservation-actions.ts` | Brak filtra site |
| `submitConditionCheck` (GRN temp) | `grns/[grnId]/cold-chain-adapter.ts` → `quality/_actions/cold-chain-actions.ts` | Poza warehouse `_actions`; brak weryfikacji w tym torze |
| Przyjęcie PO (`receivePoLine` itd.) | `receive-po-line.ts` / `lib/warehouse/receive-po-line-core.ts` | Poza zakresem FIX-GRN |

---

## [G-2] Cichy skip testu PostgreSQL

**Wybór: fail fast na poziomie pliku** (`throw` gdy brak `DATABASE_URL`).

**Uzasadnienie:** Test dokumentuje regułę planera Postgresa — mock query nigdy jej nie wykryje. `describe.skip` bez bazy daje zieloną bramkę z 0 asercji (klasa błędu z całej kampanii). Jawny marker wymagałby osobnej logiki w orchestratorze; `throw` jest samowystarczalny — `vitest`/`pnpm db:test` padnie z czytelnym komunikatem: *„ten test wymaga bazy"*.

---

## [G-3] `site_id IS NULL` — lista vs szczegóły GRN

**Decyzja: szczegóły dopasowane do listy (twardy filtr).**

`listGrns` od dawna ma `g.site_id = $4::uuid` (bez `IS NULL`). `getGrnDetail` miał łagodniejszy predykat (`… or g.site_id is null`), więc GRN bez site był widoczny po bezpośrednim URL, ale nie na liście.

Usunięto `or g.site_id is null` z `getGrnDetail`. Gdy cookie „All sites" (`getActiveSiteId` → `null`), predykat site jest wyłączony — lista i tak zwraca `noActiveSite` (pusta), więc nie ma regresji „widoczne na liście → 404".

**LP pozostają łagodniejsze** (`lp.site_id IS NULL` na liście/szczegółach) — to osobna semantyka legacy LP, nie dotyczy GRN.

---

## [G-4]–[G-6] Testy

- **All sites:** mock zwraca wiersz LP przy `siteParam === null`; asercja `ok: true` + `data.id` + follow-up queries (historia).
- **Liczniki + anulowana linia:** mock `getGrnDetail` z 2 liniami (1 anulowana); `itemCount === 1` na liście i w szczegółach.
- **Supplier batch `—`:** `getByTestId('grn-item-supplier-batch-line-1').toHaveTextContent('—')`.

---

## [G-7] Korekta rep-T5

Usunięto sekcję „Pozostała niespójność" o druku — recenzent potwierdził spójność `liveLineCount` / `cancelled_at is null` między listą, szczegółami i `grn-document.ts`.

---

## Czego NIE jestem pewien

1. Czy `submitConditionCheck` (cold-chain z GRN) powinien odrzucać cross-site po `grn_item_id`/`lp_id`, czy wystarczy gate w `quality/_actions` — nie czytałem tego modułu w tym torze.
2. Czy mutacje LP z `site_id IS NULL` powinny kiedyś być dozwolone przy aktywnym site (reads je dopuszczają; mutacje teraz fail-closed jak `createStockMove`).
3. Czy orchestrator `pnpm db:test` zawsze ustawia `DATABASE_URL` — jeśli nie, nowy `throw` zatrzyma suite zamiast cichego skipa (zamierzone).
