/**
 * Gate checklist auto-satisfy predicates (W4.2-E MED-3).
 *
 * Maps seeded GateChecklistTemplates item_text values (migration 426) to real
 * project state. Display-only at read time — mirrors the FA-derived closure
 * pattern in get-project.ts (no completed_at write).
 */

export type GateChecklistAutoKind =
  | 'formulation_locked'
  | 'fg_candidate'
  | 'ingredients_present'
  | 'linked_bom_ready';

export type GateChecklistAutoSignals = {
  hasLockedFormulation: boolean;
  hasFgCandidate: boolean;
  ingredientCount: number;
  linkedBomCount: number;
};

/** Stable English seed texts from Reference.GateChecklistTemplates (mig 426). */
const FORMULATION_LOCKED_TEXTS = new Set([
  'formulation created and locked',
]);

const FG_CANDIDATE_TEXTS = new Set([
  'fg candidate created or mapped in system',
  'fg candidate created or mapped in system (t-095)',
]);

const INGREDIENTS_PRESENT_TEXTS = new Set([
  'key ingredients identified',
  'detailed ingredient specification',
  'recipe has at least one ingredient',
]);

const LINKED_BOM_READY_TEXTS = new Set([
  'initial shared bom ready and linked to npd project',
]);

function normalizeItemText(itemText: string): string {
  return itemText.trim().toLowerCase();
}

/**
 * Resolve a checklist row to an auto-satisfy kind by EXACT seeded text only.
 *
 * This runs on the gate-authorization path (advance-project-gate.ts), so a match
 * lets a required item pass without an override note. Substring/fuzzy matching is
 * deliberately excluded: a genuinely manual row like "Formulation locked and QA
 * approval recorded" contains "formulation"+"locked" and would be silently
 * auto-satisfied, bypassing the real QA gate. Org-customized copy that isn't an
 * exact seed text stays manual (completed_at required) — the safe default.
 */
export function matchGateChecklistAutoKind(itemText: string): GateChecklistAutoKind | null {
  const normalized = normalizeItemText(itemText);
  if (!normalized) return null;

  if (FORMULATION_LOCKED_TEXTS.has(normalized)) return 'formulation_locked';
  if (FG_CANDIDATE_TEXTS.has(normalized)) return 'fg_candidate';
  if (LINKED_BOM_READY_TEXTS.has(normalized)) return 'linked_bom_ready';
  if (INGREDIENTS_PRESENT_TEXTS.has(normalized)) return 'ingredients_present';

  return null;
}

export function buildGateChecklistAutoSignals(row: {
  product_code: string | null;
  recipe_ingredient_count: number;
  has_locked_formulation: boolean;
  linked_bom_count: number;
}): GateChecklistAutoSignals {
  return {
    hasLockedFormulation: row.has_locked_formulation === true,
    hasFgCandidate: row.product_code !== null && row.product_code.trim() !== '',
    ingredientCount: Number(row.recipe_ingredient_count ?? 0),
    linkedBomCount: Number(row.linked_bom_count ?? 0),
  };
}

export function isGateChecklistAutoSatisfied(
  kind: GateChecklistAutoKind,
  signals: GateChecklistAutoSignals,
): boolean {
  switch (kind) {
    case 'formulation_locked':
      return signals.hasLockedFormulation;
    case 'fg_candidate':
      return signals.hasFgCandidate;
    case 'ingredients_present':
      return signals.ingredientCount >= 1;
    case 'linked_bom_ready':
      return signals.linkedBomCount > 0;
    default:
      return false;
  }
}

/** Single source of truth: manual completion OR live auto-satisfy predicate. */
export function isGateChecklistItemResolved(
  itemText: string,
  completedAt: string | null,
  signals: GateChecklistAutoSignals,
): boolean {
  if (completedAt !== null) return true;
  const kind = matchGateChecklistAutoKind(itemText);
  if (!kind) return false;
  return isGateChecklistAutoSatisfied(kind, signals);
}

export type GateChecklistAutoItem = {
  itemText: string;
  done: boolean;
  completedAt: string | null;
  autoDerived?: boolean;
};

/** Apply auto-satisfy to checklist rows (OR with manual / FA-derived done). */
export function applyGateChecklistAutoSatisfy<T extends GateChecklistAutoItem>(
  items: T[],
  signals: GateChecklistAutoSignals,
): T[] {
  return items.map((item) => {
    const kind = matchGateChecklistAutoKind(item.itemText);
    if (!kind || item.done) return item;
    if (!isGateChecklistAutoSatisfied(kind, signals)) return item;
    // Manual completion already recorded — keep attribution, do not mark auto.
    if (item.completedAt !== null) return { ...item, done: true };
    return { ...item, done: true, autoDerived: true };
  });
}
