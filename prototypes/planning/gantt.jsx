// ============ SCREEN-08 — WO Gantt View ============

const DAY_W = 200;            // px per day column
const HOUR_W = DAY_W / 24;    // px per hour
const TOTAL_W = DAY_W * 7;    // px for 7-day timeline

const PlanGantt = ({ onNav, onOpenWo }) => {
  const [selectedBar, setSelectedBar] = React.useState(null);
  const [view, setView] = React.useState("week");
  const [lineFilter, setLineFilter] = React.useState("all");

  const dates = ["Mon 2026-04-21","Tue 22","Wed 23","Thu 24","Fri 25","Sat 26","Sun 27"];

  const visibleBars = GANTT_BARS.filter(b => lineFilter === "all" || b.line === lineFilter);
  const changeovers = 5; // pre-computed for demo

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · <a onClick={()=>onNav("wos")}>Work orders</a> · Gantt</div>
          <h1 className="page-title">WO Gantt view</h1>
          <div className="muted" style={{fontSize:12}}>{visibleBars.length} WOs · {changeovers} changeovers in view · Factory-A · week 17</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("wos")}>▦ List view</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("sequencing")}>↯ Run sequencing</button>
          <button className="btn btn-secondary btn-sm">⇪ Export PNG</button>
        </div>
      </div>

      <div className="gantt-toolbar">
        <select style={{width:140}}><option>Week</option><option>Day</option><option>Month</option></select>
        <div className="pills">
          <button className={"pill " + (lineFilter === "all" ? "on" : "")} onClick={()=>setLineFilter("all")}>All lines</button>
          {GANTT_LINES.map(l => (
            <button key={l.id} className={"pill " + (lineFilter === l.id ? "on" : "")} onClick={()=>setLineFilter(l.id)}>{l.id}</button>
          ))}
        </div>
        <select style={{width:140}}><option>All statuses</option><option>Released</option><option>Planned</option><option>In progress</option></select>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm">Reschedule all</button>
        <button className="btn btn-ghost btn-sm">–</button>
        <span className="mono" style={{fontSize:11, color:"var(--muted)"}}>100%</span>
        <button className="btn btn-ghost btn-sm">+</button>
      </div>

      <div className="gantt-allergen-legend">
        <b style={{fontSize:11, color:"var(--muted)"}}>Allergen legend:</b>
        <span className="gal-chip"><span className="gal-dot" style={{background:"rgba(255,255,255,0.4)", border:"1px solid var(--border)"}}></span>Allergen-free</span>
        <span className="gal-chip"><span className="gal-dot" style={{background:"#f59e0b"}}></span>Gluten</span>
        <span className="gal-chip"><span className="gal-dot" style={{background:"#60a5fa"}}></span>Dairy</span>
        <span className="gal-chip"><span className="gal-dot" style={{background:"#a855f7"}}></span>Egg</span>
        <span className="gal-chip"><span className="gal-dot" style={{background:"#b45309"}}></span>Nuts</span>
        <span className="spacer"></span>
        <span style={{fontSize:11, color:"var(--muted)"}}>Priority: <span style={{borderLeft:"3px solid #ef4444", paddingLeft:4}}>Critical</span> · <span style={{borderLeft:"3px solid #f59e0b", paddingLeft:4}}>High</span></span>
      </div>

      <div className="gantt-scroll">
        <div className="gantt-grid" style={{minWidth: 200 + TOTAL_W}}>
          {/* Header */}
          <div className="gantt-header">
            <div className="gh-lines">Production lines</div>
            {dates.map((d,i) => (
              <div key={i} className={"gh-day " + (i === 0 ? "today" : "")}>
                {d}
                <div className="gh-sub">06 · 09 · 12 · 15 · 18 · 21</div>
              </div>
            ))}
          </div>

          {/* Lanes */}
          {GANTT_LINES.filter(l => lineFilter === "all" || l.id === lineFilter).map(line => {
            const bars = visibleBars.filter(b => b.line === line.id);
            const todayX = 10.5 * HOUR_W; // 10:30 as example "now"
            return (
              <div key={line.id} className="gantt-lane">
                <div className="gantt-lane-label">
                  {line.id}
                  <small>{line.name.replace(line.id + " — ", "")}</small>
                </div>
                <div className="gantt-lane-track" style={{minHeight: 72, width: TOTAL_W, position:"relative"}}>
                  {/* Today line */}
                  <div className="gantt-today" style={{left: todayX}}></div>

                  {/* Changeover markers — simplified */}
                  {line.id === "LINE-04" && <div className="gantt-changeover" style={{left: DAY_W + 16 * HOUR_W}} title="Allergen changeover"></div>}
                  {line.id === "LINE-02" && <div className="gantt-changeover" style={{left: DAY_W + 20 * HOUR_W}} title="Allergen changeover"></div>}

                  {/* WO bars */}
                  {bars.map(b => {
                    const left = b.day * DAY_W + b.start * HOUR_W;
                    const width = (b.end - b.start) * HOUR_W;
                    const cls = [
                      "gantt-bar",
                      b.status,
                      b.priority === "critical" ? "prio-critical" : b.priority === "high" ? "prio-high" : "",
                      b.conflict ? "conflict" : "",
                    ].join(" ");
                    return (
                      <div key={b.id} className={cls} style={{left, width}} onClick={e => { e.stopPropagation(); setSelectedBar(b); }}>
                        <div className="gb-code">{b.id}</div>
                        <div className="gb-name">{b.name}</div>
                        <div className={"gb-band " + b.allergen}></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* DAG dependency arrows (illustrative — simple marker between parent and child same-line) */}
          <svg style={{position:"absolute", top: 42, left: 200, width: TOTAL_W, height: "100%", pointerEvents:"none"}}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--muted)" />
              </marker>
            </defs>
            {/* Arrow from WO-2026-0114 (L4 day1 9am) to WO-2026-0113 (L4 day1 10am) */}
            <path className="gantt-dep-arrow" d={`M ${DAY_W + 9 * HOUR_W} 290 Q ${DAY_W + 9.5 * HOUR_W} 295, ${DAY_W + 10 * HOUR_W} 300`}/>
          </svg>
        </div>
      </div>

      {/* Popover on bar click */}
      {selectedBar && (
        <div className="modal-overlay" onClick={()=>setSelectedBar(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()} style={{width:400}}>
            <div className="modal-head">
              <div>
                <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{selectedBar.id}</div>
                <div className="modal-title">{selectedBar.name}</div>
              </div>
              <button className="modal-close" onClick={()=>setSelectedBar(null)}>✕</button>
            </div>
            <div className="modal-body" style={{fontSize:12, display:"grid", gap:10}}>
              <div className="row-flex"><span className="muted">Item</span><span className="spacer"></span><span className="mono">{selectedBar.item}</span></div>
              <div className="row-flex"><span className="muted">Line</span><span className="spacer"></span><span className="mono">{selectedBar.line}</span></div>
              <div className="row-flex"><span className="muted">Status</span><span className="spacer"></span><WOPlanStatus s={selectedBar.status}/></div>
              <div className="row-flex"><span className="muted">Priority</span><span className="spacer"></span><Priority p={selectedBar.priority}/></div>
              <div className="row-flex"><span className="muted">Day / hours</span><span className="spacer"></span><span className="mono">Day {selectedBar.day + 1} · {selectedBar.start}:00 – {selectedBar.end}:00</span></div>
              <div className="row-flex"><span className="muted">Allergen</span><span className="spacer"></span><span className="mono">{selectedBar.allergen}</span></div>
              {selectedBar.conflict && (
                <div className="alert-red alert-box" style={{fontSize:11}}>
                  <b>Capacity conflict</b> · This WO exceeds line capacity for its scheduled slot.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary btn-sm" onClick={()=>setSelectedBar(null)}>Close</button>
              <button className="btn btn-secondary btn-sm">Edit schedule</button>
              <button className="btn btn-primary btn-sm" onClick={()=>{ setSelectedBar(null); onOpenWo(selectedBar.id); }}>View detail →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { PlanGantt });
