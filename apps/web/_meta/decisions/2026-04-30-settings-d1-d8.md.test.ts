import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findRepoRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), '../..'), resolve(__dirname, '../../../..')];
  const root = candidates.find((candidate) => existsSync(resolve(candidate, 'docs/prd/02-SETTINGS-PRD.md')));
  expect(root, `Could not locate repo root from cwd=${process.cwd()}`).toBeTruthy();
  return root!;
}

const repoRoot = findRepoRoot();
const decisionDocPath = resolve(repoRoot, '_meta/decisions/2026-04-30-settings-d1-d8.md');
const decisionDocDir = dirname(decisionDocPath);

const expectedDecisions = [
  { id: 'D1', terms: ['10 system roles', '4', 'role_categories'] },
  { id: 'D2', terms: ['flat permission', 'checkbox', 'module_permission_levels'] },
  { id: 'D3', terms: ['SET-001', 'SET-006', 'launcher'] },
  { id: 'D4', terms: ['Sensory'] },
  { id: 'D5', terms: ['Kanban', 'Table', 'Split'] },
  { id: 'D6', terms: ['01NPDg', '01NPDh', '01NPDi'] },
  { id: 'D7', terms: ['WebAuthn', 'Phase 3', 'disabled', 'Coming Phase 3'] },
  { id: 'D8', terms: ['prototype-index-settings.json', 'sites_screen', '14-MULTI-SITE'] },
] as const;

const mistaggedPrototypeMoves = [
  ['sites_screen', '14-MULTI-SITE'],
  ['shifts_screen', '15-OEE'],
  ['devices_screen', '06-SCANNER-P1'],
  ['products_screen', '03-TECHNICAL'],
  ['boms_screen', '03-TECHNICAL'],
  ['partners_screen', '03-TECHNICAL'],
] as const;

function readDecisionDoc(): string {
  expect(existsSync(decisionDocPath), `Missing required decisions log at ${decisionDocPath}`).toBe(true);
  return readFileSync(decisionDocPath, 'utf8');
}

function sectionFor(markdown: string, id: string): string {
  const match = markdown.match(new RegExp(`^#{2,4}\\s+${id}\\b[\\s\\S]*?(?=^#{2,4}\\s+D\\d\\b|$)`, 'm'));
  expect(match?.[0], `Missing markdown section heading for ${id}`).toBeTruthy();
  return match![0];
}

function slugifyHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~:[\]()]/g, '')
    .replace(/§/g, '')
    .replace(/[^a-z0-9\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function anchorsFor(markdown: string): Set<string> {
  const anchors = new Set<string>();
  Array.from(markdown.matchAll(/^#{1,6}\s+(.+)$/gm)).forEach((heading) => {
    anchors.add(slugifyHeading(heading[1]));
  });
  return anchors;
}

describe('settings D1-D8 decisions log', () => {
  it('lists all 8 decisions in one summary table and one section per decision', () => {
    const markdown = readDecisionDoc();

    expect(markdown, 'Expected one markdown summary table with Decision/Rationale/Date/Source columns').toMatch(
      /\|\s*Decision\s*\|[\s\S]*\|\s*Rationale\s*\|[\s\S]*\|\s*Date\s*\|[\s\S]*\|\s*Source/i,
    );

    for (const { id, terms } of expectedDecisions) {
      expect(markdown, `Summary table must include a row for ${id}`).toMatch(new RegExp(`\\|\\s*${id}\\s*\\|`));
      const section = sectionFor(markdown, id);
      expect(section, `${id} must include a date locked to the gap-backlog decision date`).toMatch(/2026-04-30/);
      expect(section, `${id} must include an explicit Decision field`).toMatch(/\bDecision\b/i);
      expect(section, `${id} must include an explicit Rationale field`).toMatch(/\bRationale\b/i);
      expect(section, `${id} must include an explicit Source PRD/section reference`).toMatch(/\bSource\b/i);
      for (const term of terms) {
        expect(section, `${id} section must preserve term: ${term}`).toContain(term);
      }
    }
  });

  it('has local markdown links whose target files and PRD heading anchors resolve', () => {
    const markdown = readDecisionDoc();
    const localLinks = Array.from(markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))
      .map((match) => match[1].trim())
      .filter((href) => !/^(https?:|mailto:)/.test(href));

    expect(localLinks.length, 'Decision log must use resolvable local markdown links for PRD/source references').toBeGreaterThan(0);
    expect(
      localLinks.some((href) => href.includes('docs/prd/02-SETTINGS-PRD.md') && href.includes('#')),
      'At least one source link must target PRD 02-SETTINGS v3.5 with a heading anchor',
    ).toBe(true);

    for (const href of localLinks) {
      const [target, rawAnchor] = href.split('#');
      const targetPath = resolve(decisionDocDir, decodeURIComponent(target || '.'));
      expect(existsSync(targetPath), `Broken local link target: ${href}`).toBe(true);

      if (rawAnchor) {
        const targetMarkdown = readFileSync(targetPath, 'utf8');
        const anchors = anchorsFor(targetMarkdown);
        expect(anchors.has(decodeURIComponent(rawAnchor)), `Broken markdown anchor in link: ${href}`).toBe(true);
      }
    }
  });

  it('documents D8 prototype-index verification and proves the settings index no longer owns moved labels', () => {
    const markdown = readDecisionDoc();
    const d8 = sectionFor(markdown, 'D8');
    expect(d8, 'D8 must cite the prototype index used for verification').toContain('_meta/prototype-labels/prototype-index-settings.json');

    const indexPath = resolve(repoRoot, '_meta/prototype-labels/prototype-index-settings.json');
    expect(existsSync(indexPath), `Missing prototype index at ${indexPath}`).toBe(true);
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { entries?: Array<{ label?: string }> };
    const labels = new Set((index.entries ?? []).map((entry) => entry.label));

    for (const [label, module] of mistaggedPrototypeMoves) {
      expect(d8, `D8 must state ${label} was moved to ${module}`).toContain(label);
      expect(d8, `D8 must state ${label} target module ${module}`).toContain(module);
      expect(labels.has(label), `${label} must not remain in settings prototype index`).toBe(false);
    }
  });
});
