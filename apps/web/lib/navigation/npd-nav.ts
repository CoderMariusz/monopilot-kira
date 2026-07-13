/**
 * 01-npd top sub-navigation manifest.
 *
 * Structure mirrors the design SSOT `SubNav`
 * (prototypes/design/Monopilot Design System/npd/chrome.jsx:76-121): a horizontal
 * tab bar with flat tabs (Projects / Formulations / Allergen cascade / …).
 *
 * Labels are FG-facing: "FG is canonical, FA is only a legacy alias" (NPD domain
 * rule). The prototype's "Modal gallery" tab is intentionally excluded (product-owner
 * decision, out of scope).
 *
 * Labels are i18n'd via the `Navigation.npd` namespace (all four locales).
 *
 * Formulations and Allergen cascade routes are not built yet (later waves); the
 * links exist now so the shell is complete and stable across the module.
 *
 * The standalone Briefs UI has been removed (briefs are now folded into project
 * create-wizard and project detail). C7b removed the Apex group (FG Dashboard /
 * Finished Goods) — those routes redirect to the pipeline.
 */

export type NpdNavItem = {
  key: string;
  /** i18n key (relative to the `Navigation.npd` namespace). */
  i18nKey: string;
  route: string;
};

export type NpdNavTopTab = NpdNavItem & {
  /** Extra routes that should also mark this tab active. */
  matchPrefixes?: string[];
};

/** Flat tabs rendered in order. */
export const NPD_NAV_TOP_TABS: NpdNavTopTab[] = [
  { key: "projects", i18nKey: "tabs.projects", route: "/pipeline" },
  { key: "formulations", i18nKey: "tabs.formulations", route: "/formulations" },
  { key: "allergenCascade", i18nKey: "tabs.allergenCascade", route: "/allergen-cascade" },
  { key: "costingRollup", i18nKey: "tabs.costingRollup", route: "/costing/rollup" },
  { key: "workload", i18nKey: "tabs.workload", route: "/pipeline/workload" },
];

/**
 * Whether a tab/item route is active for the current locale-relative path.
 * A tab is active when the path equals its route or is nested under it.
 */
export function isNpdNavItemActive(route: string, currentPath: string): boolean {
  if (currentPath === route) return true;
  if (currentPath.startsWith(`${route}/`)) return true;
  return false;
}
