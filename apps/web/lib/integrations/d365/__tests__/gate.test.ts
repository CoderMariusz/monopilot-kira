/**
 * T-030 — D365 gate + health (assertD365Enabled, V-TEC-70 / V-SET-42).
 *
 * Real-DB integration. Skipped when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertD365Enabled,
  D365DisabledError,
  findMissingD365Constants,
  isD365Enabled,
} from '../gate';
import { makeHarness, enableD365Flag, seedD365Constants, type Harness } from './helpers';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('T-030 D365 gate (assertD365Enabled)', () => {
  let h: Harness;

  beforeAll(() => {
    h = makeHarness();
  });

  afterAll(async () => {
    await h.cleanup();
  });

  it('AC1: throws V-TEC-70 Disabled when integration.d365.enabled=false', async () => {
    const org = await h.createOrg();
    await enableD365Flag(h.owner, org.orgId, false);
    await seedD365Constants(h.owner, org.orgId);

    await org.runAsApp(async (client) => {
      expect(await isD365Enabled(client)).toBe(false);
      await expect(assertD365Enabled(client)).rejects.toMatchObject({
        name: 'D365DisabledError',
        code: 'V-TEC-70',
      });
    });
  });

  it('AC2: throws V-SET-42 when any of the 5 Apex constants is empty (flag on)', async () => {
    const org = await h.createOrg();
    await enableD365Flag(h.owner, org.orgId, true);
    // All required constants set EXCEPT the consumption warehouse.
    await seedD365Constants(h.owner, org.orgId, { CONSUMPTIONWAREHOUSEID: '' });

    await org.runAsApp(async (client) => {
      const missing = await findMissingD365Constants(client);
      expect(missing).toContain('CONSUMPTIONWAREHOUSEID');

      try {
        await assertD365Enabled(client);
        throw new Error('expected assertD365Enabled to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(D365DisabledError);
        expect((err as D365DisabledError).code).toBe('V-SET-42');
        expect((err as D365DisabledError).missingConstants).toContain('CONSUMPTIONWAREHOUSEID');
      }
    });
  });

  it('AC3: passes when flag on AND all 5 constants present (family prefixes count)', async () => {
    const org = await h.createOrg();
    await enableD365Flag(h.owner, org.orgId, true);
    // PRODUCTGROUPID + COSTINGOPERATIONRESOURCEID satisfied by the _FG / _DEFAULT family keys.
    await seedD365Constants(h.owner, org.orgId);

    await org.runAsApp(async (client) => {
      expect(await isD365Enabled(client)).toBe(true);
      expect(await findMissingD365Constants(client)).toEqual([]);
      await expect(assertD365Enabled(client)).resolves.toBeUndefined();
    });
  });
});
