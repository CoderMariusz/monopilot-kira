export type RevertToNpdInput = {
  projectId: string;
  reason: string;
};

export type RevertToNpdError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'not_release_locked'
  | 'active_work_orders'
  | 'persistence_failed';

export type RevertToNpdResult =
  | { ok: true; data: { projectId: string; factorySpecRecalled: boolean } }
  | { ok: false; error: RevertToNpdError; message?: string };
