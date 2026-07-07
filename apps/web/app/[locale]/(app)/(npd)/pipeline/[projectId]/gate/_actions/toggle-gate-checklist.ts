'use server';

import { toggleGateChecklistItem as toggleGateChecklistItemAction } from '../../../../../../../(npd)/pipeline/_actions/toggle-gate-checklist-item';

/** Gate-screen adapter: maps checklist panel `done` to backend `completed`. */
export async function toggleGateChecklistAdapter(input: {
  projectId: string;
  itemId: string;
  done: boolean;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const result = await toggleGateChecklistItemAction({
    projectId: input.projectId,
    itemId: input.itemId,
    completed: input.done,
  });
  return result.ok ? { ok: true as const } : { ok: false as const, code: result.code };
}
