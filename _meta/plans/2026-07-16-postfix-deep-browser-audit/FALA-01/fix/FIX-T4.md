# FIX-T4 (Codex) — FactorySpec: domknij saveFactorySpecVersion bypass — monopilot-kira

ROLA: Senior dev. Domknij P1 z cross-review Composera (spójność e-sign invalidation). TYLKO KOD. NIE odpalaj testów/build/lint/git. NIE commituj, NIE `git add`. Orchestrator odpala bramkę po Tobie.
REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD). RLS: `org_id`+`app.current_org_id()`.

KONTEKST: Twój P0 fix (`updateFactorySpec` edit-po-e-sign → nowa rewizja `in_review` + archiwum + audyt `factory_spec.esign_invalidated`, reopen pokazuje historyczne receipty) jest POPRAWNY i żywy. Cross-review wskazał alternatywną ścieżkę omijającą tę politykę.

## DO NAPRAWY

### F1 — `saveFactorySpecVersion` omija politykę e-sign invalidation
`saveFactorySpecVersion` (`factory-spec-lifecycle.ts:~356-424`) to alternatywna ścieżka wersjonowania BEZ `hasBundleApprovalReceipt`/`factory_spec.esign_invalidated`. Na `in_review` z podpisem można ją wywołać → archiwum + nowy `draft` bez tego samego audytu/ochrony co `updateFactorySpec`. Nowy `specId` de-facto unieważnia nonce (podpis nie aplikuje się do zmienionej treści), ale brak spójnego audytu i ryzyko obejścia procedury „signed edit = revision in_review".
**FIX:** ujednolić: jeśli `hasBundleApprovalReceipt` (l.~83-95) na tym spec → wymuś TEN SAM flow co `updateFactorySpec` (rewizja `in_review` + audyt `factory_spec.esign_invalidated`), ALBO zablokuj `saveFactorySpecVersion` na podpisanym `in_review` z czytelnym błędem. Zachowaj `requireMutableSpec` + `FOR UPDATE` (serializacja). Nie zmieniaj poprawnego zachowania `updateFactorySpec`.

### F2 (NICE) — cienkie testy receiptów
Dodaj: (a) unit loadera `bundle-data` z 2 wierszami `e_sign_log` → assert `current` vs `historical` receipt; (b) test że `saveFactorySpecVersion` na podpisanym spec przechodzi tą samą polityką (rewizja/audyt lub blok). Wzorem `actions/__tests__/factory-spec-lifecycle.unit.test.ts`, `_actions/__tests__/bundle-data.unit.test.ts`. NIE uruchamiaj.

## MIGRACJA: none oczekiwane. Jeśli konieczna: `packages/db/migrations/518-<opis>.sql`.
## Dotykaj TYLKO: `technical/factory-specs/**`. NIE tykaj innych domen.

## OUTPUT: ## FILES TOUCHED / ## FIX (F1,F2 → zmiana) / ## MIGRATION / ## TEST / ## UNCERTAINTIES
