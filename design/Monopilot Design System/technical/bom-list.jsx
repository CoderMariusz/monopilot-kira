// ============ BOM list (hero list view) ============

const BOMList = ({ onOpen }) => {
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const rows = BOM_LIST.filter(b => {
    if (filter !== "all" && b.status !== filter) return false;
    if (q && !(b.name.toLowerCase().includes(q.toLowerCase()) || b.id.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const counts = {
    all: BOM_LIST.length,
    active: BOM_LIST.filter(b => b.status === "active").length,
    draft: BOM_LIST.filter(b => b.status === "draft").length,
    review: BOM_LIST.filter(b => b.status === "review").length,
    archived: BOM_LIST.filter(b => b.status === "archived").length,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Technical</a> › BOMs & recipes</div>
          <div className="page-title">BOMs & recipes</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Multi-level bills of materials with sub-recipes (brines, marinades, coatings), routings, cost roll-ups and full revision history.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary">⧉ Duplicate…</button>
          <button className="btn btn-secondary">⇪ Import from NPD</button>
          <button className="btn btn-primary">+ New BOM</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <KPI label="Active BOMs" value="34" sub="of 42 total" tone="default" />
        <KPI label="Avg yield" value="89.4%" sub="rolling 30 d" tone="green" />
        <KPI label="Cost variance" value="+2.1%" sub="vs. std. cost" tone="amber" />
        <KPI label="Open ECOs" value="6" sub="2 high priority" tone="blue" />
      </div>

      {/* Filter + search */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div className="pills">
          {[["all","All"],["active","Active"],["draft","Draft"],["review","In review"],["archived","Archived"]].map(([k, label]) => (
            <button key={k} className={"pill " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>
              {label} <span style={{ opacity: 0.5, marginLeft: 4 }}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }}></div>
        <input type="text" placeholder="Filter by name or code…" value={q} onChange={e => setQ(e.target.value)}
          style={{ width: 260 }} />
        <button className="btn btn-ghost btn-sm">⚙ Columns</button>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div className="bom-grid">
          <div className="bom-row head">
            <div>BOM code</div>
            <div>Product</div>
            <div>Category</div>
            <div>Ver.</div>
            <div style={{ textAlign: "right" }}>Cost / pc</div>
            <div style={{ textAlign: "right" }}>Yield</div>
            <div>Updated</div>
            <div>Status</div>
            <div></div>
          </div>
          {rows.map(b => (
            <div key={b.id} className="bom-row" onClick={() => onOpen && onOpen(b.id)}>
              <div className="mono bom-code">{b.id}</div>
              <div>
                <div className="bom-name">{b.name}</div>
                <div className="bom-meta">{b.comps} components · {b.levels} levels · Owner: {b.owner}</div>
              </div>
              <div style={{ fontSize: 12 }}>{b.category}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{b.version}</div>
              <div className="mono num" style={{ fontSize: 13, textAlign: "right", fontWeight: 600 }}>{b.cost.toFixed(2)} zł</div>
              <div className="mono num" style={{ fontSize: 13, textAlign: "right", color: b.yield < 0.85 ? "var(--red)" : "var(--text)" }}>
                {(b.yield * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }} className="mono">{b.updated}</div>
              <div><Status s={b.status} /></div>
              <div style={{ color: "var(--muted)", textAlign: "center" }}>›</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const KPI = ({ label, value, sub, tone }) => {
  const toneMap = { default: "", green: "var(--green)", amber: "var(--amber)", blue: "var(--blue)", red: "var(--red)" };
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: toneMap[tone] || "var(--text)" }} className="mono">{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
};

Object.assign(window, { BOMList, KPI });
