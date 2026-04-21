// ============================================================================
// Brief screens — SCR-04 (Brief List) + SCR-05 (Brief Detail / Edit)
// Briefs are pre-FA intake: product idea, components, packaging.
// When marked complete and npd_manager converts → creates FA with pre-fill.
// ============================================================================

const BriefList = ({ onOpenBrief, openModal }) => {
  const briefs = window.NPD_BRIEFS;
  const [status, setStatus] = React.useState("All");
  const [tmpl, setTmpl]     = React.useState("All");
  const [search, setSearch] = React.useState("");

  const rows = briefs.filter(b => {
    if (status !== "All" && b.status !== status.toLowerCase()) return false;
    if (tmpl !== "All"   && b.template !== tmpl) return false;
    if (search && !(b.dev_code.toLowerCase().includes(search.toLowerCase()) || b.product_name.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const statusBadge = (s) => {
    if (s === "draft")     return <span className="badge badge-gray">Draft</span>;
    if (s === "complete")  return <span className="badge badge-amber">Complete</span>;
    if (s === "converted") return <span className="badge badge-green">✓ Converted</span>;
    if (s === "abandoned") return <span className="badge badge-gray" style={{ opacity: 0.6 }}>Abandoned</span>;
    return <span className="badge badge-gray">{s}</span>;
  };

  return (
    <>
      <div className="breadcrumb"><a>NPD</a> / Briefs</div>
      <div className="page-head">
        <div>
          <div className="page-title">NPD Briefs</div>
          <div className="muted" style={{ fontSize: 12 }}>{rows.length} of {briefs.length} visible · Briefs are pre-FA intake</div>
        </div>
        <button className="btn btn-primary" onClick={() => openModal("briefCreate")}>+ New Brief</button>
      </div>

      <div className="card" style={{ padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Search brief name or dev code…" style={{ flex: "1 1 240px" }} value={search} onChange={e => setSearch(e.target.value)} />
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: "auto" }}>
            <option>All</option><option>Draft</option><option>Complete</option><option>Converted</option><option>Abandoned</option>
          </select>
          <select value={tmpl} onChange={e => setTmpl(e.target.value)} style={{ width: "auto" }}>
            <option>All</option><option>Single</option><option>Multi</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th>Dev Code</th><th>Product Name</th><th>Template</th><th>Status</th><th>Linked FA</th><th>Created</th><th>Owner</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.brief_id} style={{ cursor: "pointer" }} onClick={() => onOpenBrief(b.brief_id)}>
                <td className="mono"><a style={{ color: "var(--blue)" }}>{b.dev_code}</a></td>
                <td style={{ fontWeight: 500 }}>{b.product_name}</td>
                <td><span className={`badge badge-${b.template === "Multi" ? "blue" : "gray"}`}>{b.template}</span></td>
                <td>{statusBadge(b.status)}</td>
                <td className="mono">{b.fa_code || <span className="muted">—</span>}</td>
                <td className="mono">{b.created_at}</td>
                <td>{b.owner}</td>
                <td onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => onOpenBrief(b.brief_id)}>Open</button>
                  {b.status === "complete" && <button className="btn btn-secondary btn-sm" onClick={() => openModal("briefConvert", { brief: b })}>Convert</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                No briefs match filters. <a style={{ cursor: "pointer", color: "var(--blue)" }} onClick={() => { setStatus("All"); setTmpl("All"); setSearch(""); }}>Clear</a>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

const BriefDetail = ({ briefId, onBack, openModal }) => {
  const brief = window.NPD_BRIEFS.find(b => b.brief_id === briefId) || window.NPD_BRIEFS[0];
  const [section, setSection] = React.useState("product");
  const isMulti = brief.template === "Multi";
  const converted = brief.status === "converted";

  const [components, setComponents] = React.useState([
    { component: "Prosciutto Crudo", slice_count: 4, supplier: "Negroni", code: "PR1839H", price: "28.00", weight_g: 70, pct: 32 },
    { component: "Salami Milano",    slice_count: 5, supplier: "Veroni",  code: "PR1942G", price: "22.00", weight_g: 80, pct: 36 },
    { component: "Cooked Ham",       slice_count: 4, supplier: "Beretta", code: "PR2045A", price: "18.50", weight_g: 70, pct: 32 }
  ]);
  const totalWeight = components.reduce((s, c) => s + Number(c.weight_g || 0), 0);
  const weightMismatch = Math.abs(totalWeight - 220) > 5; // target 220g ±5g

  return (
    <>
      <div className="breadcrumb"><a onClick={onBack}>NPD</a> / <a onClick={onBack}>Briefs</a> / {brief.dev_code}</div>
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="mono" style={{ fontSize: 16, color: "var(--blue)", fontWeight: 600 }}>{brief.dev_code}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{brief.product_name}</div>
            <span className={`badge badge-${brief.template === "Multi" ? "blue" : "gray"}`}>{brief.template}</span>
            {brief.status === "converted" && <span className="badge badge-green">✓ Converted → {brief.fa_code}</span>}
            {brief.status === "draft"     && <span className="badge badge-gray">Draft</span>}
            {brief.status === "complete"  && <span className="badge badge-amber">Complete</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" disabled={converted}>Save draft</button>
          {brief.status === "draft" && <button className="btn btn-primary" disabled={weightMismatch && isMulti}>Mark complete</button>}
          {brief.status === "complete" && <button className="btn btn-success" onClick={() => openModal("briefConvert", { brief })}>Convert to FA →</button>}
        </div>
      </div>

      {converted && (
        <div className="alert alert-green">
          This brief has been converted to <strong>{brief.fa_code}</strong>. It is now read-only. <a style={{ color: "var(--blue)", cursor: "pointer" }}>View FA →</a>
        </div>
      )}

      <div className="subnav-inline">
        <a className={section === "product" ? "on" : ""} onClick={() => setSection("product")}>Product details</a>
        <a className={section === "packaging" ? "on" : ""} onClick={() => setSection("packaging")}>Packaging</a>
      </div>

      {section === "product" && (
        <>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Section A — Product details</div>
            <div className="form-grid">
              <div className="field"><label>Product *</label><input defaultValue={brief.product_name} disabled={converted} /></div>
              <div className="field"><label>Volume (pcs/week)</label><input type="number" defaultValue={1200} disabled={converted} /></div>
              <div className="field"><label>Dev Code *</label>
                <input className="mono" defaultValue={brief.dev_code} disabled={converted} />
                <div className="ff-help">V08 · Format DEV&lt;YY&gt;&lt;MM&gt;-&lt;seq&gt;</div>
              </div>
              <div className="field"><label>Packs per case</label><input type="number" defaultValue={12} disabled={converted} /></div>
              <div className="field"><label>Benchmark identified</label><input defaultValue="Sokołów premium platter" disabled={converted} /></div>
            </div>
            <div className="field"><label>Comments</label>
              <textarea rows="3" disabled={converted} defaultValue="Premium platter concept — multi-component cold cut selection. Target Easter 2026 launch."></textarea>
            </div>
          </div>

          {isMulti && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">Components (Multi template)</div>
                <button className="btn btn-secondary btn-sm" disabled={converted}
                        onClick={() => setComponents([...components, { component: "", slice_count: null, supplier: "", code: "", price: "", weight_g: 0, pct: 0 }])}>
                  + Add component
                </button>
              </div>
              <table style={{ fontSize: 12 }}>
                <thead><tr><th>Component</th><th>Slice count</th><th>Supplier</th><th>Code</th><th>Price</th><th>Weight (g)</th><th>%</th><th></th></tr></thead>
                <tbody>
                  {components.map((c, i) => (
                    <tr key={i}>
                      <td><input defaultValue={c.component} disabled={converted} /></td>
                      <td><input type="number" defaultValue={c.slice_count || ""} disabled={converted} style={{ width: 70 }} /></td>
                      <td><input defaultValue={c.supplier} disabled={converted} /></td>
                      <td><input className="mono" defaultValue={c.code} disabled={converted} style={{ width: 100 }} /></td>
                      <td><input defaultValue={c.price} disabled={converted} style={{ width: 80 }} /></td>
                      <td><input type="number" defaultValue={c.weight_g} disabled={converted} style={{ width: 70 }} /></td>
                      <td className="mono num">{c.pct}%</td>
                      <td><button className="btn btn-ghost btn-sm" disabled={converted} onClick={() => setComponents(components.filter((_, j) => j !== i))}>✕</button></td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--gray-050)", fontWeight: 600 }}>
                    <td>Total</td><td></td><td></td><td></td><td></td>
                    <td className="mono num">{totalWeight}g</td>
                    <td className="mono num">{components.reduce((s, c) => s + Number(c.pct || 0), 0)}%</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              {weightMismatch && (
                <div className="alert alert-amber">
                  <strong>V-NPD-BRF-001:</strong> Component weights ({totalWeight}g) differ from target total by more than 5g. Adjust before Mark Complete.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {section === "packaging" && (
        <>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 10 }}>Section B — Packaging (C14-C20)</div>
            <div className="form-grid">
              <div className="field"><label>C14 · Primary packaging</label><input defaultValue="MAP tray 220g" disabled={converted} /></div>
              <div className="field"><label>C15 · Secondary packaging</label><input defaultValue="Cardboard case x10" disabled={converted} /></div>
              <div className="field"><label>C16 · Base web/tray/bag code</label>
                <input className="mono" defaultValue="WEB-PET-300" disabled={converted} />
                <div className="ff-help">Maps to fa.web on Convert.</div>
              </div>
              <div className="field"><label>C17 · Base web price</label><input defaultValue="0.18" disabled={converted} /></div>
              <div className="field"><label>C18 · Top web type</label><input defaultValue="PET/PE 70µm peel" disabled={converted} /></div>
              <div className="field"><label>C19 · Sleeve/Carton code</label>
                <input className="mono" defaultValue="MRP-CRT-012" disabled={converted} />
                <div className="ff-help">Maps to fa.mrp_sleeves on Convert.</div>
              </div>
              <div className="field"><label>C20 · Sleeve/Carton price</label><input defaultValue="0.22" disabled={converted} /></div>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Fields C21–C37</div>
              <span className="badge badge-gray" style={{ fontSize: 9 }}>Phase B.2 rescan pending</span>
            </div>
            <div className="alert alert-blue">
              Fields C21-C37 (sleeve artwork, lamination, gas mix, pallet config, retailer-specific labelling) are pending the Phase B.2 Brief schema rescan. Rendered inline but not yet mapped to FA.
            </div>
            <div className="form-grid">
              {[21, 22, 23, 24, 25, 26, 27, 28, 29].map(n => (
                <div key={n} className="field"><label>C{n} · [TBD]</label><input placeholder="[Field TBD — pending Brief schema rescan]" disabled /></div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { BriefList, BriefDetail });
