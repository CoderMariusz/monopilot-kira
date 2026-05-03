# MonoPilot Kira

Repozytorium produktu **MonoPilot MES** — multi-tenant Manufacturing Execution System dla zakładów produkcji spożywczej.

---

## Struktura repozytorium

```
monopilot-kira/
├── README.md               ← ten plik
├── .env.example            ← zmienne środowiskowe
│
├── prototypes/             ← wszystkie prototypy UI i moduły produktu
│   ├── colors_and_type.css ← tokeny design systemu
│   ├── components.html     ← komponenty desktop
│   ├── patterns.html       ← wzorce layoutu
│   ├── scanner-kit.html    ← komponenty mobile/dark
│   ├── example-screen.html ← przykładowy ekran
│   ├── MONOPILOT-SITEMAP.html
│   ├── SCANNER-PROTOTYPE (2).html
│   ├── auth/
│   ├── dashboard/
│   ├── design/             ← UX specs per moduł
│   ├── npd/ · settings/ · technical/ · planning/ · planning-ext/
│   ├── warehouse/ · scanner/ · production/ · quality/ · finance/
│   ├── reporting/ · maintenance/ · multi-site/ · oee/
│   ├── screenshots/
│   └── uploads/
│
├── docs/                   ← dokumentacja projektu
│   ├── prd/                ← Product Requirements Documents (00–15)
│   ├── BACKLOG.md
│   ├── SKILL.md
│   ├── TUNING-PATTERN.md
│   └── ...
│
├── _meta/                  ← planowanie, atomic-tasks, audyty, decyzje
├── _foundation/            ← ADR-y, architektura, skill registry
├── _shared/                ← wspólne komponenty (modals, primitives, CSS)
└── _archive/               ← archiwum
```

---

## Kontekst produktu

**Co to jest MonoPilot.** Przeglądarkowy MES obejmujący pełny cykl produkcyjny: Technical (produkty, BOM, routing), Planning (dostawcy, PO, WO, MRP), Production (realizacja WO, wydajność, odpady), Warehouse (LP tracking, GRN, przesunięcia), Scanner (mobilna aplikacja dla operatorów), Quality (specyfikacje, blokady, NCR, HACCP), Shipping (SO, picking, pakowanie) + dodatki premium: NPD, Finance, OEE, Reporting, Multi-Site, Maintenance.

**Kto używa.**
- **Desktop** — kierownicy, planiści, QA, technolodzy, kupcy. Sidebar + gęste tabele + dashboardy KPI. Jasny motyw.
- **Skaner mobilny** — operatorzy na hali, magazynierzy. Duże strefy dotykowe, skanowanie kodów, jeden przepływ na ekran. **Ciemny motyw**.

**Tenants.** Pierwszy tenant: **Apex** (mleczarnia). System jest white-label.

---

## Jak korzystać z prototypów

1. Otwórz `prototypes/colors_and_type.css` — wszystkie tokeny (kolory, typografia, spacing).
2. Desktop: `prototypes/components.html` + `prototypes/patterns.html`.
3. Mobile/scanner: `prototypes/scanner-kit.html`.
4. Pełne widoki: `prototypes/MONOPILOT-SITEMAP.html` (każdy ekran) lub `prototypes/SCANNER-PROTOTYPE (2).html`.

---

## PRD-y

Wszystkie Product Requirements Documents w `docs/prd/` — od `00-FOUNDATION-PRD.md` do `15-OEE-PRD.md`.
