# FALA 2 — plan dowodowy E2E (batched)

Zasada ownera: **każdy fix dowiedziony behawioralnie** (odtworzenie zakazanej akcji → dowód blokady/działania + DB/runtime check + brak regresji). **Renderowanie strony ≠ naprawa.** P1/P2 wolno batchować — jeden przelot może dowieść wielu bugów, jeśli da się je udowodnić razem.

10 findingów → **2 przeloty**.

## Cięcie fali (root-cause, nie kolejność planu)

| Tor | Findings | Root cause | Silnik | Migracja |
|---|---|---|---|---|
| T1 | R04-03, R04-07 | klient liczy własną „gotowość" zamiast renderować serwerową | Composer | 519 (rezerwa) |
| T2 | R04-05, R04-06 | matematyka costing (margin=revenue, yield 0% = brak straty) | Codex | 520 (rezerwa) |
| T3 | R04-08, R04-10 | persystencja/DB (BOM `persistence_failed`, brak FK sensory) | Codex | **516** |
| T4 | R04-02, R04-09 | integralność approval/e-sign | Composer | 517 (rezerwa) |
| T5 | R04-11, R04-12 | UI/CRUD (clone dead-review, brak void/unbook) | Opus subagent | 518 (rezerwa) |

## PRZELOT 1 — pełny cykl życia projektu NPD (8 bugów)

Jeden projekt NPD prowadzony G0 → G4 → Handoff → delete. Każdy przystanek dowodzi innego fixa.

| # | Krok / zakazana akcja | Dowód że fix działa | Check |
|---|---|---|---|
| 1 | G0 z niekompletną checklistą; G2 z **zero składników** | modal pokazuje DOKŁADNIE te blokery, którymi serwer odrzuci (w tym ukryty duplikat „Runs/week"); brak „No blockers" | **R04-03** · UI + próba submitu |
| 2 | Receptura: koszt `£0.50/kg`, pack `0.480 kg`, target `£2.50`, `500` packs | wiersz marży = `£2.26`/pack, `£1130`/batch, `£4.7083…`/kg (a nie `2.50`/`1250`/`5.20`) | **R04-05** · arytmetyka na ekranie |
| 3 | Ustaw expected yield `0%` | odrzucone albo jawnie nieokreślone — NIE „After yield (0%) £0.50/kg" | **R04-06** · UI + brak zapisu |
| 4 | Zablokuj formulację → **Generate production BOM** | powstaje nagłówek + wersja + linie (koniec z `persistence_failed`); błąd, gdyby był, ma konkretną przyczynę | **R04-08** · DB: header/version/lines + runtime-log |
| 5 | Handoff: ręcznie zaznacz wszystkie 6 flag checklisty | nagłówek NIE mówi „All gates pass", dopóki `Active shared BOM with lines` / `Factory spec approved` są `Not met` | **R04-07** · UI + stan bramek |
| 6 | Po approve G4 zmień wagę opakowania `480 g → 500 g` | edycja zablokowana **albo** approval atomowo unieważniony ze zdarzeniem audytowym; nie istnieje „approval ważny + definicja zmieniona" | **R04-02** · UI + DB (status approval / zdarzenie) |
| 7 | Rozwiń wpis e-sign w historii | **Certificate ID / hash niepusty** (albo uczciwy komunikat dla rekordów historycznych); czasy w formacie lokalnym | **R04-09** · UI + DB `e_sign_log` |
| 8 | Usuń projekt | rekord sensory w Technical NIE zostaje osierocony i edytowalny; FG dalej poprawnie → Blocked (brak regresji C027) | **R04-10** · DB: sensory + FG |

**Brak regresji do potwierdzenia w tym samym przelocie:** projekt daje się utworzyć, etapy przechodzą gdy kryteria SĄ spełnione (bramka nie over-blokuje — lekcja z Fali 1), receptura zapisuje się z pełną precyzją, FG archiwizuje się przy delete.

## PRZELOT 2 — kreator Clone + CRUD trial/pilot (2 bugi)

| # | Krok / zakazana akcja | Dowód że fix działa | Check |
|---|---|---|---|
| 1 | Nowy projekt → **Clone**, źródło niewybrane → dalej do Review | brak martwego zaułka: nazwany brakujący warunek + droga powrotu (a nie sam disabled Create) | **R04-11** · UI |
| 2 | Trial `101%` / pilot `100.01%` | błąd wskazuje **konkretne pole i powód** zamiast `Could not save` | **R04-12a** · UI |
| 3 | Wycofaj (void) zapisany trial / cofnij rezerwację czasu linii | operacja istnieje, jest audytowalna (kto/kiedy/powód) i zwalnia czas linii | **R04-12b** · UI + DB |
| 4 | Regresja precyzji: `12.345 × 52.35%`, `25.555 × 100%` | `6.4626075 kg` i `25.555 kg`, zero dryfu | **brak regresji** · UI |

## Środowisko dowodowe
Prod `monopilot-kira.vercel.app`, org **Apex 22** (`…0002`), `admin@monopilot.test`. Runtime-error z Vercel (`get_runtime_logs`, scoped do deploymentId + level=error). DB-check przez owner-prod psql (`DATABASE_URL_OWNER`, `sslmode=require`). Artefakty testowe sprzątane po przelocie; wpisy audytowe (append-only) zostają.
