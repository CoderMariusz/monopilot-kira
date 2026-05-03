// ============ Data screens: Products, BOMs, Suppliers/Customers, Units ============

// ---------- Products ----------
const ProductsScreen = () => {
  const [cat, setCat] = React.useState("all");
  const prods = cat === "all" ? window.SETTINGS_PRODUCTS : window.SETTINGS_PRODUCTS.filter(p => p.cat === cat);
  const cats = ["all", ...new Set(window.SETTINGS_PRODUCTS.map(p => p.cat))];

  return (
    <>
      <PageHead title="Products & SKUs" sub="Your sellable product catalog. SKUs link to BOMs and production lines."
        actions={<><button className="btn btn-secondary">Import CSV</button><button className="btn btn-primary">+ New product</button></>} />

      <div className="sg-section">
        <div className="sg-section-head">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="sg-section-title">{prods.length} products</div>
            <div className="pills">
              {cats.map(c => <button key={c} className={`pill ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c === "all" ? "All" : c}</button>)}
            </div>
          </div>
          <div style={{ width: 220 }}><input type="text" placeholder="Search SKU or name…" /></div>
        </div>
        <div className="sg-section-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Unit</th><th>Weight</th><th>BOM</th><th>Line</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {prods.map(p => (
                <tr key={p.sku}>
                  <td className="mono">{p.sku}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="muted">{p.cat}</td>
                  <td className="mono">{p.uom}</td>
                  <td className="mono num">{p.weight}</td>
                  <td><a className="mono" style={{ color: "var(--blue)", cursor: "pointer" }}>{p.bom}</a></td>
                  <td>{p.line}</td>
                  <td>
                    {p.status === "active" && <span className="badge badge-green">● Active</span>}
                    {p.status === "development" && <span className="badge badge-blue">◔ Development</span>}
                    {p.status === "pilot" && <span className="badge badge-amber">⚑ Pilot</span>}
                    {p.status === "discontinued" && <span className="badge badge-gray">✕ Discontinued</span>}
                  </td>
                  <td className="muted">⋮</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ---------- BOMs ----------
const BomsScreen = () => (
  <>
    <PageHead title="BOMs & recipes" sub="Production recipes linked to SKUs. Drafts in NPD get promoted here."
      actions={<><button className="btn btn-secondary">Compare versions</button><button className="btn btn-primary">+ New BOM</button></>} />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
      <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--blue)" }}>
        <div className="muted" style={{ fontSize: 11 }}>Active BOMs</div><div style={{ fontSize: 24, fontWeight: 700 }}>42</div>
      </div>
      <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--amber)" }}>
        <div className="muted" style={{ fontSize: 11 }}>Draft (NPD)</div><div style={{ fontSize: 24, fontWeight: 700 }}>6</div>
      </div>
      <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--gray-400, #94a3b8)" }}>
        <div className="muted" style={{ fontSize: 11 }}>Archived</div><div style={{ fontSize: 24, fontWeight: 700 }}>18</div>
      </div>
    </div>

    <Section title="BOMs">
      <table>
        <thead><tr><th>BOM #</th><th>Product</th><th>Version</th><th>Ingredients</th><th>Last updated</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {window.SETTINGS_BOMS.map(b => (
            <tr key={b.id}>
              <td className="mono">{b.id}</td>
              <td style={{ fontWeight: 500 }}>{b.product}</td>
              <td className="mono">{b.version}</td>
              <td className="mono num">{b.ingredients}</td>
              <td className="mono">{b.updated}</td>
              <td>{b.status === "active" ? <span className="badge badge-green">● Active</span> : <span className="badge badge-amber">⟳ Draft</span>}</td>
              <td className="muted">⋮</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>

    <Section title="BOM settings">
      <SRow label="Auto-calculate nutrition" hint="Compute nutrition from ingredient data on every save.">
        <Toggle on={true} />
      </SRow>
      <SRow label="Require allergen review" hint="Force allergen review when an ingredient is added or removed.">
        <Toggle on={true} />
      </SRow>
      <SRow label="BOM version retention" hint="How many historical versions to keep.">
        <select defaultValue="10"><option>5</option><option>10</option><option>25</option><option>All</option></select>
      </SRow>
    </Section>
  </>
);

// ---------- Processes (drives WIP code generation in NPD) ----------
const ProcessesScreen = () => {
  const procs = window.SETTINGS_PROCESSES || [];
  const [edit, setEdit] = React.useState(null);
  const active = procs.filter(p => p.active).length;
  const totalCounter = procs.reduce((s, p) => s + (p.counter || 0), 0);

  return (
    <>
      <PageHead
        title="Processes"
        sub="Manufacturing process catalog. Initials drive WIP code generation in NPD: WIP-{INITIAL}-{counter}."
        actions={<><button className="btn btn-secondary">Import</button><button className="btn btn-primary">+ Add process</button></>}
      />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--blue)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Active processes</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{active}</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--green)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Total WIPs generated</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{totalCounter.toLocaleString()}</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--amber)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Avg yield (default)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(procs.reduce((s, p) => s + p.yield_default, 0) / procs.length)}<span style={{ fontSize: 14, fontWeight: 500 }}>%</span>
          </div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--muted)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Inactive (archived)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{procs.length - active}</div>
        </div>
      </div>

      {/* Format explainer card */}
      <div className="card" style={{ marginBottom: 12, background: "#f8fafc" }}>
        <div className="card-head"><h3 className="card-title" style={{ fontSize: 13 }}>WIP code format</h3></div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0.5 }}>
            <span style={{ color: "var(--muted)" }}>WIP-</span>
            <span style={{ color: "var(--blue)" }}>XX</span>
            <span style={{ color: "var(--muted)" }}>-</span>
            <span style={{ color: "var(--green)" }}>NNNNNNN</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 600 }}>
            Each row below contributes <code style={{ color: "var(--blue)" }}>XX</code> (process initial) and the next sequential <code style={{ color: "var(--green)" }}>NNNNNNN</code>.
            Example chain: <span className="mono">RM0001 + RM0002 → MX → WIP-MX-0001248</span> · then <span className="mono">WIP-MX-0001248 + ING001 → BK → WIP-BK-0000894</span>.
          </div>
        </div>
      </div>

      <Section title="Process catalog">
        <table>
          <thead><tr>
            <th>ID</th><th>Code</th><th>Name</th><th>Initial (used in WIP)</th><th>Next WIP code</th><th>Counter</th><th>Default yield</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {procs.map(p => {
              const next = `WIP-${p.initial}-${String(p.counter + 1).padStart(7, "0")}`;
              return (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                  <td className="mono">{p.id}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{p.code}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}<div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{p.desc}</div></td>
                  <td>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", background: "#dbeafe", padding: "2px 8px", borderRadius: 4 }}>{p.initial}</span>
                  </td>
                  <td className="mono" style={{ color: "var(--green)" }}>{next}</td>
                  <td className="mono num">{p.counter.toLocaleString()}</td>
                  <td className="mono num">{p.yield_default}%</td>
                  <td>{p.active
                    ? <span className="badge badge-green">● Active</span>
                    : <span className="badge badge-gray">⊘ Inactive</span>}</td>
                  <td className="muted" style={{ cursor: "pointer" }} onClick={() => setEdit(p)}>✏️</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Process settings">
        <SRow label="Counter padding" hint="Number of digits in the WIP suffix (e.g. 7 → 0000001).">
          <select defaultValue="7"><option>5</option><option>6</option><option>7</option><option>8</option></select>
        </SRow>
        <SRow label="Auto-create WIP on Production save" hint="When a process is filled in NPD ProdDetail, increment counter and lock the generated WIP code.">
          <Toggle on={true} />
        </SRow>
        <SRow label="Lock initial after first WIP issued" hint="Prevent renaming a process initial after WIPs already exist using it (audit-safe).">
          <Toggle on={true} />
        </SRow>
        <SRow label="Allow legacy single-letter codes" hint="Accept old format (M, B, S…) on import, but generate new ones in 2-letter form.">
          <Toggle on={false} />
        </SRow>
      </Section>

      {/* Tiny edit drawer */}
      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, margin: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Edit process: {edit.name}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Changes to <strong>Initial</strong> only affect newly-generated WIP codes.</div>
            <div className="field"><label>Code</label><input className="mono" defaultValue={edit.code} /></div>
            <div className="field"><label>Name</label><input defaultValue={edit.name} /></div>
            <div className="field"><label>Initial (2 letters, used in WIP-XX-NNNNNNN)</label>
              <input className="mono" defaultValue={edit.initial} maxLength={2} style={{ textTransform: "uppercase", width: 100 }} />
              <div className="ff-help">Preview: <span className="mono" style={{ color: "var(--blue)" }}>WIP-{edit.initial}-{String(edit.counter + 1).padStart(7, "0")}</span></div>
            </div>
            <div className="field"><label>Default yield %</label><input type="number" defaultValue={edit.yield_default} /></div>
            <div className="field"><label>Counter (next value)</label>
              <input type="number" defaultValue={edit.counter} />
              <div className="ff-help">Manual override only — usually auto-incremented by NPD.</div>
            </div>
            <div className="field"><label>Description</label><input defaultValue={edit.desc} /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setEdit(null)}>Save changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- Suppliers & customers ----------
const PartnersScreen = () => {
  const [tab, setTab] = React.useState("all");
  const data = tab === "all" ? window.SETTINGS_PARTNERS :
               tab === "supplier" ? window.SETTINGS_PARTNERS.filter(p => p.type === "Supplier") :
               window.SETTINGS_PARTNERS.filter(p => p.type === "Customer");

  return (
    <>
      <PageHead title="Suppliers & customers" sub="Your trading partners. Used in purchase orders and shipments."
        actions={<><button className="btn btn-secondary">Import</button><button className="btn btn-primary">+ Add partner</button></>} />

      <div className="sg-section">
        <div className="sg-section-head">
          <div className="pills">
            <button className={`pill ${tab === "all" ? "on" : ""}`} onClick={() => setTab("all")}>All ({window.SETTINGS_PARTNERS.length})</button>
            <button className={`pill ${tab === "supplier" ? "on" : ""}`} onClick={() => setTab("supplier")}>Suppliers ({window.SETTINGS_PARTNERS.filter(p => p.type === "Supplier").length})</button>
            <button className={`pill ${tab === "customer" ? "on" : ""}`} onClick={() => setTab("customer")}>Customers ({window.SETTINGS_PARTNERS.filter(p => p.type === "Customer").length})</button>
          </div>
          <div style={{ width: 220 }}><input type="text" placeholder="Search partners…" /></div>
        </div>
        <div className="sg-section-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>ID</th><th>Type</th><th>Name</th><th>Primary contact</th><th>Email</th><th>Country</th><th>Since</th><th>Status</th></tr></thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id}>
                  <td className="mono">{p.id}</td>
                  <td>{p.type === "Supplier" ? <span className="badge badge-blue">Supplier</span> : <span className="badge badge-violet">Customer</span>}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.contact}</td>
                  <td className="muted">{p.email}</td>
                  <td className="mono">{p.country}</td>
                  <td className="mono">{p.since}</td>
                  <td><span className="badge badge-green">● Active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ---------- Units & conversions ----------
const UnitsScreen = () => {
  const groups = {};
  window.SETTINGS_UOM.forEach(u => {
    groups[u.cat] = groups[u.cat] || [];
    groups[u.cat].push(u);
  });

  return (
    <>
      <PageHead title="Units & conversions" sub="Units of measure used across recipes, stock, and shipping."
        actions={<button className="btn btn-primary">+ Add unit</button>} />

      {Object.entries(groups).map(([cat, units]) => (
        <Section key={cat} title={cat} sub={`Base unit: ${units.find(u => u.base)?.name}`}>
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Factor to base</th><th>Base?</th><th></th></tr></thead>
            <tbody>
              {units.map(u => (
                <tr key={u.code}>
                  <td className="mono">{u.code}</td>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td className="mono num">{u.factor}</td>
                  <td>{u.base ? <span className="badge badge-blue">Base</span> : <span className="muted">—</span>}</td>
                  <td className="muted">⋮</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}

      <Section title="Custom conversions" sub="Define non-linear conversions (e.g. Flour: 1 cup = 120g).">
        <div className="muted" style={{ fontSize: 12 }}>No custom conversions yet. <a style={{ color: "var(--blue)", cursor: "pointer" }}>+ Add conversion</a></div>
      </Section>
    </>
  );
};

Object.assign(window, { ProductsScreen, BomsScreen, PartnersScreen, UnitsScreen });
