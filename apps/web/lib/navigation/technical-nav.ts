/**
 * 03-technical left sub-nav rail manifest.
 *
 * Structure mirrors the design SSOT `TECH_NAV`
 * (prototypes/design/Monopilot Design System/technical/data.jsx:9). D365 (5
 * screens) is relocated to Settings › Integrations per the 2026-06-05 decision,
 * so it is intentionally absent here. Sensory / Lab results / Compliance /
 * Tooling are real built screens not enumerated in the design's primary nav;
 * they are folded into the nearest design group (decision 2026-06-05).
 *
 * Traceability search, Change control (ECO) and Revision history joined the nav
 * on 2026-06-10: schema (mig 229/230) + reviewed server actions + screens are live.
 *
 * i18n (2026-06-24): group + item copy is now translated via next-intl under the
 * `Navigation.technical` namespace (groups / items), mirroring the settings nav.
 * `label` is retained as the English source-of-truth fallback (and for tests);
 * `i18nKey` is the canonical render path (TechnicalSubNav resolves it).
 */

export type TechnicalNavItem = {
  key: string;
  /** English source-of-truth label (fallback / test reference). */
  label: string;
  /** next-intl key under `Navigation.technical` (e.g. `items.boms`). */
  i18nKey: string;
  route: string;
  icon: string;
};

export type TechnicalNavGroup = {
  id: string;
  /** English source-of-truth label (fallback / test reference). */
  label: string;
  /** next-intl key under `Navigation.technical` (e.g. `groups.products`). */
  i18nKey: string;
  items: TechnicalNavItem[];
};

/** Item-key → i18n key segment (matches the `Navigation.technical.items.*` json). */
function i18nItemKey(key: string): string {
  return `items.${key.replaceAll('-', '_')}`;
}

/** Item factory — derives the `i18nKey` from the stable item `key`. */
function navItem(key: string, label: string, route: string, icon: string): TechnicalNavItem {
  return { key, label, i18nKey: i18nItemKey(key), route, icon };
}

/** Group factory — derives the `i18nKey` from the stable group `id`. */
function navGroup(id: string, label: string, items: TechnicalNavItem[]): TechnicalNavGroup {
  return { id, label, i18nKey: `groups.${id.replaceAll('-', '_')}`, items };
}

export const TECHNICAL_NAV_GROUPS: TechnicalNavGroup[] = [
  navGroup('overview', 'Overview', [navItem('dashboard', 'Dashboard', '/technical', '◇')]),
  navGroup('products', 'Products', [
    navItem('products', 'Products', '/technical/items', '◈'),
    navItem('materials', 'Materials', '/technical/materials', '⬢'),
    navItem('boms', 'BOMs & recipes', '/technical/bom', '▦'),
    navItem('specs', 'Product specifications', '/technical/factory-specs', '☰'),
    navItem('nutrition', 'Nutrition panel', '/technical/nutrition', '♥'),
    navItem('allergens', 'Allergen matrix', '/technical/allergens-config', '!'),
    navItem('shelflife', 'Shelf life', '/technical/shelf-life', '⧗'),
  ]),
  navGroup('cost-trace', 'Cost & trace', [
    navItem('costing', 'Recipe costing', '/technical/cost', '$'),
    navItem('costhist', 'Cost history', '/technical/cost/history', '∿'),
    navItem('traceability', 'Traceability search', '/technical/traceability', '⌕'),
  ]),
  navGroup('process', 'Process', [
    navItem('routings', 'Routings', '/technical/routings', '→'),
    navItem('tooling', 'Tooling', '/technical/tooling', '⚙'),
  ]),
  navGroup('compliance', 'Compliance', [
    navItem('allergen-cascade', 'Allergen cascade', '/technical/allergens/cascade', '⇣'),
    navItem('allergen-process', 'Process additions', '/technical/allergens/process-additions', '⊕'),
    navItem('contamination-risk', 'Contamination risk', '/technical/allergens/contamination-risk', '▦'),
    navItem('sensory', 'Sensory', '/technical/sensory', '◐'),
    navItem('lab-results', 'Lab results', '/technical/lab-results', '🧪'),
    navItem('compliance', 'Compliance', '/technical/compliance', '✅'),
    navItem('eco', 'Change control (ECO)', '/technical/eco', 'Δ'),
    navItem('revisions', 'Revision history', '/technical/revisions', '↺'),
  ]),
];

export function isTechnicalNavItemActive(route: string, currentPath: string): boolean {
  if (currentPath === route) return true;
  // Overview (/technical) must not light up on every subroute — exact match only.
  if (route === '/technical') return false;
  // Recipe costing (/technical/cost) must not light up on Cost history
  // (/technical/cost/history) — keep the deeper route distinct.
  if (route === '/technical/cost') return false;
  if (currentPath.startsWith(`${route}/`)) return true;
  return false;
}
