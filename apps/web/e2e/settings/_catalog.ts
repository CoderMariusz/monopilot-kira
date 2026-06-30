/**
 * Wave-6 consolidated settings parity-evidence catalog.
 *
 * Single source of truth for the T-143…T-153 browser parity groups. Each entry
 * maps a real settings route (after the W4/W5 consolidation of the
 * apps/web/app/[locale]/(app)/(admin)/settings/** tree) to:
 *   - its SET-task id (the planning/atomic-task identifier),
 *   - the LITERAL prototype anchor required by
 *     _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md, i.e.
 *     `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>`,
 *   - an optional modal trigger so screen specs can also capture the modal
 *     overlay (SM-01…SM-11) that belongs to the screen.
 *
 * The thin per-group spec files under apps/web/e2e/settings/*.spec.ts import
 * GROUPS from here and hand each entry to the shared runner
 * (apps/web/e2e/settings/_runner.ts). This keeps the 11 STATUS-addressable
 * spec files (a-ui, a-modals, account, b-ui, b-modals, c-ui, d-ui, d-modals,
 * e-ui, e-modals, system-ui) as ~10-line shims over one real harness instead of
 * 11 near-duplicate 200-line files.
 *
 * HONEST SCOPE: these entries are the navigation + anchor catalog. The actual
 * screenshot / axe / parity_report.json capture only happens when the runner is
 * executed against a real authenticated server (PLAYWRIGHT_BASE_URL +
 * PLAYWRIGHT_AUTH_STORAGE). Without that the per-group specs skip with a
 * BLOCKED_AUTH note — they never fabricate artifacts.
 */

export type ModalTrigger = {
  /** SM-id of the modal (traceability only). */
  modal_id: string;
  /** Accessible name (regex source) of the control that opens the modal. */
  open_role: 'button' | 'link' | 'menuitem';
  open_name: RegExp;
  /** Literal prototype anchor for the modal region. */
  prototype_anchor: string;
  /** Human label for the modal (used in the report + artifact filename). */
  label: string;
};

export type ScreenEntry = {
  /** SET/atomic-task id for traceability in the parity report. */
  set_task_id: string;
  /** Authenticated app route to capture (locale-prefixed). */
  route: string;
  /** Short, stable label (also used for artifact filenames). */
  label: string;
  /**
   * Literal prototype anchor, exactly the format mandated by
   * UI-PROTOTYPE-PARITY-POLICY.md §1.1. For the handful of spec-driven screens
   * with no exact JSX we record the nearest reusable pattern per §1.2 and mark
   * `spec_driven: true`.
   */
  prototype_anchor: string;
  spec_driven?: boolean;
  /**
   * A regex that must match somewhere in the rendered <main> text to prove the
   * real (non-error, non-login) surface rendered. Kept loose on purpose — the
   * authoritative real-data assertions live in the per-screen RTL suites; this
   * harness proves the route renders its own surface authenticated.
   */
  expectText?: RegExp;
  /** Optional modal to also open + screenshot from this screen. */
  modal?: ModalTrigger;
};

export type ParityGroup = {
  /** Wave-6 STATUS task id (T-143…T-153). */
  task_id: string;
  /** Stable group key (also the spec filename stem). */
  key: string;
  title: string;
  screens: ScreenEntry[];
};

const PROTO = 'prototypes/design/Monopilot Design System/settings';

// ---------------------------------------------------------------------------
// T-143 — RBAC screens (02-settings-a-ui)
// ---------------------------------------------------------------------------
export const GROUP_A_UI: ParityGroup = {
  task_id: 'T-143',
  key: 'a-ui',
  title: 'RBAC screens',
  screens: [
    {
      set_task_id: 'SET-010',
      route: '/en/settings/company',
      label: 'company-profile',
      prototype_anchor: `${PROTO}/org-screens.jsx:4-100`,
      expectText: /company|organization|profile/i,
    },
    {
      set_task_id: 'SET-005',
      route: '/en/settings/users',
      label: 'users',
      prototype_anchor: `${PROTO}/access-screens.jsx:4-151`,
      expectText: /users|roles/i,
    },
    {
      set_task_id: 'SET-020',
      route: '/en/settings/audit',
      label: 'audit-log',
      prototype_anchor: `${PROTO}/org-screens.jsx:192-252`,
      expectText: /audit|log/i,
    },
    {
      set_task_id: 'SET-006',
      route: '/en/settings/invitations',
      label: 'pending-invitations',
      prototype_anchor: `${PROTO}/access-screens.jsx:4-151`,
      expectText: /invit/i,
    },
    {
      set_task_id: 'SET-007',
      route: '/en/settings/roles',
      label: 'roles-permissions',
      prototype_anchor: `${PROTO}/access-screens.jsx:4-151`,
      expectText: /role|permission/i,
    },
    {
      set_task_id: 'SET-011b',
      route: '/en/settings/authorization',
      label: 'auth-policies',
      prototype_anchor: `${PROTO}/access-screens.jsx:154-239`,
      expectText: /auth|policy|policies|mfa|sso/i,
    },
  ],
};

// ---------------------------------------------------------------------------
// T-144 — RBAC modals (02-settings-a-modals)
// ---------------------------------------------------------------------------
export const GROUP_A_MODALS: ParityGroup = {
  task_id: 'T-144',
  key: 'a-modals',
  title: 'RBAC modals',
  screens: [
    {
      set_task_id: 'SET-005',
      route: '/en/settings/users',
      label: 'user-invite-modal',
      prototype_anchor: `${PROTO}/modals.jsx:378-407`,
      expectText: /users|roles/i,
      modal: {
        modal_id: 'SM-01',
        open_role: 'button',
        open_name: /\+?\s*invite user/i,
        prototype_anchor: `${PROTO}/modals.jsx:378-407`,
        label: 'user-invite-modal',
      },
    },
    {
      set_task_id: 'SET-007',
      route: '/en/settings/roles',
      label: 'role-assign-modal',
      prototype_anchor: `${PROTO}/modals.jsx:410-447`,
      expectText: /role|permission/i,
      modal: {
        modal_id: 'SM-02',
        open_role: 'button',
        open_name: /assign|edit role/i,
        prototype_anchor: `${PROTO}/modals.jsx:410-447`,
        label: 'role-assign-modal',
      },
    },
    {
      set_task_id: 'SET-005',
      route: '/en/settings/users',
      label: 'password-reset-modal',
      prototype_anchor: `${PROTO}/modals.jsx:492-510`,
      expectText: /users|roles/i,
      modal: {
        modal_id: 'SM-03',
        open_role: 'button',
        open_name: /reset password|password reset/i,
        prototype_anchor: `${PROTO}/modals.jsx:492-510`,
        label: 'password-reset-modal',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// T-145 — Account self-service (02-settings-account)
// ---------------------------------------------------------------------------
export const GROUP_ACCOUNT: ParityGroup = {
  task_id: 'T-145',
  key: 'account',
  title: 'Account self-service',
  screens: [
    {
      set_task_id: 'SET-100',
      route: '/en/account/profile',
      label: 'my-profile',
      prototype_anchor: `${PROTO}/account-screens.jsx:3-75`,
      expectText: /profile|name|email|language/i,
    },
    {
      set_task_id: 'SET-101',
      route: '/en/account/notifications',
      label: 'my-notifications',
      prototype_anchor: `${PROTO}/account-screens.jsx:77-124`,
      expectText: /notification/i,
    },
  ],
};

// ---------------------------------------------------------------------------
// T-146 — Variants / Modules screens (02-settings-b-ui)
// ---------------------------------------------------------------------------
export const GROUP_B_UI: ParityGroup = {
  task_id: 'T-146',
  key: 'b-ui',
  title: 'Variants / Modules screens',
  screens: [
    {
      set_task_id: 'SET-040',
      route: '/en/settings/flags',
      label: 'flags-admin',
      prototype_anchor: `${PROTO}/admin-screens.jsx:350-408`,
      expectText: /flag|feature/i,
    },
    {
      set_task_id: 'SET-041',
      route: '/en/settings/promotions',
      label: 'promotions',
      prototype_anchor: `${PROTO}/admin-screens.jsx:630-688`,
      expectText: /promot|tier|L2/i,
    },
    {
      set_task_id: 'SET-042',
      route: '/en/settings/features',
      label: 'features',
      prototype_anchor: `${PROTO}/admin-screens.jsx:350-408`,
      expectText: /feature/i,
    },
    {
      set_task_id: 'SET-043',
      route: '/en/settings/tenant',
      label: 'tenant-variations-dashboard',
      prototype_anchor: `${PROTO}/admin-screens.jsx:630-688`,
      expectText: /tenant|variation|tier/i,
    },
    {
      set_task_id: 'SET-044',
      route: '/en/settings/tenant/depts',
      label: 'dept-taxonomy-editor',
      prototype_anchor: `${PROTO}/admin-screens.jsx:630-688`,
      expectText: /department|taxonomy|dept/i,
    },
    {
      set_task_id: 'SET-045',
      route: '/en/settings/tenant/rules',
      label: 'rule-variant-selector',
      prototype_anchor: `${PROTO}/admin-screens.jsx:630-688`,
      expectText: /rule|variant/i,
    },
    {
      set_task_id: 'SET-046',
      route: '/en/settings/modules',
      label: 'module-toggles',
      prototype_anchor: `${PROTO}/ops-screens.jsx:166-198`,
      spec_driven: true,
      expectText: /module/i,
    },
    {
      set_task_id: 'SET-047',
      route: '/en/settings/tenant/migrations',
      label: 'migration-history',
      prototype_anchor: `${PROTO}/admin-screens.jsx:630-688`,
      expectText: /migration|history/i,
    },
  ],
};

// ---------------------------------------------------------------------------
// T-147 — Variants / Modules modals (02-settings-b-modals)
// ---------------------------------------------------------------------------
export const GROUP_B_MODALS: ParityGroup = {
  task_id: 'T-147',
  key: 'b-modals',
  title: 'Variants / Modules modals',
  screens: [
    {
      set_task_id: 'SET-040',
      route: '/en/settings/flags',
      label: 'flag-edit-modal',
      prototype_anchor: `${PROTO}/modals.jsx:72-108`,
      expectText: /flag|feature/i,
      modal: {
        modal_id: 'SM-04',
        open_role: 'button',
        open_name: /edit|configure/i,
        prototype_anchor: `${PROTO}/modals.jsx:72-108`,
        label: 'flag-edit-modal',
      },
    },
    {
      set_task_id: 'SET-041',
      route: '/en/settings/promotions',
      label: 'promote-to-l2-modal',
      prototype_anchor: `${PROTO}/modals.jsx:262-375`,
      expectText: /promot|tier|L2/i,
      modal: {
        modal_id: 'SM-05',
        open_role: 'button',
        open_name: /promote|upgrade/i,
        prototype_anchor: `${PROTO}/modals.jsx:262-375`,
        label: 'promote-to-l2-modal',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// T-148 — Schema admin screens (02-settings-c-ui)
// ---------------------------------------------------------------------------
export const GROUP_C_UI: ParityGroup = {
  task_id: 'T-148',
  key: 'c-ui',
  title: 'Schema admin screens',
  screens: [
    {
      set_task_id: 'SET-030',
      route: '/en/settings/schema',
      label: 'schema-browser',
      prototype_anchor: `${PROTO}/admin-screens.jsx:414-469`,
      expectText: /schema|column|table/i,
    },
    {
      set_task_id: 'SET-031',
      route: '/en/settings/schema/new',
      label: 'schema-column-edit-wizard',
      prototype_anchor: `${PROTO}/admin-screens.jsx:414-469`,
      expectText: /column|wizard|schema/i,
    },
    {
      set_task_id: 'SET-032',
      route: '/en/settings/schema-migrations',
      label: 'schema-migrations-queue',
      prototype_anchor: `${PROTO}/admin-screens.jsx:414-469`,
      expectText: /migration|queue|schema/i,
    },
    {
      set_task_id: 'SET-033',
      route: '/en/settings/schema/migrations',
      label: 'schema-migrations-history',
      prototype_anchor: `${PROTO}/admin-screens.jsx:414-469`,
      expectText: /migration|schema/i,
    },
    {
      set_task_id: 'SET-034',
      route: '/en/settings/schema/preview',
      label: 'schema-shadow-preview',
      prototype_anchor: `${PROTO}/admin-screens.jsx:414-469`,
      spec_driven: true,
      expectText: /preview|draft|schema|shadow/i,
    },
    {
      set_task_id: 'SET-035',
      route: '/en/settings/schema',
      label: 'schema-view-modal',
      prototype_anchor: `${PROTO}/modals.jsx:111-138`,
      expectText: /schema|column/i,
      modal: {
        modal_id: 'SM-06',
        open_role: 'button',
        open_name: /view|details|inspect/i,
        prototype_anchor: `${PROTO}/modals.jsx:111-138`,
        label: 'schema-view-modal',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// T-149 — Rules / Reference Data screens (02-settings-d-ui)
// ---------------------------------------------------------------------------
export const GROUP_D_UI: ParityGroup = {
  task_id: 'T-149',
  key: 'd-ui',
  title: 'Rules / Reference Data screens',
  screens: [
    {
      set_task_id: 'SET-050',
      route: '/en/settings/rules',
      label: 'rules-registry',
      prototype_anchor: `${PROTO}/admin-screens.jsx:152-210`,
      expectText: /rule/i,
    },
    {
      set_task_id: 'SET-051',
      route: '/en/settings/reference',
      label: 'reference-data',
      prototype_anchor: `${PROTO}/admin-screens.jsx:216-344`,
      expectText: /reference|data/i,
    },
    {
      set_task_id: 'SET-052',
      route: '/en/settings/units',
      label: 'units-uom',
      prototype_anchor: `${PROTO}/data-screens.jsx:151-187`,
      expectText: /unit|conversion/i,
    },
    {
      set_task_id: 'SET-055',
      route: '/en/settings/reference/manufacturing-operations',
      label: 'mfgops-list',
      prototype_anchor: `${PROTO}/admin-screens.jsx:475-535`,
      expectText: /operation|mfg|manufactur/i,
    },
    {
      set_task_id: 'SET-056',
      route: '/en/settings/quality',
      label: 'reference-quality',
      prototype_anchor: `${PROTO}/admin-screens.jsx:216-344`,
      expectText: /quality|reference|reject/i,
    },
    {
      // DB-cleanup Phase 3: /settings/partners is now a navigational landing
      // pointing at the OPERATIONAL supplier/customer masters (the decorative
      // reference_tables.partners store had zero operational readers). No exact
      // JSX prototype for a module-pointer landing → nearest reusable pattern is
      // the ops-screens PageHead + grouped cards (same anchor module-toggles
      // uses), recorded spec_driven per UI-PROTOTYPE-PARITY-POLICY §1.2.
      set_task_id: 'SET-054',
      route: '/en/settings/partners',
      label: 'partners-operational-landing',
      prototype_anchor: `${PROTO}/ops-screens.jsx:166-198`,
      spec_driven: true,
      expectText: /supplier|customer|operational/i,
    },
  ],
};

// ---------------------------------------------------------------------------
// T-150 — Rules / Ref-Data modals (02-settings-d-modals)
// ---------------------------------------------------------------------------
export const GROUP_D_MODALS: ParityGroup = {
  task_id: 'T-150',
  key: 'd-modals',
  title: 'Rules / Ref-Data modals',
  screens: [
    {
      set_task_id: 'SET-050',
      route: '/en/settings/rules',
      label: 'rule-dry-run-modal',
      prototype_anchor: `${PROTO}/modals.jsx:18-69`,
      expectText: /rule/i,
      modal: {
        modal_id: 'SM-07',
        open_role: 'button',
        open_name: /dry.?run|test rule|simulate/i,
        prototype_anchor: `${PROTO}/modals.jsx:18-69`,
        label: 'rule-dry-run-modal',
      },
    },
    {
      set_task_id: 'SET-051',
      route: '/en/settings/reference',
      label: 'delete-reference-data-modal',
      prototype_anchor: `${PROTO}/modals.jsx:513-532`,
      expectText: /reference|data/i,
      modal: {
        modal_id: 'SM-08',
        open_role: 'button',
        open_name: /delete|remove/i,
        prototype_anchor: `${PROTO}/modals.jsx:513-532`,
        label: 'delete-reference-data-modal',
      },
    },
    {
      set_task_id: 'SET-051',
      route: '/en/settings/reference',
      label: 'ref-row-edit-modal',
      prototype_anchor: `${PROTO}/modals.jsx:535-572`,
      expectText: /reference|data/i,
      modal: {
        modal_id: 'SM-09',
        open_role: 'button',
        open_name: /edit|add row/i,
        prototype_anchor: `${PROTO}/modals.jsx:535-572`,
        label: 'ref-row-edit-modal',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// T-151 — Infra / Security / Integrations screens (02-settings-e-ui)
// ---------------------------------------------------------------------------
export const GROUP_E_UI: ParityGroup = {
  task_id: 'T-151',
  key: 'e-ui',
  title: 'Infra / Security / Integrations screens',
  screens: [
    {
      set_task_id: 'SET-011b',
      route: '/en/settings/security',
      label: 'security',
      prototype_anchor: `${PROTO}/access-screens.jsx:154-239`,
      expectText: /security|mfa|sso|session|ip/i,
    },
    {
      set_task_id: 'SET-090',
      route: '/en/settings/integrations/d365',
      label: 'd365-connection',
      prototype_anchor: `${PROTO}/admin-screens.jsx:540-581`,
      expectText: /d365|dynamics|connection/i,
    },
    {
      set_task_id: 'SET-091',
      route: '/en/settings/integrations/d365/mapping',
      label: 'd365-mapping',
      prototype_anchor: `${PROTO}/admin-screens.jsx:586-624`,
      expectText: /d365|mapping/i,
    },
    {
      set_task_id: 'SET-060',
      route: '/en/settings/email',
      label: 'email-templates',
      prototype_anchor: `${PROTO}/admin-screens.jsx:626-673`,
      expectText: /email|template/i,
    },
    {
      set_task_id: 'SET-061',
      route: '/en/settings/email/variables',
      label: 'email-variables',
      prototype_anchor: `${PROTO}/admin-screens.jsx:626-673`,
      expectText: /variable|email/i,
    },
    {
      set_task_id: 'SET-070',
      route: '/en/settings/notifications',
      label: 'notifications',
      prototype_anchor: `${PROTO}/admin-screens.jsx:27-103`,
      expectText: /notification/i,
    },
    {
      set_task_id: 'SET-110',
      route: '/en/settings/integrations',
      label: 'integrations-catalog',
      prototype_anchor: `${PROTO}/integrations.jsx:7-107`,
      expectText: /integration/i,
    },
    {
      set_task_id: 'SET-080',
      route: '/en/settings/warehouses',
      label: 'warehouse-list',
      prototype_anchor: `${PROTO}/access-screens.jsx:154-239`,
      expectText: /warehouse/i,
    },
    {
      set_task_id: 'SET-081',
      route: '/en/settings/infra/locations',
      label: 'location-tree',
      prototype_anchor: `${PROTO}/access-screens.jsx:154-239`,
      expectText: /location/i,
    },
    {
      set_task_id: 'SET-082',
      route: '/en/settings/infra/machines',
      label: 'machine-list',
      prototype_anchor: `${PROTO}/access-screens.jsx:154-239`,
      expectText: /machine/i,
    },
    {
      set_task_id: 'SET-083',
      route: '/en/settings/infra/lines',
      label: 'line-list',
      prototype_anchor: `${PROTO}/access-screens.jsx:154-239`,
      expectText: /line/i,
    },
    {
      set_task_id: 'SET-092',
      route: '/en/settings/integrations/d365/sync',
      label: 'd365-sync-config',
      prototype_anchor: `${PROTO}/admin-screens.jsx:109-146`,
      expectText: /sync|d365/i,
    },
    {
      set_task_id: 'SET-093',
      route: '/en/settings/integrations/d365/audit',
      label: 'd365-sync-audit',
      prototype_anchor: `${PROTO}/admin-screens.jsx:109-146`,
      expectText: /audit|sync|d365/i,
    },
    {
      set_task_id: 'SET-062',
      route: '/en/settings/notifications/email-log',
      label: 'email-delivery-log',
      prototype_anchor: `${PROTO}/ops-screens.jsx:98-163`,
      expectText: /email|log|delivery/i,
    },
  ],
};

// ---------------------------------------------------------------------------
// T-152 — Infra / Security modals (02-settings-e-modals)
// ---------------------------------------------------------------------------
export const GROUP_E_MODALS: ParityGroup = {
  task_id: 'T-152',
  key: 'e-modals',
  title: 'Infra / Security modals',
  screens: [
    {
      set_task_id: 'SET-060',
      route: '/en/settings/email',
      label: 'email-template-edit-modal',
      prototype_anchor: `${PROTO}/modals.jsx:141-259`,
      expectText: /email|template/i,
      modal: {
        modal_id: 'SM-10',
        open_role: 'button',
        open_name: /edit/i,
        prototype_anchor: `${PROTO}/modals.jsx:141-259`,
        label: 'email-template-edit-modal',
      },
    },
    {
      set_task_id: 'SET-090',
      route: '/en/settings/integrations/d365',
      label: 'd365-test-connection-modal',
      prototype_anchor: `${PROTO}/modals.jsx:450-489`,
      expectText: /d365|connection/i,
      modal: {
        modal_id: 'SM-11',
        open_role: 'button',
        open_name: /test connection|test/i,
        prototype_anchor: `${PROTO}/modals.jsx:450-489`,
        label: 'd365-test-connection-modal',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// T-153 — System utility screens (02-settings-system-ui)
// NOTE: spec-driven — no exact JSX prototypes; nearest reusable pattern is the
// ops-screens toggle list per UI-PROTOTYPE-PARITY-POLICY §1.2.
// ---------------------------------------------------------------------------
export const GROUP_SYSTEM_UI: ParityGroup = {
  task_id: 'T-153',
  key: 'system-ui',
  title: 'System utility screens',
  screens: [
    {
      set_task_id: 'SET-029',
      route: '/en/settings/import-export',
      label: 'global-import-export',
      prototype_anchor: `${PROTO}/ops-screens.jsx:263-384`,
      expectText: /import|export/i,
    },
    {
      set_task_id: 'SET-057',
      route: '/en/settings/quality',
      label: 'grn-qc-toggle',
      prototype_anchor: `${PROTO}/ops-screens.jsx:166-198`,
      spec_driven: true,
      expectText: /quality|qc|grn|reject/i,
    },
    {
      set_task_id: 'SET-100',
      route: '/en/account/profile',
      label: 'language-picker',
      prototype_anchor: `${PROTO}/account-screens.jsx:20-24`,
      spec_driven: true,
      expectText: /language|profile/i,
    },
  ],
};

export const ALL_GROUPS: ParityGroup[] = [
  GROUP_A_UI,
  GROUP_A_MODALS,
  GROUP_ACCOUNT,
  GROUP_B_UI,
  GROUP_B_MODALS,
  GROUP_C_UI,
  GROUP_D_UI,
  GROUP_D_MODALS,
  GROUP_E_UI,
  GROUP_E_MODALS,
  GROUP_SYSTEM_UI,
];
