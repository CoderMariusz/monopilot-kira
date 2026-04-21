// ============ Chrome: sidebar, topbar, subnav ============

const Sidebar = ({ current, onNav }) => {
  const link = (id, label, icon) => (
    <div className={`sidebar-item ${current === id ? "active" : ""}`} onClick={() => onNav(id)}>
      <span className="ic">{icon}</span>{label}
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
      {link("pipeline", "NPD", "★")}
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

Object.assign(window, { Sidebar, Topbar, SubNav });
