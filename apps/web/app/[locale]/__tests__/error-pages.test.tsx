/**
 * @vitest-environment jsdom
 *
 * Shell gap #1 — 404 + error boundary rendering.
 *
 * Asserts the localized not-found card, the (app) client error boundary
 * (digest + reset), and that i18n keys resolve through the REAL en.json. These
 * pages are lightweight (no data fetching), so the tests just verify structure,
 * the design-system .empty-state card, the back-to-dashboard link, and the
 * reset wiring.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

function loadEn() {
  return JSON.parse(readFileSync(path.resolve(__dirname, "../../../i18n/en.json"), "utf-8"));
}

function makeT() {
  return async (req?: string | { namespace?: string }) => {
    const namespace = typeof req === "object" ? req.namespace ?? "" : req ?? "";
    const messages = loadEn();
    const ns = namespace.split(".").reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = key.split(".").reduce((acc: unknown, part: string) => {
        return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns);
      return typeof value === "string" ? value : key;
    };
  };
}

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn((req?: string | { namespace?: string }) => makeT()(req)),
}));

// Client error boundary uses the synchronous next-intl hook.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const messages = loadEn();
    const ns = (namespace ?? "").split(".").reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = key.split(".").reduce((acc: unknown, part: string) => {
        return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns);
      return typeof value === "string" ? value : key;
    };
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

import LocaleNotFound from "../not-found";
import AppError from "../(app)/error";

afterEach(() => cleanup());

describe("Shell gap #1 — localized 404", () => {
  it("renders the design-system empty-state card with a back-to-dashboard link", async () => {
    render(await LocaleNotFound());
    const card = screen.getByTestId("not-found-card");
    expect(card).toBeInTheDocument();
    expect(card.querySelector(".empty-state")).toBeTruthy();

    const en = loadEn();
    expect(screen.getByText(en.Errors.notFound.title)).toBeInTheDocument();

    const home = screen.getByTestId("not-found-home");
    expect(home).toHaveAttribute("href", "/en/dashboard");
    expect(home).toHaveTextContent(en.Errors.notFound.backToDashboard);
  });
});

describe("Shell gap #1 — (app) error boundary", () => {
  it("renders the error card with the digest and a working reset", async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<AppError error={error} reset={reset} />);

    expect(screen.getByTestId("app-error-boundary")).toBeInTheDocument();
    expect(screen.getByTestId("app-error-digest")).toHaveTextContent("abc123");

    await userEvent.click(screen.getByTestId("app-error-retry"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("omits the digest line when no digest is present", () => {
    render(<AppError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.queryByTestId("app-error-digest")).not.toBeInTheDocument();
  });
});
