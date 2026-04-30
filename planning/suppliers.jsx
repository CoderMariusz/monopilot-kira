// ============ SUPPLIER CRUD — Fix-2 audit (PRD §6.1 / §6.6 Must Have) ============
//
// Three screens satisfying FR-PLAN-001 / FR-PLAN-002 / FR-PLAN-003:
//   * PlanSupplierList   — `SupplierTable` (tabs + filter + D365 sync badges)
//   * PlanSupplierDetail — `SupplierDetail` (read view + product assignments + PO history)
//   * SupplierFormModal  — `SupplierForm` (create/edit, Zod-style validation shape)
//
// Primitives reused (no _shared edits):
//   TabsCounted  — active / inactive / drift
//   EmptyState   — zero-results tables
//   Modal + Field + Summary — from _shared/modals.jsx
// =================================================================================

// ---------- D365 sync badge helper ----------
const SupplierD365Badge = ({ sync }) => {
  const map = {
    synced: ["badge-green", "D365 synced"],
    drift:  ["badge-amber", "D365 drift"],
    local:  ["badge-gray",  "Local only"],
  };
  const [cls, label] = map[sync] || ["badge-gray", sync || "—"];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

// ==================================================================
// SCREEN — Supplier list (SupplierTable)
// ==================================================================
const PlanSupplierList = ({ onOpenSupplier, onNav }) => {
  const [tab, setTab] = React.useState("active");
  const [search, setSearch] = React.useState("");
  const [modal, setModal] = React.useState(null); // null | { mode: "create"|"edit", data }

  const activeCount   = PLAN_SUPPLIERS.filter(s => s.active).length;
  const inactiveCount = PLAN_SUPPLIERS.filter(s => !s.active).length;
  const driftCount    = PLAN_SUPPLIERS.filter(s => s.d365Sync === "drift").length;

  const tabs = [
    { key: "active",   label: "Active",   count: activeCount,   tone: "ok"   },
    { key: "inactive", label: "Inactive", count: inactiveCount, tone: "neutral" },
    { key: "drift",    label: "D365 drift", count: driftCount,  tone: driftCount > 0 ? "warn" : "neutral" },
    { key: "all",      label: "All",      count: PLAN_SUPPLIERS.length, tone: "info" },
  ];

  const visible = PLAN_SUPPLIERS.filter(s => {
    if (tab === "active"   && !s.active) return false;
    if (tab === "inactive" &&  s.active) return false;
    if (tab === "drift"    && s.d365Sync !== "drift") return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) ||
           s.code.toLowerCase().includes(q) ||
           (s.email || "").toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Suppliers</div>
          <h1 className="page-title">Supplier master</h1>
          <div className="muted" style={{fontSize:12}}>
            {PLAN_SUPPLIERS.length} suppliers · {activeCount} active · {driftCount} with D365 drift · Soft-delete only (FR-PLAN-001)
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>alert("D365 supplier pull triggered (mock) · see 03-TECHNICAL §13 worker")}>⇅ Pull from D365</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setModal({ mode: "create", data: null })}>＋ New supplier</button>
        </div>
      </div>

      <div className="kpi-row-8">
        <div className="kpi"><div className="kpi-label">Active suppliers</div><div className="kpi-value">{activeCount}</div><div className="kpi-sub">Used on active POs</div></div>
        <div className="kpi amber"><div className="kpi-label">D365 drift</div><div className="kpi-value">{driftCount}</div><div className="kpi-sub">Admin resolve required (V-PLAN-PO-006)</div></div>
        <div className="kpi"><div className="kpi-label">Avg lead time</div><div className="kpi-value">{(PLAN_SUPPLIERS.filter(s=>s.active).reduce((a,s)=>a+s.leadTime,0) / Math.max(1, activeCount)).toFixed(1)}<span style={{fontSize:14,color:"var(--muted)"}}>d</span></div><div className="kpi-sub">Across active suppliers</div></div>
        <div className="kpi green"><div className="kpi-label">YTD spend</div><div className="kpi-value">£{(PLAN_SUPPLIERS.reduce((a,s)=>a+s.ytdSpend,0) / 1000).toFixed(1)}<span style={{fontSize:14,color:"var(--muted)"}}>k</span></div><div className="kpi-sub">2026 calendar year</div></div>
      </div>

      <TabsCounted current={tab} tabs={tabs} onChange={setTab} ariaLabel="Supplier status filter"/>

      <div className="filter-bar">
        <input type="text" placeholder="Search supplier name, code, email…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:280}}/>
        <select style={{width:140}}><option>All countries</option><option>GB</option><option>PL</option><option>ES</option><option>DE</option><option>SE</option></select>
        <select style={{width:140}}><option>All currencies</option><option>GBP</option><option>EUR</option><option>PLN</option></select>
        <select style={{width:160}}><option>All D365 states</option><option>Synced</option><option>Drift</option><option>Local only</option></select>
        <span className="spacer"></span>
        <button className="clear-all" onClick={()=>{setSearch(""); setTab("active");}}>Clear all filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      <div className="card" style={{padding:0}}>
        {visible.length === 0 ? (
          <EmptyState
            icon="◫"
            title="No suppliers match this filter"
            body={search ? `No supplier matches "${search}".` : "Switch tab or clear filters to see suppliers in other states."}
            action={{ label: "Clear filters", onClick: () => {setSearch(""); setTab("all");} }}
          />
        ) : (
          <table>
            <thead><tr>
              <th>Code</th><th>Name</th><th>Country</th><th>Currency</th>
              <th>Payment terms</th><th style={{textAlign:"right"}}>Lead time</th>
              <th style={{textAlign:"right"}}>Open POs</th>
              <th>D365 sync</th><th>Status</th><th style={{width:120}}></th>
            </tr></thead>
            <tbody>
              {visible.map(s => (
                <tr key={s.id} onClick={()=>onOpenSupplier(s.id)} style={{cursor:"pointer"}}>
                  <td className="mono" style={{fontWeight:600}}>{s.code}</td>
                  <td>
                    <div style={{fontWeight:500}}>{s.name}</div>
                    <div className="muted" style={{fontSize:11}}>{s.email || <span className="muted">—</span>}</div>
                  </td>
                  <td className="mono">{s.country}</td>
                  <td className="mono">{s.currency}</td>
                  <td style={{fontSize:12}}>{s.paymentTerms}</td>
                  <td className="num mono">{s.leadTime}d</td>
                  <td className="num mono">{s.openPOs}</td>
                  <td><SupplierD365Badge sync={s.d365Sync}/></td>
                  <td>
                    {s.active
                      ? <span className="badge badge-green" style={{fontSize:10}}>Active</span>
                      : <span className="badge badge-gray" style={{fontSize:10}}>Inactive</span>}
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>onOpenSupplier(s.id)}>View</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setModal({ mode: "edit", data: s })}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="row-flex" style={{marginTop:10, fontSize:12, color:"var(--muted)"}}>
        <span>Showing {visible.length} of {PLAN_SUPPLIERS.length}</span>
        <span className="spacer"></span>
        <span className="mono">FR-PLAN-001 · FR-PLAN-002 · FR-PLAN-003 · V-PLAN-PO-001/002/006</span>
      </div>

      <SupplierFormModal
        open={!!modal}
        mode={modal?.mode}
        supplier={modal?.data}
        onClose={()=>setModal(null)}
      />
    </>
  );
};

// ==================================================================
// SCREEN — Supplier detail (SupplierDetail)
// ==================================================================
const PlanSupplierDetail = ({ supplierId, onBack, onNav, onOpenPo }) => {
  const [tab, setTab] = React.useState("info");
  const [modal, setModal] = React.useState(null);

  // Default to first supplier if no id supplied (router/gallery case).
  const s = PLAN_SUPPLIERS.find(x => x.id === supplierId) || PLAN_SUPPLIERS[0];
  const products = SUPPLIER_PRODUCTS[s.id] || [];
  const relatedPOs = PLAN_POS.filter(p => p.supplierCode === s.code);

  const tabs = [
    { key: "info",     label: "Info",               count: null },
    { key: "products", label: "Products",           count: products.length,   tone: "info" },
    { key: "pos",      label: "Purchase orders",    count: relatedPOs.length, tone: relatedPOs.length ? "info" : "neutral" },
    { key: "d365",     label: "D365 sync",          count: null, tone: s.d365Sync === "drift" ? "warn" : null },
  ];

  return (
    <>
      <div className="breadcrumb" style={{marginBottom:6}}>
        <a onClick={()=>onNav("dashboard")}>Planning</a> · <a onClick={onBack}>Suppliers</a> · <span className="mono">{s.code}</span>
      </div>

      <div className="wo-head">
        <div className="wo-head-top">
          <div>
            <div className="wo-head-title">
              <span className="wo-head-code">{s.code}</span>
              <span className="wo-head-name">{s.name}</span>
              {s.active
                ? <span className="badge badge-green" style={{fontSize:10}}>Active</span>
                : <span className="badge badge-gray" style={{fontSize:10}}>Inactive</span>}
              <SupplierD365Badge sync={s.d365Sync}/>
            </div>
            <div className="muted" style={{fontSize:12, marginTop:3}}>
              {s.country} · {s.currency} · {s.paymentTerms} · lead time <b className="mono">{s.leadTime}d</b>
              &nbsp;·&nbsp; {relatedPOs.length} POs · YTD <b className="mono">£{s.ytdSpend.toLocaleString()}</b>
            </div>
          </div>
          <div className="wo-head-actions">
            <button className="btn btn-secondary btn-sm" onClick={()=>setModal("edit")}>Edit</button>
            {s.active
              ? <button className="btn btn-danger btn-sm" onClick={()=>setModal("deactivate")}>Deactivate (soft)</button>
              : <button className="btn btn-primary btn-sm" onClick={()=>setModal("reactivate")}>Reactivate</button>}
          </div>
        </div>
      </div>

      {s.d365Sync === "drift" && (
        <div className="alert-amber alert-box" style={{marginBottom:12}}>
          <span>⚠</span>
          <div>
            <b>D365 drift detected.</b>
            <div style={{fontSize:11}}>Local edit after last D365 pull — admin must resolve before next nightly sync (FR-PLAN-003 + V-PLAN-PO-006). Last sync: <span className="mono">{s.lastSync}</span></div>
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-secondary" onClick={()=>alert("→ 02-SETTINGS §11 D365 admin · resolve drift")}>Resolve drift →</button>
          </div>
        </div>
      )}

      <TabsCounted current={tab} tabs={tabs} onChange={setTab} ariaLabel="Supplier detail tabs"/>

      {tab === "info" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12, alignItems:"flex-start"}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Supplier info</h3></div>
            <div style={{fontSize:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              <div><div className="label">Supplier code</div><div className="mono" style={{fontWeight:600}}>{s.code}</div></div>
              <div><div className="label">Name</div><div>{s.name}</div></div>
              <div><div className="label">Country (ISO-3166)</div><div className="mono">{s.country}</div></div>
              <div><div className="label">Currency (ISO-4217)</div><div className="mono">{s.currency}</div></div>
              <div><div className="label">Payment terms</div><div>{s.paymentTerms}</div></div>
              <div><div className="label">Default lead time</div><div className="mono">{s.leadTime} days</div></div>
              <div><div className="label">Email</div><div>{s.email || <span className="muted">—</span>}</div></div>
              <div><div className="label">Phone (E.164)</div><div className="mono">{s.phone || <span className="muted">—</span>}</div></div>
              <div><div className="label">Rating (internal)</div><div className="mono">{s.rating.toFixed(1)} / 5.0</div></div>
              <div>
                <div className="label">Certifications</div>
                <div className="row-flex" style={{flexWrap:"wrap", gap:4}}>
                  {s.certifications.length
                    ? s.certifications.map(c => <span key={c} className="badge badge-blue" style={{fontSize:10}}>{c}</span>)
                    : <span className="muted">—</span>}
                </div>
              </div>
            </div>
            <div style={{marginTop:10}}>
              <div className="label">Notes</div>
              <div style={{fontSize:12, lineHeight:1.45}}>{s.notes}</div>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Activity</h3></div>
              <div style={{fontSize:12, display:"grid", gap:8}}>
                <div className="row-flex"><span className="muted">YTD spend</span><span className="spacer"></span><span className="mono" style={{fontWeight:600}}>£{s.ytdSpend.toLocaleString()}</span></div>
                <div className="row-flex"><span className="muted">Open POs</span><span className="spacer"></span><span className="mono">{s.openPOs}</span></div>
                <div className="row-flex"><span className="muted">Total POs (history)</span><span className="spacer"></span><span className="mono">{relatedPOs.length}</span></div>
                <div className="row-flex"><span className="muted">Default products</span><span className="spacer"></span><span className="mono">{s.defaultProducts}</span></div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Quick actions</h3></div>
              <div style={{display:"grid", gap:6, fontSize:12}}>
                <button className="btn btn-primary btn-sm" disabled={!s.active} onClick={()=>alert("→ PO fast-flow prefilled with " + s.name)}>＋ Create PO for this supplier</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>setTab("products")}>Manage product assignments →</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>setTab("pos")}>View PO history ({relatedPOs.length}) →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "products" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
            <h3 className="card-title">Product assignments</h3>
            <div className="row-flex">
              <span className="muted" style={{fontSize:11}}>{products.filter(p=>p.isDefault).length} default · {products.length} total · max 1 default per product (FR-PLAN-002)</span>
              <button className="btn btn-secondary btn-sm" disabled={!s.active}>＋ Assign product</button>
            </div>
          </div>
          {products.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No product assignments"
              body={s.active
                ? "This supplier is active but has no products assigned yet. Assign products so PO fast-flow can pick them as smart defaults."
                : "Inactive suppliers keep their history but cannot be assigned new products."}
              action={s.active ? { label: "Assign product", onClick: ()=>{} } : null}
            />
          ) : (
            <table>
              <thead><tr>
                <th>Product</th><th>Name</th>
                <th style={{textAlign:"right"}}>Unit price</th>
                <th style={{textAlign:"right"}}>Discount %</th>
                <th style={{textAlign:"right"}}>Lead time</th>
                <th>Default?</th><th style={{width:90}}></th>
              </tr></thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.product}>
                    <td className="mono" style={{fontWeight:600}}>{p.product}</td>
                    <td>{p.name}</td>
                    <td className="num mono">{s.currency} {p.unitPrice.toFixed(2)}</td>
                    <td className="num mono">{p.discount}%</td>
                    <td className="num mono">{p.leadTime}d</td>
                    <td>
                      {p.isDefault
                        ? <span className="badge badge-green" style={{fontSize:10}}>✓ Default</span>
                        : <span className="muted" style={{fontSize:11}}>—</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "pos" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
            <h3 className="card-title">Purchase order history</h3>
            <span className="muted" style={{fontSize:11}}>{relatedPOs.length} POs · sorted by expected delivery</span>
          </div>
          {relatedPOs.length === 0 ? (
            <EmptyState icon="⇪" title="No POs on record" body={`${s.name} has no purchase orders yet.`}/>
          ) : (
            <table>
              <thead><tr>
                <th>PO number</th><th>Expected delivery</th>
                <th style={{textAlign:"right"}}>Lines</th>
                <th>Status</th><th style={{textAlign:"right"}}>Total</th>
                <th style={{width:90}}></th>
              </tr></thead>
              <tbody>
                {relatedPOs.map(p => (
                  <tr key={p.id} onClick={()=>onOpenPo && onOpenPo(p.id)} style={{cursor:"pointer"}}>
                    <td className="mono" style={{fontWeight:600}}>
                      {p.id}
                      {p.drift && <span className="drift-tag" title="D365 drift">D365 drift</span>}
                    </td>
                    <td className="mono" style={{fontSize:12}}>
                      {p.exp}
                      <div className="muted" style={{fontSize:10, color: p.overdue ? "var(--red-700)" : "var(--muted)"}}>
                        {p.overdue ? `Overdue ${p.overdue}d` : p.rel}
                      </div>
                    </td>
                    <td className="num mono">{p.lines}</td>
                    <td><POStatus s={p.status}/></td>
                    <td className="num mono">{p.total}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation(); onOpenPo && onOpenPo(p.id);}}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "d365" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">D365 sync status</h3></div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:12}}>
            <div><div className="label">Sync state</div><div><SupplierD365Badge sync={s.d365Sync}/></div></div>
            <div><div className="label">D365 supplier id</div><div className="mono">{s.d365Id || <span className="muted">not in D365</span>}</div></div>
            <div><div className="label">Last sync</div><div className="mono">{s.lastSync || <span className="muted">never</span>}</div></div>
            <div><div className="label">Source</div><div>{s.d365Id ? "Pulled from D365 (03-TECHNICAL §13 worker)" : "Created locally"}</div></div>
          </div>
          {s.d365Sync === "drift" && (
            <div className="alert-amber alert-box" style={{marginTop:12, fontSize:12}}>
              <span>⚠</span>
              <div>
                <b>Drift since last pull.</b> A local edit happened after the last D365 supplier snapshot.
                Admin must open <span className="mono">02-SETTINGS §11 · D365 admin</span> to review the field-level diff
                and choose <b>keep local</b> or <b>overwrite with D365</b>. Drift blocks the nightly pull from auto-updating this row.
              </div>
            </div>
          )}
          {!s.d365Id && (
            <div className="alert-blue alert-box" style={{marginTop:12, fontSize:12}}>
              <span>ⓘ</span>
              <div>Local-only supplier — never synced to D365. Pushing to D365 is a P2 capability.</div>
            </div>
          )}
        </div>
      )}

      <SupplierFormModal
        open={modal === "edit"}
        mode="edit"
        supplier={s}
        onClose={()=>setModal(null)}
      />

      {modal === "deactivate" && (
        <DeactivateSupplierModal open onClose={()=>setModal(null)} supplier={s}/>
      )}
    </>
  );
};

// ==================================================================
// MODAL — Supplier create / edit (SupplierForm)
// ==================================================================
const SupplierFormModal = ({ open, mode = "create", supplier, onClose }) => {
  const isEdit = mode === "edit" && supplier;
  const blank = {
    code: "", name: "", country: "GB", currency: "GBP",
    paymentTerms: "Net 30", leadTime: 7,
    email: "", phone: "", rating: 4.0, active: true, notes: "",
  };
  const [form, setForm] = React.useState(isEdit ? { ...blank, ...supplier } : blank);

  React.useEffect(() => {
    if (!open) return;
    setForm(isEdit ? { ...blank, ...supplier } : blank);
  }, [open, mode, supplier?.id]);

  if (!open) return null;

  // Zod-style validation mirrors FR-PLAN-001 rules.
  const codeRx    = /^SUP-\d{4,}$/;
  const countryRx = /^[A-Z]{2}$/;
  const ccyRx     = /^[A-Z]{3}$/;
  const emailRx   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRx   = /^\+?[0-9 ()\-]{6,}$/;

  const errors = {};
  if (!form.code || !codeRx.test(form.code))         errors.code = "Format SUP-NNNN (4+ digits)";
  if (!form.name || form.name.length < 2)            errors.name = "Required (min 2 chars)";
  if (!countryRx.test(form.country))                 errors.country = "ISO-3166 alpha-2 (e.g. GB, PL)";
  if (!ccyRx.test(form.currency))                    errors.currency = "ISO-4217 alpha-3 (e.g. GBP)";
  if (form.leadTime < 0 || form.leadTime > 120)      errors.leadTime = "0–120 days";
  if (form.email && !emailRx.test(form.email))       errors.email = "Invalid email";
  if (form.phone && !phoneRx.test(form.phone))       errors.phone = "Use E.164-ish format";
  // V-PLAN-PO-001: supplier code unique per tenant
  if (!isEdit && PLAN_SUPPLIERS.some(s => s.code === form.code))
    errors.code = "Code already exists (V-PLAN-PO-001)";

  const valid = Object.keys(errors).length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title={isEdit ? `Edit supplier — ${supplier.code}` : "Create supplier"}
      subtitle={isEdit ? "Changes take effect immediately · audit logged" : "Fields marked * are required · Zod validation mirrors FR-PLAN-001"}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid}
          onClick={() => { alert((isEdit ? "Updated " : "Created ") + form.code + " (mock save)"); onClose(); }}>
          {isEdit ? "Save changes" : "Create supplier"}
        </button>
      </>}
    >
      <div className="grid-2">
        <Field label="Supplier code" required help="Format SUP-NNNN — used as PO reference" error={errors.code}>
          <input value={form.code} disabled={isEdit} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="SUP-0078"/>
        </Field>
        <Field label="Name" required error={errors.name}>
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Acme Meats Ltd."/>
        </Field>
        <Field label="Country (ISO-3166)" required error={errors.country}>
          <input value={form.country} onChange={e => setForm({...form, country: e.target.value.toUpperCase()})} placeholder="GB" maxLength={2} style={{maxWidth:80}}/>
        </Field>
        <Field label="Currency (ISO-4217)" required error={errors.currency}>
          <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
            <option>GBP</option><option>EUR</option><option>PLN</option><option>USD</option>
          </select>
        </Field>
        <Field label="Payment terms" required>
          <select value={form.paymentTerms} onChange={e => setForm({...form, paymentTerms: e.target.value})}>
            <option>Net 14</option><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Prepaid</option>
          </select>
        </Field>
        <Field label="Default lead time (days)" required error={errors.leadTime}>
          <input type="number" min={0} max={120} value={form.leadTime} onChange={e => setForm({...form, leadTime: +e.target.value})}/>
        </Field>
        <Field label="Email" error={errors.email} help="Used for PO confirmations">
          <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="orders@example.com"/>
        </Field>
        <Field label="Phone (E.164)" error={errors.phone} help="Optional — international format">
          <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+44 20 7946 0891"/>
        </Field>
        <Field label="Rating (internal)">
          <input type="number" min={0} max={5} step={0.1} value={form.rating} onChange={e => setForm({...form, rating: +e.target.value})}/>
        </Field>
        <Field label="Active">
          <label style={{fontSize:12}}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})}/>
            &nbsp;Supplier is active (uncheck = soft delete)
          </label>
        </Field>
      </div>
      <Field label="Notes" help="Visible in supplier detail + PO fast-flow (internal only)">
        <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Internal comments, allergen cross-risk notes, EUDR scope…"/>
      </Field>

      {isEdit && supplier?.d365Sync === "synced" && (
        <div className="alert-amber alert-box" style={{marginTop:10, fontSize:12}}>
          <span>⚠</span>
          <div>
            <b>Editing a D365-synced supplier will mark this row as <span className="mono">drift</span>.</b>
            <div style={{fontSize:11}}>FR-PLAN-003 — admin must resolve drift before next nightly sync.</div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ==================================================================
// MODAL — Deactivate supplier (soft delete per FR-PLAN-001)
// ==================================================================
const DeactivateSupplierModal = ({ open, onClose, supplier }) => {
  const [confirm, setConfirm] = React.useState("");
  const match = confirm.trim() === supplier?.code;
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} size="default"
      title={`Deactivate ${supplier?.code}?`}
      subtitle="Soft delete — history preserved per FR-PLAN-001"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!match} onClick={() => { alert("Deactivated " + supplier?.code + " (mock)"); onClose(); }}>
          Deactivate supplier
        </button>
      </>}
    >
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div>
          <b>Soft delete — no data is removed.</b>
          <div style={{fontSize:11}}>
            Existing POs keep their supplier link (audit trail). New POs cannot select this supplier.
            To reactivate later, open the supplier and click <i>Reactivate</i>.
          </div>
        </div>
      </div>
      <Summary rows={[
        { label: "Supplier",    value: supplier?.name },
        { label: "Open POs",    value: supplier?.openPOs + " — will continue to completion", mono: false },
        { label: "YTD spend",   value: "£" + (supplier?.ytdSpend || 0).toLocaleString(), mono: true },
        { label: "Action",      value: "Set is_active = false", emphasis: true },
      ]}/>
      <Field label={`Type ${supplier?.code} to confirm`} required>
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={supplier?.code} style={{fontFamily:"var(--font-mono)"}}/>
      </Field>
    </Modal>
  );
};

Object.assign(window, {
  PlanSupplierList, PlanSupplierDetail,
  SupplierFormModal, DeactivateSupplierModal,
  SupplierD365Badge,
});
