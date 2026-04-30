# Translation Notes — Settings Module
Generated: 2026-04-23
Source files scanned: modals.jsx, org-screens.jsx, access-screens.jsx, admin-screens.jsx, ops-screens.jsx, data-screens.jsx, account-screens.jsx, integrations.jsx

---

## Quick Reference Index

| Label | File | Lines | Type | Domain | Interaction | Time (min) |
|---|---|---|---|---|---|---|
| rule_dry_run_modal | modals.jsx | 18-69 | modal | WO | read-only | 90 |
| flag_edit_modal | modals.jsx | 72-108 | modal | Permission | edit | 60 |
| schema_view_modal | modals.jsx | 111-138 | modal | Spec | read-only | 30 |
| email_template_edit_modal | modals.jsx | 141-259 | wizard | Integration | edit | 120 |
| promote_to_l2_modal | modals.jsx | 262-375 | wizard | Permission | approve | 120 |
| user_invite_modal | modals.jsx | 378-407 | modal | User | create | 45 |
| role_assign_modal | modals.jsx | 410-447 | modal | Role | edit | 60 |
| d365_test_connection_modal | modals.jsx | 450-489 | modal | Integration | read-only | 45 |
| password_reset_modal | modals.jsx | 492-510 | modal | User | delete | 30 |
| delete_reference_data_modal | modals.jsx | 513-532 | modal | Allergen | delete | 30 |
| ref_row_edit_modal | modals.jsx | 535-572 | modal | Allergen | edit | 45 |
| company_profile_screen | org-screens.jsx | 4-100 | form | Org | edit | 90 |
| sites_screen | org-screens.jsx | 103-189 | page-layout | Org | edit | 120 |
| warehouses_screen | org-screens.jsx | 192-252 | page-layout | Org | edit | 90 |
| shifts_screen | org-screens.jsx | 255-306 | page-layout | Org | edit | 90 |
| users_screen | access-screens.jsx | 4-151 | page-layout | User | edit | 150 |
| security_screen | access-screens.jsx | 154-239 | form | Permission | edit | 120 |
| d365_connection_screen | admin-screens.jsx | 27-103 | form | Integration | edit | 120 |
| d365_mapping_screen | admin-screens.jsx | 109-146 | table | Integration | read-only | 60 |
| rules_registry_screen | admin-screens.jsx | 152-210 | table | WO | read-only | 75 |
| rule_detail_screen | admin-screens.jsx | 216-344 | tabs | WO | read-only | 120 |
| flags_admin_screen | admin-screens.jsx | 350-408 | table | Permission | edit | 90 |
| schema_browser_screen | admin-screens.jsx | 414-469 | table | Spec | read-only | 75 |
| reference_data_screen | admin-screens.jsx | 475-535 | page-layout | Allergen | edit | 90 |
| email_templates_screen | admin-screens.jsx | 540-581 | page-layout | Integration | edit | 90 |
| email_variables_screen | admin-screens.jsx | 586-624 | table | Integration | read-only | 45 |
| promotions_screen | admin-screens.jsx | 630-688 | page-layout | Permission | approve | 90 |
| devices_screen | ops-screens.jsx | 4-95 | page-layout | Org | create | 120 |
| notifications_screen | ops-screens.jsx | 98-163 | form | Org | edit | 75 |
| features_screen | ops-screens.jsx | 166-198 | form | Permission | edit | 45 |
| products_screen | data-screens.jsx | 4-52 | table | ProdDetail | edit | 75 |
| boms_screen | data-screens.jsx | 55-103 | page-layout | BOM | edit | 90 |
| partners_screen | data-screens.jsx | 106-148 | table | Supplier | edit | 60 |
| units_screen | data-screens.jsx | 151-187 | page-layout | Org | edit | 60 |
| my_profile_screen | account-screens.jsx | 3-75 | form | User | edit | 120 |
| my_notifications_screen | account-screens.jsx | 77-124 | form | User | edit | 60 |
| integrations_screen | integrations.jsx | 7-107 | page-layout | Integration | edit | 120 |

**Total estimated translation time: 3,075 minutes (~51 hours)**

---

## Architectural patterns found across all settings screens

### 1. Shared primitive dependency: Modal, Stepper, Field, ReasonInput, Summary
All 11 modals in modals.jsx depend on primitives from `_shared/modals.jsx`. These MUST be translated first:
- `Modal` → `@radix-ui/react-dialog Dialog` with title/subtitle/footer slot props
- `Stepper` → custom stepper built on `nav` + `aria-current="step"` or shadcn Steps (if available)
- `Field` → shadcn `FormField` + `FormItem` + `FormLabel` + `FormDescription` + `FormMessage`
- `ReasonInput` → shadcn `Textarea` with character counter and `z.string().min(N)` validation
- `Summary` → custom `dl`/`dt`/`dd` layout or shadcn `DescriptionList`

### 2. window.SETTINGS_* globals → Server Component data fetching
Every screen uses `window.SETTINGS_*` mock data globals. In production:
- These become Drizzle ORM queries in Next.js Server Components or `loader` functions
- Data passed as props to Client Components only when interactivity requires it
- Sensitive data (API keys, secrets) never returned to client; placeholder strings only

### 3. Section + SRow layout pattern → shadcn Card + FormField
The `Section` + `SRow` primitive pair appears in every screen. Translate to:
```tsx
<Card>
  <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{sub}</CardDescription></CardHeader>
  <CardContent className="divide-y">
    <div className="py-3 grid grid-cols-[200px_1fr] gap-4 items-start">
      <Label className="pt-2 text-sm font-medium">{label}</Label>
      <div>
        {/* control */}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
    </div>
  </CardContent>
  {foot && <CardFooter className="justify-end gap-2">{foot}</CardFooter>}
</Card>
```

### 4. Toggle component → shadcn Switch
`<Toggle on={x} onChange={fn}/>` maps to `<Switch checked={x} onCheckedChange={fn}/>`. When a toggle triggers a Server Action directly (no explicit Save button), wrap with `useTransition` and show a loading state on the Switch.

### 5. Inline custom modals → shared Dialog
`DevicesScreen` (pair device) and `UsersScreen` (invite) each contain inline `position:fixed` overlay modals. These must be extracted to dedicated Dialog components and reuse the pattern from `_shared/modals.jsx`.

### 6. RBAC enforcement pattern
The prototype renders all controls regardless of user role. In production:
- Server Components check `session.user.role` from auth provider
- Dangerous actions (flag edit L1, promotions, password reset, schema changes) require `Admin` role
- L1 flag edits must redirect to PromoteToL2Modal — not allow direct save
- Add `isAdmin` / `canManageUsers` / `canManageIntegrations` prop guards from server session

### 7. Form save pattern
Most screens have inline "Save changes" / "Cancel" buttons with no form library. In production:
- Wrap each Section that has its own Save in a `<form action={serverAction}>`
- Use `useFormStatus` for pending state on the Save button
- Use `useActionState` (React 19) or `react-hook-form` + Server Action for validation feedback
- Emit domain outbox events (e.g. `org.profile.updated`, `flag.toggled`, `user.invited`) on success

### 8. Import/Export CSV pattern
Buttons exist in: ProductsScreen, BomsScreen (compare), PartnersScreen, ReferenceDataScreen, SchemaBrowserScreen, D365MappingScreen. In production:
- Export → Next.js route handler streaming `text/csv` with `Content-Disposition: attachment`
- Import → multi-step wizard (upload → preview → commit): BL-SET-04 pattern; use Papa Parse server-side

---

## Known bugs from BACKLOG.md affecting Settings screens

| Bug ID | Severity | Description | Affected Component |
|---|---|---|---|
| BL-SET-12 | HIGH | Duplicate `const BomsScreen` in app.jsx and data-screens.jsx | boms_screen |
| BL-PROD-05 | HIGH | `.btn-danger` missing from shared CSS — destructive confirms fall back to primary styling | password_reset_modal, delete_reference_data_modal |
| BL-SET-01 | Medium | Column edit wizard (SET-031, 8 steps) not built | schema_browser_screen |
| BL-SET-02 | Medium | Schema diff viewer (SET-032) not built | schema_browser_screen |
| BL-SET-03 | Medium | Rule version diff button disabled for non-current versions (SET-042) | rule_detail_screen |
| BL-SET-04 | Medium | CSV import wizard (3-step, SET-053) not built | reference_data_screen |
| BL-SET-06 | Medium | D365 constants inline editor (SET-081) not built | d365_connection_screen |
| BL-SET-07 | Medium | D365 sync config (SET-082) not built | d365_connection_screen |
| BL-SET-09 | Medium | MFA enrollment modal (MODAL-MFA-ENROLL) not built — stubbed | my_profile_screen |
| BL-SET-10 | Low | Reference table grids beyond allergens not implemented | reference_data_screen |
| BL-SET-11 | P2 | PostHog read-through panel on Feature flags not built | flags_admin_screen |
| BL-TEC-01 | Medium | Item.allergens[] unmapped to D365 — surfaces red banner in mapping screen | d365_mapping_screen |
| BL-SET-08 | Low | Email delivery log (SET-093) not built | email_templates_screen |
| BL-SET-05 | Low | Dept taxonomy editor (SET-061) not built | (no prototype screen yet) |

---

## Modal dependency graph

```
modals.jsx (SM-01 through SM-11)
├── SM-01 rule_dry_run_modal
│     └── consumed by: rule_detail_screen (admin-screens.jsx), rules_registry_screen
├── SM-02 flag_edit_modal
│     └── consumed by: flags_admin_screen
├── SM-03 schema_view_modal
│     └── consumed by: schema_browser_screen
├── SM-04 email_template_edit_modal
│     └── consumed by: email_templates_screen
├── SM-05 promote_to_l2_modal
│     └── consumed by: promotions_screen
├── SM-06 user_invite_modal
│     └── consumed by: users_screen (inline duplicate also exists — remove inline)
├── SM-07 role_assign_modal
│     └── consumed by: users_screen (action menu, not yet wired)
├── SM-08 d365_test_connection_modal
│     └── consumed by: d365_connection_screen, d365_mapping_screen
├── SM-09 password_reset_modal
│     └── consumed by: users_screen (action menu)
├── SM-10 delete_reference_data_modal
│     └── consumed by: reference_data_screen
└── SM-11 ref_row_edit_modal
      └── consumed by: reference_data_screen
```

---

## Production implementation order recommendation

**Tier 0 (blockers — build first):**
1. Shared primitives (`Dialog`, `Field`/`FormField`, `Stepper`, `ReasonInput`, `Summary`) — all modals depend on these
2. Fix BL-PROD-05: add `.btn-danger` / `Button variant="destructive"` to shared CSS

**Tier 1 (core admin unlocks other modules):**
3. `user_invite_modal` + `role_assign_modal` + `users_screen` — gates onboarding
4. `company_profile_screen` — gates org identity everywhere
5. `d365_connection_screen` + `d365_test_connection_modal` — gates D365 pipeline

**Tier 2 (operations):**
6. `flags_admin_screen` + `flag_edit_modal` — gates runtime feature toggles
7. `rules_registry_screen` + `rule_detail_screen` + `rule_dry_run_modal` — gates rule governance
8. `email_templates_screen` + `email_template_edit_modal` — gates notification flows

**Tier 3 (data management):**
9. `reference_data_screen` + `ref_row_edit_modal` + `delete_reference_data_modal` — allergen/UoM master data
10. `products_screen`, `boms_screen`, `partners_screen`, `units_screen`

**Tier 4 (account + ops):**
11. `my_profile_screen`, `my_notifications_screen`, `security_screen`
12. `devices_screen`, `notifications_screen`, `features_screen`
13. `integrations_screen`, `schema_browser_screen`, `promotions_screen`
