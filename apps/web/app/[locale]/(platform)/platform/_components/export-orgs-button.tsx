"use client";

/**
 * "⤓ Export" control — client-side CSV download of the organizations table
 * already rendered by the console (no new server surface, no audit action).
 *
 * Visual parity anchor: .btn.btn-secondary (prototypes/design/Monopilot Design
 * System/platform/platform-console-and-org-shell.html lines 40-41, 220) — the
 * exact secondary treatment the console page uses for its other secondary
 * buttons.
 *
 * The server passes ONLY plain data (ExportOrgRow[] — all strings/numbers) and
 * a filename; no function crosses the server→client boundary.
 */

import type { JSX } from "react";

export type ExportOrgRow = {
  code: string;
  name: string;
  industry: string;
  sites: number;
  users: number;
  status: string;
};

export type ExportOrgsButtonProps = {
  label: string;
  filename: string;
  /** Localised, ordered CSV header cells: code,name,industry,sites,users,status. */
  headers: [string, string, string, string, string, string];
  rows: ExportOrgRow[];
};

/**
 * RFC-4180-ish CSV cell quoting: wrap and double-up embedded quotes.
 *
 * CSV-injection hardening: a cell whose raw value begins with `=`, `+`, `-` or
 * `@` is interpreted as a formula by Excel / Sheets / LibreOffice on open. We
 * neutralise it by prefixing a single quote so the spreadsheet treats it as
 * literal text, then quote as normal.
 */
function csvCell(value: string | number): string {
  let s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(headers: readonly string[], rows: ExportOrgRow[]): string {
  const head = headers.map(csvCell).join(",");
  const body = rows
    .map((r) => [r.code, r.name, r.industry, r.sites, r.users, r.status].map(csvCell).join(","))
    .join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}

export function ExportOrgsButton({ label, filename, headers, rows }: ExportOrgsButtonProps): JSX.Element {
  function download() {
    const csv = buildCsv(headers, rows);
    // Prepend a UTF-8 BOM so Excel opens the file as UTF-8.
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      data-testid="platform-export"
      onClick={download}
      disabled={rows.length === 0}
      style={{
        padding: "6px 14px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        border: "1px solid #e2e8f0",
        fontFamily: "inherit",
        background: "#fff",
        color: "#1e293b",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: rows.length === 0 ? "not-allowed" : "pointer",
        opacity: rows.length === 0 ? 0.55 : 1,
      }}
    >
      ⤓ {label}
    </button>
  );
}

export default ExportOrgsButton;
