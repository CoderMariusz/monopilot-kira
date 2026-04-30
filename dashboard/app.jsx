// =============================================================================
// Dashboard app — adaptive hero (wizard | KPIs) + per-module widget grid
// Persona toggle in topbar lets the user preview both states.
// =============================================================================

const SIDEBAR = [
  { group: "Core", items: [
    { key: "dashboard", icon: "🏠", label: "Dashboard",  active: true },
    { key: "settings",  icon: "⚙️", label: "Settings",   href: "../settings/settings.html" },
  ]},
  { group: "Operations", items: [
    { key: "technical", icon: "🔧", label: "Technical",  badge: { text: "2", cls: "" } },
    { key: "planning",  icon: "📅", label: "Planning",   badge: { text: "3", cls: "amber" } },
    { key: "production",icon: "🏭", label: "Production", badge: { text: "•", cls: "" } },
    { key: "quality",   icon: "✅", label: "Quality",    badge: { text: "2", cls: "" } },
  ]},
  { group: "Premium", items: [
    { key: "npd",       icon: "💡", label: "NPD",        href: "../npd/index.html", badge: { text: "24", cls: "gray" } },
    { key: "finance",   icon: "💰", label: "Finance" },
    { key: "oee",       icon: "📊", label: "OEE" },
    { key: "reporting", icon: "📈", label: "Reporting" },
  ]},
];

const Sidebar = () => (
  <aside className="sidebar">
    <div className="brand-row">
      <div className="brand-mark">M</div>
      <div className="brand-text">Mono<span>Pilot</span></div>
      <div className="brand-tenant">apex</div>
    </div>

    {SIDEBAR.map(g => (
      <React.Fragment key={g.group}>
        <div className="nav-group">{g.group}</div>
        {g.items.map(it => (
          <div
            key={it.key}
            className={"nav-item" + (it.active ? " active" : "")}
            onClick={() => it.href && (window.location.href = it.href)}
          >
            <span className="nav-icon">{it.icon}</span>
            <span>{it.label}</span>
            {it.badge && <span className={"nav-badge " + (it.badge.cls || "")}>{it.badge.text}</span>}
          </div>
        ))}
      </React.Fragment>
    ))}
  </aside>
);

const Topbar = ({ persona, setPersona }) => (
  <div className="topbar">
    <div>
      <div className="topbar-title">Dashboard</div>
      <div className="topbar-sub">Plant overview · Apex Foods Ltd</div>
    </div>
    <div className="topbar-spacer"></div>

    <div className="persona-toggle" title="Demo: switch onboarding state">
      <button className={persona === "wizard" ? "active" : ""} onClick={() => setPersona("wizard")}>Setup pending</button>
      <button className={persona === "kpi" ? "active" : ""} onClick={() => setPersona("kpi")}>Live</button>
    </div>

    <div className="search-box"><input placeholder="Search FG, WO, LP, supplier…" /></div>
    <div className="icon-btn" title="Help">?</div>
    <div className="icon-btn" title="Notifications">🔔<span className="dot"></span></div>
    <div className="user-pill">
      <div className="user-avatar">{window.DASH_USER.initials}</div>
      <span>{window.DASH_USER.name}</span>
      <span style={{ color: "var(--gray-500)" }}>›</span>
    </div>
  </div>
);

// ============================================================
// HERO — wizard variant (onboarding incomplete)
// ============================================================
const HeroWizard = () => {
  const steps = window.DASH_ONBOARDING_STEPS;
  const done = steps.filter(s => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <div className="hero-wizard">
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="hero-tag">⚡ Setup wizard</div>
        <h2 className="hero-title">You're {pct}% done — let's finish setup</h2>
        <p className="hero-sub">
          Your workspace needs a few more steps before you can run production.
          Most teams finish in under 15 minutes.
        </p>

        <div className="hero-progress">
          <div className="hero-bar"><i style={{ width: pct + "%" }} /></div>
          <div className="hero-progress-text">{done}/{steps.length} steps</div>
        </div>

        <div className="hero-cta">
          <button className="btn-on-hero" onClick={() => window.location.href = "../settings/settings.html"}>
            Continue setup →
          </button>
          <button className="btn-on-hero-ghost">Skip for now</button>
        </div>
      </div>

      <div className="hero-side">
        <div className="hero-side-h">Remaining steps</div>
        {steps.map(s => (
          <div key={s.key} className={"hero-step" + (s.done ? " done" : "") + (s.current ? " current" : "")}>
            <div className="dot">{s.done ? "✓" : s.num}</div>
            <span>{s.label}</span>
            <span className="duration">{s.duration}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// HERO — KPI variant (onboarding complete)
// ============================================================
const HeroKpi = () => (
  <div className="hero-kpi">
    <div className="kpi-card">
      <div className="kpi-label">Active work orders</div>
      <div className="kpi-value">12</div>
      <div className="kpi-trend up">↑ 3 today</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-label">Yield · MTD</div>
      <div className="kpi-value">91.5%</div>
      <div className="kpi-trend up">↑ 0.7% vs last month</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-label">Open POs</div>
      <div className="kpi-value">23</div>
      <div className="kpi-trend down">3 overdue</div>
    </div>
    <div className="kpi-card">
      <div className="kpi-label">QA holds</div>
      <div className="kpi-value">2</div>
      <div className="kpi-trend flat">No change</div>
    </div>
  </div>
);

// ============================================================
// APP
// ============================================================
const DashboardApp = () => {
  // Persona toggle drives hero variant + dims onboarding banner
  const [persona, setPersona] = React.useState("wizard");

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Topbar persona={persona} setPersona={setPersona} />

        <div className="page">
          <div className="page-head">
            <div>
              <h1 className="greeting">{greeting}, {window.DASH_USER.name.split(" ")[0]}</h1>
              <div className="greeting-sub">{window.DASH_USER.role} · {window.DASH_USER.org} · Wednesday, 13 May 2026</div>
            </div>
            <div className="page-actions">
              <button className="btn btn-secondary">Export report</button>
              <button className="btn btn-primary">+ New WO</button>
            </div>
          </div>

          {persona === "wizard" ? <HeroWizard /> : <HeroKpi />}

          <div className="section-grid" style={{ marginBottom: 16 }}>
            {window.DASH_MODULES.npd        && <NpdWidget />}
            {window.DASH_MODULES.production && <ProductionWidget />}
          </div>
          <div className="section-grid">
            {window.DASH_MODULES.technical  && <TechnicalWidget />}
            {window.DASH_MODULES.quality    && <QualityWidget />}
          </div>
          <div style={{ marginTop: 16 }}>
            {window.DASH_MODULES.planning   && <PlanningWidget />}
          </div>
        </div>
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<DashboardApp />);
