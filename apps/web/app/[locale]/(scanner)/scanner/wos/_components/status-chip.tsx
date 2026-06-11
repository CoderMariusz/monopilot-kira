"use client";

// ============================================================
// Scanner — WO status chip.
// Parity: prototypes/scanner/flow-consume.jsx <StatusChip status={w.status}/>
// (shared shell helper). Dark-palette pill, color keyed by status.
// ============================================================

import { scannerTokens as T } from "../../../../../../components/shell/scanner-primitives";
import type { ScannerProdLabels } from "../../../_components/scanner-prod-labels";
import type { WoStatus } from "./wo-types";

const PALETTE: Record<WoStatus, { bg: string; fg: string }> = {
  planned: { bg: "#1e293b", fg: T.mute },
  released: { bg: "#0e2333", fg: T.blue2 },
  inprog: { bg: "#0e2a18", fg: T.green },
  paused: { bg: "#3b2f0b", fg: T.amber },
  done: { bg: "#1e293b", fg: T.txt2 },
  cancelled: { bg: "#3b1212", fg: T.red },
};

export function statusLabel(status: WoStatus, labels: ScannerProdLabels): string {
  return labels.status[status] ?? status;
}

export function StatusChip({ status, label }: { status: WoStatus; label: string }) {
  const c = PALETTE[status] ?? PALETTE.planned;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </span>
  );
}
