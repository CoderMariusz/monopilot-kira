# NPD Module — API Contract

REST endpoints the backend must expose. Maps directly to the `window.NPD_*` helpers used in the prototype — those will be replaced by `fetch()` against these routes.

> **Auth:** every request requires `Authorization: Bearer <jwt>`. Tenant scope derived from JWT — never accept tenant id from client.
>
> **Errors:** standard envelope `{error: {code, message, details}}`. `details` may include field-level errors (`{field_key: "message"}`).
>
> **Idempotency:** mutations that map to D365 push (build, allergen recalc) require `Idempotency-Key` header; service de-dups within 24h.

---

## 1. Configuration

### `GET /api/npd/config/templates`
List all templates available to this tenant.

**Response 200:**
```json
[
  {
    "id": "luka_bakery",
    "name": "Łuka · Bakery",
    "description": "Industrial bakery — sliced bread, rolls, buns, pastries",
    "industry": "bakery",
    "based_on": "Pennine Bakery v3.0",
    "version": "v1.0",
    "is_built_in": true,
    "is_active": true,
    "departments_count": 7,
    "fields_count": 64,
    "validation_rules_count": 12
  }
]
```

### `GET /api/npd/config/templates/{id}`
Full template definition — what `window.NPD_CONFIG_TEMPLATES.find(...)` returns.

**Response 200:**
```json
{
  "id": "luka_bakery",
  "name": "Łuka · Bakery",
  "version": "v1.0",
  "industry": "bakery",
  "departments": [
    {
      "id": "core",
      "label": "Core",
      "order": 1,
      "accent_color": "#3b82f6",
      "close_role_keys": ["admin", "npd_manager"],
      "blocking_dep_keys": [],
      "fields": [
        {
          "id": "fg_code",
          "label": "FG Code",
          "type": "text",
          "required": true,
          "help_text": "Format FG followed by 4 digits",
          "placeholder": "FG2401"
        }
      ]
    }
  ],
  "blocking_rules": [
    {"id": "V01", "title": "FG Code format", "description": "...", "severity": "error", "enabled": true}
  ]
}
```

### `POST /api/npd/config/templates`
Create new template (clone or blank). **Admin only.**

**Body:**
```json
{
  "template_key": "tenant_custom_v1",
  "name": "Tenant Custom v1",
  "based_on_template_id": "luka_bakery"
}
```

### `PATCH /api/npd/config/templates/{id}`
Edit template — name, departments, fields, rules. **Admin only.** Built-in templates rejected with 403.

### `POST /api/npd/config/templates/{id}/activate`
Activate a template for this tenant. **Admin only.**

**Response 200:** `{"activated_at": "...", "previous_template_id": "..."}` — fires `npd:config-activated` to all sessions via WebSocket.

> Existing FGs **keep** their `template_id`. Only new FGs created after activation use the new template.

### `POST /api/npd/config/templates/{id}/change-requests`
NPD Manager submits change request (MODAL-CONFIG-04). **`config.request_changes` permission required.**

**Body:**
```json
{
  "scope": "field",
  "target": "core.shelf_life_days",
  "proposal": "Add a numeric field 'shelf_life_days' to Core, required, used in V11 rule.",
  "reason": "Tesco contract change requires shelf-life on label artwork.",
  "urgency": "high"
}
```

**Response 201:** `{"id": 142, "status": "pending"}`.

### `GET /api/npd/config/change-requests?status=pending`
Admin queue. Filter by `status`, `template_id`, `scope`.

### `POST /api/npd/config/change-requests/{id}/decision`
**Body:** `{"status": "approved" | "rejected", "review_note": "..."}`. Admin only.

---

## 2. Briefs

### `GET /api/npd/briefs?status=draft&owner=me`
List briefs.

### `POST /api/npd/briefs`
Create brief (MODAL-02). **`brief.create` required.**

**Body:**
```json
{
  "product_name": "Crumpets 6pk",
  "template": "Single",
  "dev_code": "DEV26-052",
  "volume_units_year": 1200,
  "target_price": "0.68",
  "pack_size": "300g",
  "components": [
    {"component_name": "Crumpet batter", "weight_g": 50, "pct_of_pack": 100}
  ]
}
```

**Response 201:** full brief object.

### `GET /api/npd/briefs/{brief_id}`
### `PATCH /api/npd/briefs/{brief_id}`
Edit while `status = draft`. Returns 409 if `status = converted`.

### `POST /api/npd/briefs/{brief_id}/mark-complete`
Validates: name ≥ 1 char, components weight sums to 100%. Status moves draft → complete.

### `POST /api/npd/briefs/{brief_id}/convert-to-fg`
**Body:**
```json
{ "fg_code": "FG2410" }
```

**Response 200:**
```json
{
  "fg_id": 142,
  "fg_code": "FG2410",
  "redirect_to": "/npd/fg/FG2410"
}
```

Side-effects: creates `npd_fgs` row, copies brief fields → fg field values, sets brief.status = `converted`, brief.fg_id = new FG id, fires `npd:fg-created` event.

---

## 3. Finished Goods (FG)

### `GET /api/npd/fgs?status=Alert&owner=me`
List. Supports `?search=`, `?template_id=`, `?launch_before=`, pagination.

### `POST /api/npd/fgs`
Create FG directly without brief (MODAL-01). **`fa.create` required.**

### `GET /api/npd/fgs/{fg_code}`
Full FG with all field values + dept state.

**Response 200:**
```json
{
  "fg_code": "FG2401",
  "product_name": "White Sliced Loaf 800g",
  "status_overall": "Alert",
  "template_id": "luka_bakery",
  "field_values": {
    "core.fg_code": "FG2401",
    "core.product_name": "White Sliced Loaf 800g",
    "core.pack_size": "800g",
    "planning.runs_per_week": 6
  },
  "dept_state": {
    "core":        {"state": "closed",  "closed_at": "...", "closed_by": "K. Walker"},
    "planning":    {"state": "inprog"},
    "commercial":  {"state": "blocked"}
  },
  "progress_pct": 35
}
```

### `PATCH /api/npd/fgs/{fg_code}`
Edit any field value (per-field permission check). Invalid transitions return 422.

**Body:** `{"field_values": {"planning.runs_per_week": 8}}`.

### `POST /api/npd/fgs/{fg_code}/close-dept`
Close a department gate (MODAL-04). Service validates all required fields filled + blocking deps closed.

**Body:** `{"dept_key": "planning", "note": "All fields confirmed with line manager."}`

### `POST /api/npd/fgs/{fg_code}/reopen-dept`
Admin / NPD Manager only. Reverses gate close.

**Body:** `{"dept_key": "planning", "reason": "..."}` (min 10 chars)

### `DELETE /api/npd/fgs/{fg_code}`
Soft-delete (MODAL-08). **`fa.delete` required.** Body: `{"confirmation_text": "FG2401"}` — must match exactly.

### `POST /api/npd/fgs/{fg_code}/build-d365`
MODAL-05 / MODAL-10. **`fa.build_d365` required.** Pre-conditions: `status_overall = Complete` (all 7 depts closed), MFA verified within last 5 min.

**Body:**
```json
{
  "mfa_code": "123456",
  "build_options": {
    "create_intermediate_wips": true,
    "push_to_d365": true
  }
}
```

**Response 200:** `{"build_run_id": "...", "products": [...], "status": "success"}`.

---

## 4. Formulations

### `GET /api/npd/fgs/{fg_code}/formulations`
List versions.

### `POST /api/npd/fgs/{fg_code}/formulations`
Create new draft (MODAL VersionSave). **`formulation.edit` required.**

### `PATCH /api/npd/formulations/{id}`
Edit ingredients while `status = draft`.

### `POST /api/npd/formulations/{id}/lock`
Lock version (MODAL FormulationLock). Body: `{"reason": "..."}`. Once locked, status moves to `locked`, `locked_by` and `locked_at` set. No further edits.

### `GET /api/npd/formulations/compare?a={id}&b={id}`
Returns ingredient-level diff for VersionCompareModal.

---

## 5. Allergens

### `GET /api/npd/fgs/{fg_code}/allergens`
Returns 14 allergens × state matrix + cascade source per allergen.

### `POST /api/npd/fgs/{fg_code}/allergens/recalc`
Force recalculation from RM data. Returns updated matrix. Idempotent.

### `POST /api/npd/fgs/{fg_code}/allergens/override`
MODAL-09. **`allergen.override` required.**

**Body:**
```json
{
  "allergen_code": "soy",
  "state": "absent",
  "reason": "Soya flour replaced with wheat gluten in BOM v0.3 — not declared on label."
}
```

Reason min 10 chars. Persists row + creates `npd_history` event.

---

## 6. Documents & risks

### `POST /api/npd/fgs/{fg_code}/documents`
Multipart upload (MODAL DocUpload).

**Form:** `file`, `doc_type`, `version_label`.

**Response 201:** `{"id": ..., "storage_url": "...", "size_bytes": ...}`. Storage URL is signed for 1h read.

### `GET /api/npd/fgs/{fg_code}/documents`
### `DELETE /api/npd/documents/{id}`

### `GET /api/npd/fgs/{fg_code}/risks`
### `POST /api/npd/fgs/{fg_code}/risks`
### `PATCH /api/npd/risks/{id}`
### `DELETE /api/npd/risks/{id}`

Body for create/edit:
```json
{
  "description": "Wheat flour contamination during line changeover",
  "likelihood": 2,
  "impact": 3,
  "mitigation": "Allergen wash protocol between WO batches",
  "owner_user_id": 42,
  "status": "open"
}
```

`score` is computed server-side as `likelihood * impact`.

---

## 7. History (audit log)

### `GET /api/npd/fgs/{fg_code}/history?limit=50`
Reverse chronological event list.

**Response:**
```json
[
  {
    "id": 1042,
    "event_type": "dept_close",
    "actor": "K. Walker",
    "description": "Closed Planning department.",
    "payload": {"dept_key": "planning"},
    "created_at": "2026-04-15T16:21:00Z"
  }
]
```

History is immutable — no UPDATE/DELETE endpoints.

---

## 8. WebSocket events

`/api/npd/ws` (authenticated). Server pushes:

| event | payload |
|---|---|
| `npd:fg-created` | `{fg_code, fg_id}` |
| `npd:fg-updated` | `{fg_code, changed_fields: [...]}` |
| `npd:fg-dept-closed` | `{fg_code, dept_key, by}` |
| `npd:fg-built` | `{fg_code, build_run_id}` |
| `npd:config-activated` | `{template_id}` |
| `npd:allergen-recalculated` | `{fg_code}` |

UI listens via `window.addEventListener("npd:...", ...)` — service layer translates WS events to DOM events.

---

## 9. Permissions endpoint

### `GET /api/npd/permissions`
Returns the current user's permission set for this tenant — drives `window.npd_can(...)` checks.

**Response:**
```json
{
  "role": "npd_manager",
  "actions": [
    "fa.edit", "fa.advance_gate",
    "brief.create", "brief.edit", "brief.convert_to_fa",
    "formulation.edit", "formulation.lock",
    "allergen.override", "risk.edit",
    "config.read", "config.request_changes"
  ]
}
```

Cached client-side for the session. Re-fetched on role switch.

---

## 10. Rate limits & quotas

| endpoint group | limit |
|---|---|
| read (`GET`) | 60/min/user |
| write (`POST`/`PATCH`) | 30/min/user |
| `build-d365` | 5/hour/tenant |
| document upload | 10/hour/user · 20MB max per file |
| allergen recalc | 30/hour/tenant |

429 response includes `Retry-After` header.
