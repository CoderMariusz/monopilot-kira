export type PlatformActionResult =
  | { ok: true }
  | { ok: false; error: 'invalid_org' | 'forbidden' };
