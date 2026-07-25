import { describe, expect, it } from 'vitest';

import {
  buildWipSuccessorIndex,
  isWipDefinitionStale,
  pickChangesHint,
  resolveStaleWipDefinitions,
  resolveWipSuccessorHead,
  type ReferencedWipDefinition,
  type WipLineageRow,
} from '../stale-wip-definition';

const DEF_A: ReferencedWipDefinition = {
  wipDefinitionId: 'def-a',
  name: 'Sauce base',
  version: 3,
};

describe('isWipDefinitionStale', () => {
  it('is stale when ack exists and accepted_version < definition.version', () => {
    expect(
      isWipDefinitionStale({
        definition: DEF_A,
        ack: { wipDefinitionId: 'def-a', acceptedVersion: 2 },
        bumpNotifications: [],
      }),
    ).toBe(true);
  });

  it('is not stale when ack exists and accepted_version >= definition.version', () => {
    expect(
      isWipDefinitionStale({
        definition: DEF_A,
        ack: { wipDefinitionId: 'def-a', acceptedVersion: 3 },
        bumpNotifications: [{ wipDefinitionId: 'def-a', projectId: 'proj-1', version: 3 }],
      }),
    ).toBe(false);
  });

  it('is stale when no ack and a bump notification exists (branch b)', () => {
    expect(
      isWipDefinitionStale({
        definition: DEF_A,
        ack: null,
        bumpNotifications: [{ wipDefinitionId: 'def-a', projectId: 'proj-1', version: 3 }],
      }),
    ).toBe(true);
  });

  it('is not stale when no ack and no bump notification (avoids coalesce false positive)', () => {
    expect(
      isWipDefinitionStale({
        definition: { ...DEF_A, version: 5 },
        ack: null,
        bumpNotifications: [],
      }),
    ).toBe(false);
  });
});

describe('pickChangesHint', () => {
  it('prefers payload changes over body', () => {
    expect(
      pickChangesHint('def-a', [
        {
          wipDefinitionId: 'def-a',
          projectId: 'proj-1',
          version: 2,
          changes: 'Yield adjusted',
          body: 'Body text',
        },
      ]),
    ).toBe('Yield adjusted');
  });
});

describe('resolveStaleWipDefinitions', () => {
  it('returns multiple stale rows scoped to the project', () => {
    const rows = resolveStaleWipDefinitions({
      projectId: 'proj-1',
      definitions: [
        DEF_A,
        { wipDefinitionId: 'def-b', name: 'Filling', version: 2 },
      ],
      acks: [{ wipDefinitionId: 'def-b', acceptedVersion: 2 }],
      bumpNotifications: [
        { wipDefinitionId: 'def-a', projectId: 'proj-1', version: 3, changes: 'Composition changed' },
        { wipDefinitionId: 'def-b', projectId: 'proj-2', version: 3 },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.wipDefinitionId).toBe('def-a');
    expect(rows[0]?.changesHint).toBe('Composition changed');
  });

  it('flags a pinned v2 as stale when v3 supersedes it (clone-on-write)', () => {
    const v2: ReferencedWipDefinition = { wipDefinitionId: 'def-v2', name: 'Sauce', version: 2 };
    const v3: ReferencedWipDefinition = { wipDefinitionId: 'def-v3', name: 'Sauce', version: 3 };
    const rows = resolveStaleWipDefinitions({
      projectId: 'proj-1',
      definitions: [v2],
      acks: [],
      bumpNotifications: [],
      successorHeads: new Map([['def-v2', v3]]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.wipDefinitionId).toBe('def-v2');
    expect(rows[0]?.version).toBe(3);
  });

  it('does not flag a project already pinned to the active head version', () => {
    const v4: ReferencedWipDefinition = { wipDefinitionId: 'def-v4', name: 'Sauce', version: 4 };
    const rows = resolveStaleWipDefinitions({
      projectId: 'proj-1',
      definitions: [v4],
      acks: [],
      bumpNotifications: [],
      successorHeads: new Map([['def-v4', v4]]),
    });

    expect(rows).toHaveLength(0);
  });
});

describe('resolveWipSuccessorHead', () => {
  const lineage: WipLineageRow[] = [
    { wipDefinitionId: 'def-v2', name: 'Sauce', version: 2, supersedesWipDefinitionId: null },
    { wipDefinitionId: 'def-v3', name: 'Sauce', version: 3, supersedesWipDefinitionId: 'def-v2' },
    { wipDefinitionId: 'def-v4', name: 'Sauce', version: 4, supersedesWipDefinitionId: 'def-v3' },
  ];

  it('walks v2→v3→v4 and returns v4 as the chain head', () => {
    const rowsById = new Map(lineage.map((row) => [row.wipDefinitionId, row]));
    const successorIndex = buildWipSuccessorIndex(lineage);
    const head = resolveWipSuccessorHead('def-v2', rowsById, successorIndex);
    expect(head).toEqual({ wipDefinitionId: 'def-v4', name: 'Sauce', version: 4 });
  });

  it('terminates on a cyclic v2→v3→v2 chain without looping', () => {
    const cyclic: WipLineageRow[] = [
      { wipDefinitionId: 'def-v2', name: 'Sauce', version: 2, supersedesWipDefinitionId: 'def-v3' },
      { wipDefinitionId: 'def-v3', name: 'Sauce', version: 3, supersedesWipDefinitionId: 'def-v2' },
    ];
    const rowsById = new Map(cyclic.map((row) => [row.wipDefinitionId, row]));
    const successorIndex = buildWipSuccessorIndex(cyclic);
    const head = resolveWipSuccessorHead('def-v2', rowsById, successorIndex);
    // ponytail: on a cycle the walk stops and reports the ROOT, so head === pinned id
    // and the caller raises no staleness. That is deliberate: with corrupt lineage any
    // "active successor" we named would be a guess, and the user could accept the wrong
    // recipe version off the banner. Terminating without a false claim is the contract.
    expect(head?.wipDefinitionId).toBe('def-v2');
  });
});
