// ============ Chrome: sidebar, topbar, subnav ============

// §3.7 Sidebar count badge helper — red if any overdue, amber if any pending.
// Derives counts from NPD_BRIEFS + NPD_FAS (no data.jsx edits).
const deriveNpdSidebarCount = () => {
  const briefs = window.NPD_BRIEFS || [];
  const fas = window.NPD_FAS || [];
  // "Awaiting signoff" = briefs in status "complete" (waiting to be converted)
  // plus FAs where status_overall === "Alert" (red-lined).
  const pending = briefs.filter(b => b.status === "complete").length;
  const overdue = fas.filter(f => f.status_overall === "Alert" || (f.days_left !== null && f.days_left !== undefined && f.days_left <= 10 && !f.built)).length;
  const total = pending + overdue;
  const tone = overdue > 0 ? "bad" : (pending > 0 ? "warn" : "neutral");
  return { total, overdue, pending, tone };
};

const SidebarBadge = ({ count, tone }) => {
  if (!count) return null;
  const bg = tone === "bad" ? "var(--sem-bad-bg, #fef2f2)" : tone === "warn" ? "var(--sem-warn-bg, #fffbeb)" : "var(--sem-neutral-bg, #f1f5f9)";
  const color = tone === "bad" ? "var(--red-700, #b91c1c)" : tone === "warn" ? "var(--amber-700, #b45309)" : "var(--gray-600, #4b5563)";
  return (
    <span style={{
      marginLeft: "auto", background: bg, color, borderRadius: 10,
      padding: "1px 7px", fontSize: 10, fontWeight: 700,
      fontVariantNumeric: "tabular-nums", lineHeight: 1.4
    }} title={tone === "bad" ? `${count} items overdue` : `${count} awaiting signoff`}>
      {count}
    </span>
  );
};

const Sidebar = ({ current, onNav }) => {
  const npdCount = deriveNpdSidebarCount();
  const link = (id, label, icon, badge) => (
    <div className={`sidebar-item ${current === id ? "active" : ""}`} onClick={() => onNav(id)} style={{ display: "flex", alignItems: "center" }}>
      <span className="ic">{icon}</span>
      <span>{label}</span>
      {badge}
    </div>
  );
  return (
    <div id="sidebar">
      <div className="sidebar-logo">Monopilot <span>MES</span></div>
      <div className="sidebar-group">Core</div>
      <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
      <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
      <div className="sidebar-group">Operations</div>
      <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
      <div className="sidebar-item"><span className="ic">⚒</span>Production</div>
      <div className="sidebar-item"><span className="ic">▥</span>Warehouse</div>
      <div className="sidebar-group">QA &amp; Shipping</div>
      <div className="sidebar-item"><span className="ic">✓</span>Quality</div>
      <div className="sidebar-item"><span className="ic">→</span>Shipping</div>
      <div className="sidebar-group">Premium</div>
      {link("pipeline", "NPD", "★", <SidebarBadge count={npdCount.total} tone={npdCount.tone}/>)}
      <div className="sidebar-item"><span className="ic">$</span>Finance</div>
      <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
      <div className="sidebar-item"><span className="ic">↔</span>Integrations</div>
    </div>
  );
};

const Topbar = ({ role, setRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search NPD project, recipe, ingredient…" /></div>
    <div className="spacer"></div>
    <div className="role-switch">
      <button className={role === "rd" ? "on" : ""} onClick={() => setRole("rd")}>R&amp;D view</button>
      <button className={role === "mgr" ? "on" : ""} onClick={() => setRole("mgr")}>Manager view</button>
    </div>
    <span className="badge badge-amber">2 approvals</span>
    <div className="avatar">KN</div>
  </div>
);

const SubNav = ({ current, onNav, role }) => {
  // Structured sub-nav — spec-aligned primary entries + legacy R&D pipeline + admin
  const tabs = [
    { id: "dashboard",    label: "Dashboard",      group: "Jane" },
    { id: "fa_list",      label: "Factory Articles", group: "Jane" },
    { id: "briefs",       label: "Briefs",         group: "Jane" },
    { id: "formulations", label: "Formulations",   group: "RD" },
    { id: "allergens",    label: "Allergen cascade", group: "RD" },
    { id: "pipeline",     label: "R&D pipeline",   group: "RD" },
    { id: "gallery",      label: "Modal gallery",  group: "Admin" }
  ];

  // Highlight logic: fa_detail belongs under fa_list; brief_detail under briefs; project under pipeline
  const isActive = (id) => {
    if (current === id) return true;
    if (id === "fa_list"  && (current === "fa_detail" || current === "fa_kanban" || current === "d365_builder" || current === "formulation_editor")) return true;
    if (id === "briefs"   && current === "brief_detail") return true;
    if (id === "pipeline" && (current === "project" || current === "new")) return true;
    return false;
  };

  return (
    <div className="subnav">
      {tabs.map(t => (
        <a key={t.id} className={isActive(t.id) ? "on" : ""} onClick={() => onNav(t.id)}>{t.label}</a>
      ))}
    </div>
  );
};

Object.assign(window, { Sidebar, Topbar, SubNav, deriveNpdSidebarCount });
