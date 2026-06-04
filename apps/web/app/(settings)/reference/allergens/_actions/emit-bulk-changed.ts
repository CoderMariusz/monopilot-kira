'use server';

import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../../../../lib/auth/with-org-context';

type BulkChangedKind = 'rm' | 'process';

export type EmitAllergenBulkChangedInput = {
  kind: BulkChangedKind;
  ingredientCodes?: string[];
  processNames?: string[];
  sourceEventId?: string;
};

export type EmitAllergenBulkChangedResult = {
  sourceEventId: string;
  eventType:
    | 'reference.allergens_by_rm.bulk_changed'
    | 'reference.allergens_added_by_process.bulk_changed';
};

export async function emitAllergenBulkChanged(
  input: EmitAllergenBulkChangedInput,
): Promise<EmitAllergenBulkChangedResult> {
  const sourceEventId = input.sourceEventId ?? randomUUID();
  const eventType =
    input.kind === 'process'
      ? 'reference.allergens_added_by_process.bulk_changed'
      : 'reference.allergens_by_rm.bulk_changed';
  const ingredientCodes = normalizeList(input.ingredientCodes);
  const processNames = normalizeList(input.processNames);

  return withOrgContext(async ({ orgId, client }) => {
    await client.query(
      `insert into public.outbox_events (
         org_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload,
         app_version,
         dedup_key
       )
       values ($1::uuid, $2, 'reference', $3, $4::jsonb, 't099-web', $5)
       on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
      [
        orgId,
        eventType,
        sourceEventId,
        JSON.stringify({
          source_event_id: sourceEventId,
          ingredient_codes: ingredientCodes,
          process_names: processNames,
        }),
        `allergen-bulk-changed:${sourceEventId}`,
      ],
    );

    return { sourceEventId, eventType };
  });
}

function normalizeList(values: string[] | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
  ).sort();
}
