/**
 * Dashboard recent-activity label mapping — unit coverage.
 *
 * Asserts the contract that keeps the feed human-readable:
 *   - mapped action / resource codes resolve to a stable i18n key suffix that
 *     EXISTS in the live en.json bundle (no orphan keys, no missing keys);
 *   - unmapped codes fall back to a humanized last segment — the raw dotted
 *     string is NEVER returned;
 *   - resource references prefer a human ref, truncate a bare UUID, and drop the
 *     `*` schema-drift sentinel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  eventLabelKey,
  humanizeCode,
  resourceLabelKey,
  shortRef,
} from "../activity-labels";

const en = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../../../../i18n/en.json"), "utf-8"),
) as { Dashboard: { activity: { events: Record<string, string>; resources: Record<string, string> } } };

const EVENTS = en.Dashboard.activity.events;
const RESOURCES = en.Dashboard.activity.resources;

describe("eventLabelKey", () => {
  it("maps real audit action codes to a key that exists in en.json", () => {
    const cases: [string, string][] = [
      ["planning.purchase_order.status_changed", "poStatusChanged"],
      ["planning.transfer_order.updated", "toUpdated"],
      ["ship.customer.created", "customerCreated"],
      ["warehouse.lp.metadata_corrected", "lpMetadataCorrected"],
      ["e_sign.recorded", "eSignRecorded"],
      ["schema.drift_detected", "schemaDriftDetected"],
      ["production.wo.started", "woStarted"],
      ["quality.hold.created", "holdCreated"],
    ];
    for (const [action, expectedKey] of cases) {
      expect(eventLabelKey(action)).toBe(expectedKey);
      expect(EVENTS[expectedKey]).toBeTypeOf("string");
    }
  });

  it("returns null for an unmapped action", () => {
    expect(eventLabelKey("some.brand_new.event")).toBeNull();
  });

  it("never maps to a key that is missing from en.json", () => {
    // Every mapped key must resolve to a real translation.
    const sample = [
      "planning.purchase_order.created",
      "production.consume.completed",
      "warehouse.grn.received",
      "shipping.shipment.packed",
      "quality.ncr.opened",
      "technical.factory_spec.approved",
      "npd.gate.approved",
    ];
    for (const action of sample) {
      const key = eventLabelKey(action);
      expect(key).not.toBeNull();
      expect(EVENTS[key as string]).toBeDefined();
    }
  });
});

describe("resourceLabelKey", () => {
  it("maps resource types to keys present in en.json", () => {
    for (const [type, key] of [
      ["purchase_order", "purchaseOrder"],
      ["transfer_order", "transferOrder"],
      ["license_plate", "licensePlate"],
      ["reference.dept_columns", "schemaColumns"],
    ] as [string, string][]) {
      expect(resourceLabelKey(type)).toBe(key);
      expect(RESOURCES[key]).toBeTypeOf("string");
    }
  });

  it("returns null for an unmapped resource type", () => {
    expect(resourceLabelKey("mystery_table")).toBeNull();
  });
});

describe("humanizeCode (fallback)", () => {
  it("turns a dotted code into a Title-Case last segment, never the raw string", () => {
    expect(humanizeCode("some.module.thing_happened")).toBe("Thing happened");
    expect(humanizeCode("planning.purchase_order.status_changed")).toBe("Status changed");
    expect(humanizeCode("license_plate")).toBe("License plate");
    // camelCase input is split on word boundaries (each word keeps its case).
    expect(humanizeCode("npdProjectCreated")).toBe("Npd Project Created");
  });

  it("never returns a string containing a dot for a dotted input", () => {
    expect(humanizeCode("a.b.c_d")).not.toContain(".");
  });
});

describe("shortRef (UUID handling)", () => {
  const UUID = "49b4abd3-6a8b-44a2-8347-3fcdc80de770";

  it("prefers a carried human reference verbatim", () => {
    expect(shortRef("PO-202606-0003", UUID)).toBe("PO-202606-0003");
    expect(shortRef("  TO-DEMO-0001  ", UUID)).toBe("TO-DEMO-0001");
  });

  it("truncates a bare UUID to its first segment with an ellipsis", () => {
    expect(shortRef(null, UUID)).toBe("49b4abd3…");
    expect(shortRef(undefined, UUID)).toBe("49b4abd3…");
  });

  it("drops the schema-drift sentinel and empty ids", () => {
    expect(shortRef(null, "*")).toBeNull();
    expect(shortRef(null, "")).toBeNull();
    expect(shortRef(null, null)).toBeNull();
  });

  it("returns an already-short non-UUID id as-is", () => {
    expect(shortRef(null, "WO-1")).toBe("WO-1");
  });
});
