'use server';

/**
 * `'use server'` boundary for the disassembly-BOM creation action.
 *
 * Client Components must call disassembly server actions through this file, NOT
 * `./disassembly` directly. `./disassembly` is `server-only` and imports `pg`
 * (via `withOrgContext`); a Client Component value-importing from it pulls the
 * server-only implementation + `pg`/`tls` into the client bundle and BREAKS the
 * production build. This thin wrapper keeps the implementation and its types on
 * the server while exposing a callable server-action reference to the client.
 */

import { createDisassemblyBomDraft as createDisassemblyBomDraftImpl } from './disassembly';
import type { CreateDisassemblyBomDraftResult } from './disassembly';

export async function createDisassemblyBomDraft(
  params: unknown,
): Promise<CreateDisassemblyBomDraftResult> {
  return createDisassemblyBomDraftImpl(params);
}
