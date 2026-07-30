# DZIENNIK 2026-07-30 — bieżący stan pracy

> Aktualizowany na bieżąco. **Po kompakcie czytaj to jako drugie, zaraz po `PLAN-DNIA.md`.**
> Koniec pracy: **20:00**. Ostatnie zlecenie: **19:45**.

## Bieżące tory (aktualizuj przy każdej zmianie)

| tor | co robi | silnik | zasób | status |
|---|---|---|---|---|
| F1 | PRD-008 (duplikat outboxu) + NSA-150 (RODO) + onboarding | Codex SOL | klon `t1` | 🔵 w toku od 01:35 |
| F3 | dziura w bramce anulowania ukończonego WO (obejście A) | Codex SOL | klon `t2` | 🔵 w toku od 01:45 |

## Zamknięte dziś
- **08:13** — start 12h okna. Plan zapisany.
- **~01:30** — 457 zdarzeń outboxu ostemplowanych na prodzie (decyzja ownera).
- **~01:32** — **push `9f9dd557..1323a7ae`**, 15 commitów. Migracje 543+544 na produkcji.
- **~01:40** — tor F2 zamknięty: katalog i testy skorygowane wg decyzji ownera
  (`WH-066` fail-closed, `SFQ-072` blokada, oba przejścia stanów zostają).
  **Znalazł przy tym, że warunek ownera o anulowaniu WO NIE jest egzekwowany** → tor F3.

## ⚠️ Do pilnowania
- **Nowy błąd typechecku** w `apps/web/lib/production/pause-resume-wo.ts:123,206` — brakuje
  `dedupKey` w wywołaniach outboxu. To skutek uboczny naprawy `PRD-008` przez tor F1
  (dodał wymagane pole do sygnatury). **Bramka to wyłapie — nie commituj bez naprawy rodzeństwa.**
- `UI-003` (global search) — **bez decyzji ownera**. Zapytać przy okazji.
- Obejście B w `lp-downstream-guard.ts` (netto konsumpcji = 0) — **świadomie zostawione**,
  do decyzji ownera.

## Następne w kolejce
1. Uruchomić linię Fable (finding) — priorytet **obliczenia**: WAC, koszty, konwersje jednostek, wariancje.
2. Bramka + commit torów F1/F2/F3.
3. E2E ścieżka NPD → finanse (sekwencyjnie, jedna przeglądarka).
4. Faza 2: szardy P1-P5 równolegle.
