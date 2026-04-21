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

// ---------- Work centers ----------
const WorkCentersScreen = () => (
  <div>
    <PageHeader title="Work centers" breadcrumb="Technical › Work centers"
      sub="Machines and cells on the shop floor — capacity, OEE targets, and shift coverage."
      actions={<button className="btn btn-primary">+ New work center</button>} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {WORK_CENTERS.map(wc => (
        <div key={wc.code} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{wc.code}</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{wc.name}</div>
            </div>
            <Status s={wc.status} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{wc.type} · {wc.shift}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span className="muted">Capacity</span><span className="mono">{wc.capacity}</span>
          </div>
          {wc.oee != null && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                <span className="muted">OEE target</span>
                <span className="mono" style={{ color: wc.oee > 80 ? "var(--green-700)" : wc.oee > 70 ? "var(--amber-700)" : "var(--red-700)", fontWeight: 600 }}>{wc.oee}%</span>
              </div>
              <div style={{ marginTop: 8, height: 4, background: "var(--gray-100)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: wc.oee + "%", height: "100%", background: wc.oee > 80 ? "var(--green)" : wc.oee > 70 ? "var(--amber)" : "var(--red)" }}></div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  </div>
);

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

// ---------- Process parameters overview ----------
const ParamsScreen = () => (
  <div>
    <PageHeader title="Process parameters" breadcrumb="Technical › Process parameters"
      sub="Critical control points and tolerances across all active routings. Linked to HACCP plan v12." />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
      <KPI label="CCPs defined" value="12" sub="across 9 routings" tone="red" />
      <KPI label="Open deviations" value="2" sub="last 30 days" tone="amber" />
      <KPI label="Avg. CpK" value="1.42" sub="target ≥ 1.33" tone="green" />
      <KPI label="Next review" value="2026-05-12" sub="QA quarterly" tone="default" />
    </div>
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
      Full CCP register shown within each BOM · Parameters tab.<br/>
      <a style={{ color: "var(--blue)", cursor: "pointer" }}>Open master HACCP register →</a>
    </div>
  </div>
);

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

// ---------- Maintenance plans ----------
const MaintenanceScreen = () => (
  <div>
    <PageHeader title="Maintenance plans" breadcrumb="Technical › Maintenance"
      sub="Preventive maintenance schedules per work center. Due tasks surface in Planning as capacity blocks."
      actions={<button className="btn btn-primary">+ New plan</button>} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
      <KPI label="Active plans" value="28" sub="across 9 WCs" tone="default" />
      <KPI label="Due this week" value="4" sub="1 critical" tone="amber" />
      <KPI label="Overdue" value="0" sub="keep at zero" tone="green" />
      <KPI label="MTBF (SMOKE-01)" value="184 h" sub="target ≥ 150 h" tone="green" />
    </div>
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead><tr>
          <th style={{ width: 100 }}>WC code</th>
          <th>Asset · Task</th>
          <th style={{ width: 140 }}>Interval</th>
          <th style={{ width: 100 }}>Last</th>
          <th style={{ width: 100 }}>Next</th>
          <th style={{ width: 80, textAlign: "right" }}>Days</th>
          <th style={{ width: 150 }}>Owner</th>
          <th style={{ width: 40 }}></th>
        </tr></thead>
        <tbody>
          {MAINT_PLANS.map((m, i) => (
            <tr key={i} style={m.critical ? { background: "var(--red-050a)" } : {}}>
              <td className="mono">{m.code}</td>
              <td>
                <div style={{ fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.kind}{m.critical && <span style={{ color: "var(--red-700)", fontWeight: 500 }}> · critical</span>}</div>
              </td>
              <td style={{ fontSize: 12 }}>{m.interval}</td>
              <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{m.last}</td>
              <td className="mono" style={{ fontSize: 12 }}>{m.next}</td>
              <td className="num mono" style={{ color: m.due <= 2 ? "var(--red-700)" : m.due <= 7 ? "var(--amber-700)" : "var(--muted)", fontWeight: 600 }}>
                {m.due === 0 ? "today" : m.due + "d"}
              </td>
              <td style={{ fontSize: 12 }}>{m.owner}</td>
              <td style={{ color: "var(--muted)" }}>›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------- Tooling ----------
const ToolingScreen = () => (
  <div>
    <PageHeader title="Tooling & consumables" breadcrumb="Technical › Tooling"
      sub="Dedicated tools and consumables tied to work centers — stock, re-order points, lifecycle."
      actions={<button className="btn btn-primary">+ Add item</button>} />
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead><tr>
          <th style={{ width: 100 }}>ID</th>
          <th>Item</th>
          <th style={{ width: 100 }}>Type</th>
          <th style={{ width: 100 }}>Work center</th>
          <th style={{ width: 90, textAlign: "right" }}>Stock</th>
          <th style={{ width: 90, textAlign: "right" }}>Min</th>
          <th style={{ width: 100 }}>Life</th>
          <th style={{ width: 100, textAlign: "right" }}>Cost (zł)</th>
          <th style={{ width: 100 }}></th>
        </tr></thead>
        <tbody>
          {TOOLING.map(t => (
            <tr key={t.id}>
              <td className="mono">{t.id}</td>
              <td style={{ fontWeight: 500 }}>{t.name}</td>
              <td><span className={"badge " + (t.type === "Tooling" ? "badge-blue" : "badge-gray")}>{t.type}</span></td>
              <td className="mono" style={{ fontSize: 12 }}>{t.wc}</td>
              <td className="mono num" style={{ color: t.stock < t.min ? "var(--red)" : "var(--text)", fontWeight: 600 }}>{t.stock}</td>
              <td className="mono num" style={{ color: "var(--muted)" }}>{t.min}</td>
              <td className="mono" style={{ fontSize: 12 }}>{t.life}</td>
              <td className="mono num">{t.cost.toFixed(2)}</td>
              <td>
                {t.stock < t.min ? <span className="badge badge-red">Reorder</span> : <span className="badge badge-green">OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

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
      <PageHeader title="D365 sync — status" breadcrumb="Technical › D365 integration › Status"
        sub={s.env + " · " + s.connector}
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

// ---------- TEC-071 · D365 field mapping ----------
const D365MappingScreen = () => {
  const statusTone = { ok: "badge-green", warn: "badge-amber", unmapped: "badge-red" };
  return (
    <div>
      <PageHeader title="D365 field mapping" breadcrumb="Technical › D365 integration › Field mapping"
        sub="MonoPilot attribute → D365 field. Changes require admin role and trigger a full re-sync."
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

// ---------- TEC-072 · D365 drift resolution ----------
const D365DriftScreen = ({ openModal }) => {
  const sevTone = { low: "badge-gray", medium: "badge-amber", high: "badge-red" };
  return (
    <div>
      <PageHeader title="D365 drift resolution" breadcrumb="Technical › D365 integration › Drift"
        sub="Automatically detected mismatches between MonoPilot and D365. Accept to overwrite, reject to keep your side." />
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

// ---------- TEC-073 · D365 sync log ----------
const D365LogScreen = () => {
  const kindTone = { full: "badge-violet", delta: "badge-blue", manual: "badge-amber" };
  return (
    <div>
      <PageHeader title="D365 sync log" breadcrumb="Technical › D365 integration › Log"
        sub="Timeline of recent sync runs — scheduled and manual. Click a row to see per-item payload." />
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

Object.assign(window, {
  RoutingsScreen, WorkCentersScreen, SpecsScreen, AllergenScreen, ParamsScreen,
  EcoScreen, HistoryScreen, MaintenanceScreen, ToolingScreen, PageHeader,
  TechDashboardScreen, MaterialsListScreen, MaterialDetailScreen,
  NutritionScreen, CostingScreen, ShelfLifeScreen, CostHistoryScreen,
  TraceabilityScreen, D365StatusScreen, D365MappingScreen, D365DriftScreen, D365LogScreen,
});
