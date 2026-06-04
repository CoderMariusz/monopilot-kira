/**
 * T-028 / T-029 — runtime D365 HTTP client factories.
 *
 * R15 anti-corruption adapter, export/import only. The live credentials are
 * sourced from the runtime D365 connection env (mirrors the settings
 * `testRuntimeD365Connection` path). When the connection is not configured the
 * factories return a client whose calls fail gracefully (push → error result;
 * pull → empty) so the workers never throw on a misconfigured org and never call
 * a live D365 in tests (tests inject their own mock client).
 *
 * D365-owned fields (release/factory state, customer billing, GL chart) are
 * NEVER part of the outbound payload — the WO-confirmation payload is a
 * production journal only.
 */

import type { D365PushClient, D365PushResponse, WoConfirmationPayload } from './push';
import type { D365IncomingItem, D365PullClient } from './pull';

export type D365RuntimeConfig = {
  baseUrl: string;
  oauthBearer: string;
};

/** Resolve the runtime D365 connection config from env, or null if unset. */
export function readD365RuntimeConfig(): D365RuntimeConfig | null {
  const baseUrl = process.env.D365_BASE_URL ?? process.env.NEXT_PUBLIC_D365_BASE_URL;
  const oauthBearer = process.env.D365_OAUTH_BEARER;
  if (!baseUrl || !oauthBearer) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), oauthBearer };
}

/**
 * Build a live push client. If the runtime config is missing, returns a client
 * that yields a deterministic error result (so the worker DLQs rather than
 * throws). Never throws synchronously.
 */
export function makeD365PushClient(config: D365RuntimeConfig | null = readD365RuntimeConfig()): D365PushClient {
  return {
    async submitWoConfirmation(
      payload: WoConfirmationPayload,
      idempotencyKey: string,
    ): Promise<D365PushResponse> {
      if (!config) {
        return { status: 'error', httpStatus: 0, message: 'D365 connection not configured' };
      }
      try {
        const res = await fetch(
          `${config.baseUrl}/api/services/ProductionJournalService/SubmitJournal`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.oauthBearer}`,
              'content-type': 'application/json',
              'x-idempotency-key': idempotencyKey,
            },
            body: JSON.stringify(payload),
          },
        );
        if (res.status === 409) return { status: 'conflict' };
        if (res.ok) return { status: 'ok' };
        return { status: 'error', httpStatus: res.status, message: `D365 responded ${res.status}` };
      } catch (err) {
        return { status: 'error', httpStatus: 0, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/**
 * Build a live pull client. If the runtime config is missing, returns a client
 * that yields no records (the job completes with records_processed=0 rather than
 * failing). A real implementation maps the D365 Data Entity `/data/Products`
 * response onto `D365IncomingItem`; that mapping is intentionally minimal here
 * and exercised by the injected mock in tests.
 */
export function makeD365PullClient(config: D365RuntimeConfig | null = readD365RuntimeConfig()): D365PullClient {
  return {
    async fetchItems(sinceIso: string | null): Promise<D365IncomingItem[]> {
      if (!config) return [];
      const filter = sinceIso ? `?$filter=ModifiedDateTime gt ${encodeURIComponent(sinceIso)}` : '';
      const res = await fetch(`${config.baseUrl}/data/Products${filter}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${config.oauthBearer}` },
      });
      if (!res.ok) {
        throw new Error(`D365 pull /data/Products responded ${res.status}`);
      }
      const body = (await res.json()) as { value?: unknown[] };
      const records = Array.isArray(body.value) ? body.value : [];
      return records.map(mapIncomingItem).filter((r): r is D365IncomingItem => r !== null);
    },
  };
}

/** Map a raw D365 product entity onto the local mirror subset. */
function mapIncomingItem(raw: unknown): D365IncomingItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const d365ItemId = typeof r.ItemId === 'string' ? r.ItemId : null;
  const itemCode = typeof r.ItemId === 'string' ? r.ItemId : null;
  const name = typeof r.ProductName === 'string' ? r.ProductName : itemCode;
  if (!d365ItemId || !itemCode || !name) return null;
  const itemType = mapItemType(r.ProductType);
  return {
    d365_item_id: d365ItemId,
    item_code: itemCode,
    name,
    item_type: itemType,
    modified_at: typeof r.ModifiedDateTime === 'string' ? r.ModifiedDateTime : new Date().toISOString(),
  };
}

function mapItemType(raw: unknown): D365IncomingItem['item_type'] {
  // Conservative default: D365 products import as raw materials unless explicitly
  // typed. Local Technical ownership reclassifies as needed (drift-protected).
  if (raw === 'Service' || raw === 'BOM') return 'fg';
  return 'rm';
}
