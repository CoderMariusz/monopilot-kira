/**
 * Staleness rule (W3 L11 — pinned by execution contract):
 *
 * A referenced WIP definition is STALE iff:
 *   (a) an ack row exists for (definition, project) AND ack.accepted_version < definition.version; OR
 *   (b) NO ack row exists AND there is at least one user_notifications row of type
 *       `wip.definition.updated` whose payload references this definition + project.
 *
 * Plain coalesce(ack, 0) < version is FORBIDDEN — it false-positives on definitions that were
 * already at v>1 when first picked.
 *
 * Known limitation: branch (b) is user-scoped (user_notifications RLS); another user's notification
 * does not surface the banner for the current viewer.
 */

export type WipDefinitionAck = {
  wipDefinitionId: string;
  acceptedVersion: number;
};

export type WipBumpNotification = {
  wipDefinitionId: string;
  projectId: string;
  version: number;
  body?: string | null;
  changes?: unknown;
};

export type ReferencedWipDefinition = {
  wipDefinitionId: string;
  name: string;
  version: number;
};

export type WipLineageRow = ReferencedWipDefinition & {
  supersedesWipDefinitionId: string | null;
};

export type StaleWipDefinitionRow = ReferencedWipDefinition & {
  changesHint: string | null;
};

const MAX_WIP_SUCCESSOR_HOPS = 50;

/** Maps a superseded definition id to its direct clone-on-write successor. */
export function buildWipSuccessorIndex(rows: WipLineageRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    if (row.supersedesWipDefinitionId) {
      index.set(row.supersedesWipDefinitionId, row.wipDefinitionId);
    }
  }
  return index;
}

/**
 * Walk the clone-on-write chain (v2→v3→v4) from a pinned root id.
 * Cycle-safe: revisiting an id stops the walk (PF-R05-01 precedent).
 */
export function resolveWipSuccessorHead(
  rootId: string,
  rowsById: Map<string, WipLineageRow>,
  successorIndex: Map<string, string>,
  maxHops = MAX_WIP_SUCCESSOR_HOPS,
): ReferencedWipDefinition | null {
  const visited = new Set<string>();
  let currentId = rootId;

  for (let hop = 0; hop < maxHops; hop++) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const nextId = successorIndex.get(currentId);
    if (!nextId) break;
    currentId = nextId;
  }

  const head = rowsById.get(currentId);
  if (!head) return null;
  return {
    wipDefinitionId: head.wipDefinitionId,
    name: head.name,
    version: head.version,
  };
}

export function isWipDefinitionSuperseded(input: {
  definition: ReferencedWipDefinition;
  successorHead: ReferencedWipDefinition | null;
}): boolean {
  return (
    input.successorHead !== null &&
    input.successorHead.wipDefinitionId !== input.definition.wipDefinitionId
  );
}

export function isWipDefinitionStale(input: {
  definition: ReferencedWipDefinition;
  ack: WipDefinitionAck | null;
  bumpNotifications: WipBumpNotification[];
  successorHead?: ReferencedWipDefinition | null;
}): boolean {
  const { definition, ack, bumpNotifications, successorHead } = input;

  if (isWipDefinitionSuperseded({ definition, successorHead: successorHead ?? null })) {
    return true;
  }

  if (ack !== null && ack.acceptedVersion < definition.version) {
    return true;
  }

  if (ack === null) {
    return bumpNotifications.some((n) => n.wipDefinitionId === definition.wipDefinitionId);
  }

  return false;
}

export function pickChangesHint(
  definitionId: string,
  bumpNotifications: WipBumpNotification[],
): string | null {
  const matching = bumpNotifications.filter((n) => n.wipDefinitionId === definitionId);
  if (matching.length === 0) return null;

  const newest = matching.reduce((best, current) =>
    current.version >= best.version ? current : best,
  );

  if (typeof newest.changes === 'string' && newest.changes.trim().length > 0) {
    return newest.changes.trim();
  }
  if (newest.body && newest.body.trim().length > 0) {
    return newest.body.trim();
  }
  return null;
}

export function resolveStaleWipDefinitions(input: {
  definitions: ReferencedWipDefinition[];
  acks: WipDefinitionAck[];
  bumpNotifications: WipBumpNotification[];
  projectId: string;
  successorHeads?: Map<string, ReferencedWipDefinition | null>;
}): StaleWipDefinitionRow[] {
  const ackByDef = new Map(input.acks.map((a) => [a.wipDefinitionId, a]));
  const projectNotifications = input.bumpNotifications.filter((n) => n.projectId === input.projectId);

  const stale: StaleWipDefinitionRow[] = [];

  for (const definition of input.definitions) {
    const successorHead = input.successorHeads?.get(definition.wipDefinitionId) ?? null;
    const ack = ackByDef.get(definition.wipDefinitionId) ?? null;
    const defNotifications = projectNotifications.filter(
      (n) =>
        n.wipDefinitionId === definition.wipDefinitionId ||
        (successorHead !== null && n.wipDefinitionId === successorHead.wipDefinitionId),
    );

    if (
      !isWipDefinitionStale({
        definition,
        ack,
        bumpNotifications: defNotifications,
        successorHead,
      })
    ) {
      continue;
    }

    const display = isWipDefinitionSuperseded({ definition, successorHead })
      ? successorHead!
      : definition;

    stale.push({
      wipDefinitionId: definition.wipDefinitionId,
      name: display.name,
      version: display.version,
      changesHint: pickChangesHint(definition.wipDefinitionId, defNotifications),
    });
  }

  return stale;
}
