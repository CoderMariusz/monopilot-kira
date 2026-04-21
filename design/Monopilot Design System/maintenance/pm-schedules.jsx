// ============ MAINT-009 PM Schedules List + Calendar view ============

const MntPMList = ({ onNav, openModal, role }) => {
  const [view, setView] = React.useState("list"); // list | week | month
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [techFilter, setTechFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [monthOffset, setMonthOffset] = React.useState(0);

  const isManager = role === "Manager" || role === "Admin";

  const visible = MNT_PM_SCHEDULES.filter(p => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (techFilter !== "all" && p.tech !== techFilter) return false;
    if (statusFilter === "active" && !p.active) return false;
    if (statusFilter === "inactive" && p.active) return false;
    if (overdueOnly && p.days >= 0) return false;
    if (search && !(p.pm.toLowerCase().includes(search.toLowerCase()) ||
                    p.asset.toLowerCase().includes(search.toLowerCase()) ||
                    (p.tech||"").toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const overdueCount = MNT_PM_SCHEDULES.filter(p => p.days < 0).length;
  const weekCount = MNT_PM_SCHEDULES.filter(p => p.days >= 0 && p.days <= 7).length;
  const activeCount = MNT_PM_SCHEDULES.filter(p => p.active).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · PM schedules</div>
          <h1 className="page-title">PM schedules</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_PM_SCHEDULES.length} schedules · {activeCount} active · {overdueCount} overdue · {weekCount} due this week
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search PM, asset, tech…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
          <div className="pm-cal-toggle">
            <button className={view==="list"?"on":""} onClick={()=>setView("list")}>List</button>
            <button className={view==="week"?"on":""} onClick={()=>setView("week")}>Week</button>
            <button className={view==="month"?"on":""} onClick={()=>setView("month")}>Month</button>
          </div>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("pmEdit", { mode: "create" })}>＋ Create PM Schedule</button>}
        </div>
      </div>

      {/* Summary KPI row */}
      <div className="kpi-grid-6">
        <div className="kpi"><div className="kpi-label">Schedules active</div><div className="kpi-value">{activeCount}</div><div className="kpi-sub">of {MNT_PM_SCHEDULES.length} total</div></div>
        <div className="kpi amber"><div className="kpi-label">Due this week</div><div className="kpi-value">{weekCount}</div><div className="kpi-sub">≤ 7 days</div></div>
        <div className="kpi red"><div className="kpi-label">Overdue</div><div className="kpi-value">{overdueCount}</div><div className="kpi-sub">Immediate attention</div></div>
        <div className="kpi green"><div className="kpi-label">PM compliance (30d)</div><div className="kpi-value">87.4%</div><div className="kpi-sub">Target ≥ 85%</div></div>
        <div className="kpi blue"><div className="kpi-label">Auto-generate</div><div className="kpi-value">{MNT_PM_SCHEDULES.filter(p=>p.auto).length}</div><div className="kpi-sub">Engine scheduled</div></div>
        <div className="kpi"><div className="kpi-label">Avg interval</div><div className="kpi-value mono">45d</div><div className="kpi-sub">Across active</div></div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>Type</label>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="preventive">Preventive</option>
          <option value="calibration">Calibration</option>
          <option value="sanitation">Sanitation</option>
          <option value="inspection">Inspection</option>
        </select>
        <label>Technician</label>
        <select value={techFilter} onChange={e=>setTechFilter(e.target.value)}>
          <option value="all">All</option>
          {MNT_TECHNICIANS.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        <label>Status</label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={overdueOnly} onChange={e=>setOverdueOnly(e.target.checked)}/> Overdue only
        </label>
      </div>

      {view === "list" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead>
              <tr>
                <th>PM #</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Frequency</th>
                <th>Last done</th>
                <th>Next due</th>
                <th>Technician</th>
                <th>Template</th>
                <th>Auto</th>
                <th>Active</th>
                <th style={{width:120}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.pm} className={p.days < 0 ? "row-overdue" : (p.days <= 7 ? "row-due" : "")} style={{cursor:"pointer"}} onClick={()=>onNav("pm_schedules")}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{p.pm}</td>
                  <td style={{fontSize:12}}>{p.asset}{p.allergen && <span className="badge badge-amber" style={{fontSize:9, marginLeft:6}}>Allergen</span>}</td>
                  <td><MwoType t={p.type}/></td>
                  <td style={{fontSize:11}}>{p.freq}</td>
                  <td className="mono" style={{fontSize:11}}>{p.lastDone || <span className="muted">Never</span>}</td>
                  <td><DueCell date={p.nextDue} days={p.days}/></td>
                  <td style={{fontSize:11}}>{p.tech || <span className="muted">—</span>}</td>
                  <td style={{fontSize:11}}>{p.tmpl || <span className="muted">—</span>}</td>
                  <td>{p.auto ? <span className="badge badge-green" style={{fontSize:9}}>✓</span> : <span className="muted">—</span>}</td>
                  <td>{p.active ? <span className="badge badge-green" style={{fontSize:9}}>✓</span> : <span className="badge badge-gray" style={{fontSize:9}}>Inactive</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {isManager && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("pmEdit", { pm: p.pm, mode: "edit" })}>Edit</button>}
                    {isManager && p.active && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("pmSkip", { pm: p.pm })}>Skip</button>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={11} style={{textAlign:"center", padding:40}}>
                  <div className="muted">No PM schedules match your filters.</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "month" && <PMMonthCalendar schedules={visible} onOpenPm={()=>onNav("pm_schedules")} monthOffset={monthOffset} onOffset={setMonthOffset}/>}
      {view === "week"  && <PMWeekCalendar schedules={visible} onOpenPm={()=>onNav("pm_schedules")}/>}
    </>
  );
};

// ============ Month Calendar View ============
const PMMonthCalendar = ({ schedules, onOpenPm, monthOffset, onOffset }) => {
  // April 2026 centered on today 2026-04-21
  const monthStart = new Date(2026, 3 + monthOffset, 1);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (monthStart.getDay() + 6) % 7; // Mon=0

  // Compute events per day (keyed by yyyy-mm-dd)
  const eventsMap = {};
  schedules.forEach(p => {
    if (!eventsMap[p.nextDue]) eventsMap[p.nextDue] = [];
    eventsMap[p.nextDue].push(p);
  });

  const cells = [];
  // pad with previous month
  for (let i = 0; i < firstDayOfWeek; i++) {
    const d = new Date(year, month, 1 - (firstDayOfWeek - i));
    cells.push({ day: d.getDate(), date: fmtDate(d), other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    cells.push({ day: d, date, other: false, today: date === "2026-04-21" });
  }
  // Fill final row
  while (cells.length % 7 !== 0) {
    const dt = new Date(year, month + 1, cells.length - firstDayOfWeek - daysInMonth + 1);
    cells.push({ day: dt.getDate(), date: fmtDate(dt), other: true });
  }

  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  return (
    <div className="pm-cal">
      <div className="pm-cal-head">
        <div className="row-flex">
          <button className="btn btn-ghost btn-sm" onClick={()=>onOffset(monthOffset-1)}>‹ Prev</button>
          <div className="pm-cal-title">{monthNames[month]} {year}</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>onOffset(monthOffset+1)}>Next ›</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>onOffset(0)}>Today</button>
        </div>
        <div className="row-flex" style={{fontSize:10}}>
          <span className="cm-chip prod">Preventive</span>
          <span className="cm-chip qa">Calibration</span>
          <span className="cm-chip wh">Sanitation</span>
          <span className="cm-chip">Inspection</span>
          <span className="badge badge-red" style={{fontSize:9}}>Overdue</span>
        </div>
      </div>

      <div className="cal-dow-head">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <div key={d}>{d}</div>)}
      </div>

      <div className="cal-grid-month">
        {cells.map((c,i) => (
          <div key={i} className={"cal-cell " + (c.other ? "other-month " : "") + (c.today ? "today" : "")}>
            <div className="cc-day">{c.day}</div>
            {(eventsMap[c.date] || []).slice(0,4).map(ev => (
              <span key={ev.pm} className={"cc-event cal-event " + ev.type + (ev.days < 0 ? " overdue" : "")} onClick={onOpenPm} title={`${ev.pm} · ${ev.asset}`}>
                {ev.pm} · {ev.asset.split(" ")[0]}
              </span>
            ))}
            {(eventsMap[c.date] || []).length > 4 && (
              <span style={{fontSize:9, color:"var(--muted)", fontStyle:"italic"}}>+{eventsMap[c.date].length - 4} more</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ Week Calendar View (asset × day grid) ============
const PMWeekCalendar = ({ schedules, onOpenPm }) => {
  // Week starting 2026-04-20 Monday
  const weekDays = [
    { date: "2026-04-20", dow: "Mon", day: "20" },
    { date: "2026-04-21", dow: "Tue", day: "21", today: true },
    { date: "2026-04-22", dow: "Wed", day: "22" },
    { date: "2026-04-23", dow: "Thu", day: "23" },
    { date: "2026-04-24", dow: "Fri", day: "24" },
    { date: "2026-04-25", dow: "Sat", day: "25" },
    { date: "2026-04-26", dow: "Sun", day: "26" },
  ];
  // Group schedules by asset
  const byAsset = {};
  schedules.forEach(p => {
    if (!byAsset[p.asset]) byAsset[p.asset] = [];
    byAsset[p.asset].push(p);
  });

  return (
    <div className="pm-cal">
      <div className="pm-cal-head">
        <div className="pm-cal-title">Week of 20 Apr 2026 — asset × day grid</div>
        <div className="row-flex">
          <button className="btn btn-ghost btn-sm">‹ Prev week</button>
          <button className="btn btn-ghost btn-sm">Next week ›</button>
        </div>
      </div>

      <div className="cal-week" style={{marginBottom:4}}>
        <div style={{fontSize:10, color:"var(--muted)", textTransform:"uppercase", fontWeight:600, padding:"4px 6px"}}>Asset</div>
        {weekDays.map(d => (
          <div key={d.date} style={{fontSize:10, color: d.today ? "var(--blue)" : "var(--muted)", textTransform:"uppercase", fontWeight:700, padding:"4px 6px", textAlign:"center"}}>
            {d.dow} <span className="mono">{d.day}</span>
          </div>
        ))}
      </div>

      {Object.keys(byAsset).slice(0, 12).map(asset => (
        <div key={asset} className="cal-week" style={{marginBottom:4}}>
          <div className="cal-week-asset">{asset}</div>
          {weekDays.map(d => {
            const events = byAsset[asset].filter(p => p.nextDue === d.date);
            return (
              <div key={d.date} className={"cal-week-cell " + (d.today ? "today" : "")}>
                {events.map(ev => (
                  <span key={ev.pm} className={"cc-event cal-event " + ev.type} onClick={onOpenPm} style={{display:"block"}}>
                    {ev.pm}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

Object.assign(window, { MntPMList, PMMonthCalendar, PMWeekCalendar });
