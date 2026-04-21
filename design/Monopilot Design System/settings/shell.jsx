// ============ Shell: sidebar + topbar + settings sub-nav ============

const SSidebar = () => (
  <div id="sidebar">
    <div className="sidebar-logo">Monopilot <span>MES</span></div>
    <div className="sidebar-group">Core</div>
    <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
    <div className="sidebar-item active"><span className="ic">⚙</span>Settings</div>
    <div className="sidebar-group">Operations</div>
    <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
    <div className="sidebar-item"><span className="ic">⚒</span>Production</div>
    <div className="sidebar-item"><span className="ic">▥</span>Warehouse</div>
    <div className="sidebar-group">QA &amp; Shipping</div>
    <div className="sidebar-item"><span className="ic">✓</span>Quality</div>
    <div className="sidebar-item"><span className="ic">→</span>Shipping</div>
    <div className="sidebar-group">Premium</div>
    <div className="sidebar-item"><span className="ic">★</span>NPD</div>
    <div className="sidebar-item"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
  </div>
);

const STopbar = ({ role, setRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search settings…" /></div>
    <div className="spacer"></div>
    <div className="role-switch">
      <button className={role === "admin" ? "on" : ""} onClick={() => setRole("admin")}>Admin</button>
      <button className={role === "user" ? "on" : ""} onClick={() => setRole("user")}>User</button>
    </div>
    <div className="avatar">KN</div>
  </div>
);

const SettingsNav = ({ current, onNav, role }) => {
  const groups = window.SETTINGS_NAV.filter(g => role === "admin" ? g.admin !== false : g.admin === false);
  return (
    <div id="settings-nav">
      {groups.map(g => (
        <React.Fragment key={g.group}>
          <div className="settings-nav-group">{g.group}</div>
          {g.items.map(it => (
            <div key={it.key}
                 className={`settings-nav-item ${current === it.key ? "active" : ""}`}
                 onClick={() => onNav(it.key)}>
              <span className="ic">{it.ic}</span>
              <span>{it.label}</span>
              {it.highlight && <span style={{ marginLeft: "auto" }} className="badge badge-blue">Hero</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
      <div style={{ padding: 16, marginTop: 20, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>
        Monopilot MES v2.14.3<br/>
        Plan: <strong style={{ color: "var(--text)" }}>Premium</strong> · 48/50 seats
      </div>
    </div>
  );
};

const PageHead = ({ title, sub, actions }) => (
  <div className="sg-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
    <div>
      <div className="sg-title">{title}</div>
      {sub && <div className="sg-sub">{sub}</div>}
    </div>
    {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
  </div>
);

// Reusable section shell
const Section = ({ title, sub, children, action, foot }) => (
  <div className="sg-section">
    {(title || action) && (
      <div className="sg-section-head">
        <div>
          {title && <div className="sg-section-title">{title}</div>}
          {sub && <div className="sg-section-sub">{sub}</div>}
        </div>
        {action}
      </div>
    )}
    <div className="sg-section-body">{children}</div>
    {foot && <div className="sg-section-foot">{foot}</div>}
  </div>
);

const SRow = ({ label, hint, children }) => (
  <div className="sg-row">
    <div>
      <div className="sg-label">{label}</div>
      {hint && <div className="sg-hint">{hint}</div>}
    </div>
    <div className="sg-field">{children}</div>
  </div>
);

const Toggle = ({ on, onChange }) => (
  <label className="sg-toggle">
    <input type="checkbox" checked={on || false} onChange={e => onChange && onChange(e.target.checked)} />
    <span className="slider"></span>
  </label>
);

Object.assign(window, { SSidebar, STopbar, SettingsNav, PageHead, Section, SRow, Toggle });
