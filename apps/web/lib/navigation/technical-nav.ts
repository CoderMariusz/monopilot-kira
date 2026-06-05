/**
 * 03-technical left sub-nav rail manifest.
 *
 * Mirrors the Settings sub-nav pattern (lib/navigation/settings-nav.ts) — the
 * design system (01-DESIGN-SPEC §5) calls for a left sub-nav rail on modules
 * with many sections, naming Technical (Overview / Products / BOMs…) explicitly.
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
    id: 'master-data',
    label: 'Master data',
    items: [
      { key: 'overview', label: 'Overview', route: '/technical', icon: '🏠' },
      { key: 'items', label: 'Items', route: '/technical/items', icon: '📦' },
      { key: 'boms', label: 'BOMs', route: '/technical/bom', icon: '🧾' },
      { key: 'routings', label: 'Routings', route: '/technical/routings', icon: '🛠' },
    ],
  },
  {
    id: 'quality-allergens',
    label: 'Quality & allergens',
    items: [
      { key: 'allergens', label: 'Allergens', route: '/technical/allergens-config', icon: '⚠️' },
      { key: 'sensory', label: 'Sensory', route: '/technical/sensory', icon: '👅' },
      { key: 'compliance', label: 'Compliance', route: '/technical/compliance', icon: '✅' },
      { key: 'lab-results', label: 'Lab results', route: '/technical/lab-results', icon: '🧪' },
      { key: 'shelf-life', label: 'Shelf life', route: '/technical/shelf-life', icon: '⏳' },
    ],
  },
  {
    id: 'cost-specs',
    label: 'Cost & specs',
    items: [
      { key: 'cost', label: 'Cost', route: '/technical/cost', icon: '💰' },
      { key: 'factory-specs', label: 'Factory specs', route: '/technical/factory-specs', icon: '📋' },
      { key: 'tooling', label: 'Tooling', route: '/technical/tooling', icon: '🔧' },
    ],
  },
];

export function isTechnicalNavItemActive(route: string, currentPath: string): boolean {
  if (currentPath === route) return true;
  // Overview (/technical) must not light up on every subroute — exact match only.
  if (route !== '/technical' && currentPath.startsWith(`${route}/`)) return true;
  return false;
}
