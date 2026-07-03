'use server';

import { acceptWipDefinitionUpdate } from '../../../../(modules)/technical/wip-library/_actions/wip-definition-actions';

export type AcceptWipDefinitionUpdateUiResult =
  | { ok: true; acceptedVersion: number; bomsRegenerated?: boolean }
  | { ok: false; error: string };

export async function acceptWipDefinitionUpdateForProject(input: {
  wipDefinitionId: string;
  projectId: string;
}): Promise<AcceptWipDefinitionUpdateUiResult> {
  const result = await acceptWipDefinitionUpdate({
    wipDefinitionId: input.wipDefinitionId,
    projectId: input.projectId,
  });

  if (!result.ok) {
    return { ok: false, error: 'accept_failed' };
  }

  return {
    ok: true,
    acceptedVersion: result.acceptedVersion,
    ...('bomsRegenerated' in result && result.bomsRegenerated === true
      ? { bomsRegenerated: true as const }
      : {}),
  };
}
