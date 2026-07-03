import { describe, expect, it } from 'vitest';

import {
  isWipDefinitionStale,
  pickChangesHint,
  resolveStaleWipDefinitions,
  type ReferencedWipDefinition,
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
});
