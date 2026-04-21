// ============ BOM detail — tabs: Ingredients tree / Routing / Costs / Parameters / Versions / Graph ============

const BOMDetail = ({ onBack, tweaks }) => {
  const [tab, setTab] = React.useState("tree");
  const bom = BOM_TREE;

  const tabs = [
    { key: "tree", label: "Ingredients", count: "3 levels" },
    { key: "routing", label: "Routing", count: ROUTING.length },
    { key: "params", label: "Parameters", count: PROCESS_PARAMS.length },
    { key: "costs", label: "Costs" },
    { key: "versions", label: "Versions", count: VERSIONS.length },
    { key: "graph", label: "Visual graph" },
    { key: "sheet", label: "Recipe sheet" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <a onClick={onBack}>BOMs & recipes</a> › <span className="mono">{bom.code}</span>
          </div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {bom.name}
            <Status s="active" />
            <span className="badge badge-blue">v7</span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Standard batch <strong style={{ color: "var(--text)" }}>100 kg input → ~222 szt × 450 g</strong>
            {" · "}Yield 91% · Cost <span className="mono">11.82 zł/szt</span> · Owner A. Majewska · Last updated 2026-04-14
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm">⧖ History</button>
          <button className="btn btn-secondary">⧉ Duplicate</button>
          <button className="btn btn-secondary">⇄ Propose change (ECO)</button>
          <button className="btn btn-primary">✎ Edit</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.key} className={"tab-btn " + (tab === t.key ? "on" : "")} onClick={() => setTab(t.key)}>
            {t.label}{t.count != null && <span className="count">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "tree" && <TreeTab tweaks={tweaks} />}
      {tab === "routing" && <RoutingTab />}
      {tab === "params" && <ParamsTab />}
      {tab === "costs" && <CostsTab />}
      {tab === "versions" && <VersionsTab />}
      {tab === "graph" && <GraphTab />}
      {tab === "sheet" && <SheetTab />}
    </div>
  );
};

// ---------- Ingredients tree ----------
const TreeTab = ({ tweaks }) => {
  const costLayout = tweaks?.costLayout || "side";  // side | inline | drawer
  const [openKeys, setOpenKeys] = React.useState(new Set(["SUB-001", "SUB-002"]));
  const toggle = (id) => {
    setOpenKeys(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const renderRow = (node, depth) => {
    const open = openKeys.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const totalCost = node.cost || (node.children ? node.children.reduce((s, c) => s + (c.cost || 0), 0) : 0);
    const pctOfBatch = ((totalCost / 11.82) * 100);
    return (
      <React.Fragment key={node.id}>
        <div className={"tree-row " + (hasChildren ? "parent" : "")}>
          <div className="tree-caret" onClick={() => hasChildren && toggle(node.id)}>
            {hasChildren ? (open ? "▾" : "▸") : ""}
          </div>
          <div className="tree-name" style={{ paddingLeft: depth * 18 }}>
            <span style={{ width: 16, display: "inline-block", textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
              {node.type === "sub-bom" ? "⊞" : node.type === "packaging" ? "◰" : "○"}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginRight: 6, minWidth: 60 }}>{node.code}</span>
            <span>{node.name}</span>
            {node.type === "sub-bom" && <span className="tree-badge-mini">sub-BOM</span>}
            {node.note && <span className="tree-badge-mini" style={{ background: "var(--blue-050)", color: "var(--blue-700)" }}>{node.note}</span>}
            {node.auto && <span className="tree-badge-mini" style={{ background: "var(--gray-050)", color: "var(--muted)" }}>auto</span>}
          </div>
          <div className="mono num" style={{ textAlign: "right" }}>{node.qty?.toFixed(3) || "—"}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{node.uom || ""}</div>
          <div className="mono num" style={{ textAlign: "right", color: node.scrap > 2 ? "var(--amber-700)" : "var(--muted)", fontSize: 12 }}>
            {node.scrap != null ? node.scrap.toFixed(1) + "%" : ""}
          </div>
          <div className="mono num" style={{ textAlign: "right", fontWeight: hasChildren ? 600 : 400 }}>
            {totalCost > 0 ? totalCost.toFixed(2) : "—"}
          </div>
          {costLayout === "inline" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "inline-block", width: 50, height: 6, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden", verticalAlign: "middle", marginRight: 6 }}>
                <div style={{ width: Math.min(100, pctOfBatch) + "%", height: "100%", background: "var(--blue)" }}></div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{pctOfBatch.toFixed(0)}%</span>
            </div>
          )}
          {costLayout !== "inline" && <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>{node.supplier || ""}</div>}
          <div style={{ color: "var(--muted)", textAlign: "center", cursor: "pointer" }}>⋯</div>
        </div>
        {open && hasChildren && node.children.map(c => renderRow(c, depth + 1))}
      </React.Fragment>
    );
  };

  const treeEl = (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <div className="tree-head">
        <div></div>
        <div>Component</div>
        <div style={{ textAlign: "right" }}>Qty</div>
        <div>UoM</div>
        <div style={{ textAlign: "right" }}>Scrap</div>
        <div style={{ textAlign: "right" }}>Cost (zł)</div>
        <div style={{ textAlign: "right" }}>{costLayout === "inline" ? "Share" : "Supplier"}</div>
        <div></div>
      </div>
      {BOM_TREE.children.map(c => renderRow(c, 0))}
      <div className="tree-row" style={{ background: "var(--gray-100)", fontWeight: 700 }}>
        <div></div>
        <div style={{ fontWeight: 700 }}>TOTAL · 1 szt (450 g)</div>
        <div></div><div></div><div></div>
        <div className="mono num" style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>11.82</div>
        <div></div><div></div>
      </div>
    </div>
  );

  if (costLayout === "inline") {
    return treeEl;
  }

  return (
    <div className="bom-split">
      {treeEl}
      <CostPanel />
    </div>
  );
};

const CostPanel = () => (
  <div style={{ position: "sticky", top: 72 }}>
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginBottom: 10 }}>
      <div className="section-head" style={{ marginBottom: 10 }}>Cost roll-up</div>
      <div className="tech-cost-box">
        <div className="tech-cost-line"><span>Raw materials</span><span className="mono">9.84 zł</span></div>
        <div className="tech-cost-line"><span>Packaging</span><span className="mono">0.34 zł</span></div>
        <div className="tech-cost-line"><span>Direct labour</span><span className="mono">0.82 zł</span></div>
        <div className="tech-cost-line"><span>Energy & utilities</span><span className="mono">0.44 zł</span></div>
        <div className="tech-cost-line"><span>Overhead (12%)</span><span className="mono">0.38 zł</span></div>
        <div className="tech-cost-line total"><span>Cost / 1 szt</span><span className="mono">11.82 zł</span></div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>
        Based on D365 standard prices valid 2026-04-01 → 2026-06-30.
      </div>
    </div>

    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginBottom: 10 }}>
      <div className="section-head" style={{ marginBottom: 10 }}>Nutrition (per 100 g)</div>
      {[
        ["Energy", "1 208 kJ / 290 kcal"],
        ["Fat", "24.2 g"],
        ["  of which saturates", "8.8 g"],
        ["Carbohydrate", "1.2 g"],
        ["  of which sugars", "0.4 g"],
        ["Protein", "17.1 g"],
        ["Salt", "2.1 g"],
      ].map(([k, v]) => (
        <div key={k} className="tech-cost-line" style={{ padding: "3px 0", fontSize: 12 }}>
          <span style={{ color: k.startsWith("  ") ? "var(--muted)" : "var(--text)", paddingLeft: k.startsWith("  ") ? 12 : 0 }}>{k.trim()}</span>
          <span className="mono">{v}</span>
        </div>
      ))}
    </div>

    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
      <div className="section-head" style={{ marginBottom: 10 }}>Allergens</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[
          ["Gluten", false], ["Eggs", false], ["Milk", false], ["Soy", false],
          ["Nuts", false], ["Celery", false], ["Mustard", true], ["Sesame", false],
        ].map(([label, present]) => (
          <span key={label} className={"badge " + (present ? "badge-amber" : "badge-gray")}>
            {present ? "⚠ " : ""}{label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
        May contain: pieprz (mustard) — shared spice mill line.
      </div>
    </div>
  </div>
);

// ---------- Routing ----------
const RoutingTab = () => (
  <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
    <div className="route-step head">
      <div></div>
      <div>Operation</div>
      <div>Work center · Resource</div>
      <div style={{ textAlign: "right" }}>Setup</div>
      <div style={{ textAlign: "right" }}>Run</div>
      <div>Staffing</div>
      <div></div>
    </div>
    {ROUTING.map(r => (
      <div key={r.n} className="route-step">
        <div className="route-num">{r.n / 10}</div>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.op}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Step {r.n}</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{r.wc}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.resource}</div>
        </div>
        <div className="mono num" style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{r.setup || "—"}</div>
        <div className="mono num" style={{ textAlign: "right", fontSize: 13, fontWeight: 500 }}>
          {r.run} <span style={{ color: "var(--muted)", fontSize: 11 }}>{r.uom}</span>
        </div>
        <div style={{ fontSize: 12 }}>{r.resource}</div>
        <div style={{ color: "var(--muted)", textAlign: "center", cursor: "pointer" }}>⋯</div>
      </div>
    ))}
    <div className="route-step" style={{ background: "var(--gray-100)", fontWeight: 700 }}>
      <div></div>
      <div>TOTAL · 100 kg batch</div>
      <div></div>
      <div className="mono num" style={{ textAlign: "right", fontSize: 12 }}>102 min</div>
      <div className="mono num" style={{ textAlign: "right", fontSize: 13 }}>508 min</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>~10 hr total (incl. holds)</div>
      <div></div>
    </div>
  </div>
);

// ---------- Process parameters ----------
const ParamsTab = () => (
  <div>
    <div style={{ background: "var(--amber-050a)", border: "1px solid var(--amber)", borderRadius: "var(--radius)", padding: 10, marginBottom: 10, fontSize: 12, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 18, color: "var(--amber)" }}>⚠</span>
      <div>
        <strong>3 CCPs (Critical Control Points)</strong> are defined on this routing. All changes require QA sign-off and trigger HACCP re-evaluation.
      </div>
    </div>
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>Step</th>
            <th>Parameter</th>
            <th style={{ textAlign: "right" }}>Min</th>
            <th style={{ textAlign: "right" }}>Target</th>
            <th style={{ textAlign: "right" }}>Max</th>
            <th style={{ width: 60 }}>UoM</th>
            <th style={{ width: 120 }}>Tolerance</th>
            <th style={{ width: 80 }}>CCP</th>
          </tr>
        </thead>
        <tbody>
          {PROCESS_PARAMS.map((p, i) => (
            <tr key={i} style={p.ccp ? { background: "var(--red-050a)" } : {}}>
              <td className="mono">{p.step}</td>
              <td>
                {p.param}
                {p.note && <div style={{ fontSize: 11, color: "var(--red-700)", fontWeight: 500 }}>{p.note}</div>}
              </td>
              <td className="mono num">{p.min}</td>
              <td className="mono num" style={{ fontWeight: 600 }}>{p.target}</td>
              <td className="mono num">{p.max}</td>
              <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{p.uom}</td>
              <td>
                <ParamRangeBar min={p.min} target={p.target} max={p.max} />
              </td>
              <td>{p.ccp ? <span className="badge badge-red">CCP</span> : <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ParamRangeBar = ({ min, target, max }) => {
  const range = max - min;
  const targetPct = range === 0 ? 50 : ((target - min) / range) * 100;
  return (
    <div style={{ position: "relative", height: 6, background: "var(--gray-100)", borderRadius: 3, overflow: "visible" }}>
      <div style={{ position: "absolute", left: "10%", right: "10%", top: 0, bottom: 0, background: "var(--green-050)", borderRadius: 3 }}></div>
      <div style={{ position: "absolute", left: targetPct + "%", top: -2, width: 2, height: 10, background: "var(--green-700)" }}></div>
    </div>
  );
};

// ---------- Costs waterfall ----------
const CostsTab = () => {
  const parts = [
    { label: "Wieprzowina kl. II", v: 4.86 },
    { label: "Słonina", v: 1.32 },
    { label: "Sól peklująca + woda", v: 0.12 },
    { label: "Mieszanka przypraw A-17", v: 0.86 },
    { label: "Osłonka Viscofan Ø26", v: 0.34 },
    { label: "Dym płynny", v: 0.18 },
    { label: "Pakowanie (folia + etykieta + karton)", v: 0.34 },
    { label: "Robocizna bezpośrednia", v: 0.82 },
    { label: "Energia (wędzenie + chłodzenie)", v: 0.44 },
    { label: "Overhead 12%", v: 0.38 },
  ];
  const max = Math.max(...parts.map(p => p.v));
  const total = parts.reduce((s, p) => s + p.v, 0);

  return (
    <div className="bom-split">
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <div className="section-head" style={{ marginBottom: 14 }}>Cost breakdown · 1 szt 450 g</div>
        {parts.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "220px 1fr 80px", gap: 12, alignItems: "center", padding: "6px 0" }}>
            <div style={{ fontSize: 13 }}>{p.label}</div>
            <div style={{ height: 18, background: "var(--gray-100)", borderRadius: 3, position: "relative", overflow: "hidden" }}>
              <div style={{ width: (p.v / max) * 100 + "%", height: "100%", background: i < 7 ? "var(--blue)" : "var(--amber)", opacity: 0.8 }}></div>
            </div>
            <div className="mono num" style={{ textAlign: "right", fontSize: 13, fontWeight: 500 }}>{p.v.toFixed(2)} zł</div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
          <strong>Total · 1 szt</strong>
          <strong className="mono">{total.toFixed(2)} zł</strong>
        </div>
      </div>

      <div>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginBottom: 10 }}>
          <div className="section-head" style={{ marginBottom: 10 }}>vs. standard cost</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--amber)" }} className="mono">+2.1%</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            11.82 zł vs. 11.58 zł planned.<br/>Driven by pork shoulder spot price (+4.2% in April).
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
          <div className="section-head" style={{ marginBottom: 10 }}>Sensitivity</div>
          <div style={{ fontSize: 12 }}>
            <div style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span>+10% pork price</span><span className="mono">+0.49 zł/szt</span>
            </div>
            <div style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span>−1% yield</span><span className="mono">+0.12 zł/szt</span>
            </div>
            <div style={{ padding: "4px 0", display: "flex", justifyContent: "space-between" }}>
              <span>+0.10 zł/kWh</span><span className="mono">+0.05 zł/szt</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Versions with timeline + diff ----------
const VersionsTab = () => {
  const [compareMode, setCompareMode] = React.useState(false);
  return (
    <div className="bom-split">
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div className="section-head">Revision log</div>
          <div style={{ marginLeft: "auto" }}>
            <button className={"btn btn-sm " + (compareMode ? "btn-primary" : "btn-secondary")} onClick={() => setCompareMode(!compareMode)}>
              ⇄ Compare v6 → v7
            </button>
          </div>
        </div>

        {compareMode ? (
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              Showing changes between <span className="mono">v6</span> (2026-01-22) and <span className="mono">v7</span> (current, 2026-04-14). Linked to <span className="mono">ECO-2041</span>.
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
              <div className="diff-row" style={{ background: "var(--gray-100)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
                <div>v6 · before</div>
                <div className="diff-arrow">→</div>
                <div>v7 · current</div>
              </div>
              {VERSION_DIFF.map((d, i) => (
                <React.Fragment key={i}>
                  <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--muted)", borderTop: i > 0 ? "1px solid var(--border)" : 0, background: "var(--gray-050)" }}>
                    {d.field}
                  </div>
                  <div className={"diff-row " + d.kind}>
                    <div className="mono" style={{ fontSize: 12, color: d.kind === "add" ? "var(--muted)" : "var(--text)" }}>
                      {d.from}
                    </div>
                    <div className="diff-arrow">
                      {d.kind === "add" ? "＋" : d.kind === "rem" ? "−" : "→"}
                    </div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
                      {d.to}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {VERSIONS.map(v => (
              <div key={v.v} style={{ display: "grid", gridTemplateColumns: "70px 80px 1fr 140px", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <div className="mono" style={{ fontWeight: 600, color: v.current ? "var(--blue)" : "var(--text)" }}>
                  {v.v}{v.current && <div style={{ fontSize: 10, color: "var(--blue)" }}>CURRENT</div>}
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{v.date}</div>
                <div>
                  <div style={{ fontSize: 13 }}>{v.summary}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    <span className="mono">{v.eco}</span> · {v.author}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <button className="btn btn-ghost btn-sm">View</button>
                  {!v.current && <button className="btn btn-ghost btn-sm">Compare</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
          <div className="section-head" style={{ marginBottom: 10 }}>Provenance</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Originated from NPD project <a style={{ color: "var(--blue)", cursor: "pointer" }}>F25-004 Kiełbasa śląska refresh</a> (2024-10).<br/>
            <br/>
            <strong>Approval chain</strong><br/>
            <span style={{ color: "var(--muted)" }}>NPD → Technologist → QA → Production lead</span>
          </div>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <div className="section-head" style={{ marginBottom: 8 }}>Downstream impact</div>
          <div style={{ fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span>Open work orders</span><span className="mono">3</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span>Active specs</span><span className="mono">1</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span>Customer contracts</span><span className="mono">2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Visual graph (novel) ----------
const GraphTab = () => {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        Material flow: raw ingredients → sub-BOMs → thermal process → finished product. Drag to pan · scroll to zoom.
      </div>
      <div className="bom-flow" style={{ display: "flex", gap: 40, alignItems: "stretch" }}>
        {/* Column 1: raw materials */}
        <div className="flow-col">
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Raw materials (lvl 2)</div>
          <div className="flow-node">R-1001 · Wieprzowina kl. II <span style={{ color: "var(--muted)", float: "right" }} className="mono">0.54 kg</span></div>
          <div className="flow-node">R-1002 · Słonina <span style={{ color: "var(--muted)", float: "right" }} className="mono">0.22 kg</span></div>
          <div className="flow-node">R-1201 · Peklosól <span style={{ color: "var(--muted)", float: "right" }} className="mono">18 g</span></div>
          <div className="flow-node">R-1202 · Woda <span style={{ color: "var(--muted)", float: "right" }} className="mono">40 g</span></div>
          <div style={{ height: 8 }}></div>
          <div className="flow-node">R-2101 · Pieprz czarny <span style={{ color: "var(--muted)", float: "right" }} className="mono">6 g</span></div>
          <div className="flow-node">R-2102 · Czosnek gran. <span style={{ color: "var(--muted)", float: "right" }} className="mono">8 g</span></div>
          <div className="flow-node">R-2103 · Gałka <span style={{ color: "var(--muted)", float: "right" }} className="mono">2 g</span></div>
          <div className="flow-node">R-2104 · Majeranek <span style={{ color: "var(--muted)", float: "right" }} className="mono">4 g</span></div>
          <div className="flow-node">R-2105 · Cukier <span style={{ color: "var(--muted)", float: "right" }} className="mono">2 g</span></div>
        </div>

        {/* Arrow 1 */}
        <FlowArrow />

        {/* Column 2: sub-BOMs */}
        <div className="flow-col" style={{ justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Sub-BOMs (lvl 1)</div>
          <div style={{ height: 40 }}></div>
          <div className="flow-node parent">⊞ SUB-001 · Farsz wieprzowy<br/><span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>0.780 kg · 5.42 zł</span></div>
          <div style={{ height: 40 }}></div>
          <div className="flow-node parent">⊞ SUB-002 · Przyprawy A-17<br/><span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>0.022 kg · 0.86 zł</span></div>
        </div>

        <FlowArrow />

        {/* Column 3: process */}
        <div className="flow-col" style={{ justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Process</div>
          <div className="flow-node process">Kutrowanie<br/><span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>CUT-05 · 22 min · 10°C</span></div>
          <div className="flow-node process">Nadziewanie Ø26<br/><span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>STUFF-01 · 55 min</span></div>
          <div className="flow-node process" style={{ background: "var(--red-050a)", borderLeftColor: "var(--red)" }}>Wędzenie + parzenie<br/>
            <span style={{ fontSize: 11, color: "var(--red-700)", fontWeight: 500 }}>SMOKE-01 · 72°C / 28 min · CCP-2</span>
          </div>
          <div className="flow-node process" style={{ background: "var(--red-050a)", borderLeftColor: "var(--red)" }}>Chłodzenie<br/>
            <span style={{ fontSize: 11, color: "var(--red-700)", fontWeight: 500 }}>CHILL-02 · →4°C · CCP-3</span>
          </div>
        </div>

        <FlowArrow />

        {/* Column 4: packaging + output */}
        <div className="flow-col" style={{ justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Pack &amp; output</div>
          <div className="flow-node" style={{ borderLeft: "3px solid var(--amber)" }}>◰ Folia PA/PE + etykieta<br/>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>PACK-03 · MAP atmos.</span>
          </div>
          <div style={{ height: 20 }}></div>
          <div className="flow-node output" style={{ fontSize: 14 }}>
            ✓ Kiełbasa śląska 450g<br/>
            <span style={{ fontSize: 11, color: "var(--green-700)", fontWeight: 500 }}>Yield 91% · 11.82 zł/szt</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 16, fontSize: 11, color: "var(--muted)", justifyContent: "center" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--blue-050)", borderLeft: "3px solid var(--blue)", verticalAlign: "middle", marginRight: 4 }}></span> Sub-BOM</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--amber-050a)", borderLeft: "3px solid var(--amber)", verticalAlign: "middle", marginRight: 4 }}></span> Process step</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--red-050a)", borderLeft: "3px solid var(--red)", verticalAlign: "middle", marginRight: 4 }}></span> CCP</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--green-050a)", borderLeft: "3px solid var(--green)", verticalAlign: "middle", marginRight: 4 }}></span> Finished product</span>
      </div>
    </div>
  );
};

const FlowArrow = () => (
  <div style={{ display: "flex", alignItems: "center", color: "var(--muted)", fontSize: 20 }}>→</div>
);

// ---------- Printable recipe sheet ----------
const SheetTab = () => (
  <div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
      <button className="btn btn-secondary btn-sm">⎙ Print</button>
      <button className="btn btn-secondary btn-sm">⇩ PDF</button>
    </div>
    <div className="recipe-sheet">
      <h1>Kiełbasa śląska pieczona 450g</h1>
      <div className="subhead">
        BOM <span className="mono">B-0421 · v7</span> · Standard batch 100 kg · Yield 91% · Cost 11.82 zł/szt · Zatwierdzono 2026-04-14 · A. Majewska
      </div>

      <h3>Surowce (na 1 szt · 450 g)</h3>
      <table style={{ width: "100%", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th style={{ textAlign: "left", padding: "4px 0" }}>Kod</th>
          <th style={{ textAlign: "left", padding: "4px 0" }}>Składnik</th>
          <th style={{ textAlign: "right", padding: "4px 0" }}>Ilość</th>
          <th style={{ textAlign: "right", padding: "4px 0" }}>%</th>
        </tr></thead>
        <tbody>
          <tr><td className="mono">R-1001</td><td>Wieprzowina kl. II (łopatka)</td><td className="mono num" style={{ textAlign: "right" }}>540 g</td><td className="num mono">54.0</td></tr>
          <tr><td className="mono">R-1002</td><td>Słonina wieprzowa</td><td className="mono num" style={{ textAlign: "right" }}>220 g</td><td className="num mono">22.0</td></tr>
          <tr><td className="mono">R-1201</td><td>Sól peklująca</td><td className="mono num" style={{ textAlign: "right" }}>18 g</td><td className="num mono">1.8</td></tr>
          <tr><td className="mono">R-1202</td><td>Woda technologiczna</td><td className="mono num" style={{ textAlign: "right" }}>40 g</td><td className="num mono">4.0</td></tr>
          <tr><td className="mono">SUB-002</td><td>Mieszanka przypraw A-17</td><td className="mono num" style={{ textAlign: "right" }}>22 g</td><td className="num mono">2.2</td></tr>
          <tr><td className="mono">R-3001</td><td>Osłonka białkowa Ø26</td><td className="mono num" style={{ textAlign: "right" }}>0.9 m</td><td className="num mono">—</td></tr>
          <tr><td className="mono">R-3100</td><td>Dym płynny regal</td><td className="mono num" style={{ textAlign: "right" }}>8 g</td><td className="num mono">0.8</td></tr>
        </tbody>
      </table>

      <h3>Proces</h3>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.6 }}>
        <li>Rozdrobnij surowce na wilku Ø8 mm, temperatura ≤ 4°C.</li>
        <li>Wymieszaj z peklosolą, odstaw na 24 h w komorze 2°C.</li>
        <li>Kutruj do uzyskania jednolitej masy, temperatura końcowa <strong>10°C (±2)</strong>.</li>
        <li>Nadziej w osłonkę Ø26, formuj pętle 450 g.</li>
        <li>Osadzaj 60 min, 6°C.</li>
        <li>Wędź w 3 fazach (osadzanie → suszenie → wędzenie) do 65°C zewn.</li>
        <li><strong>CCP-2:</strong> parz do temperatury w centrum <strong>72°C przez ≥ 28 min</strong>.</li>
        <li><strong>CCP-3:</strong> schłódź prysznicem + komora do <strong>≤ 4°C w centrum</strong>.</li>
        <li>Pakuj MAP (O₂ ≤ 1%, CO₂ 28–35%), sprawdź szczelność.</li>
        <li>Detekcja metalu + kontrola wagi (tolerancja ±5 g).</li>
      </ol>

      <h3>Alergeny i uwagi</h3>
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
        Brak głównych alergenów. Może zawierać śladowe ilości gorczycy (wspólna linia przypraw).<br/>
        Okres przydatności: 21 dni, przechowywanie 0–6°C. Zgodność HACCP zatwierdzona wg procedury P-HACCP-03 (v12, 2026-03).
      </div>
    </div>
  </div>
);

Object.assign(window, { BOMDetail });
