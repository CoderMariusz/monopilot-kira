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

export type StaleWipDefinitionRow = ReferencedWipDefinition & {
  changesHint: string | null;
};

export function isWipDefinitionStale(input: {
  definition: ReferencedWipDefinition;
  ack: WipDefinitionAck | null;
  bumpNotifications: WipBumpNotification[];
}): boolean {
  const { definition, ack, bumpNotifications } = input;

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
}): StaleWipDefinitionRow[] {
  const ackByDef = new Map(input.acks.map((a) => [a.wipDefinitionId, a]));
  const projectNotifications = input.bumpNotifications.filter((n) => n.projectId === input.projectId);

  const stale: StaleWipDefinitionRow[] = [];

  for (const definition of input.definitions) {
    const ack = ackByDef.get(definition.wipDefinitionId) ?? null;
    const defNotifications = projectNotifications.filter(
      (n) => n.wipDefinitionId === definition.wipDefinitionId,
    );

    if (
      !isWipDefinitionStale({
        definition,
        ack,
        bumpNotifications: defNotifications,
      })
    ) {
      continue;
    }

    stale.push({
      ...definition,
      changesHint: pickChangesHint(definition.wipDefinitionId, defNotifications),
    });
  }

  return stale;
}
