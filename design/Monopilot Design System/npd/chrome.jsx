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
  const forzaScreens = ["dashboard", "fa_list", "fa_detail", "fa_kanban", "d365_builder", "formulation_editor", "briefs", "brief_detail"];
  const isForzaActive = forzaScreens.includes(current);
  const [forzaOpen, setForzaOpen] = React.useState(isForzaActive);

  const isActive = (id) => {
    if (current === id) return true;
    if (id === "pipeline" && (current === "project" || current === "new")) return true;
    if (id === "fa_list"  && (current === "fa_detail" || current === "fa_kanban" || current === "d365_builder" || current === "formulation_editor")) return true;
    if (id === "briefs"   && current === "brief_detail") return true;
    return false;
  };

  const subItem = (id, label) => (
    <a key={id}
      className={isActive(id) ? "on" : ""}
      onClick={() => onNav(id)}
      style={{ paddingLeft: 22, fontSize: 12, opacity: 0.9 }}>
      {label}
    </a>
  );

  return (
    <div className="subnav">
      <a className={isActive("pipeline")     ? "on" : ""} onClick={() => onNav("pipeline")}>Projects</a>
      <a className={isActive("formulations") ? "on" : ""} onClick={() => onNav("formulations")}>Formulations</a>
      <a className={isActive("allergens")    ? "on" : ""} onClick={() => onNav("allergens")}>Allergen cascade</a>

      {/* Forza collapsible section */}
      <a className={isForzaActive ? "on" : ""}
        onClick={() => setForzaOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6 }}>
        Forza
        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: "auto" }}>{forzaOpen ? "▲" : "▼"}</span>
      </a>
      {forzaOpen && (
        <>
          {subItem("dashboard", "FA Dashboard")}
          {subItem("fa_list",   "Factory Articles")}
          {subItem("briefs",    "Briefs")}
        </>
      )}

      <a className={isActive("gallery") ? "on" : ""} onClick={() => onNav("gallery")} style={{ marginLeft: "auto" }}>Modal gallery</a>
    </div>
  );
};

Object.assign(window, { Sidebar, Topbar, SubNav });
