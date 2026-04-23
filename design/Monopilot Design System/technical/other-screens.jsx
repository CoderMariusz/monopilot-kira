// ============ Adjacent screens: Routings, Work centers, Specs, Params, ECO, Maintenance, Tooling, Allergens, History ============

// ---------- Routings list ----------
const RoutingsScreen = () => (
  <div>
    <PageHeader title="Routings" breadcrumb="Technical › Routings"
      sub="Reusable process templates shared across BOMs. Edits here propagate to all linked products."
      actions={<><button className="btn btn-secondary">⧉ Duplicate</button><button className="btn btn-primary">+ New routing</button></>} />
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead><tr>
          <th style={{ width: 110 }}>Code</th>
          <th>Routing name</th>
          <th style={{ width: 120, textAlign: "right" }}>Linked products</th>
          <th style={{ width: 100, textAlign: "right" }}>Steps</th>
          <th style={{ width: 120 }}>Last updated</th>
          <th style={{ width: 60 }}></th>
        </tr></thead>
        <tbody>
          {ROUTINGS_LIST.map(r => (
            <tr key={r.id} style={{ cursor: "pointer" }}>
              <td className="mono">{r.id}</td>
              <td style={{ fontWeight: 500 }}>{r.name}</td>
              <td className="num mono">{r.products}</td>
              <td className="num mono">{r.steps}</td>
              <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{r.updated}</td>
              <td style={{ color: "var(--muted)" }}>›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------- [REMOVED] Work centers ----------
// Audit Fix-5b (B)-class hallucination: work_centers belong in 02-SETTINGS §12
// (production_lines + machines tables), not in 03-TECHNICAL. Screen removed.

// ---------- Product specifications ----------
const SpecsScreen = () => (
  <div>
    <PageHeader title="Product specifications" breadcrumb="Technical › Specifications"
      sub="Customer-facing technical data sheets. Anchored to a BOM version; released on approval."
      actions={<button className="btn btn-primary">+ New specification</button>} />
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead><tr>
          <th style={{ width: 100 }}>Spec</th>
          <th>Product</th>
          <th style={{ width: 120 }}>Category</th>
          <th style={{ width: 60 }}>Ver.</th>
          <th style={{ width: 140 }}>Customer</th>
          <th style={{ width: 100 }}>Shelf life</th>
          <th style={{ width: 100 }}>Storage</th>
          <th style={{ width: 100 }}>Status</th>
        </tr></thead>
        <tbody>
          {SPECS.map(s => (
            <tr key={s.id} style={{ cursor: "pointer" }}>
              <td className="mono">{s.id}</td>
              <td style={{ fontWeight: 500 }}>{s.name}</td>
              <td style={{ fontSize: 12 }}>{s.category}</td>
              <td className="mono" style={{ color: "var(--muted)" }}>{s.version}</td>
              <td style={{ fontSize: 12 }}>{s.customer}</td>
              <td className="mono" style={{ fontSize: 12 }}>{s.shelf}</td>
              <td className="mono" style={{ fontSize: 12 }}>{s.storage}</td>
              <td><Status s={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------- Allergen matrix ----------
const AllergenScreen = () => {
  const allergens = ["Gluten", "Eggs", "Milk", "Soy", "Nuts", "Celery", "Mustard", "Sesame", "Fish", "Sulphites"];
  const rows = [
    { p: "Kiełbasa śląska 450g", v: [0,0,0,0,0,0,1,0,0,0] },
    { p: "Pasztet drobiowy 180g", v: [0,2,1,0,0,1,1,0,0,0] },
    { p: "Gulasz wołowy 350g", v: [1,0,0,1,0,2,1,0,0,1] },
    { p: "Szynka wędzona 150g", v: [0,0,0,0,0,0,1,0,0,1] },
    { p: "Filet kurczaka 180g", v: [0,0,0,0,0,0,0,0,0,0] },
    { p: "Pierogi z mięsem 400g", v: [2,2,2,0,0,0,1,0,0,0] },
    { p: "Klopsiki pomidorowe 320g", v: [2,1,0,0,0,2,1,0,0,1] },
  ];
  return (
    <div>
      <PageHeader title="Allergen matrix" breadcrumb="Technical › Allergen matrix"
        sub="At-a-glance allergen presence across all active products. Click a cell to see source ingredients." />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ minWidth: 220 }}>Product</th>
            {allergens.map(a => <th key={a} style={{ textAlign: "center", fontSize: 10, writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "10px 4px", height: 100 }}>{a}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{r.p}</td>
                {r.v.map((val, j) => (
                  <td key={j} style={{ textAlign: "center", padding: 4 }}>
                    <div style={{
                      width: 20, height: 20, margin: "0 auto", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#fff", fontWeight: 600,
                      background: val === 2 ? "var(--red)" : val === 1 ? "var(--amber)" : "var(--gray-100)",
                    }}>
                      {val === 2 ? "●" : val === 1 ? "⚠" : ""}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 11, color: "var(--muted)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--red)", verticalAlign: "middle", borderRadius: 2, marginRight: 4 }}></span> Contains</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--amber)", verticalAlign: "middle", borderRadius: 2, marginRight: 4 }}></span> May contain</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--gray-100)", border: "1px solid var(--border)", verticalAlign: "middle", borderRadius: 2, marginRight: 4 }}></span> Absent</span>
      </div>
    </div>
  );
};

// ---------- [REMOVED] Process parameters / CCP / HACCP ----------
// Audit Fix-5b (B)-class hallucination: CCP register + HACCP belong in
// 09-QUALITY (ISO 22000 Phase 2+ regulatory roadmap), not 03-TECHNICAL Phase 1.

// ---------- ECO (Change Control) ----------
const EcoScreen = () => (
  <div>
    <PageHeader title="Change control (ECO)" breadcrumb="Technical › Change control"
      sub="Engineering Change Orders — all recipe, process, packaging and supplier changes flow through here."
      actions={<button className="btn btn-primary">+ New ECO</button>} />

    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
      <div className="pills">
        <button className="pill on">Open <span style={{ opacity: 0.5, marginLeft: 4 }}>3</span></button>
        <button className="pill">Closed <span style={{ opacity: 0.5, marginLeft: 4 }}>47</span></button>
        <button className="pill">All <span style={{ opacity: 0.5, marginLeft: 4 }}>50</span></button>
      </div>
    </div>

    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead><tr>
          <th style={{ width: 100 }}>ECO</th>
          <th>Title</th>
          <th style={{ width: 120 }}>Affects</th>
          <th style={{ width: 140 }}>Impact</th>
          <th style={{ width: 120 }}>Author</th>
          <th style={{ width: 100 }}>Opened</th>
          <th style={{ width: 110 }}>Priority</th>
          <th style={{ width: 110 }}>Status</th>
        </tr></thead>
        <tbody>
          {ECO_LIST.map(e => (
            <tr key={e.id} style={{ cursor: "pointer" }}>
              <td className="mono">{e.id}</td>
              <td style={{ fontWeight: 500 }}>{e.title}</td>
              <td className="mono" style={{ fontSize: 12 }}>{e.bom}</td>
              <td style={{ fontSize: 12 }}>{e.impact}</td>
              <td style={{ fontSize: 12 }}>{e.author}</td>
              <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{e.opened}</td>
              <td>
                <span className={"badge " + (e.priority === "high" ? "badge-red" : e.priority === "low" ? "badge-gray" : "badge-blue")}>
                  {e.priority}
                </span>
              </td>
              <td><Status s={e.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------- Revision history (global) ----------
const HistoryScreen = () => {
  const events = [
    { t: "2026-04-19 14:22", user: "A. Majewska", act: "Published", obj: "B-0443 Szynka wędzona plastry — v2 draft", tag: "BOM" },
    { t: "2026-04-18 09:41", user: "A. Majewska", act: "Opened ECO", obj: "ECO-2044 Redukcja soli -10%", tag: "ECO" },
    { t: "2026-04-15 16:08", user: "P. Kowalski", act: "Approved", obj: "ECO-2043 Zmiana dostawcy pieprzu", tag: "ECO" },
    { t: "2026-04-14 11:55", user: "A. Majewska", act: "Updated routing", obj: "RT-CM-02 Kiełbasa pieczona — step 70 rewrite", tag: "Routing" },
    { t: "2026-04-14 11:10", user: "A. Majewska", act: "Published", obj: "B-0421 Kiełbasa śląska — v7 (Viscofan)", tag: "BOM" },
    { t: "2026-04-11 10:32", user: "K. Nowacki", act: "Opened ECO", obj: "ECO-2042 Nowy karton pierogów", tag: "ECO" },
    { t: "2026-04-08 15:18", user: "QA team", act: "Signed off", obj: "Parameters review — CCP-2 all products", tag: "CCP" },
    { t: "2026-04-02 08:50", user: "A. Majewska", act: "Supplier switch", obj: "R-3001 Osłonka Ø26: Kalle → Viscofan", tag: "Material" },
  ];
  const tagColor = { BOM: "badge-blue", ECO: "badge-violet", Routing: "badge-amber", CCP: "badge-red", Material: "badge-gray" };
  return (
    <div>
      <PageHeader title="Revision history" breadcrumb="Technical › Revision history"
        sub="Immutable audit log of every change to BOMs, routings, specs and ECOs. Filter, export, subscribe to alerts." />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 0 }}>
        {events.map((e, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 80px 140px 1fr 100px", gap: 12, padding: "10px 16px", borderBottom: i < events.length - 1 ? "1px solid var(--border)" : 0, alignItems: "center" }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{e.t}</div>
            <div><span className={"badge " + tagColor[e.tag]}>{e.tag}</span></div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{e.user}</div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>{e.act}: </span>{e.obj}
            </div>
            <div style={{ textAlign: "right" }}>
              <button className="btn btn-ghost btn-sm">View</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- [REMOVED] Maintenance plans ----------
// Audit Fix-5b (B)-class hallucination: maintenance plans belong in
// 13-MAINTENANCE module, not 03-TECHNICAL. Screen removed.

// ---------- [REMOVED] Tooling & consumables ----------
// Audit Fix-5b (B)-class hallucination: tooling/consumables belong in
// 05-WAREHOUSE or 13-MAINTENANCE, not 03-TECHNICAL.

const PageHeader = ({ title, breadcrumb, sub, actions }) => (
  <div className="page-head">
    <div>
      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
      <div className="page-title">{title}</div>
      {sub && <div className="muted" style={{ fontSize: 13, maxWidth: 720 }}>{sub}</div>}
    </div>
    {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
  </div>
);

// ============================================================
//  NEW BUILT SCREENS — Step 3 of Technical module completion
// ============================================================

// ---------- TEC-017 · Technical Dashboard ----------
const TechDashboardScreen = ({ openModal }) => (
  <div>
    <PageHeader title="Technical dashboard" breadcrumb="Technical › Dashboard"
      sub="Health of the technical master data: active records, change velocity, variance alerts, D365 sync." />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 18 }}>
      {TEC_DASH_KPIS.map((k, i) => <KPI key={i} label={k.label} value={k.value} sub={k.sub} tone={k.tone} />)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>BOM change velocity — last 8 weeks</strong>
          <span className="mono muted" style={{ fontSize: 11 }}>published vs. drafted</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "6px 0" }}>
          {[3,5,2,6,4,7,5,9].map((v, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: v * 12, background: i === 7 ? "var(--blue)" : "var(--blue-050)", borderRadius: "3px 3px 0 0" }}></div>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>W{i - 7 + 17}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <strong style={{ fontSize: 14, display: "block", marginBottom: 8 }}>Active alerts</strong>
        <div className="alert-red alert-box" style={{ fontSize: 12, marginBottom: 8 }}>
          <span>⚠</span>
          <div><b>Allergen conflict</b> — FA5200 Pasztet scheduled on LINE-02 after FA5100 (mustard cross-contact).</div>
        </div>
        <div className="alert-amber alert-box" style={{ fontSize: 12, marginBottom: 8 }}>
          <span>△</span>
          <div><b>Cost drift</b> — FA5301 std. cost −5.8% vs. last week (raw beef price drop).</div>
        </div>
        <div className="alert-blue alert-box" style={{ fontSize: 12 }}>
          <span>ⓘ</span>
          <div><b>4 D365 drift items</b> awaiting resolution. <a style={{ color: "var(--blue)", cursor: "pointer" }}>Open →</a></div>
        </div>
      </div>
    </div>

    <div style={{ marginTop: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13 }}>Recent BOM changes</div>
      <table>
        <thead><tr><th style={{ width: 120 }}>When</th><th style={{ width: 110 }}>BOM</th><th>Change</th><th style={{ width: 100 }}>Author</th><th style={{ width: 100 }}>Status</th></tr></thead>
        <tbody>
          {VERSIONS.slice(0, 5).map((v, i) => (
            <tr key={i}>
              <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{v.date}</td>
              <td className="mono">B-0421 · {v.v}</td>
              <td style={{ fontSize: 13 }}>{v.summary}</td>
              <td style={{ fontSize: 12 }}>{v.author}</td>
              <td><Status s={v.current ? "active" : "closed"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------- TEC-003 · Materials list ----------
const MaterialsListScreen = ({ onOpen }) => {
  const [filter, setFilter] = React.useState("all");
  const rows = filter === "all" ? MATERIALS : MATERIALS.filter(m => m.type === filter);
  const typeTag = { RM: "badge-blue", intermediate: "badge-violet", packaging: "badge-amber" };
  return (
    <div>
      <PageHeader title="Materials" breadcrumb="Technical › Materials"
        sub="Raw materials, intermediates (sub-BOM outputs) and packaging consumed by finished products."
        actions={<><button className="btn btn-secondary">⇪ Import</button><button className="btn btn-primary">+ New material</button></>} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div className="pills">
          {[["all","All"],["RM","Raw materials"],["intermediate","Intermediates"],["packaging","Packaging"]].map(([k, lbl]) => (
            <button key={k} className={"pill " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>
              {lbl} <span style={{ opacity: 0.5, marginLeft: 4 }}>{k === "all" ? MATERIALS.length : MATERIALS.filter(m => m.type === k).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 110 }}>Code</th>
            <th>Name</th>
            <th style={{ width: 120 }}>Type</th>
            <th style={{ width: 60 }}>UoM</th>
            <th style={{ width: 100, textAlign: "right" }}>Cost / UoM (zł)</th>
            <th style={{ width: 180 }}>Primary supplier</th>
            <th style={{ width: 120 }}>Updated</th>
            <th style={{ width: 100 }}>Status</th>
          </tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.code} style={{ cursor: "pointer" }} onClick={() => onOpen && onOpen(m.code)}>
                <td className="mono">{m.code}</td>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td><span className={"badge " + (typeTag[m.type] || "badge-gray")}>{m.type}</span></td>
                <td className="mono" style={{ fontSize: 12 }}>{m.uom}</td>
                <td className="num mono">{m.cost.toFixed(2)}</td>
                <td style={{ fontSize: 12 }}>{m.supplier}</td>
                <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{m.updated}</td>
                <td><Status s={m.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- TEC-004 · Material detail ----------
const MaterialDetailScreen = ({ code = "R-1001", onBack }) => {
  const [tab, setTab] = React.useState("overview");
  const m = MATERIALS.find(x => x.code === code) || MATERIALS[0];
  const suppliers = MATERIAL_SUPPLIERS.filter(s => s.mat === m.code);
  const subs = MATERIAL_SUBSTITUTES.filter(s => s.mat === m.code);
  const history = MATERIAL_COST_HISTORY[m.code] || [];
  return (
    <div>
      <PageHeader title={m.code + " · " + m.name} breadcrumb={<><a onClick={onBack} style={{ cursor: "pointer" }}>Materials</a> › {m.code}</>}
        sub={"Technical master for " + m.type + ". Used in BOMs, PO catalogue and customer specs."}
        actions={<><button className="btn btn-secondary">⇅ Where-used</button><button className="btn btn-primary">✎ Edit</button></>} />

      <div className="tabs-bar" style={{ marginBottom: 12 }}>
        {[["overview","Overview"],["spec","Specification"],["suppliers","Suppliers"],["substitutes","Substitutes"],["cost","Cost history"]].map(([k, lbl]) => (
          <button key={k} className={"tab-btn " + (tab === k ? "on" : "")} onClick={() => setTab(k)}>{lbl}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
            <strong style={{ fontSize: 13 }}>Identification</strong>
            <Summary rows={[
              { label: "Code",          value: m.code,  mono: true },
              { label: "Name",          value: m.name,  mono: false },
              { label: "Type",          value: m.type,  mono: true },
              { label: "UoM",           value: m.uom,   mono: true },
              { label: "Std cost / " + m.uom, value: m.cost.toFixed(2) + " zł", mono: true, emphasis: true },
            ]} />
          </div>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
            <strong style={{ fontSize: 13 }}>Compliance & safety</strong>
            <Summary rows={[
              { label: "Kosher",      value: "not certified", mono: false },
              { label: "Halal",       value: "not certified", mono: false },
              { label: "Allergens",   value: "none declared", mono: false },
              { label: "CoA required",value: "yes",           mono: false },
              { label: "MSDS",        value: "n/a",           mono: true },
            ]} />
          </div>
        </div>
      )}

      {tab === "spec" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18 }}>
          <strong style={{ fontSize: 13 }}>Incoming specification</strong>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
            <div><b>Wygląd:</b> mięso wieprzowe klasy II, bez skóry, bez kości, bez ścięgien powyżej 10 mm.</div>
            <div><b>Temperatura przyjęcia:</b> 0–4°C.</div>
            <div><b>pH (24h post-mortem):</b> 5.6–6.2.</div>
            <div><b>Mikrobiologia:</b> TPC &lt; 10⁶ cfu/g, E.coli &lt; 10² cfu/g, Salmonella nieobecna w 25 g.</div>
            <div><b>Pakowanie:</b> karton 20 kg foliowany, paleta EUR.</div>
            <div><b>Pochodzenie:</b> UE (Polska / DE).</div>
          </div>
          <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 12 }}>
            <span>ⓘ</span><div>Specification locked to supplier agreement <b className="mono">SA-SOK-2024-11</b>. Next review 2026-11.</div>
          </div>
        </div>
      )}

      {tab === "suppliers" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <table>
            <thead><tr><th>Supplier</th><th style={{ width: 120, textAlign: "right" }}>Price / kg (zł)</th><th style={{ width: 80 }}>Lead</th><th style={{ width: 100 }}>MOQ</th><th style={{ width: 100 }}>Role</th></tr></thead>
            <tbody>
              {suppliers.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{s.supplier}</td>
                  <td className="num mono">{s.price.toFixed(2)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.lead}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.moq}</td>
                  <td>{s.primary ? <span className="badge badge-green">Primary</span> : <span className="badge badge-gray">Backup</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "substitutes" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {subs.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>No substitutes defined for {m.code}.</div>
          ) : (
            <table>
              <thead><tr><th style={{ width: 220 }}>Substitute</th><th>Note</th><th style={{ width: 180 }}>Allowed</th></tr></thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{s.sub}</td>
                    <td style={{ fontSize: 13 }}>{s.note}</td>
                    <td><span className={"badge " + (s.allowed === "not permitted" ? "badge-red" : "badge-amber")}>{s.allowed}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "cost" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
          <strong style={{ fontSize: 13 }}>Cost history</strong>
          {history.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>No cost history recorded.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110, marginTop: 14 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: (h.price / 10) * 80, background: "var(--blue-050)", border: "1px solid var(--blue)", borderRadius: "3px 3px 0 0" }}></div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{h.price.toFixed(2)}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{h.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- TEC-009 · Nutrition panel ----------
const NutritionScreen = () => {
  const n = NUTRITION;
  return (
    <div>
      <PageHeader title="Nutrition panel" breadcrumb="Technical › Nutrition"
        sub={n.product + " · " + n.basis + ". Drives the %DV column and the customer-facing label."} />
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <span>Macronutrients</span>
            <span className="mono muted" style={{ fontSize: 11 }}>per 100 g</span>
          </div>
          <table>
            <thead><tr><th>Nutrient</th><th style={{ width: 140, textAlign: "right" }}>Amount</th><th style={{ width: 80, textAlign: "right" }}>%DV</th><th style={{ width: 100 }}>Source</th></tr></thead>
            <tbody>
              {n.macros.map((m, i) => (
                <tr key={i} style={m.hi ? { background: "var(--amber-050a)" } : {}}>
                  <td style={{ paddingLeft: m.indent ? 24 : 12, fontSize: 13, fontWeight: m.indent ? 400 : 500, color: m.indent ? "var(--muted)" : "var(--text)" }}>{m.k}</td>
                  <td className="num mono" style={{ fontWeight: m.hi ? 700 : 500 }}>{m.v}</td>
                  <td className="num mono" style={{ color: m.dv >= 30 ? "var(--amber-700)" : "var(--muted)" }}>{m.dv}%</td>
                  <td>
                    <span className={"badge " + (m.source === "analysis" ? "badge-green" : "badge-gray")} style={{ fontSize: 10 }}>
                      {m.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13 }}>Allergens (14 EU declared)</div>
          <table>
            <thead><tr><th>Allergen</th><th style={{ width: 90, textAlign: "center" }}>Present</th><th style={{ width: 110, textAlign: "center" }}>May contain</th><th>Source</th></tr></thead>
            <tbody>
              {n.allergens.map((a, i) => (
                <tr key={i} style={a.present ? { background: "var(--red-050a)" } : a.mayContain ? { background: "var(--amber-050a)" } : {}}>
                  <td style={{ fontWeight: 500 }}>{a.a}</td>
                  <td style={{ textAlign: "center" }}>{a.present ? <span className="badge badge-red">●</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td style={{ textAlign: "center" }}>{a.mayContain ? <span className="badge badge-amber">⚠</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td style={{ fontSize: 11, color: "var(--muted)" }}>{a.source || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 12 }}>
        <span>ⓘ</span><div>Recomputed from BOM v7 on 2026-04-14. <a style={{ color: "var(--blue)", cursor: "pointer" }}>Open Nutrition Calculator →</a></div>
      </div>
    </div>
  );
};

// ---------- TEC-013 · Costing view ----------
const CostingScreen = ({ openModal }) => {
  const c = COSTING;
  const toneBg = { blue: "var(--blue)", amber: "var(--amber)", violet: "#8b5cf6", red: "var(--red)", gray: "var(--gray-500, #94a3b8)" };
  const margin = c.sellPrice - c.stdCost;
  const marginPct = (margin / c.sellPrice * 100).toFixed(1);
  return (
    <div>
      <PageHeader title="Recipe costing" breadcrumb="Technical › Costing"
        sub={c.product + " · Standard-cost roll-up based on BOM v7 quantities × current material/labor rates."}
        actions={<>
          <button className="btn btn-secondary" onClick={() => openModal && openModal("costRollupRecompute")}>↻ Recompute</button>
          <button className="btn btn-primary">Export cost sheet</button>
        </>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <KPI label="Std. cost" value={c.stdCost.toFixed(2) + " zł"} sub="per pack" tone="default" />
        <KPI label="Target cost" value={c.target.toFixed(2) + " zł"} sub={"Δ +" + (c.stdCost - c.target).toFixed(2) + " zł"} tone="amber" />
        <KPI label="Selling price" value={c.sellPrice.toFixed(2) + " zł"} sub="retail MSRP" tone="default" />
        <KPI label="Margin" value={marginPct + "%"} sub={"+" + margin.toFixed(2) + " zł"} tone={marginPct > 30 ? "green" : "amber"} />
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <strong style={{ fontSize: 13 }}>Cost breakdown</strong>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {c.breakdown.map((b, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{b.cat}</span>
                <span className="mono" style={{ fontWeight: 600 }}>{b.val.toFixed(2)} zł <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {b.pct}%</span></span>
              </div>
              <div style={{ height: 14, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: b.pct + "%", height: "100%", background: toneBg[b.tone] || "var(--blue)" }}></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 10, background: "var(--gray-050)", borderRadius: 4, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <strong>Total std. cost</strong>
          <strong className="mono">{c.stdCost.toFixed(2)} zł</strong>
        </div>
      </div>

      <div className="alert-amber alert-box" style={{ marginTop: 14, fontSize: 12 }}>
        <span>△</span>
        <div><b>Yield {c.yieldPct}%</b> — recipe is losing 9% in thermal processing. Target is 92%. <a style={{ color: "var(--blue)", cursor: "pointer" }}>Open yield analysis →</a></div>
      </div>
    </div>
  );
};

// ---------- TEC-014 · Shelf-life panel ----------
const ShelfLifeScreen = ({ openModal }) => (
  <div>
    <PageHeader title="Shelf-life configuration" breadcrumb="Technical › Shelf life"
      sub="Per-product use_by vs. best_before rules. Regulatory preset controls which mode is legally required."
      actions={<button className="btn btn-primary">+ New rule</button>} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
      <KPI label="Products"        value="124" sub="with rules" tone="default" />
      <KPI label="Use-by rules"    value={SHELF_LIFE.filter(s => s.mode === "use_by").length + ""} sub="perishable" tone="red" />
      <KPI label="Best-before"     value={SHELF_LIFE.filter(s => s.mode === "best_before").length + ""} sub="ambient / frozen" tone="green" />
      <KPI label="Overrides (wk)"  value="2" sub="reason-logged" tone="amber" />
    </div>
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead><tr>
          <th>Product</th>
          <th style={{ width: 110 }}>Mode</th>
          <th style={{ width: 100, textAlign: "right" }}>Duration</th>
          <th style={{ width: 100 }}>Storage</th>
          <th style={{ width: 180 }}>Regulatory preset</th>
          <th>Notes</th>
          <th style={{ width: 90 }}></th>
        </tr></thead>
        <tbody>
          {SHELF_LIFE.map((s, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{s.product}</td>
              <td><span className={"badge " + (s.mode === "use_by" ? "badge-red" : "badge-green")}>{s.mode}</span></td>
              <td className="num mono">{s.mode === "use_by" ? s.useBy + " days" : s.best + " days"}</td>
              <td className="mono" style={{ fontSize: 12 }}>{s.storage}</td>
              <td style={{ fontSize: 12 }}>{s.preset}</td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{s.notes || "—"}</td>
              <td style={{ textAlign: "right" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openModal && openModal("shelfLifeOverride", s)}>Override</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 12 }}>
      <span>ⓘ</span><div>Regulatory preset source: <b>Rozp. (UE) 1169/2011</b> · PL HACCP GHP/GMP guidelines. Changing a preset triggers ECO.</div>
    </div>
  </div>
);

// ---------- TEC-015 · Cost history ----------
const CostHistoryScreen = () => {
  const rows = COST_HISTORY;
  const maxCost = Math.max(...rows.map(r => r.cost));
  const minCost = Math.min(...rows.map(r => r.cost));
  const range = maxCost - minCost || 1;
  return (
    <div>
      <PageHeader title="Cost history" breadcrumb="Technical › Cost history"
        sub="B-0421 Kiełbasa śląska pieczona 450g · Timeline of standard-cost changes across BOM versions." />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong style={{ fontSize: 13 }}>Sparkline · std cost (zł)</strong>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            <span>min <b className="mono" style={{ color: "var(--green-700)" }}>{minCost.toFixed(2)}</b></span>
            <span style={{ marginLeft: 14 }}>max <b className="mono" style={{ color: "var(--red-700)" }}>{maxCost.toFixed(2)}</b></span>
          </div>
        </div>
        <svg width="100%" height="90" viewBox="0 0 700 90" preserveAspectRatio="none">
          {rows.map((r, i) => {
            if (i === 0) return null;
            const x1 = ((i - 1) / (rows.length - 1)) * 680 + 10;
            const y1 = 80 - ((rows[i-1].cost - minCost) / range) * 70;
            const x2 = (i / (rows.length - 1)) * 680 + 10;
            const y2 = 80 - ((r.cost - minCost) / range) * 70;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--blue)" strokeWidth="2" />;
          })}
          {rows.map((r, i) => {
            const x = (i / (rows.length - 1)) * 680 + 10;
            const y = 80 - ((r.cost - minCost) / range) * 70;
            return <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="var(--blue)" strokeWidth="2" />;
          })}
        </svg>
      </div>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 120 }}>Date</th>
            <th style={{ width: 80 }}>Version</th>
            <th style={{ width: 110, textAlign: "right" }}>Cost (zł)</th>
            <th style={{ width: 90, textAlign: "right" }}>Δ%</th>
            <th>Reason</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{r.date}</td>
                <td className="mono">{r.src}</td>
                <td className="num mono" style={{ fontWeight: 600 }}>{r.cost.toFixed(2)}</td>
                <td className="num mono" style={{ color: r.delta > 0 ? "var(--red-700)" : r.delta < 0 ? "var(--green-700)" : "var(--muted)", fontWeight: 600 }}>
                  {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}%
                </td>
                <td style={{ fontSize: 13 }}>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- TEC-016 · Traceability search ----------
const TraceabilityScreen = () => {
  const [q, setQ] = React.useState(TRACE_SAMPLE.query);
  const [searched, setSearched] = React.useState(true);
  const t = TRACE_SAMPLE;
  return (
    <div>
      <PageHeader title="Traceability search" breadcrumb="Technical › Traceability"
        sub="FSMA-204 / GS1-style trace. Enter an LP, batch, lot or WO to see forward shipments and backward components." />

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="LP-YYYY-MM-DD-##### · WO-##### · Batch-########## · Lot-XXX-######-##"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)" }} />
          <button className="btn btn-primary" onClick={() => setSearched(true)}>Search</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          Tip — scanning a GS1 label auto-fills LP with AI(00).
        </div>
      </div>

      {searched && (
        <>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{t.query}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{t.product}</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{t.woBatch}</div>
              </div>
              <button className="btn btn-secondary btn-sm">Export CSV</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span>← Backward — components in</span>
                <span className="muted" style={{ fontSize: 11 }}>{t.backward.length} lots</span>
              </div>
              <table>
                <thead><tr><th>Component</th><th style={{ width: 140 }}>Lot</th><th style={{ width: 80, textAlign: "right" }}>Qty</th><th style={{ width: 50 }}>CoA</th></tr></thead>
                <tbody>
                  {t.backward.map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{b.comp}<div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{b.supplier}</div></td>
                      <td className="mono" style={{ fontSize: 11 }}>{b.lot}</td>
                      <td className="num mono" style={{ fontSize: 12 }}>{b.qty}</td>
                      <td>{b.coa === "yes" ? <span className="badge badge-green" style={{ fontSize: 10 }}>✓</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span>Forward — shipments out →</span>
                <span className="muted" style={{ fontSize: 11 }}>{t.forward.length} LPs</span>
              </div>
              <table>
                <thead><tr><th>LP</th><th style={{ width: 80, textAlign: "right" }}>Qty</th><th>Destination</th><th style={{ width: 80 }}>Stage</th></tr></thead>
                <tbody>
                  {t.forward.map((f, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontSize: 11 }}>{f.lp}<div style={{ fontSize: 10, color: "var(--muted)" }}>{f.at}</div></td>
                      <td className="num mono" style={{ fontSize: 12 }}>{f.qty}</td>
                      <td style={{ fontSize: 12 }}>{f.dest}</td>
                      <td><span className={"badge " + (f.stage === "Shipped" ? "badge-green" : "badge-amber")} style={{ fontSize: 10 }}>{f.stage}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ---------- TEC-070 · D365 sync status ----------
const D365StatusScreen = ({ openModal }) => {
  const s = D365_STATUS;
  const healthTone = { ok: "green", degraded: "amber", down: "red" }[s.health] || "default";
  return (
    <div>
      <PageHeader title="D365 sync dashboard (TEC-070)" breadcrumb="Technical › D365 integration › Dashboard"
        sub={s.env + " · " + s.connector + " · last runs + status + success rate"}
        actions={<>
          <button className="btn btn-secondary" onClick={() => openModal && openModal("d365ItemSync")}>↻ Run delta sync</button>
          <button className="btn btn-primary">Run full sync</button>
        </>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <KPI label="Connector health" value={s.health} sub={"env · " + s.env} tone={healthTone} />
        <KPI label="Last full sync"   value={s.lastFull.slice(11)} sub={s.lastFull.slice(0, 10)} tone="default" />
        <KPI label="Last delta sync"  value={s.lastDelta.slice(11)} sub={s.lastDelta.slice(0, 10)} tone="default" />
        <KPI label="Next scheduled"   value={s.nextRun.slice(11)} sub={s.nextRun.slice(0, 10)} tone="blue" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <KPI label="Queue (inbound)"  value={s.queueIn + ""} sub="pending items → MP" tone="default" />
        <KPI label="Queue (outbound)" value={s.queueOut + ""} sub="pending items → D365" tone="default" />
        <KPI label="Drift open"       value={s.driftOpen + ""} sub={s.dlq + " in DLQ"} tone="amber" />
      </div>
      <div className="alert-amber alert-box" style={{ fontSize: 12 }}>
        <span>△</span>
        <div>
          <b>Connector degraded</b> — 2 items in dead-letter queue (cost drift above auto-accept threshold). Resolve drift to clear DLQ.
          <div style={{ marginTop: 6 }}><button className="btn btn-ghost btn-sm" onClick={() => openModal && openModal("d365DriftResolve")}>Open drift resolution →</button></div>
        </div>
      </div>
    </div>
  );
};

// ---------- TEC-074 · D365 field mapping (re-coded from TEC-071 per audit) ----------
const D365MappingScreen = () => {
  const statusTone = { ok: "badge-green", warn: "badge-amber", unmapped: "badge-red" };
  return (
    <div>
      <PageHeader title="D365 field mapping (TEC-074)" breadcrumb="Technical › D365 integration › Field mapping"
        sub="MonoPilot attribute → D365 field. Changes require admin role and trigger a full re-sync. TEC-074 is the prototype extension (PRD v3 reserves TEC-070..073 for dashboard/manual/audit/DLQ)."
        actions={<button className="btn btn-primary">Edit mapping</button>} />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th>MonoPilot field</th>
            <th>D365 field</th>
            <th style={{ width: 90 }}>Type</th>
            <th style={{ width: 90 }}>Direction</th>
            <th>Transform</th>
            <th style={{ width: 100 }}>Status</th>
          </tr></thead>
          <tbody>
            {D365_FIELDS.map((f, i) => (
              <tr key={i}>
                <td className="mono" style={{ fontSize: 12 }}>{f.mp}</td>
                <td className="mono" style={{ fontSize: 12 }}>{f.d365}</td>
                <td style={{ fontSize: 12 }}>{f.type}</td>
                <td>
                  <span className={"badge " + (f.direction === "push" ? "badge-blue" : "badge-violet")} style={{ fontSize: 10 }}>
                    {f.direction === "push" ? "MP → D365" : "D365 → MP"}
                  </span>
                </td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{f.transform}</td>
                <td><span className={"badge " + statusTone[f.status]}>{f.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="alert-red alert-box" style={{ marginTop: 12, fontSize: 12 }}>
        <span>⚠</span><div><b>1 unmapped field</b> (Item.allergens[]) — values are lost on push to D365. Open backlog item <span className="mono">MIG-D365-ALLG-01</span>.</div>
      </div>
    </div>
  );
};

// ---------- TEC-073 · D365 DLQ Manager / drift resolution (re-coded per PRD §13.8) ----------
const D365DriftScreen = ({ openModal }) => {
  const sevTone = { low: "badge-gray", medium: "badge-amber", high: "badge-red" };
  return (
    <div>
      <PageHeader title="D365 DLQ manager (TEC-073)" breadcrumb="Technical › D365 integration › DLQ manager"
        sub="Failed records + detected drift. Admin may retry, accept (overwrite with MP value), reject (keep D365), or mark resolved after manual D365 fix." />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 120 }}>Drift ID</th>
            <th>Entity</th>
            <th style={{ width: 90 }}>Item</th>
            <th style={{ width: 110 }}>MP value</th>
            <th style={{ width: 110 }}>D365 value</th>
            <th style={{ width: 80 }}>Δ</th>
            <th style={{ width: 90 }}>Severity</th>
            <th style={{ width: 140 }}>Detected</th>
            <th style={{ width: 160 }}>Action</th>
          </tr></thead>
          <tbody>
            {D365_DRIFT.map(d => (
              <tr key={d.id}>
                <td className="mono">{d.id}</td>
                <td className="mono" style={{ fontSize: 12 }}>{d.entity}</td>
                <td className="mono">{d.code}</td>
                <td className="num mono" style={{ fontSize: 12 }}>{d.mp}</td>
                <td className="num mono" style={{ fontSize: 12 }}>{d.d365}</td>
                <td className="mono" style={{ fontSize: 12, color: "var(--red-700)", fontWeight: 600 }}>{d.delta}</td>
                <td><span className={"badge " + sevTone[d.severity]}>{d.severity}</span></td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{d.detected}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal && openModal("d365DriftResolve", d)}>Accept</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- TEC-072 · D365 sync audit log (re-coded per PRD §13.8) ----------
const D365LogScreen = () => {
  const kindTone = { full: "badge-violet", delta: "badge-blue", manual: "badge-amber" };
  return (
    <div>
      <PageHeader title="D365 sync audit log (TEC-072)" breadcrumb="Technical › D365 integration › Audit log"
        sub="Per-run detail with diff view. Timeline of recent sync runs — scheduled and manual. Click a row to see per-item payload." />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 0 }}>
        {D365_LOG.map((l, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "150px 90px 100px 80px 80px 80px 140px 1fr",
            gap: 12, padding: "10px 16px", borderBottom: i < D365_LOG.length - 1 ? "1px solid var(--border)" : 0, alignItems: "center",
            background: l.err > 0 ? "var(--red-050a)" : "transparent"
          }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{l.t}</div>
            <div><span className={"badge " + kindTone[l.kind]}>{l.kind}</span></div>
            <div className="mono" style={{ fontSize: 12 }}>{l.duration}</div>
            <div className="num mono" style={{ fontSize: 12 }}>{l.items}</div>
            <div className="num mono" style={{ color: "var(--green-700)", fontSize: 12 }}>✓ {l.ok}</div>
            <div className="num mono" style={{ color: l.err > 0 ? "var(--red)" : "var(--muted)", fontSize: 12, fontWeight: l.err > 0 ? 600 : 400 }}>{l.err > 0 ? "✗ " + l.err : "—"}</div>
            <div style={{ fontSize: 12 }}>{l.by}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{l.note || ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
//  NEW (Fix-5b) SCREENS — Products List + Product Detail (11 tabs)
//  + 3 allergen compliance screens + D365 Manual Sync
// ============================================================

// ---------- TEC-001 · Products List (the ALL-types master list) ----------
const ProductsListScreen = ({ onOpen, openModal }) => {
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [allergenFilter, setAllergenFilter] = React.useState("all");
  const [d365Filter, setD365Filter] = React.useState("all");

  const typeTone = { FA: "badge-blue", Intermediate: "badge-blue", RM: "badge-gray", "Co-product": "badge-green", Byproduct: "badge-amber" };
  const statusTone = { active: "badge-green", draft: "badge-amber", deprecated: "badge-gray", blocked: "badge-red" };
  const d365Tone = { synced: "badge-green", drift: "badge-amber", error: "badge-red", unsynced: "badge-gray" };

  const rows = PRODUCTS_LIST.filter(p => {
    if (search && !(p.code.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase()))) return false;
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (allergenFilter !== "all" && !p.allergens.includes(allergenFilter)) return false;
    if (d365Filter !== "all" && p.d365 !== d365Filter) return false;
    return true;
  });

  const allergenOptions = Array.from(new Set(PRODUCTS_LIST.flatMap(p => p.allergens))).sort();

  const clearAll = () => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setAllergenFilter("all"); setD365Filter("all"); };
  const active = search || typeFilter !== "all" || statusFilter !== "all" || allergenFilter !== "all" || d365Filter !== "all";

  return (
    <div>
      <PageHeader title="Products" breadcrumb="Technical › Products"
        sub="Master list of all items — finished articles, intermediates, raw materials, co-products, by-products. Single source of truth per PRD §6."
        actions={<>
          <button className="btn btn-secondary">⇪ Import CSV</button>
          <button className="btn btn-secondary">Export CSV</button>
          <button className="btn btn-primary" onClick={() => openModal && openModal("productCreate")}>+ Create product</button>
        </>} />

      {/* Filter bar — 5 filters per PRD TEC-010 */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code or name…"
               style={{ flex: "1 1 240px", padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 4 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All types</option>
          <option value="FA">FA (Finished Article)</option>
          <option value="Intermediate">Intermediate</option>
          <option value="RM">Raw Material</option>
          <option value="Co-product">Co-product</option>
          <option value="Byproduct">Byproduct</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="deprecated">Deprecated</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={allergenFilter} onChange={e => setAllergenFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All allergens</option>
          {allergenOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={d365Filter} onChange={e => setD365Filter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">D365: all</option>
          <option value="synced">Synced</option>
          <option value="drift">Drift</option>
          <option value="error">Error</option>
          <option value="unsynced">Unsynced</option>
        </select>
        {active && <a onClick={clearAll} style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>Clear filters</a>}
      </div>

      {/* D365 drift banner — per UX §"States" microcopy */}
      {PRODUCTS_LIST.filter(p => p.d365 === "drift").length > 0 && (
        <div className="alert-amber alert-box" style={{ marginBottom: 12, fontSize: 12 }}>
          <span>△</span>
          <div>
            <b>{PRODUCTS_LIST.filter(p => p.d365 === "drift").length} items have D365 drift</b> — open DLQ manager to review.
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 110 }}>Code</th>
            <th>Name</th>
            <th style={{ width: 120 }}>Type</th>
            <th style={{ width: 50 }}>UoM</th>
            <th style={{ width: 80 }}>Weight</th>
            <th style={{ width: 90, textAlign: "right" }}>Cost/kg</th>
            <th style={{ width: 90 }}>Status</th>
            <th style={{ width: 150 }}>Allergens</th>
            <th style={{ width: 90 }}>D365</th>
            <th style={{ width: 60 }}></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                {active ? <>No products match your filters. <a onClick={clearAll} style={{ color: "var(--blue)", cursor: "pointer" }}>Clear filters</a></>
                        : <>No products yet — create your first product.</>}
              </td></tr>
            ) : rows.map(p => (
              <tr key={p.code} style={{ cursor: "pointer" }} onClick={() => onOpen && onOpen(p.code)}>
                <td className="mono">{p.code}</td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td><span className={"badge " + (typeTone[p.type] || "badge-gray")} style={{ opacity: p.type === "Intermediate" ? 0.75 : 1 }}>{p.type}</span></td>
                <td className="mono" style={{ fontSize: 12 }}>{p.uom}</td>
                <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{p.weight}</span></td>
                <td className="num mono">{p.cost.toFixed(2)}</td>
                <td><span className={"badge " + statusTone[p.status]}>{p.status}</span></td>
                <td style={{ fontSize: 11, color: "var(--muted)" }}>
                  {p.allergens.length === 0 ? <span style={{ color: "var(--muted)" }}>—</span>
                    : p.allergens.length <= 3 ? p.allergens.join(", ")
                    : p.allergens.slice(0, 3).join(", ") + " +" + (p.allergens.length - 3)}
                </td>
                <td><span className={"badge " + d365Tone[p.d365]} style={{ fontSize: 10 }}>{p.d365}</span></td>
                <td style={{ color: "var(--muted)" }}>›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 8, textAlign: "right" }}>Showing {rows.length} of {PRODUCTS_LIST.length} products</div>
    </div>
  );
};

// ---------- TEC-002 · Product detail — 11 tabs per PRD §6 ----------
const ProductDetailScreen = ({ code = "FA5100", onBack, openModal }) => {
  const [tab, setTab] = React.useState("general");
  const p = PRODUCTS_LIST.find(x => x.code === code) || PRODUCTS_LIST[0];
  const isFA = p.type === "FA";
  const statusTone = { active: "badge-green", draft: "badge-amber", deprecated: "badge-gray", blocked: "badge-red" };
  const d365Tone = { synced: "badge-green", drift: "badge-amber", error: "badge-red", unsynced: "badge-gray" };

  const tabs = [
    ["general",   "General"],
    ["allergens", "Allergens"],
    ["boms",      "BOMs"],
    ["nutrition", "Nutrition"],
    ["costing",   "Costing"],
    ["shelf",     "Shelf-life"],
    ["routing",   "Routing"],
    ["supplier",  "Supplier Specs"],
    ["lab",       "Lab Results"],
    ["d365",      "D365 Status"],
    ["history",   "History"],
  ];

  return (
    <div>
      <PageHeader
        title={<><span className="mono" style={{ fontSize: 18, color: "var(--muted)" }}>{p.code}</span> · {p.name}</>}
        breadcrumb={<><a onClick={onBack} style={{ cursor: "pointer" }}>Products</a> › {p.code}</>}
        sub={<>Type <span className="badge badge-blue">{p.type}</span>  Status <span className={"badge " + statusTone[p.status]}>{p.status}</span>  D365 <span className={"badge " + d365Tone[p.d365]}>{p.d365}</span>  · last updated {p.updated}</>}
        actions={<>
          <button className="btn btn-secondary">Deactivate</button>
          <button className="btn btn-primary">Save changes</button>
        </>} />

      <div className="tabs-bar" style={{ marginBottom: 12, display: "flex", gap: 4, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {tabs.map(([k, lbl]) => (
          <button key={k} className={"tab-btn " + (tab === k ? "on" : "")} onClick={() => setTab(k)}
                  style={{ flex: "0 0 auto", fontSize: 12 }}>{lbl}</button>
        ))}
      </div>

      {tab === "general" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
            <strong style={{ fontSize: 13 }}>Core identification</strong>
            <Summary rows={[
              { label: "Item code", value: p.code, mono: true },
              { label: "Item name", value: p.name },
              { label: "Description", value: "Customer-facing product description (optional, max 1000 chars)" },
              { label: "Status", value: p.status },
              { label: "Product group", value: p.type === "FA" ? "FinGoods" : p.type },
              { label: "D365 Item ID", value: "0001234", mono: true },
            ]} />
          </div>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
            <strong style={{ fontSize: 13 }}>Classification &amp; weight</strong>
            <Summary rows={[
              { label: "Item type", value: p.type, mono: true, emphasis: true },
              { label: "UoM base", value: p.uom, mono: true },
              { label: "Weight mode", value: p.weight },
              { label: "Nominal weight (kg)", value: p.type === "FA" ? "0.450" : "—", mono: true },
              { label: "GS1 GTIN", value: p.type === "FA" ? "05060523100016" : "—", mono: true },
            ]} />
            {p.type === "Intermediate" && (
              <div className="alert-blue alert-box" style={{ marginTop: 10, fontSize: 11 }}>
                <span>ⓘ</span><div><b>PR-code builder:</b> digits <span className="mono">{p.code.replace(/[A-Z]+$/, "").replace("PR", "")}</span> + process letter <span className="mono">{p.code.slice(-1)}</span> → code <span className="mono">{p.code}</span></div>
              </div>
            )}
            {p.weight === "Catch" && (
              <div className="alert-blue alert-box" style={{ marginTop: 10, fontSize: 11 }}>
                <span>ⓘ</span><div>Catch-weight requires GS1 AI 3103 (net) or 3922 (variable price) barcode encoding.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "allergens" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
          <strong style={{ fontSize: 13 }}>Allergen profile · EU 1169/2011</strong>
          <div style={{ marginTop: 10 }}>
            {p.allergens.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No allergens declared.</div>
            ) : (
              <table>
                <thead><tr><th>Allergen</th><th>Intensity</th><th>Source</th><th>Action</th></tr></thead>
                <tbody>
                  {p.allergens.map(a => (
                    <tr key={a}>
                      <td style={{ fontWeight: 500 }}>{a}</td>
                      <td><span className="badge badge-red">contains</span></td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>cascaded from BOM component</td>
                      <td><button className="btn btn-ghost btn-sm">Override</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 12 }}>
            <span>ⓘ</span><div>Allergens auto-cascade from RMs + process additions. Manual overrides require reason (V-TEC-42). See <a style={{ color: "var(--blue)", cursor: "pointer" }}>allergen cascade preview (TEC-041) →</a></div>
          </div>
        </div>
      )}

      {tab === "boms" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {!isFA && p.type !== "Intermediate" ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>BOM tab not shown for {p.type} items.</div>
          ) : (
            <>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>BOM versions for {p.code}</strong>
                <button className="btn btn-primary btn-sm">+ Create new BOM version</button>
              </div>
              <table>
                <thead><tr><th>Version</th><th>Status</th><th>Effective from</th><th>Effective to</th><th>Approved by</th><th>Actions</th></tr></thead>
                <tbody>
                  {VERSIONS.slice(0, 3).map(v => (
                    <tr key={v.v}>
                      <td className="mono">{v.v}</td>
                      <td><span className={"badge " + (v.current ? "badge-green" : "badge-gray")}>{v.current ? "active" : "archived"}</span></td>
                      <td className="mono" style={{ fontSize: 12 }}>{v.date}</td>
                      <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>—</td>
                      <td style={{ fontSize: 12 }}>{v.author}</td>
                      <td><button className="btn btn-ghost btn-sm">View</button><button className="btn btn-ghost btn-sm">Set active</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === "nutrition" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
          <strong style={{ fontSize: 13 }}>Nutrition panel (per 100 g)</strong>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Embedded view — full panel available at Nutrition screen (TEC-009).</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <KPI label="Energy" value="267 kcal" sub="13% DV" tone="default" />
            <KPI label="Fat" value="22.4 g" sub="32% DV" tone="amber" />
            <KPI label="Protein" value="15.8 g" sub="32% DV" tone="green" />
            <KPI label="Salt" value="2.1 g" sub="35% DV" tone="red" />
          </div>
        </div>
      )}

      {tab === "costing" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current cost</div>
          <div style={{ fontSize: 36, fontWeight: 700, margin: "8px 0" }}><span className="mono">{p.cost.toFixed(2)} zł</span></div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>per {p.uom} · effective {p.updated}</div>
          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn btn-secondary">Edit cost</button>
            <a style={{ fontSize: 12, color: "var(--blue)", padding: "6px 10px" }}>View full history →</a>
          </div>
          <div className="alert-amber alert-box" style={{ marginTop: 16, fontSize: 11, textAlign: "left" }}>
            <span>△</span><div><b>V-TEC-53:</b> cost changes &gt;20% require admin approval (reason-logged).</div>
          </div>
        </div>
      )}

      {tab === "shelf" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
          <strong style={{ fontSize: 13 }}>Shelf-life configuration</strong>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>Shelf life days</label>
              <input defaultValue={isFA ? "21" : ""} style={{ width: "100%", marginTop: 4, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>Mode</label>
              <div style={{ marginTop: 4 }}>
                <label style={{ marginRight: 12, fontSize: 12 }}><input type="radio" name="mode" defaultChecked /> Use By (safety)</label>
                <label style={{ fontSize: 12 }}><input type="radio" name="mode" /> Best Before (quality)</label>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>Date code format</label>
              <select style={{ width: "100%", marginTop: 4, padding: "6px 10px", fontSize: 12 }}><option>YYWW</option><option>YYYY-MM-DD</option><option>JJWW</option><option>YYJJJ</option></select>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Preview: <span className="mono">2617</span></div>
            </div>
          </div>
          <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 11 }}>
            <span>ⓘ</span><div>EU 1169/2011: meat/fish/dairy must use "Use By"; dry goods may use "Best Before".</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 12 }}>Regulatory compliance checklist (7 regs)</strong>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
              {["EU 1169/2011","BRCGS P1 v9","PL GHP/GMP","FSMA 204","ISO 22000","Halal","Kosher"].map((r, i) => (
                <div key={r}><span style={{ color: i < 4 ? "var(--green-700)" : i === 4 ? "var(--amber-700)" : "var(--muted)" }}>{i < 4 ? "✓" : i === 4 ? "△" : "—"}</span> {r}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "routing" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>Routing versions</strong>
            <button className="btn btn-primary btn-sm">+ New routing version</button>
          </div>
          <table>
            <thead><tr><th>Version</th><th>Operations</th><th>Total time</th><th>Status</th><th>Effective from</th><th>Approved by</th></tr></thead>
            <tbody>
              <tr>
                <td className="mono">v2</td><td className="num mono">11</td><td className="mono">7h 48m</td>
                <td><span className="badge badge-green">active</span></td>
                <td className="mono" style={{ fontSize: 12 }}>2026-04-14</td><td>A. Majewska</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "supplier" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>Supplier specifications</strong>
            <button className="btn btn-primary btn-sm">+ Upload spec</button>
          </div>
          <table>
            <thead><tr><th>Supplier code</th><th>Spec version</th><th>Issued</th><th>Expiry</th><th>Allergens declared</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td className="mono">SA-SOK-2024-11</td>
                <td className="mono">v3</td>
                <td className="mono" style={{ fontSize: 12 }}>2024-11-10</td>
                <td className="mono" style={{ fontSize: 12 }}>2026-11-10</td>
                <td style={{ fontSize: 11 }}>{p.allergens.join(", ") || "—"}</td>
                <td><span className="badge badge-green">Active</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "lab" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>Lab results (TEC-045)</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ fontSize: 12 }}><option>All test types</option><option>ATP Swab</option><option>Allergen ELISA</option><option>Micro APC</option><option>Nutrition</option></select>
              <button className="btn btn-primary btn-sm">+ Add lab result</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Test type</th><th>Result</th><th>Unit</th><th>Status</th><th>Lab provider</th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{ fontSize: 12 }}>2026-04-18</td><td>ATP Swab</td><td className="num mono">6</td><td className="mono">RLU</td><td><span className="badge badge-green">Pass</span></td><td>SGS Poland</td></tr>
              <tr><td className="mono" style={{ fontSize: 12 }}>2026-04-10</td><td>Allergen ELISA</td><td className="num mono">&lt;2.5</td><td className="mono">ppm</td><td><span className="badge badge-green">Pass</span></td><td>Eurofins</td></tr>
              <tr><td className="mono" style={{ fontSize: 12 }}>2026-03-28</td><td>Micro APC</td><td className="num mono">1.2×10³</td><td className="mono">cfu/g</td><td><span className="badge badge-green">Pass</span></td><td>SGS Poland</td></tr>
            </tbody>
          </table>
          <div className="alert-blue alert-box" style={{ margin: 12, fontSize: 11 }}>
            <span>ⓘ</span><div>V-TEC-44: ATP swab <b>result_value &gt; 10 RLU</b> → auto-set status=fail (baseline threshold configurable in 02-SETTINGS).</div>
          </div>
        </div>
      )}

      {tab === "d365" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
          <strong style={{ fontSize: 13 }}>D365 sync status for this item</strong>
          <Summary rows={[
            { label: "D365 Item ID", value: "0001234", mono: true },
            { label: "d365_sync_status", value: p.d365, mono: true, emphasis: true },
            { label: "Last sync at", value: "2026-04-21 14:05", mono: true },
            { label: "Next scheduled", value: "2026-04-21 22:00", mono: true },
          ]} />
          <div style={{ marginTop: 10 }}>
            <a style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>Open D365 sync dashboard (TEC-070) →</a>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>Audit log for {p.code}</strong>
            <select style={{ fontSize: 12 }}><option>All actions</option><option>CREATE</option><option>UPDATE</option><option>APPROVE</option><option>DEACTIVATE</option></select>
          </div>
          <table>
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Field changed</th><th>Old → New</th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{ fontSize: 12 }}>2026-04-14 11:10</td><td>A. Majewska</td><td><span className="badge badge-blue">UPDATE</span></td><td>casing_supplier</td><td>Kalle → Viscofan</td></tr>
              <tr><td className="mono" style={{ fontSize: 12 }}>2026-04-02 08:50</td><td>A. Majewska</td><td><span className="badge badge-blue">UPDATE</span></td><td>cost_per_kg</td><td>11.88 → 11.82</td></tr>
              <tr><td className="mono" style={{ fontSize: 12 }}>2024-10-30 14:22</td><td>M. Szymczak</td><td><span className="badge badge-green">CREATE</span></td><td>—</td><td>Initial NPD handover</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---------- TEC-041 · Allergen Cascade Preview ----------
const AllergenCascadeScreen = () => {
  const c = ALLERGEN_CASCADE;
  const levelTone = { RM: "badge-gray", Intermediate: "badge-blue", Process: "badge-violet", FA: "badge-green" };
  return (
    <div>
      <PageHeader title="Allergen cascade preview (TEC-041)" breadcrumb="Technical › Compliance › Cascade"
        sub={c.product + " · " + c.bomVersion + " · derivation chain RM → Intermediate → Process → FA per EU 1169/2011"} />

      <div className="alert-blue alert-box" style={{ marginBottom: 12, fontSize: 12 }}>
        <span>ⓘ</span>
        <div><b>Cascade rule</b> <span className="mono">allergen_cascade_rm_to_fa</span> (PRD §10.2): FA allergens = UNION(RM allergens via BOM) + UNION(process additions per process_stage). Manual overrides preserved (V-TEC-45).</div>
      </div>

      {/* Final allergens summary */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Final allergen profile for {c.product.split(" ")[0]}</strong>
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {c.finalAllergens.map(a => (
            <div key={a.code} style={{ padding: "6px 10px", background: a.intensity === "contains" ? "var(--red-050a)" : "var(--amber-050a)", borderRadius: 6, fontSize: 12, border: "1px solid " + (a.intensity === "contains" ? "var(--red)" : "var(--amber)") }}>
              <b>{a.name}</b> <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>· {a.code}</span>
              <span className={"badge " + (a.intensity === "contains" ? "badge-red" : "badge-amber")} style={{ marginLeft: 6, fontSize: 9 }}>{a.intensity}</span>
              <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>({a.source})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cascade tree visual */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <strong style={{ fontSize: 13 }}>Derivation chain</strong>
        <div style={{ marginTop: 14, position: "relative", paddingLeft: 18 }}>
          <div style={{ position: "absolute", left: 8, top: 12, bottom: 12, width: 2, background: "var(--border)" }}></div>
          {c.chain.map((node, i) => (
            <div key={i} style={{ position: "relative", marginBottom: i < c.chain.length - 1 ? 14 : 0, paddingLeft: 18 }}>
              <div style={{ position: "absolute", left: -8, top: 6, width: 14, height: 14, background: "#fff", border: "2px solid var(--blue)", borderRadius: "50%" }}></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={"badge " + (levelTone[node.level] || "badge-gray")} style={{ fontSize: 10 }}>{node.level}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{node.code}</span>
                <span style={{ fontSize: 13 }}>{node.name}</span>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{node.bomPath}</div>
              {node.contributes.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: "var(--muted)" }}>Contributes: </span>
                  {node.contributes.map(a => (
                    <span key={a.code} className="badge badge-red" style={{ fontSize: 9, marginRight: 4 }}>{a.name}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="alert-amber alert-box" style={{ marginTop: 12, fontSize: 11 }}>
        <span>△</span><div><b>BRCGS P1 v9</b> + EU 1169/2011 require documented cascade evidence. This preview is the read-only visualization; allergen edits happen in Product Detail → Allergens tab.</div>
      </div>
    </div>
  );
};

// ---------- TEC-042 · Process Allergen Additions ----------
const ProcessAllergenScreen = () => {
  const intensityTone = { contains: "badge-red", may_contain: "badge-amber" };
  return (
    <div>
      <PageHeader title="Process allergen additions (TEC-042)" breadcrumb="Technical › Compliance › Process additions"
        sub="Admin-only config: process_code → allergen_code mapping. Cascade rule merges these into FA allergen profiles (PRD §10.4)."
        actions={<button className="btn btn-primary">+ Add mapping</button>} />

      <div className="alert-blue alert-box" style={{ marginBottom: 12, fontSize: 12 }}>
        <span>ⓘ</span>
        <div>When a BOM uses a process_stage listed here, the cascade rule automatically adds the mapped allergens to the FA profile. Example: <span className="mono">PR_breading</span> adds Gluten + Eggs even if no RM declares them directly.</div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 140 }}>Process code</th>
            <th>Process name</th>
            <th style={{ width: 110 }}>Allergen</th>
            <th style={{ width: 100 }}>Intensity</th>
            <th>Reason</th>
            <th style={{ width: 120 }}>Added by</th>
            <th style={{ width: 110 }}>Updated</th>
            <th style={{ width: 80 }}></th>
          </tr></thead>
          <tbody>
            {PROCESS_ALLERGEN_ADDITIONS.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ fontSize: 12 }}>{r.process_code}</td>
                <td style={{ fontWeight: 500 }}>{r.process_name}</td>
                <td><span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginRight: 4 }}>{r.allergen_code}</span>{r.allergen_name}</td>
                <td><span className={"badge " + intensityTone[r.intensity]} style={{ fontSize: 10 }}>{r.intensity}</span></td>
                <td style={{ fontSize: 12 }}>{r.reason}</td>
                <td style={{ fontSize: 12 }}>{r.added_by}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.last_update}</td>
                <td>
                  <button className="btn btn-ghost btn-sm">✎</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-amber alert-box" style={{ marginTop: 12, fontSize: 11 }}>
        <span>△</span><div><b>V-TEC-40:</b> allergen_code must exist in <span className="mono">reference_tables.allergens_reference</span> (EU-14 + org custom). Edits here trigger async cascade rebuild (V-TEC-41) on all FAs using these process codes.</div>
      </div>
    </div>
  );
};

// ---------- TEC-043 · Contamination Risk Matrix ----------
const ContaminationRiskScreen = () => {
  const riskTone = {
    high:       { bg: "var(--red)",    fg: "#fff", label: "H" },
    medium:     { bg: "var(--amber)",  fg: "#fff", label: "M" },
    low:        { bg: "var(--green)",  fg: "#fff", label: "L" },
    segregated: { bg: "#4b5563",       fg: "#fff", label: "S" },
    "n/a":      { bg: "var(--gray-100)", fg: "var(--muted)", label: "—" },
  };
  const [editMode, setEditMode] = React.useState(false);
  const counts = CONTAMINATION_LINES.reduce((acc, l) => {
    (CONTAMINATION_MATRIX[l.line_id] || []).forEach(r => acc[r] = (acc[r] || 0) + 1);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Contamination risk matrix (TEC-043)" breadcrumb="Technical › Compliance › Contamination risk"
        sub="Line × allergen cross-contamination risk grid. Feeds the allergen changeover gate in 08-PRODUCTION (PRD §10.5)."
        actions={<>
          <button className="btn btn-secondary" onClick={() => setEditMode(!editMode)}>{editMode ? "Done" : "Edit matrix"}</button>
          <button className="btn btn-primary">Export for audit</button>
        </>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <KPI label="High risk cells"    value={(counts["high"] || 0) + ""}    sub="segregation + ATP ≤10 RLU"         tone="red" />
        <KPI label="Medium risk cells"  value={(counts["medium"] || 0) + ""}  sub="cleaning + dual sign-off"          tone="amber" />
        <KPI label="Segregated"         value={(counts["segregated"] || 0) + ""} sub="dedicated lines"                tone="default" />
        <KPI label="Coverage"           value={CONTAMINATION_LINES.length + "×" + CONTAMINATION_ALLERGENS.length} sub="lines × EU-14 allergens"      tone="green" />
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 200, position: "sticky", left: 0, background: "#fff", zIndex: 2 }}>Line</th>
              {CONTAMINATION_ALLERGENS.map(a => (
                <th key={a} style={{ textAlign: "center", writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "8px 2px", height: 90, fontSize: 10 }}>{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTAMINATION_LINES.map(l => (
              <tr key={l.line_id}>
                <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{l.line_id}</div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{l.line_name}</div>
                </td>
                {(CONTAMINATION_MATRIX[l.line_id] || []).map((risk, j) => {
                  const t = riskTone[risk] || riskTone["n/a"];
                  return (
                    <td key={j} style={{ textAlign: "center", padding: 2 }}>
                      {editMode ? (
                        <select defaultValue={risk} style={{ fontSize: 10, padding: 2, width: 60 }}>
                          <option value="low">L</option>
                          <option value="medium">M</option>
                          <option value="high">H</option>
                          <option value="segregated">S</option>
                        </select>
                      ) : (
                        <div title={CONTAMINATION_ALLERGENS[j] + " · " + risk} style={{
                          width: 28, height: 28, margin: "0 auto", borderRadius: 4,
                          background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        }}>{t.label}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 18, fontSize: 11, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted)", textTransform: "uppercase", fontSize: 10 }}>Legend</span>
        <span><span style={{ display: "inline-block", width: 16, height: 16, background: "var(--red)", verticalAlign: "middle", borderRadius: 3, marginRight: 4 }}></span> <b>High</b> — segregation needed, different run day</span>
        <span><span style={{ display: "inline-block", width: 16, height: 16, background: "var(--amber)", verticalAlign: "middle", borderRadius: 3, marginRight: 4 }}></span> <b>Medium</b> — full cleaning between runs</span>
        <span><span style={{ display: "inline-block", width: 16, height: 16, background: "var(--green)", verticalAlign: "middle", borderRadius: 3, marginRight: 4 }}></span> <b>Low</b> — standard cleaning</span>
        <span><span style={{ display: "inline-block", width: 16, height: 16, background: "#4b5563", verticalAlign: "middle", borderRadius: 3, marginRight: 4 }}></span> <b>Segregated</b> — dedicated line</span>
      </div>

      <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 11 }}>
        <span>ⓘ</span><div><b>Changeover gate</b> (PRD §10.5): when the next WO's allergen-free claim clashes with a High/Medium cell on the scheduled line, 08-PRODUCTION blocks START until cleaning validation + ATP swab <b>≤10 RLU</b> + dual sign-off (quality_lead + production_lead).</div>
      </div>
    </div>
  );
};

// ---------- TEC-071 · D365 Manual Sync Trigger ----------
const D365ManualSyncScreen = ({ openModal }) => {
  const [entity, setEntity] = React.useState("item");
  const [direction, setDirection] = React.useState("pull");
  return (
    <div>
      <PageHeader title="D365 manual sync trigger (TEC-071)" breadcrumb="Technical › D365 integration › Manual sync"
        sub="Admin on-demand trigger: pick entity + direction + confirm. Scheduled syncs run automatically (see TEC-070)." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20 }}>
          <strong style={{ fontSize: 13 }}>Trigger a sync run</strong>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Entity</label>
            <select value={entity} onChange={e => setEntity(e.target.value)} style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}>
              <option value="item">Items (master data)</option>
              <option value="bom">BOMs</option>
              <option value="routing">Routings</option>
              <option value="cost">Cost_per_kg</option>
              <option value="wo_confirm">WO confirmations (push only)</option>
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Direction</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["pull","push","both"].map(d => (
                <button key={d} onClick={() => setDirection(d)}
                  style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 4,
                           background: direction === d ? "var(--blue-050)" : "#fff", fontWeight: direction === d ? 600 : 400, cursor: "pointer" }}>
                  {d === "pull" ? "D365 → MP (pull)" : d === "push" ? "MP → D365 (push)" : "Both"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Scope</label>
            <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
              <label><input type="radio" name="scope" defaultChecked /> Delta (since last run)</label>
              <label><input type="radio" name="scope" /> Full</label>
            </div>
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => openModal && openModal("d365ItemSync", { entity, direction })}>Dry-run</button>
            <button className="btn btn-primary" onClick={() => openModal && openModal("d365ItemSync", { entity, direction })}>Run sync now</button>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20 }}>
          <strong style={{ fontSize: 13 }}>Recent manual runs</strong>
          <div style={{ marginTop: 10 }}>
            {D365_LOG.filter(l => l.kind === "manual").map((l, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="mono">{l.t}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{l.duration}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                  {l.items} items · <span style={{ color: l.err > 0 ? "var(--red-700)" : "var(--green-700)" }}>{l.err > 0 ? "✗ " + l.err + " err" : "✓ all ok"}</span> · {l.by}
                </div>
                {l.note && <div style={{ fontSize: 11, marginTop: 2 }}>{l.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <a style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>View full audit log (TEC-072) →</a>
          </div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 11 }}>
        <span>ⓘ</span><div>Manual trigger does not bypass validation or cost-change approval gates (V-TEC-53). Failed records land in DLQ (TEC-073).</div>
      </div>
    </div>
  );
};

Object.assign(window, {
  RoutingsScreen, SpecsScreen, AllergenScreen,
  EcoScreen, HistoryScreen, PageHeader,
  TechDashboardScreen, MaterialsListScreen, MaterialDetailScreen,
  NutritionScreen, CostingScreen, ShelfLifeScreen, CostHistoryScreen,
  TraceabilityScreen,
  D365StatusScreen, D365MappingScreen, D365DriftScreen, D365LogScreen, D365ManualSyncScreen,
  ProductsListScreen, ProductDetailScreen,
  AllergenCascadeScreen, ProcessAllergenScreen, ContaminationRiskScreen,
});
