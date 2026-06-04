# PROPOSED STUB — m06 T-000: Resolve scanner workspace architecture (apps/web (scanner) vs apps/scanner)

> Status: PROPOSAL (not in manifest). HARD BLOCKER B3 — must run before ANY 06 task.
> Type: decision/spike → re-path the whole module. Depends: none (gate for all of 06).

## Why (contradiction)
- 00-foundation **T-134** already built scanner as a route-group INSIDE apps/web: `apps/web/app/[locale]/(scanner)/layout.tsx`, `(scanner)/dev/scanner/page.tsx`, `apps/web/e2e/scanner-isolation.spec.ts`.
- 06 **T-012** says "Stand up **apps/scanner** Next.js workspace", and EVERY 06 UI/test task JSON uses `apps/scanner/src/...` / `apps/scanner/__tests__/...` paths (verified T-013). `apps/scanner` does not exist.
- These cannot coexist: building T-012 as written creates a second Next app that orphans the T-134 scaffold and splits the deploy. STATUS.md flagged "workspace split must be resolved."

## Decision required
Choose ONE and document in `_meta/decisions/`:
- **Option A (recommended): keep apps/web `(scanner)` route-group.** Matches PRD §5.1 ("PWA osadzony w monorepo … shared services `lib/services/*` z desktop"), reuses T-134 scaffold (layout, ScannerFrame, dev harness, isolation spec), single Vercel deploy, shared RLS/session. **Action:** rewrite all ~31 file paths across the 06 task set from `apps/scanner/...` → `apps/web/app/[locale]/(scanner)/...` (UI) + `apps/web/lib/...`/`apps/web/app/api/...` (services/routes) + `apps/web/__tests__|e2e/...`. Update T-012 to "extend the existing (scanner) layout" not "create workspace".
- **Option B: migrate to standalone apps/scanner.** Move the T-134 scaffold into apps/scanner, add the workspace to pnpm + a Vercel project, wire shared `packages/*`. Heavier; only if PWA service-worker/install (P2) demands an isolated app.

## Acceptance criteria
1. A decision record exists in `_meta/decisions/` naming the chosen option + rationale.
2. All 49 06-scanner-p1 task JSONs' `scope_files`/prompts reference the chosen workspace root consistently; no mixed `apps/scanner` + `apps/web/(scanner)` paths remain.
3. The T-134 scaffold is either reused (A) or migrated (B) — not orphaned/duplicated.

## Risk red lines
- Do not start any 06 UI task before this is decided — paths are load-bearing for parity evidence + worktree isolation.
- Do not duplicate the scanner layout/session in two places.
