// ============================================================================
// NPD module · pipeline.jsx — Legacy R&D pipeline view (kanban) — Phase 2 deprecation
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// @deprecated BL-NPD-02 — Legacy R&D pipeline. NOT in production scope. Use fa-screens.jsx / brief-screens.jsx instead.
// ============ Pipeline screen (Kanban / Table / Split) ============

const stageColor = {
  brief: "gray",
  recipe: "blue",
  trial: "amber",
  approval: "violet",
  handoff: "green"
};

const prioBadge = (p) => {
  if (p === "high") return <span className="badge badge-red">High</span>;
  if (p === "med")  return <span className="badge badge-amber">Medium</span>;
  if (p === "low")  return <span className="badge badge-gray">Low</span>;
  return <span className="badge badge-gray">Normal</span>;
};

const KanbanCard = ({ p, onOpen }) => (
  <div className={`kanban-card prio-${p.prio}`} onClick={() => onOpen(p.id)}>
    <div className="kanban-card-title">{p.name}</div>
    <div className="muted" style={{ fontSize: 11 }}>{p.code} · {p.type}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
      <div style={{ flex: 1, height: 4, background: "var(--gray-100)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${p.progress}%`, height: "100%", background: p.progress >= 90 ? "var(--green)" : "var(--blue)" }}></div>
      </div>
      <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{p.progress}%</span>
    </div>
    <div className="kanban-card-meta">
      <span>{p.owner}</span>
      <span>▶ {new Date(p.target).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
    </div>
  </div>
);

const KanbanView = ({ projects, onOpen }) => (
  <div className="kanban">
    {window.NPD_STAGES.map(s => {
      const items = projects.filter(p => p.stage === s.key);
      return (
        <div className="kanban-col" key={s.key}>
          <div className="kanban-col-head">
            <span>{s.label}</span>
            <span className="count">{items.length}</span>
          </div>
          {items.map(p => <KanbanCard key={p.id} p={p} onOpen={onOpen} />)}
          {items.length === 0 && <div className="muted" style={{ padding: 16, textAlign: "center", fontSize: 12 }}>—</div>}
        </div>
      );
    })}
  </div>
);

const TableView = ({ projects, onOpen, selectedId, onSelect }) => (
  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
    <table>
      <thead>
        <tr>
          <th>Project</th><th>Name</th><th>Type</th><th>Stage</th>
          <th>Owner</th><th>Progress</th><th>Target</th><th>Prio</th>
        </tr>
      </thead>
      <tbody>
        {projects.map(p => (
          <tr key={p.id}
              style={{ cursor: "pointer", background: selectedId === p.id ? "var(--blue-050)" : undefined }}
              onClick={() => onSelect ? onSelect(p.id) : onOpen(p.id)}>
            <td className="mono">{p.code}</td>
            <td style={{ fontWeight: 500 }}>{p.name}</td>
            <td className="muted">{p.type}</td>
            <td><span className={`badge badge-${stageColor[p.stage]}`}>{window.NPD_STAGES.find(s => s.key === p.stage)?.label}</span></td>
            <td>{p.owner}</td>
            <td style={{ minWidth: 140 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: 5, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden", maxWidth: 100 }}>
                  <div style={{ width: `${p.progress}%`, height: "100%", background: p.progress >= 90 ? "var(--green)" : "var(--blue)" }}></div>
                </div>
                <span className="mono" style={{ fontSize: 11, minWidth: 30 }}>{p.progress}%</span>
              </div>
            </td>
            <td className="mono">{new Date(p.target).toLocaleDateString("en", { month: "short", day: "numeric" })}</td>
            <td>{prioBadge(p.prio)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SplitView = ({ projects, onOpen }) => {
  const [selId, setSelId] = React.useState(projects[0]?.id);
  const sel = projects.find(p => p.id === selId) || projects[0];
  return (
    <div className="split">
      <TableView projects={projects} onOpen={onOpen} selectedId={selId} onSelect={setSelId} />
      <div className="card" style={{ position: "sticky", top: 100 }}>
        <div className="card-head">
          <div>
            <div className="muted mono" style={{ fontSize: 11 }}>{sel.code}</div>
            <div className="card-title">{sel.name}</div>
          </div>
          {prioBadge(sel.prio)}
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{sel.type}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginBottom: 12 }}>
          <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Owner</div>{sel.owner}</div>
          <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Stage</div>
            <span className={`badge badge-${stageColor[sel.stage]}`}>{window.NPD_STAGES.find(s => s.key === sel.stage)?.label}</span></div>
          <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Created</div>{sel.created}</div>
          <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Target launch</div>{sel.target}</div>
          {sel.cost && <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Cost / kg</div><span className="mono">€{sel.cost.toFixed(2)}</span></div>}
          {sel.margin !== undefined && <div><div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Margin</div>
            <span className={sel.margin >= 0 ? "mono" : "mono"} style={{ color: sel.margin >= 0 ? "var(--green)" : "var(--red)" }}>{sel.margin > 0 ? "+" : ""}{sel.margin}%</span></div>}
        </div>

        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Progress</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 8, background: "var(--gray-100)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${sel.progress}%`, height: "100%", background: sel.progress >= 90 ? "var(--green)" : "var(--blue)" }}></div>
          </div>
          <span className="mono" style={{ fontSize: 12 }}>{sel.progress}%</span>
        </div>

        {sel.notes && <><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 12, marginBottom: 12 }}>{sel.notes}</div></>}

        <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => onOpen(sel.id)}>Open project →</button>
      </div>
    </div>
  );
};

const Pipeline = ({ onOpen, onNew, pipelineView, setPipelineView, role }) => {
  const [filter, setFilter] = React.useState("all");
  const all = window.NPD_PROJECTS;
  const projects = filter === "all" ? all :
    filter === "mine" ? all.filter(p => p.owner === "K. Nowak") :
    filter === "behind" ? all.filter(p => p.prio === "high" && p.progress < 50) :
    all.filter(p => p.stage === filter);

  return (
    <div>
      <div className="breadcrumb"><a>Premium</a> / NPD</div>
      <div className="page-head">
        <div>
          <div className="page-title">New Product Development</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {role === "mgr" ? "Pipeline oversight — 8 active projects, 2 awaiting your approval." : "Your workbench — 4 projects assigned to you."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary">Import recipe</button>
          <button className="btn btn-primary" onClick={onNew}>+ New project</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--blue)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Active projects</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>8</div>
          <div className="muted" style={{ fontSize: 11 }}>2 in brief, 2 in recipe</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--amber)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Awaiting approval</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>2</div>
          <div style={{ fontSize: 11, color: "var(--amber-700)" }}>NPD-022, NPD-021</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--green)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Launched YTD</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>14</div>
          <div style={{ fontSize: 11, color: "var(--green)" }}>↑ 3 vs 2024</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--red)" }}>
          <div className="muted" style={{ fontSize: 11 }}>At risk</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>1</div>
          <div style={{ fontSize: 11, color: "var(--red)" }}>NPD-024 margin -5%</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--violet, #8b5cf6)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Avg time to launch</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>118<span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}> days</span></div>
          <div className="muted" style={{ fontSize: 11 }}>Target: 90 days</div>
        </div>
      </div>

      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="pills">
            <button className={`pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All ({all.length})</button>
            <button className={`pill ${filter === "mine" ? "on" : ""}`} onClick={() => setFilter("mine")}>Mine</button>
            <button className={`pill ${filter === "brief" ? "on" : ""}`} onClick={() => setFilter("brief")}>Brief</button>
            <button className={`pill ${filter === "recipe" ? "on" : ""}`} onClick={() => setFilter("recipe")}>Recipe</button>
            <button className={`pill ${filter === "trial" ? "on" : ""}`} onClick={() => setFilter("trial")}>Trial</button>
            <button className={`pill ${filter === "approval" ? "on" : ""}`} onClick={() => setFilter("approval")}>Approval</button>
          </div>
        </div>
        <div className="pills">
          <button className={`pill ${pipelineView === "kanban" ? "on" : ""}`} onClick={() => setPipelineView("kanban")}>▦ Kanban</button>
          <button className={`pill ${pipelineView === "table" ? "on" : ""}`} onClick={() => setPipelineView("table")}>≡ Table</button>
          <button className={`pill ${pipelineView === "split" ? "on" : ""}`} onClick={() => setPipelineView("split")}>⊟ Split</button>
        </div>
      </div>

      {/* §3.8 EmptyState — no projects in current filter */}
      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="🧪"
            title="No projects in this view"
            body="R&D pipeline is empty for the current filter. Try broadening or start a new project."
            action={{ label: "+ New project", onClick: onNew }}
          />
        </div>
      ) : (
        <>
          {pipelineView === "kanban" && <KanbanView projects={projects} onOpen={onOpen} />}
          {pipelineView === "table" && <TableView projects={projects} onOpen={onOpen} />}
          {pipelineView === "split" && <SplitView projects={projects} onOpen={onOpen} />}
        </>
      )}
    </div>
  );
};

Object.assign(window, { Pipeline, stageColor, prioBadge });
