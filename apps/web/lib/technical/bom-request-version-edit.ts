/**
 * Canonical BOM clone-on-write helper — wraps DB `bom_request_version_edit` (mig 168).
 *
 * Plain module (not 'use server'): shared by create-draft and request-version-edit actions.
 */

import type { QueryClient } from '../../app/[locale]/(app)/(modules)/technical/bom/_actions/shared';

export type BomVersionEditRow = {
  decision: string;
  bom_header_id: string;
  status: string;
  version: number;
  supersedes_bom_header_id: string;
};

export async function callBomRequestVersionEdit(
  client: QueryClient,
  params: { sourceBomHeaderId: string; requestedBy: string; notes?: string | null },
): Promise<BomVersionEditRow | null> {
  const { rows } = await client.query<BomVersionEditRow>(
    `select decision,
            bom_header_id,
            status,
            version,
            supersedes_bom_header_id
       from public.bom_request_version_edit($1::uuid, $2::uuid, $3)`,
    [params.sourceBomHeaderId, params.requestedBy, params.notes ?? null],
  );
  return rows[0] ?? null;
}
