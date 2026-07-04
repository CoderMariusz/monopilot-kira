/**
 * Gate checklist auto-satisfy predicates (W4.2-E MED-3).
 *
 * Maps seeded GateChecklistTemplates item_text values (migration 426) to real
 * project state. Display-only at read time — mirrors the FA-derived closure
 * pattern in get-project.ts (no completed_at write).
 */

export type GateChecklistAutoKind = 'formulation_locked' | 'fg_candidate' | 'ingredients_present';

export type GateChecklistAutoSignals = {
  hasLockedFormulation: boolean;
  hasFgCandidate: boolean;
  ingredientCount: number;
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
  'initial shared bom ready and linked to npd project',
]);

function normalizeItemText(itemText: string): string {
  return itemText.trim().toLowerCase();
}

/**
 * Resolve a checklist row to an auto-satisfy kind. Prefers exact seed text;
 * falls back to conservative substring rules for org-customized copy.
 */
export function matchGateChecklistAutoKind(itemText: string): GateChecklistAutoKind | null {
  const normalized = normalizeItemText(itemText);
  if (!normalized) return null;

  if (FORMULATION_LOCKED_TEXTS.has(normalized)) return 'formulation_locked';
  if (FG_CANDIDATE_TEXTS.has(normalized)) return 'fg_candidate';
  if (INGREDIENTS_PRESENT_TEXTS.has(normalized)) return 'ingredients_present';

  if (normalized.includes('formulation') && normalized.includes('locked')) {
    return 'formulation_locked';
  }
  if (normalized.includes('fg candidate') && normalized.includes('created')) {
    return 'fg_candidate';
  }
  if (
    normalized.includes('ingredient') &&
    (normalized.includes('identified') ||
      normalized.includes('specification') ||
      normalized.includes('shared bom'))
  ) {
    return 'ingredients_present';
  }

  return null;
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
    default:
      return false;
  }
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
