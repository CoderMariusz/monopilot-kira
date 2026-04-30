// ============ SCREEN-06 — WO List ============

const PlanWOList = ({ onOpenWo, onNav }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [moreFilters, setMoreFilters] = React.useState(false);

  // GHA auto-expand §3.3: overdue + in_progress groups open by default,
  // other status groups start collapsed.
  const [openGroups, setOpenGroups] = React.useState(() => ({
    in_progress: true,
    on_hold: true,
    overdue: true,
    released: false,
    planned: false,
    draft: false,
    completed: false,
  }));
  const toggleGroup = (k) => setOpenGroups(g => ({ ...g, [k]: !g[k] }));

  const tabs = [
    { k: "all",         l: "All",         c: PLAN_WOS.length },
    { k: "draft",       l: "Draft",       c: PLAN_WOS.filter(w => w.status === "draft").length },
    { k: "planned",     l: "Planned",     c: PLAN_WOS.filter(w => w.status === "planned").length },
    { k: "released",    l: "Released",    c: PLAN_WOS.filter(w => w.status === "released").length },
    { k: "in_progress", l: "In progress", c: PLAN_WOS.filter(w => w.status === "in_progress").length },
    { k: "on_hold",     l: "On hold",     c: PLAN_WOS.filter(w => w.status === "on_hold").length },
    { k: "completed",   l: "Completed",   c: PLAN_WOS.filter(w => w.status === "completed").length },
  ];

  const visible = PLAN_WOS.filter(w =>
    (tab === "all" || w.status === tab) &&
    (!search || w.id.toLowerCase().includes(search.toLowerCase()) || w.name.toLowerCase().includes(search.toLowerCase()) || w.item.toLowerCase().includes(search.toLowerCase()))
  );

  // When tab === "all", group rows by status bucket (with overdue as its own
  // synthetic bucket). When a single status tab is selected, show flat.
  const groupOrder = ["overdue", "in_progress", "on_hold", "released", "planned", "draft", "completed"];
  const groupLabels = {
    overdue: "Overdue (on hold > 24h)",
    in_progress: "In progress",
    on_hold: "On hold",
    released: "Released",
    planned: "Planned",
    draft: "Draft",
    completed: "Completed",
  };
  const groupTones = {
    overdue: "bad",
    in_progress: "info",
    on_hold: "warn",
    released: "info",
    planned: "neutral",
    draft: "neutral",
    completed: "ok",
  };
  const bucketOf = (w) => {
    const isOverdue = w.onHold && parseInt(w.onHold) >= 24;
    if (isOverdue) return "overdue";
    return w.status;
  };
  const grouped = {};
  groupOrder.forEach(k => grouped[k] = []);
  visible.forEach(w => {
    const b = bucketOf(w);
    if (!grouped[b]) grouped[b] = [];
    grouped[b].push(w);
  });

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(w => w.id)));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Work orders</div>
          <h1 className="page-title">Work orders</h1>
          <div className="muted" style={{fontSize:12}}>{PLAN_WOS.length} work orders · 3 require attention · cascade chains: 6 active</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("gantt")}>≡ Gantt view</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("cascade")}>⊶ Cascade DAG</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm">＋ Create WO</button>
        </div>
      </div>

      {/* KPI mini-cards */}
      <div className="kpi-row-8">
        <div className="kpi"><div className="kpi-label">Scheduled today</div><div className="kpi-value">14</div><div className="kpi-sub">On 5 lines</div></div>
        <div className="kpi green"><div className="kpi-label">In progress</div><div className="kpi-value">1</div><div className="kpi-sub">Active right now</div></div>
        <div className="kpi red"><div className="kpi-label">On hold &gt; 24h</div><div className="kpi-value">2</div><div className="kpi-sub">Requires attention</div></div>
        <div className="kpi"><div className="kpi-label">This week created</div><div className="kpi-value">28</div><div className="kpi-sub">+6 vs last week</div></div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      {/* Filter bar — §3.11 "More filters ▾" collapse when >3 filters */}
      <div className="filter-bar">
        <input type="text" placeholder="Search WO id, product, item…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:260}}/>
        <select style={{width:130}}><option>All lines</option><option>LINE-01</option><option>LINE-02</option><option>LINE-03</option><option>LINE-04</option><option>LINE-05</option></select>
        <select style={{width:130}}><option>All priorities</option><option>Critical</option><option>High</option><option>Normal</option><option>Low</option></select>
        <select style={{width:120}}><option>Next 7 days</option><option>Today</option><option>Tomorrow</option><option>This week</option><option>Overdue</option></select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setMoreFilters(v => !v)}
          aria-expanded={moreFilters}
          title="Show additional filters">
          More filters {moreFilters ? "▴" : "▾"}
        </button>
        {moreFilters && <>
          <select style={{width:150}}><option>All allergen families</option><option>Allergen-free</option><option>Gluten</option><option>Dairy</option><option>Nuts</option><option>Egg</option></select>
          <select style={{width:120}}><option>All sources</option><option>Manual</option><option>D365 SO</option><option>Cascade</option><option>Rework</option></select>
        </>}
        <span className="spacer"></span>
        <button className="clear-all">Clear all filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card" style={{padding:"8px 14px", marginBottom:10, background:"var(--blue-050)", borderColor:"var(--blue)"}}>
          <div className="row-flex">
            <b>{selected.size} selected</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm">Release selected</button>
            <button className="btn btn-secondary btn-sm">Export to Excel</button>
            <button className="btn btn-secondary btn-sm">Print</button>
            <button className="btn btn-danger btn-sm">Cancel selected</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        {visible.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No work orders match your filters"
            body="Try clearing filters or switching to a different tab."
            action={{ label: "Clear all filters", onClick: () => { setSearch(""); setTab("all"); } }}
          />
        ) : (
        <table>
          <thead>
            <tr>
              <th style={{width:34}}><input type="checkbox" checked={selected.size > 0 && selected.size === visible.length} onChange={toggleAll}/></th>
              <th>WO</th>
              <th>Product</th>
              <th>Status</th>
              <th>Priority</th>
              <th style={{textAlign:"right"}}>Qty</th>
              <th>Scheduled</th>
              <th>Line</th>
              <th>Allergen</th>
              <th>Availability</th>
              <th>Progress</th>
              <th>Cascade</th>
              <th style={{width:100}}></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const renderRow = (w) => {
                const isOverdue = w.onHold && parseInt(w.onHold) >= 24;
                return (
                  <tr key={w.id} className={isOverdue ? "row-overdue" : (w.avail === "red" ? "row-warning" : "")} onClick={()=>onOpenWo(w.id)} style={{cursor:"pointer"}}>
                    <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(w.id)} onChange={()=>toggle(w.id)}/></td>
                    <td className="mono" style={{fontWeight:600}}>
                      {w.id}
                      <SourceBadge s={w.source} />
                    </td>
                    <td>
                      <div style={{fontWeight:500}}>{w.name}</div>
                      <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{w.item}</div>
                    </td>
                    <td>
                      <WOPlanStatus s={w.status} />
                      {w.onHold && <div className="muted" style={{fontSize:10, marginTop:2}}>{w.onHold}</div>}
                    </td>
                    <td><Priority p={w.priority} /></td>
                    <td className="num mono">{w.qty} {w.uom}</td>
                    <td className="mono" style={{fontSize:11}}>
                      {w.date.slice(0,10)}
                      <div className="muted" style={{fontSize:10}}>{w.rel}</div>
                    </td>
                    <td className="mono">{w.line || <span className="muted">Not assigned</span>}</td>
                    <td><AllergenCluster families={w.allergens}/></td>
                    <td><Avail v={w.avail}/></td>
                    <td style={{minWidth:100}}>
                      <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{w.progress}%</div>
                      <div className={"cell-bar " + (w.progress > 0 ? "green" : "")} style={{width:80}}><span style={{width:w.progress+"%"}}></span></div>
                    </td>
                    <td>
                      {w.cascade && (
                        <span className="cascade-layer-badge" title={`Layer ${w.cascade.layer} of ${w.cascade.total}`}>
                          ⊶ {w.cascade.layer}/{w.cascade.total}
                        </span>
                      )}
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      {w.status === "draft" && <button className="btn btn-secondary btn-sm">Plan</button>}
                      {w.status === "planned" && <button className="btn btn-primary btn-sm">Release</button>}
                      {w.status === "released" && <button className="btn btn-secondary btn-sm">Start</button>}
                      {w.status === "in_progress" && <button className="btn btn-secondary btn-sm">Pause</button>}
                      {w.status === "on_hold" && <button className="btn btn-primary btn-sm">Resume</button>}
                      {w.status === "completed" && <button className="btn btn-ghost btn-sm">Close</button>}
                      <button className="btn btn-ghost btn-sm" style={{marginLeft:2}}>⋯</button>
                    </td>
                  </tr>
                );
              };

              if (tab !== "all") {
                // Single-status filter — flat list (no group rows).
                return visible.map(renderRow);
              }

              // "All" tab — render GHA-style groups.
              const nodes = [];
              groupOrder.forEach(k => {
                const rows = grouped[k] || [];
                if (!rows.length) return;
                const isOpen = !!openGroups[k];
                const tone = groupTones[k] || "neutral";
                nodes.push(
                  <tr key={"g-" + k} className={"wo-group-row tone-" + tone} onClick={() => toggleGroup(k)} style={{cursor:"pointer"}}>
                    <td colSpan={13} style={{background:"var(--surface-2, #f1f5f9)", padding:"6px 12px", fontSize:12, fontWeight:600}}>
                      <span style={{display:"inline-block", width:14}}>{isOpen ? "▾" : "▸"}</span>
                      {groupLabels[k]}
                      <span className="mono" style={{marginLeft:8, fontSize:11, color:"var(--muted)", fontWeight:400}}>
                        {rows.length} {rows.length === 1 ? "WO" : "WOs"}
                      </span>
                      {(k === "overdue" || k === "in_progress" || k === "on_hold") && (
                        <span className="muted" style={{marginLeft:8, fontSize:10, fontWeight:400}}>· auto-expanded</span>
                      )}
                    </td>
                  </tr>
                );
                if (isOpen) rows.forEach(w => nodes.push(renderRow(w)));
              });
              return nodes;
            })()}
          </tbody>
        </table>
        )}
      </div>

      <div className="row-flex" style={{marginTop:10, fontSize:12, color:"var(--muted)"}}>
        <span>Showing {visible.length} of {PLAN_WOS.length}</span>
        <span className="spacer"></span>
        <div className="row-flex">
          <button className="btn btn-ghost btn-sm">← Prev</button>
          <span className="mono">1</span>
          <button className="btn btn-ghost btn-sm">Next →</button>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { PlanWOList });
