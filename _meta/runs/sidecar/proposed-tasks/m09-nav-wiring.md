# PROPOSED REFINEMENT — 09-quality nav/route-group registration ownership

**Type:** clarify ownership (edit T-013 or add a one-liner task). **Priority:** LOW. **Finding:** Q-4.

## Problem
09 UI tasks reference `sidebar/nav/menu` in ACs but no single task explicitly OWNS registering the Quality top-level nav entry + App Router route-group wiring in the app shell. Each page assumes the menu item already exists. If the modules menu is owned by 02-settings / Wave-0, this is fine — but it is not stated.

## Proposed change (pick one)
- **Option A (preferred):** add an explicit AC + scope line to **T-013** (QA Dashboard / module entrypoint): "Register `/quality` nav entry in the modules sidebar (or confirm 02-settings/Wave-0 owns it); the menu item is visible+clickable gated on any `quality.*` permission."
- **Option B:** add a tiny T4-wiring task asserting the Quality menu item renders and routes to the dashboard for a `quality_lead` user.

## Acceptance
- A Playwright/manual check confirms the Quality menu item is reachable post-login for a quality role.
- Owner of the modules menu is explicitly named (avoid orphaned nav).
