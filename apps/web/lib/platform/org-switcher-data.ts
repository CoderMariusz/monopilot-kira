/**
 * Topbar org-switcher data resolver for a platform admin.
 *
 * Returns null for a non-platform-admin (so the topbar renders the normal site
 * switcher / crumb only). For a platform admin it returns the home org, the
 * other orgs they may act as, and the currently-bound org (home when not acting
 * as, else the act-as target read from the mp_platform_org cookie).
 *
 * Owner-pool reads (lib/platform is fence-allowed) via listOrganizationsForPlatform,
 * which is itself assertPlatformAdmin-guarded. If the user is not a platform
 * admin, the guard throws and we return null.
 */

import { isPlatformAdmin, readPlatformOrgCookie } from "./platform-context";
import { listOrganizationsForPlatform, type PlatformOrganization } from "./queries";
import { resolvePlatformActorHomeOrgId } from "./actor-home-org";

export type PlatformSwitcherOrg = {
  id: string;
  code: string;
  name: string;
  industry: string | null;
  siteCount: number;
};

export type PlatformSwitcherData = {
  homeOrg: PlatformSwitcherOrg;
  actAsOrgs: PlatformSwitcherOrg[];
  currentOrg: PlatformSwitcherOrg;
  isActingAs: boolean;
};

function toSwitcherOrg(o: PlatformOrganization): PlatformSwitcherOrg {
  return { id: o.id, code: o.code, name: o.name, industry: o.industry, siteCount: o.siteCount };
}

export async function getPlatformSwitcherData(): Promise<PlatformSwitcherData | null> {
  if (!(await isPlatformAdmin())) return null;

  const [orgs, homeOrgId, actAsCookieOrgId] = await Promise.all([
    listOrganizationsForPlatform(),
    resolvePlatformActorHomeOrgId(),
    readPlatformOrgCookie(),
  ]);

  if (orgs.length === 0 || !homeOrgId) return null;

  const home = orgs.find((o) => o.id === homeOrgId);
  if (!home) return null;

  const actAsOrgs = orgs.filter((o) => o.id !== homeOrgId).map(toSwitcherOrg);
  const homeOrg = toSwitcherOrg(home);

  const isActingAs = Boolean(actAsCookieOrgId && actAsCookieOrgId !== homeOrgId);
  const target = isActingAs ? orgs.find((o) => o.id === actAsCookieOrgId) : undefined;
  const currentOrg = target ? toSwitcherOrg(target) : homeOrg;

  return {
    homeOrg,
    actAsOrgs,
    currentOrg,
    isActingAs: isActingAs && Boolean(target),
  };
}
