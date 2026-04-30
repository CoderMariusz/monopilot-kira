# Brief Excels — Reality Source

**Status:** Active reality (inicjowany Phase A Session 3)
**Scope:** Pre-PLD NPD stage — brief Excel files które Apex używa przed przekazaniem do PLD v7

Pliki w tym katalogu:
- `BRIEF-FLOW.md` — end-to-end brief capture + 2 known templates (brief 1, brief 2) + mapping → PLD v7

Reality files:
- `C:\Users\MaKrawczyk\OneDrive - IPL LIMITED\Desktop\PLD\brief 1.xlsx` — brief template single-component (1 product = 1 row)
- `C:\Users\MaKrawczyk\OneDrive - IPL LIMITED\Desktop\PLD\brief 2.xlsx` — brief template multi-component (1 product = N component rows + sumująca waga)

**Upstream od:** PLD v7 Excel (patrz `../pld-v7-excel/PROCESS-OVERVIEW.md` §2).
**Downstream (po Convert to PLD):** Core section Main Table `Smart_PLD_v7.xlsm`.

**Dual maintenance:** Przez ~12 miesięcy briefy żyją dalej jako Excel files (nie replaced by Monopilot yet). Monopilot target: brief = NPD-upstream module z handoff button "Convert to PLD".
