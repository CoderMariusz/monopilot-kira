/**
 * PF-R05-09 — WIP-definition lifecycle writes must revalidate the routes they
 * invalidate.
 *
 * A successful archive left the detail page in an active/editable state: the
 * mutation never called revalidatePath, so a cached RSC payload kept replaying
 * the pre-archive page (Draft badge, live "reusable" switch, live Archive
 * button) until a full navigation. These tests pin the revalidation at the
 * shared mutation path, for archive AND for the other lifecycle write that
 * shares it (save / reusable toggle).
 *
 * DEPTH GUARD (lesson from an earlier wave, where a mock pointing one directory
 * too shallow made *working* revalidation look absent): the only module stubbed
 * on the revalidation path is the BARE specifier `next/cache` — it has no
 * relative depth to get wrong. `_actions/revalidate.ts`,
 * `lib/i18n/revalidate-localized` and `i18n/routing` all execute for real, so
 * the assertions below are against the real localized URLs the app serves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routing } from '../../../../../../../../i18n/routing';

const { queryMock, revalidatePath } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
  hasAnyPermission: vi.fn(async () => true),
}));

import {
  archiveWipDefinition,
  publishWipDefinitionFromComponent,
  saveWipDefinition,
} from '../wip-definition-actions';

const definitionId = '33333333-3333-4333-8333-333333333333';
const itemId = '44444444-4444-4444-8444-444444444444';
const prodDetailId = '55555555-5555-4555-8555-555555555555';

const LIST_PATH = '/technical/wip-library';
const DETAIL_PATH = `${LIST_PATH}/${definitionId}`;

/** Every path revalidatePath was called with (locale prefix included). */
function revalidatedPaths(): string[] {
  return revalidatePath.mock.calls.map((call) => String(call[0]));
}

function localized(path: string): string[] {
  return routing.locales.map((locale) => `/${locale}${path}`);
}

beforeEach(() => {
  revalidatePath.mockClear();
  queryMock.mockReset();
});

afterEach(() => {
  queryMock.mockReset();
});

describe('archiveWipDefinition revalidation (PF-R05-09)', () => {
  it('revalidates the definition detail route AND the library list in every locale', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/count\(distinct f\.project_id\)/i.test(text)) return { rows: [{ count: '0' }], rowCount: 1 };
      if (/update public\.wip_definitions/i.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await archiveWipDefinition({ id: definitionId });
    expect(result.ok).toBe(true);

    const paths = revalidatedPaths();
    // The detail route is the one the user is standing on — it MUST be dropped.
    for (const path of localized(DETAIL_PATH)) expect(paths).toContain(path);
    for (const path of localized(LIST_PATH)) expect(paths).toContain(path);
  });

  it('does not revalidate when the archive did not happen (assertion is not vacuous)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      // Referenced by a live project → the action refuses to archive.
      if (/count\(distinct f\.project_id\)/i.test(text)) return { rows: [{ count: '2' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await archiveWipDefinition({ id: definitionId });
    expect(result.ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('saveWipDefinition revalidation (PF-R05-09 sibling mutation)', () => {
  it('revalidates the detail route after a draft/reusable write', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable/i.test(text)) {
        return {
          rows: [
            {
              id: definitionId,
              item_id: itemId,
              version: 1,
              status: 'draft',
              name: 'Sauce base',
              description: null,
              base_uom: 'kg',
              yield_pct: '100.000',
              reusable: false,
              source_project_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (/update public\.wip_definitions/i.test(text)) {
        return { rows: [{ id: definitionId, version: 2 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await saveWipDefinition({
      id: definitionId,
      name: 'Sauce base',
      description: null,
      baseUom: 'kg',
      yieldPct: 100,
      // The reusable toggle flips draft → active server-side: same stale-controls
      // class of bug as archive, so it routes through the same revalidation.
      reusable: true,
      ingredients: [],
      processes: [],
    });
    expect(result.ok).toBe(true);

    const paths = revalidatedPaths();
    for (const path of localized(DETAIL_PATH)) expect(paths).toContain(path);
    for (const path of localized(LIST_PATH)) expect(paths).toContain(path);
  });
});

describe('publishWipDefinitionFromComponent revalidation (PF-R05-09 third mutation)', () => {
  /** No sequence row for `wip` → the action falls back to a derived WIP-… code. */
  function mockPublishQueries(alreadyPublishedId?: string) {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from public\.prod_detail/i.test(text)) {
        return { rows: [{ project_id: null, output_uom: 'kg' }], rowCount: 1 };
      }
      if (/select wip_definition_id::text/i.test(text)) {
        return alreadyPublishedId
          ? { rows: [{ wip_definition_id: alreadyPublishedId }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/insert into public\.items/i.test(text)) return { rows: [{ id: itemId }], rowCount: 1 };
      if (/insert into public\.wip_definitions\b/i.test(text)) {
        return { rows: [{ id: definitionId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
  }

  it('revalidates the new definition detail route AND the library list in every locale', async () => {
    mockPublishQueries();

    const result = await publishWipDefinitionFromComponent({ prodDetailId, name: 'Sauce base' });
    expect(result).toMatchObject({ ok: true, id: definitionId });

    const paths = revalidatedPaths();
    for (const path of localized(DETAIL_PATH)) expect(paths).toContain(path);
    for (const path of localized(LIST_PATH)) expect(paths).toContain(path);
  });

  it('does not revalidate on the idempotent re-submit (assertion is not vacuous)', async () => {
    // Component already published → the action returns the existing definition
    // without writing anything, so there is nothing to invalidate.
    mockPublishQueries(definitionId);

    const result = await publishWipDefinitionFromComponent({ prodDetailId, name: 'Sauce base' });
    expect(result).toMatchObject({ ok: true, id: definitionId });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
