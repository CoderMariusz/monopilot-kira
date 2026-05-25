import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'apps/web/app');
const locationsDir = path.join(appRoot, '[locale]/(app)/(admin)/settings/infra/locations');
const pagePath = path.join(locationsDir, 'page.tsx');
const clientPath = path.join(locationsDir, 'location-tree-client.tsx');

test.describe('UI-SET-002 locations modal CRUD parity contract', () => {
  test('server page delegates interactivity to a leaf client component with prototype modal CRUD wiring', () => {
    expect(existsSync(pagePath), 'localized settings infra locations page must exist').toBe(true);
    expect(existsSync(clientPath), 'locations client island must exist').toBe(true);
    const pageSource = readFileSync(pagePath, 'utf8');
    const clientSource = readFileSync(clientPath, 'utf8');
    const firstStatement = pageSource.trimStart().slice(0, 32);

    expect(firstStatement, 'page.tsx must not become a Client Component').not.toContain('use client');
    expect(pageSource, 'page.tsx must not use React state/effect hooks inside the Server Component').not.toMatch(/React\.use(State|Effect|Memo|Callback|Reducer)/);
    expect(pageSource, 'page must import the real infra location Server Action').toContain('actions/infra/location');
    expect(pageSource, 'server page must mount the leaf client component').toContain('LocationTreeScreen');
    expect(clientSource.trimStart().startsWith("'use client'"), 'interactive island must be the only Client Component').toBe(true);
    expect(clientSource, 'primary CTA must open the Add location dialog').toContain("openDialog('add')");
    expect(clientSource, 'Edit flow must be wired to the dialog').toContain("openDialog('edit'");
    expect(clientSource, 'Child flow must be wired to the dialog').toContain("openDialog('child'");
    expect(clientSource, 'dialog must expose the prototype-required Code field').toContain('id="location-code"');
    expect(clientSource, 'dialog must expose the prototype-required Name field').toContain('id="location-name"');
    expect(clientSource, 'dialog must expose the prototype-required Parent location field').toContain('id="location-parent"');
    expect(clientSource, 'dialog must expose the prototype-required Type field').toContain('id="location-type"');
    expect(clientSource, 'dialog must expose the prototype-required Active checkbox').toContain('id="location-active"');
    expect(clientSource, 'dialog must expose the prototype-required Barcode field').toContain('id="location-barcode"');
    expect(clientSource, 'depth validator must prevent over-depth children').toContain('depthExceeded');
    expect(pageSource, 'read-only state must mention settings.infra.update').toContain('settings.infra.update');
  });
});
