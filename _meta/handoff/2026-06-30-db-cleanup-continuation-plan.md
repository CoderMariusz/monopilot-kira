# DB-cleanup — CONTINUATION HANDOFF (for the post-/compact fresh context)

Round 1 (P1/P2/supplier-FK) + Round 2 (owner decisions, mostly executed) are DONE + deployed
READY through HEAD `5c006051`. Full record: `_meta/audits/2026-06-30-db-cleanup-EXECUTION.md`.
Next free migration = **405**. Login admin@monopilot.test / `Admin2026!!!`. Org -002 = khjvkhzwfzuwzrusgobp.
Reply Polish; artifacts English. Push via `open /tmp/mk_push.command` (in-session git push blocked).
Cadence: Codex fix → different-Codex review → Opus (kira-codex-review) cross-review → Claude build
gate + migrations (MCP, record sha256 in schema_migrations) → commit (stage explicitly, never
`git add -A`, never stage purchase-orders/_actions/actions.test.ts) → push → verify Vercel READY.
⚠️ Migrations: never edit an APPLIED file (even a comment) without re-recording its checksum — the
`@monopilot/db migrate` gate runs on Vercel (NOT local next build) and fails on mismatch. For DROPs:
deploy the repoint code FIRST, then apply the drop.

## A — "one price" item↔supplier_spec single-source  (status: SCOPING — see branch A result below)
Owner: when creating an item + assigning a supplier + price, that price must land in ONE canonical
field (recommend `supplier_specs.unit_price` — per-supplier, currency-bearing, validity-versioned),
not be duplicated into a separate item field. create-item.ts currently inserts a supplier_spec WITHOUT
unit_price; the modal's price may go only to items.list_price_gbp / item_cost_history. Fix = thread the
entered supplier price into the supplier_specs insert; clarify list_price (sell) vs unit_price (purchase)
vs item_cost_history (internal cost) so each is owned once. (Detailed plan filled from branch A.)

## 1 — WAC valuation in GBP  (owner-approved "build now"; financial path — full review)
- **mig (405):** `create table public.currencies (id uuid pk default gen_random_uuid(), code char(3) not null unique check(code ~ '^[A-Z]{3}$'), name text not null, created_at timestamptz default now())`; `grant select to app_user`; seed `('GBP','Pound Sterling')`. (item_wac_state.currency_id is a NOT-NULL soft FK with no target today.)
- **helper** `apps/web/lib/finance/upsert-wac.ts`: `upsertWac(client,{orgId,siteId,itemId,deltaQtyKg,deltaValue,updatedBy})` → `insert into item_wac_state (...currency_id = (select id from public.currencies where code='GBP')...) on conflict (org_id,item_id,currency_id) do update set total_qty_kg = greatest(state+excluded,0), total_value = greatest(state+excluded,0)` (avg_cost is generated). NUMERIC strings, never JS floats.
- **3 in-transaction call sites:** GRN receipt `planning/purchase-orders/_actions/receive-po-line.ts` (after LP create; deltaQty=receivedQtyKg, deltaValue=qty×poLine.unit_price); production output `lib/production/output/register-output.ts` (after output LP; deltaValue=qty×FG active cost_per_kg); stock adjust `warehouse/_actions/grn-actions.ts` (+/- delta at current avg_cost).
- **reader** `finance/valuation/_actions/get-inventory-valuation.ts`: add `join public.currencies c on c.id = wac.currency_id` → `c.code as currency`. Values become real once WAC rows exist.
- CAVEAT: on the wiped/near-empty field the valuation stays ~£0 until stock is received/produced — test with real stock.

## 2 — drop bom_headers.product_id shadow column (the parked P3-FK Mig-D; bounded but coordinated)
- Dual-write trigger to drop: `bom_headers_sync_item_id_trg` + fn `bom_headers_sync_item_id()` (mig 362). item_id is already the authoritative read path (migs 362-364); product_id is the trigger-maintained text shadow (== product_code) with FK `bom_headers_product_id_fkey → product_legacy`.
- **Repoint ~8 prod readers → item_id:** `technical/bom/_actions/disassembly.ts` (169,176,276), `bom/_actions/create-draft.ts` (181 INSERT — stop writing product_id), `technical/boms/snapshots/_actions/diff-snapshot.ts` (54), `technical/factory-specs/_actions/bundle-data.ts` (150 WHERE), `npd/pipeline/[projectId]/handoff/_actions/get-handoff.ts` (169,214), `lib/technical/allergens/cascade.ts` (71,84,156,234 joins), `lib/technical/release-bundle-service.ts` (165-166,288,306).
- **Repoint 5 DB write/guard fns** (parked per mig 363 comment): request_npd_released_bom_edit, create_initial_shared_bom_version_for_npd_project, bom_request_version_edit, bom_headers_reject_approved_content_update, backfill_initial_shared_boms_from_legacy_npd.
- **Update ~8 DB tests** (fa-bom-view, shared-bom-ssot, technical-gate4-corrective, bom-coproducts-snapshots, bom-snapshots-list-query, bom-version-state-machine-t073, npd-shared-bom-builder) + Drizzle `schema/shared-bom.ts:62`.
- **Then:** drop trigger+fn → `ALTER TABLE public.bom_headers DROP COLUMN product_id` (drops the product_legacy FK + old indexes; confirm shadowed by mig-363 item_id indexes). Deploy repoint code first, then the drop.

## 3 — product_legacy physical drop (LARGE: 15 FK satellites — multi-table wave)
product_legacy is the renamed old product base table (mig 359); the `public.product` VIEW's INSTEAD-OF
triggers keep skeleton anchor rows so 15 live FKs resolve. The 15 `*_product_code_fkey` satellites:
allergen_cascade_rebuild_jobs, bom_headers, compliance_docs, costing_breakdowns, fa_allergen_overrides,
fa_builder_outputs, factory_release_status, formulations, npd_legacy_closeout, npd_projects,
nutri_score_results, nutrition_allergens, nutrition_profiles, prod_detail, risks.
- **Plan (dedicated wave):** migrate each satellite's product_code FK to reference `items` (FK to items.item_code or an item_id uuid FK + backfill), repoint their read/write paths, rewrite the product view's INSTEAD-OF triggers to not need product_legacy anchors, then `DROP TABLE product_legacy`. This is NOT a single safe migration — sequence per-satellite with verification.

## Also deferred (lower value): P5 allergen freshness-gate (fg_npd_ext.allergens_recomputed_at + stamp in update_fa_allergen_set + gate the accept action); dormant trigger `fa_allergen_set_refresh_on_prod_detail_edit` narrowing to UPDATE OF (org_id, product_code) only (redundant work, not a wrong result).

## B — programming-error analysis + improved skills (DONE)
Codex wrote: `_meta/retros/2026-06-30-programming-error-analysis.md` + 3 skill drafts in `_meta/retros/skill-drafts/` (`MON-migration-safety.md`, `MON-api-transaction-safety.md`, `MON-codex-review-checklist.md`). Top-3 root causes (all hit this session): (1) `withOrgContext` commits on normal return → validate-before-write / throw-to-rollback; (2) migration-checksum immutability (gate on Vercel, not local build); (3) vitest config by `.tsx`/`.ts` extension. **ACTED ON:** promoted these gotchas into root `AGENTS.md` (new "Recurring gotchas" section + fixed the `pnpm --filter web exec vitest run` command) so Codex reads them. **TODO (fresh context):** review the 3 skill drafts and, if good, install them into `.claude/skills/` via the skill-creator skill; add the "Codex brief preamble" memory-injection step to `docs/workflow/04-CODEX-INTEGRATION.md`.

## C — Obsidian-memory recommendation (DONE) → **ADOPT-CONVENTIONS-ONLY; the app ≠ worth it**
Decisive findings: the `.claude/.../memory/` vault is ALREADY an Obsidian-compatible vault (markdown + frontmatter + `[[wikilinks]]`). Obsidian's value is APP-only (graph/backlinks/tag-filter — helps the HUMAN browsing 44 notes, gives the AI agents ~nothing, since they read raw files). `![[transclusion]]` is app-render-only → an agent reading the file sees the literal `![[…]]`, not the content → useless for de-duping facts for AI. **The real gap = Codex doesn't read the vault at all — it reads `AGENTS.md`.** So the session gotchas (use-server export break, "no `pnpm build`", `task --wait --timeout-ms 3000000`, vitest `.tsx` config, live-mig number) never reach Codex.
**ACT ON (highest value, ~15 lines, do this):** promote the STABLE Codex gotchas into root `AGENTS.md` (the file Codex already reads) + add a "Codex brief preamble" step to `docs/workflow/04-CODEX-INTEGRATION.md` / the orchestrator skill: before dispatching a Codex lane, grep the `type: feedback` fact files for gotchas touching the in-scope files and paste the relevant 2-3 into the brief (the only way SESSION-FRESH memory reaches Codex). Cheap memory hygiene: add `tags:` frontmatter mirroring the emoji taxonomy; split the MEMORY.md mega-bullets to ~2 sentences; add reverse-links to the ~6 orphan fact files. **Do NOT** install Obsidian-as-infra, use Dataview, or rely on transclusion. (Full report saved to memory.)
