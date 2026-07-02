import { describe, expect, it } from 'vitest';

import { planCountSessionCreateSite } from '../count-types';

const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('planCountSessionCreateSite (F4 create honesty)', () => {
  it('proceeds when the warehouse site matches the active top-bar site', () => {
    expect(planCountSessionCreateSite(SITE_A, SITE_A)).toEqual({ action: 'proceed' });
  });

  it('plans a site switch when the warehouse belongs to a different site', () => {
    expect(planCountSessionCreateSite(SITE_A, SITE_B)).toEqual({
      action: 'switch_site',
      warehouseSiteId: SITE_B,
    });
  });

  it('plans a site switch from All sites to the warehouse site', () => {
    expect(planCountSessionCreateSite(null, SITE_B)).toEqual({
      action: 'switch_site',
      warehouseSiteId: SITE_B,
    });
  });

  it('blocks when the warehouse has no resolvable site', () => {
    expect(planCountSessionCreateSite(SITE_A, null)).toEqual({
      action: 'blocked',
      reason: 'warehouse_site_required',
    });
  });
});
