'use client';

/**
 * Legacy non-localized Roles & Permissions route.
 *
 * Structural consolidation (Class E): the canonical SET-011 RolesScreen now
 * lives in the localized tree at
 * `app/[locale]/(app)/(admin)/settings/roles/roles-screen.client.tsx`, where the
 * server loader (`page.tsx`) reads real org-scoped role/user data via
 * withOrgContext. This file is a thin alias that re-exports that canonical
 * presentational component so the legacy `/settings/roles` route, the
 * route-topology spec, and the i18n-consumption guard keep resolving — without
 * carrying any hardcoded `defaultRoles` / `defaultNpdPermissions` /
 * `defaultPermissionsByRole` / `defaultAssignableUsers` fixture data.
 *
 * There is NO seed/fixture fallback here: the component renders only the real
 * data it is given (or its honest unavailable-state when no data is wired).
 */
export {
  default,
  type AssignableUser,
  type AssignRole,
  type RoleCode,
  type RolesScreenProps,
  type SystemRole,
} from '../../../[locale]/(app)/(admin)/settings/roles/roles-screen.client';
