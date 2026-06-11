import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

// ============================================================
// Lane C — Scanner WO production flow (consume / output / waste).
// STUB spec: structural guards that do not need a running server or a live
// Bearer session. The interactive RTL coverage lives in the *.test.tsx vitest
// suites; this asserts the route topology so the /scanner URL segment can never
// regress (a bare (scanner)/wos route would collide with the desktop routes —
// that exact mistake broke a build). Promote to live page-drive specs once the
// parallel Codex API lane is wired.
// ============================================================

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'apps/web/app');
const fromAppRoot = (relativePath: string) => path.join(appRoot, relativePath);

const SCANNER = '[locale]/(scanner)/scanner/wos';

test.describe('SCN — WO production flow route topology', () => {
  test('all five WO flow pages live under the required /scanner URL segment', () => {
    for (const rel of [
      `${SCANNER}/page.tsx`,
      `${SCANNER}/[woId]/page.tsx`,
      `${SCANNER}/[woId]/consume/page.tsx`,
      `${SCANNER}/[woId]/output/page.tsx`,
      `${SCANNER}/[woId]/waste/page.tsx`,
    ]) {
      expect(existsSync(fromAppRoot(rel)), `${rel} must exist under (scanner)/scanner/wos`).toBe(true);
    }
  });

  test('the WO flow does NOT leak into the desktop (app) route group', () => {
    // A bare (scanner)/wos OR an (app)/.../scanner/wos would collide — guard both.
    expect(existsSync(fromAppRoot('[locale]/(scanner)/wos')), 'wos must not sit at the (scanner) group root').toBe(false);
    expect(
      existsSync(fromAppRoot('[locale]/(app)/(modules)/production/scanner')),
      'scanner WO flow must not be authored under the desktop (app) group',
    ).toBe(false);
  });

  test('output screen imports the shared uom convert lib (decimal-string contract)', () => {
    const src = readFileSync(fromAppRoot(`${SCANNER}/[woId]/output/_components/output-screen.tsx`), 'utf8');
    expect(src, 'output screen must convert via lib/uom/convert').toMatch(/lib\/uom\/convert/);
    expect(src, 'output screen must POST to the contract output endpoint').toMatch(/scanner\/wos\/\$\{woId\}\/output/);
  });

  test('mutation screens never author API or production server code (Codex-owned)', () => {
    for (const rel of [
      `${SCANNER}/[woId]/consume/_components/consume-screen.tsx`,
      `${SCANNER}/[woId]/output/_components/output-screen.tsx`,
      `${SCANNER}/[woId]/waste/_components/waste-screen.tsx`,
    ]) {
      const src = readFileSync(fromAppRoot(rel), 'utf8');
      expect(src, `${rel} must not import server-only production/scanner libs`).not.toMatch(
        /from ["'][^"']*lib\/(production|scanner)\//,
      );
    }
  });
});
