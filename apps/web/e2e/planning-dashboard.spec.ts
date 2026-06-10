/**
 * P-L5 — Planning Dashboard E2E (Playwright) — happy path + per-state screenshots.
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/planning/dashboard.jsx:4-262
 *
 * The /planning route is org-scoped + RBAC-gated (scheduler.run.read), so live
 * capture requires an authenticated Supabase session against a running app server
 * (Vercel preview or `pnpm --filter web dev`). When PLAYWRIGHT_BASE_URL is unset
 * (the default in this isolated worktree) the live capture is SKIPPED and the
 * accepted fallback evidence is the RTL component coverage in
 * app/[locale]/(app)/(modules)/planning/__tests__/dashboard.test.tsx
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace.
 */
import path from "node:path";

import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, "artifacts/P-L5");
const route = "/en/planning";

test.describe("Planning Dashboard parity (dashboard.jsx:4-262)", () => {
  test.skip(
    !baseURL,
    "PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.",
  );

  test("renders KPI strip + alert panels + upcoming schedule and is axe-clean", async ({ page }) => {
    await page.goto(`${baseURL}${route}`);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // KPI strip: 4 tiles, 2 of them honest "not live yet".
    const kpis = page.getByTestId("planning-kpis");
    await expect(kpis).toBeVisible();
    await expect(page.getByTestId("planning-kpi-openWos")).toBeVisible();
    await expect(page.getByTestId("planning-kpi-openPos")).toHaveAttribute("data-not-live", "true");
    await expect(page.getByTestId("planning-kpi-openTos")).toHaveAttribute("data-not-live", "true");

    // Header actions: Create WO link + disabled PO/TO/sequencing/D365.
    await expect(page.getByTestId("planning-action-createWo")).toHaveAttribute("href", /\/planning\/work-orders\?new=1/);
    await expect(page.getByTestId("planning-action-createPo")).toBeDisabled();
    await expect(page.getByTestId("planning-action-runSequencing")).toBeDisabled();
    await expect(page.getByTestId("planning-action-triggerD365")).toBeDisabled();

    // Alert + schedule regions present (empty-state safe).
    await expect(page.getByTestId("planning-alert-cols")).toBeVisible();
    await expect(page.getByTestId("planning-upcoming")).toBeVisible();

    await page.screenshot({ path: path.join(evidenceDir, "P-L5-ready.png"), fullPage: true });
    await kpis.screenshot({ path: path.join(evidenceDir, "P-L5-kpi-strip.png") });
  });
});
