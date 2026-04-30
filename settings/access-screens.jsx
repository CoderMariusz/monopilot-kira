// ============ Access screens: Users & roles, Security ============

// ---------- Users & roles ----------
const UsersScreen = ({ view }) => {
  const [selRole, setSelRole] = React.useState("all");
  const [showInvite, setShowInvite] = React.useState(false);
  const users = selRole === "all" ? window.SETTINGS_USERS : window.SETTINGS_USERS.filter(u => u.role === selRole);

  const roleBadge = (role) => {
    const map = { "Admin": "red", "Manager": "blue", "Operator": "green", "Viewer": "gray" };
    return <span className={`badge badge-${map[role]}`}>{role}</span>;
  };

  return (
    <>
      <PageHead title="Users & roles" sub={`${window.SETTINGS_USERS.length} users · 4 roles`}
        actions={<><button className="btn btn-secondary">Export</button><button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invite user</button></>} />

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Active</div><div style={{ fontSize: 24, fontWeight: 700 }}>8</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Invited</div><div style={{ fontSize: 24, fontWeight: 700 }}>1</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Disabled</div><div style={{ fontSize: 24, fontWeight: 700 }}>1</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Seats used</div><div style={{ fontSize: 24, fontWeight: 700 }}>10<span style={{ fontSize: 14, color: "var(--muted)" }}> / 50</span></div></div>
      </div>

      <div className="sg-section">
        <div className="sg-section-head">
          <div className="pills">
            <button className={`pill ${selRole === "all" ? "on" : ""}`} onClick={() => setSelRole("all")}>All</button>
            {window.SETTINGS_ROLES.map(r => (
              <button key={r} className={`pill ${selRole === r ? "on" : ""}`} onClick={() => setSelRole(r)}>{r}</button>
            ))}
          </div>
          <div style={{ width: 240 }}><input type="text" placeholder="Search by name or email…" /></div>
        </div>

        {users.length === 0 ? (
          <div className="sg-section-body">
            <EmptyState icon="👥" title={`No users in the "${selRole}" role`}
              body="Try selecting a different role or invite someone new to this workspace."
              action={{label:"＋ Invite user", onClick:()=>setShowInvite(true)}}/>
          </div>
        ) : view === "cards" ? (
          <div className="sg-section-body" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {users.map(u => (
              <div key={u.id} className="user-card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div className={`user-av ${u.color}`}>{u.init}</div>
                  {u.status === "active" && <span className="badge badge-green">● Active</span>}
                  {u.status === "invited" && <span className="badge badge-amber">⟳ Invited</span>}
                  {u.status === "disabled" && <span className="badge badge-gray">✕ Disabled</span>}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{u.name}</div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{u.email}</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {roleBadge(u.role)}
                  <span className="badge badge-gray">{u.site}</span>
                </div>
                <div className="muted" style={{ fontSize: 11, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>Last active: {u.last}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sg-section-body" style={{ padding: 0 }}>
            <table>
              <thead><tr><th></th><th>Name</th><th>Email</th><th>Role</th><th>Site</th><th>Last active</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ width: 40 }}><div className={`user-av ${u.color}`} style={{ width: 28, height: 28, fontSize: 11, margin: 0 }}>{u.init}</div></td>
                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                    <td className="muted">{u.email}</td>
                    <td>
                      <select defaultValue={u.role} style={{ width: "auto", padding: "3px 8px", fontSize: 12 }}>
                        {window.SETTINGS_ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>{u.site}</td>
                    <td className="muted mono">{u.last}</td>
                    <td>
                      {u.status === "active" && <span className="badge badge-green">● Active</span>}
                      {u.status === "invited" && <span className="badge badge-amber">⟳ Invited</span>}
                      {u.status === "disabled" && <span className="badge badge-gray">✕ Disabled</span>}
                    </td>
                    <td className="muted">⋮</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permission matrix */}
      <Section title="Role permissions" sub="What each role can do across modules. Edit by clicking a cell.">
        <table className="perm-table">
          <thead>
            <tr>
              <th>Module</th>
              {window.SETTINGS_ROLES.map(r => <th key={r}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {window.SETTINGS_MODULES.map(m => (
              <tr key={m}>
                <td>{m}</td>
                {window.SETTINGS_ROLES.map(r => {
                  const p = window.SETTINGS_PERMS[m][r];
                  return (
                    <td key={r}>
                      {p === "admin" && <span className="perm-cell admin" title="Full admin">◉</span>}
                      {p === "rw" && <span className="perm-cell rw" title="Read & write">✎</span>}
                      {p === "r" && <span className="perm-cell r" title="Read only">◎</span>}
                      {p === "none" && <span className="perm-cell none" title="No access">–</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 14, fontSize: 11, marginTop: 12, color: "var(--muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="perm-cell admin">◉</span> Full admin</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="perm-cell rw">✎</span> Read & write</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="perm-cell r">◎</span> Read only</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="perm-cell none">–</span> No access</span>
        </div>
      </Section>

      {/* Invite modal */}
      {showInvite && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowInvite(false)}>
          <div style={{ background: "#fff", borderRadius: 8, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Invite user</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>✕</button>
            </div>
            <div style={{ padding: 18 }}>
              <div className="field"><label>Email address</label><input type="email" placeholder="name@apex.pl" autoFocus /></div>
              <div className="form-grid-2">
                <div className="field"><label>Role</label><select><option>Admin</option><option defaultValue>Manager</option><option>Operator</option><option>Viewer</option></select></div>
                <div className="field"><label>Site</label><select><option>Kraków HQ</option><option>Wrocław</option><option>All sites</option></select></div>
              </div>
              <div className="field"><label>Personal message (optional)</label><textarea rows="2" placeholder="Welcome to Monopilot!"></textarea></div>
              <div className="alert alert-blue" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>They'll receive an email with a magic link. The link expires in 7 days.</div>
            </div>
            <div style={{ padding: 14, borderTop: "1px solid var(--border)", background: "var(--gray-050)", display: "flex", justifyContent: "flex-end", gap: 8, borderRadius: "0 0 8px 8px" }}>
              <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setShowInvite(false)}>Send invitation</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- Security ----------
const SecurityScreen = () => (
  <>
    <PageHead title="Security" sub="Authentication, session, and password policy." />

    <Section title="Two-factor authentication" sub="Require 2FA for all users.">
      <SRow label="Enforce 2FA for Admins" hint="Admin accounts must use an authenticator app.">
        <Toggle on={true} />
      </SRow>
      <SRow label="Enforce 2FA for all users">
        <Toggle on={false} />
      </SRow>
      <SRow label="Allowed methods">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--text)", fontWeight: 400, fontSize: 13 }}>
            <input type="checkbox" defaultChecked /> Authenticator app (TOTP)
          </label>
          <label style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--text)", fontWeight: 400, fontSize: 13 }}>
            <input type="checkbox" defaultChecked /> SMS
          </label>
          <label style={{ margin: 0, textTransform: "none", letterSpacing: 0, color: "var(--text)", fontWeight: 400, fontSize: 13 }}>
            <input type="checkbox" /> Hardware key (WebAuthn)
          </label>
        </div>
      </SRow>
    </Section>

    <Section title="Single Sign-On (SSO)" action={<span className="badge badge-green">● Connected</span>}>
      <SRow label="Provider" hint="SAML 2.0 via Microsoft Entra ID.">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "#0078d4", color: "#fff", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>MS</div>
          <div><div style={{ fontWeight: 500 }}>Microsoft Entra ID</div><div className="muted mono" style={{ fontSize: 11 }}>apex.onmicrosoft.com</div></div>
        </div>
      </SRow>
      <SRow label="Enforce SSO" hint="Password login disabled for non-admin users when on.">
        <Toggle on={false} />
      </SRow>
      <SRow label="SCIM provisioning">
        <Toggle on={true} />
      </SRow>
    </Section>

    <Section title="Password policy">
      <SRow label="Minimum length">
        <input type="number" defaultValue="12" style={{ width: 80 }} />
      </SRow>
      <SRow label="Complexity">
        <select defaultValue="strong">
          <option value="strong">Strong (upper, lower, number, symbol)</option>
          <option>Medium (upper, lower, number)</option>
          <option>Basic (length only)</option>
        </select>
      </SRow>
      <SRow label="Password expires" hint="Force rotation every N days. Not recommended by NIST.">
        <select defaultValue="never"><option value="never">Never</option><option>90 days</option><option>180 days</option></select>
      </SRow>
      <SRow label="Block reuse of last N passwords">
        <input type="number" defaultValue="5" style={{ width: 80 }} />
      </SRow>
    </Section>

    <Section title="Session">
      <SRow label="Idle timeout" hint="Log out inactive sessions.">
        <select defaultValue="60"><option>15 min</option><option>30 min</option><option value="60">60 min</option><option>4 h</option><option>Never</option></select>
      </SRow>
      <SRow label="Maximum session length">
        <select defaultValue="8h"><option>4 h</option><option value="8h">8 h</option><option>12 h</option><option>24 h</option></select>
      </SRow>
      <SRow label="IP allowlist" hint="Restrict admin login to specific IPs or ranges.">
        <div className="mono muted" style={{ fontSize: 12 }}>Not configured <a style={{ color: "var(--blue)", marginLeft: 6, cursor: "pointer" }}>+ Add range</a></div>
      </SRow>
    </Section>

    <Section title="Audit log" action={<button className="btn btn-ghost btn-sm">View full log →</button>}>
      <table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>IP</th></tr></thead>
        <tbody>
          <tr><td className="mono">2025-12-15 14:02</td><td>K. Nowak</td><td>Updated permission matrix</td><td className="mono muted">192.168.1.42</td></tr>
          <tr><td className="mono">2025-12-15 11:38</td><td>A. Zając</td><td>Approved BOM-221</td><td className="mono muted">192.168.1.15</td></tr>
          <tr><td className="mono">2025-12-15 09:12</td><td>M. Wiśniewska</td><td>Disabled user K. Nowacka</td><td className="mono muted">10.0.0.55</td></tr>
          <tr><td className="mono">2025-12-14 16:45</td><td>System</td><td>Daily backup completed</td><td className="mono muted">—</td></tr>
          <tr><td className="mono">2025-12-14 14:21</td><td>K. Nowak</td><td>Invited user m.dabrowski@apex.pl</td><td className="mono muted">192.168.1.42</td></tr>
        </tbody>
      </table>
    </Section>
  </>
);

Object.assign(window, { UsersScreen, SecurityScreen });
