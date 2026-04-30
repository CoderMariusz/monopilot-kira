# NPD Module — Prototype Translation Notes

Generated: 2026-04-23  
Source files: `design/Monopilot Design System/npd/` (10 JSX files + BACKLOG.md)  
Total entries indexed: 43  
Total estimated effort: ~3,605 minutes (~60 developer-hours)

---

## Key Architecture Patterns Found in Prototype

### 1. Global State via `window.*`
Every prototype file reads data from `window.NPD_FAS`, `window.NPD_BRIEFS`, `window.NPD_ALLERGEN_CASCADE`, etc. In production, all of these become **Drizzle ORM queries inside Next.js Server Components**. No global state pattern survives.

### 2. `openModal(name, data)` Pattern
All interactive screens accept `openModal` as a prop and call it with a string key + data object. In production this maps to **URL search params** (`?modal=faCreate&fa=FA5601`) parsed in a root Client Component that renders the appropriate Dialog. This enables shareable links and browser back-button support.

### 3. Shared Primitives (`Modal`, `Stepper`, `Field`, `ReasonInput`, `Summary`)
The prototype uses 5 shared primitives imported via `window.*`. Each maps to a production equivalent:
- `Modal` → `@radix-ui/react-dialog` Dialog + shadcn wrapper
- `Stepper` → custom StepIndicator built from flex + shadcn Separator
- `Field` → shadcn FormField + FormItem + FormLabel + FormMessage
- `ReasonInput` → shadcn Textarea with z.string().min(10) Zod validation
- `Summary` → simple 2-column read-only table, or shadcn dl/dt/dd

### 4. Validation Rules V01–V08
All validation rules (FA code regex, product name length, dev code format, D365 material check, required fields check, V06 yield chain, allergen assessment, launch date ≥24 weeks) are **client-side regexes in the prototype**. In production, they must be enforced server-side in Server Actions (Zod schemas) with the client mirroring them for immediate feedback via `useForm + zodResolver`.

### 5. Auto-Derived Fields (green background)
Fields with `style={{ background: "#E0FFE0" }}` and `readOnly` (RM Code from Finish Meat, Dieset from Line, PR Code Final) represent **server-computed values**. In production these are derived by a Server Action called `deriveFromFinishMeat()` / `deriveFromLine()` triggered on onChange, returning the derived values to the client for display.

### 6. D365 Integration Points
Three components interact with D365: `FAMRPTab` (per-field material status), `D365BuildModal` (MFA-gated output generation), and `D365WizardModal` (8-step guided build). In production:
- Material status → query `d365_import_cache` table (synced every 4h by background job)
- Build → background job (BullMQ) triggered by Server Action; SSE stream for progress
- MFA → real TOTP via Clerk MFA or speakeasy; lockout stored server-side

### 7. Allergen Cascade
The cascade (RM allergens + process additions + line changeover → FA final declaration) is represented as `window.NPD_ALLERGEN_CASCADE[faCode]`. In production this is a **database view** `fa_allergen_cascade` joining `fa_allergen_rm`, `fa_allergen_process`, and `fa_allergen_overrides`. Refresh is a Server Action that re-runs the view materialization.

### 8. Dual Module Architecture (Important: BL-NPD-02)
The prototype contains **two overlapping NPD systems**:
- Legacy R&D pipeline (`pipeline.jsx`, `project.jsx`, `recipe.jsx`, `other-stages.jsx`): Project-centric with stages (brief → recipe → trial → approval → handoff)
- FA-spec system (`fa-screens.jsx`, `brief-screens.jsx`, `formulation-screens.jsx`, `allergen-screens.jsx`, `docs-screens.jsx`, `modals.jsx`): FA-centric with 7 department gates and D365 build output

Production agents must clarify which system to implement. BACKLOG BL-NPD-02 calls for merge or deprecation in Phase 2.

---

## Known Bugs Relevant to NPD (from BACKLOG.md)

| ID | Severity | Description |
|---|---|---|
| BL-NPD-01 | Medium | Brief schema fields C21–C37 are placeholder-labeled — full rescan pending Phase B.2 |
| BL-NPD-02 | Medium | Legacy R&D pipeline screens coexist with new FA-spec screens — merge or deprecate in Phase 2 |
| BL-NPD-03 | Medium | Permissions matrix (spec §2.4) role-based field visibility not enforced — all users see all tabs |
| BL-NPD-04 | P2 | SCR-01 WebSocket 30s polling not prototyped |
| BL-NPD-05 | Low | AllergenCascade SVG diagram is static — should animate on refresh |
| BL-NPD-06 | Low | Mobile/tablet responsive breakpoints not addressed |
| BL-PROD-05 | HIGH | `.btn-danger` class missing from shared.css — affects FADeleteModal, FormulationLockModal; fix with shadcn Button variant='destructive' |

---

## All Indexed Labels

### Modals (from `modals.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `fa_create_modal` | 9–43 | FA | create | 60 |
| `brief_create_modal` | 46–86 | Brief | create | 60 |
| `brief_convert_modal` | 89–140 | Brief | approve | 75 |
| `dept_close_modal` | 143–191 | FA | approve | 75 |
| `d365_build_modal` | 194–241 | FA | approve | 90 |
| `version_compare_modal` | 244–295 | Formulation | read-only | 60 |
| `risk_add_modal` | 298–346 | FA | create | 60 |
| `fa_delete_modal` | 349–386 | FA | delete | 60 |
| `allergen_override_modal` | 389–428 | Allergen | edit | 60 |
| `d365_wizard_modal` | 431–594 | FA | approve | 180 |
| `version_save_modal` | 597–613 | Formulation | create | 30 |
| `formulation_lock_modal` | 615–642 | Formulation | approve | 45 |
| `doc_upload_modal` | 667–689 | Document | import | 45 |

### FA Screens (from `fa-screens.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `npd_dashboard` | 32–174 | FA | read-only | 120 |
| `fa_list` | 177–297 | FA | read-only | 120 |
| `fa_detail` | 300–401 | FA | edit | 90 |
| `fa_right_panel` | 404–452 | FA | read-only | 45 |
| `fa_core_tab` | 455–517 | FA | edit | 90 |
| `fa_production_tab` | 571–653 | ProdDetail | edit | 120 |
| `fa_technical_tab` | 656–743 | Allergen | edit | 120 |
| `fa_mrp_tab` | 746–786 | FA | edit | 90 |
| `fa_procurement_tab` | 789–820 | Supplier | edit | 60 |
| `fa_bom_tab` | 823–868 | BOM | read-only | 60 |
| `fa_formulations_tab` | 871–918 | Formulation | edit | 75 |
| `fa_history_tab` | 921–950 | FA | read-only | 45 |

### Brief Screens (from `brief-screens.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `brief_list` | 7–82 | Brief | read-only | 75 |
| `brief_detail` | 84–231 | Brief | edit | 150 |

### Formulation Screens (from `formulation-screens.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `formulation_list` | 7–76 | Formulation | read-only | 60 |
| `formulation_editor` | 79–153 | ProdDetail | edit | 90 |

### Pipeline (from `pipeline.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `pipeline` | 133–208 | Project | read-only | 120 |
| `kanban_view` | 35–51 | Project | read-only | 60 |
| `split_view` | 89–131 | Project | read-only | 60 |

### Project (from `project.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `create_project_wizard` | 107–263 | Project | create | 120 |
| `brief_screen` | 45–104 | Brief | edit | 75 |

### Recipe (from `recipe.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `recipe_screen` | 141–262 | Recipe | edit | 150 |
| `nutrition_panel` | 26–65 | Recipe | read-only | 60 |
| `cost_panel` | 67–101 | Recipe | edit | 45 |

### Allergen Screens (from `allergen-screens.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `allergen_cascade` | 5–118 | Allergen | read-only | 90 |

### Docs Screens (from `docs-screens.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `compliance_docs_screen` | 6–43 | Document | read-only | 45 |
| `risk_register_screen` | 46–88 | FA | edit | 45 |

### Other Stages (from `other-stages.jsx`)
| Label | Lines | Domain | Interaction | Time (min) |
|---|---|---|---|---|
| `nutrition_screen` | 4–80 | Recipe | read-only | 90 |
| `costing_screen` | 83–163 | Recipe | read-only | 90 |
| `trial_screen` | 215–243 | Recipe | create | 60 |
| `sensory_screen` | 246–336 | Recipe | read-only | 90 |
| `approval_screen` | 391–451 | Project | approve | 90 |
| `pilot_screen` | 339–388 | Recipe | read-only | 75 |
| `handoff_screen` | 455–507 | Project | approve | 90 |

---

## Total Estimated Effort

| Category | Count | Minutes |
|---|---|---|
| Modals | 13 | 840 |
| FA Screens (tabs + list + detail) | 12 | 1,035 |
| Brief Screens | 2 | 225 |
| Formulation Screens | 2 | 150 |
| Pipeline Views | 3 | 240 |
| Project / Wizard | 2 | 195 |
| Recipe Workbench | 3 | 255 |
| Allergen | 1 | 90 |
| Docs + Risk | 2 | 90 |
| Other Stages | 7 | 585 |
| **TOTAL** | **47** | **3,705 min (~62h)** |

Note: Effort estimates assume a developer familiar with Next.js App Router, shadcn/ui, Drizzle ORM, and react-hook-form. Does not include testing or DB schema work.
