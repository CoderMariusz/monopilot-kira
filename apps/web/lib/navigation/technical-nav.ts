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
 * Desktop copy is short operational English per the design's copy rule, so these
 * labels are rendered directly (no per-item i18n namespace yet).
 */

export type TechnicalNavItem = {
  key: string;
  label: string;
  route: string;
  icon: string;
};

export type TechnicalNavGroup = {
  id: string;
  label: string;
  items: TechnicalNavItem[];
};

export const TECHNICAL_NAV_GROUPS: TechnicalNavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', route: '/technical', icon: '◇' }],
  },
  {
    id: 'products',
    label: 'Products',
    items: [
      { key: 'products', label: 'Products', route: '/technical/items', icon: '◈' },
      { key: 'materials', label: 'Materials', route: '/technical/materials', icon: '⬢' },
      { key: 'boms', label: 'BOMs & recipes', route: '/technical/bom', icon: '▦' },
      { key: 'specs', label: 'Product specifications', route: '/technical/factory-specs', icon: '☰' },
      { key: 'nutrition', label: 'Nutrition panel', route: '/technical/nutrition', icon: '♥' },
      { key: 'allergens', label: 'Allergen matrix', route: '/technical/allergens-config', icon: '!' },
      { key: 'shelflife', label: 'Shelf life', route: '/technical/shelf-life', icon: '⧗' },
    ],
  },
  {
    id: 'cost-trace',
    label: 'Cost & trace',
    items: [
      { key: 'costing', label: 'Recipe costing', route: '/technical/cost', icon: '$' },
      { key: 'costhist', label: 'Cost history', route: '/technical/cost/history', icon: '∿' },
      { key: 'traceability', label: 'Traceability search', route: '/technical/traceability', icon: '⌕' },
    ],
  },
  {
    id: 'process',
    label: 'Process',
    items: [
      { key: 'routings', label: 'Routings', route: '/technical/routings', icon: '→' },
      { key: 'tooling', label: 'Tooling', route: '/technical/tooling', icon: '⚙' },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      { key: 'allergen-cascade', label: 'Allergen cascade', route: '/technical/allergens/cascade', icon: '⇣' },
      { key: 'allergen-process', label: 'Process additions', route: '/technical/allergens/process-additions', icon: '⊕' },
      { key: 'contamination-risk', label: 'Contamination risk', route: '/technical/allergens/contamination-risk', icon: '▦' },
      { key: 'sensory', label: 'Sensory', route: '/technical/sensory', icon: '◐' },
      { key: 'lab-results', label: 'Lab results', route: '/technical/lab-results', icon: '🧪' },
      { key: 'compliance', label: 'Compliance', route: '/technical/compliance', icon: '✅' },
      { key: 'eco', label: 'Change control (ECO)', route: '/technical/eco', icon: 'Δ' },
      { key: 'revisions', label: 'Revision history', route: '/technical/revisions', icon: '↺' },
    ],
  },
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
