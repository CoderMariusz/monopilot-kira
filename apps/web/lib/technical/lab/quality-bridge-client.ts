/**
 * T-020 — Quality write BRIDGE client (Technical side).
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §5.5, §10.6, §10.8.
 *
 * Ownership red-line: `lab_results` is QUALITY-OWNED. Technical has NO write or
 * approve path. Technical may only REQUEST a write through a Quality-owned
 * permission/service bridge — and ONLY if that bridge actually exists.
 *
 * In Phase 1 the 09-quality lab write bridge does NOT exist yet (the cross-module
 * dependency in T-020.json is `task_id: "TBD"`). Therefore this client resolves
 * to NO bridge and any Technical POST MUST fail loud with QUALITY_BRIDGE_MISSING
 * (HTTP 501) and write NOTHING — never silently INSERT a Technical-owned row
 * into the Quality-owned table (AC2).
 *
 * The indirection is deliberate: when 09-quality ships its write service it
 * registers a `QualityLabBridge` here (or wires `resolveQualityLabBridge` to
 * import it), the verb-level permission check stays Quality-side, and Technical
 * delegates the write through `bridge.submitLabResult` (AC3). Until then the
 * default resolver returns null and the contract degrades explicitly.
 */

export const QUALITY_BRIDGE_MISSING = 'QUALITY_BRIDGE_MISSING' as const;
export type QualityBridgeMissingCode = typeof QUALITY_BRIDGE_MISSING;

/** The Quality-side actor + payload Technical forwards to the bridge. */
export interface QualityLabWriteRequest {
  orgId: string;
  /** The Technical caller; the BRIDGE re-checks Quality permission server-side. */
  actorUserId: string;
  itemId?: string | null;
  workOrderId?: string | null;
  testType: string;
  testCode?: string | null;
  resultValue?: string | null;
  resultUnit?: string | null;
  resultStatus: string;
  thresholdRlu?: string | null;
  testedAt?: string | null;
  labProvider?: string | null;
  notes?: string | null;
}

export type QualityLabWriteResult =
  | { ok: true; labResultId: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed'; message?: string };

/**
 * The contract a 09-quality write service must implement to let Technical
 * delegate a lab-result write. The Quality side owns the permission check and
 * the actual INSERT (under Quality's own withOrgContext + RLS).
 */
export interface QualityLabBridge {
  submitLabResult(req: QualityLabWriteRequest): Promise<QualityLabWriteResult>;
}

/** Module-local registration slot (set by 09-quality when its service ships). */
let registeredBridge: QualityLabBridge | null = null;

/**
 * 09-quality (or a test) registers its bridge here. Until that happens,
 * `resolveQualityLabBridge()` returns null and Technical POST degrades to 501.
 */
export function registerQualityLabBridge(bridge: QualityLabBridge | null): void {
  registeredBridge = bridge;
}

/**
 * Resolve the Quality write bridge. Returns null in Phase 1 — no Quality lab
 * write service exists, so Technical must not author lab_results rows.
 */
export function resolveQualityLabBridge(): QualityLabBridge | null {
  return registeredBridge;
}

/**
 * Delegate a lab-result write to the Quality bridge if present.
 *
 * - No bridge  → `{ ok: false, error: QUALITY_BRIDGE_MISSING }` (caller maps to
 *   HTTP 501; AC2). Technical writes NOTHING.
 * - Bridge present → forwards the request; Quality re-checks permission and owns
 *   the INSERT, returning the new id on success (AC3).
 */
export async function submitLabResultViaBridge(
  req: QualityLabWriteRequest,
): Promise<
  | { ok: true; labResultId: string }
  | { ok: false; error: QualityBridgeMissingCode | 'forbidden' | 'invalid_input' | 'persistence_failed'; message?: string }
> {
  const bridge = resolveQualityLabBridge();
  if (!bridge) {
    return {
      ok: false,
      error: QUALITY_BRIDGE_MISSING,
      message:
        'lab_results is Quality-owned; no 09-quality write bridge is registered. Technical cannot author lab results.',
    };
  }
  return bridge.submitLabResult(req);
}
