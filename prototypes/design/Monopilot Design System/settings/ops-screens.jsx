// ============ Ops screens: Scanner devices, Notifications, Feature flags ============

// ---------- Scanner devices ----------
const DevicesScreen = () => {
  const [showPair, setShowPair] = React.useState(false);

  return (
    <>
      <PageHead title="Scanner devices" sub="Handheld scanners and tablets paired to Monopilot."
        actions={<><button className="btn btn-secondary">Export list</button><button className="btn btn-primary" onClick={() => setShowPair(true)}>+ Pair device</button></>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Total devices</div><div style={{ fontSize: 24, fontWeight: 700 }}>5</div></div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--green)" }}><div className="muted" style={{ fontSize: 11 }}>Online now</div><div style={{ fontSize: 24, fontWeight: 700 }}>3</div></div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--amber)" }}><div className="muted" style={{ fontSize: 11 }}>Low battery</div><div style={{ fontSize: 24, fontWeight: 700 }}>1</div></div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--red)" }}><div className="muted" style={{ fontSize: 11 }}>Offline</div><div style={{ fontSize: 24, fontWeight: 700 }}>1</div></div>
      </div>

      <Section title="Paired devices">
        <table>
          <thead><tr><th>Device ID</th><th>Name</th><th>Model</th><th>Site / Line</th><th>Assigned to</th><th>Battery</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {window.SETTINGS_DEVICES.map(d => (
              <tr key={d.id}>
                <td className="mono">{d.id}</td>
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td className="muted">{d.model}</td>
                <td>{d.site} · <span className="muted">{d.line}</span></td>
                <td>{d.user}</td>
                <td>
                  {d.battery > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 40, height: 5, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${d.battery}%`, height: "100%", background: d.battery > 50 ? "var(--green)" : d.battery > 20 ? "var(--amber)" : "var(--red)" }}></div>
                      </div>
                      <span className="mono" style={{ fontSize: 11 }}>{d.battery}%</span>
                    </div>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="mono muted">{d.last}</td>
                <td>
                  {d.status === "online" && <span className="badge badge-green">● Online</span>}
                  {d.status === "idle" && <span className="badge badge-gray">◌ Idle</span>}
                  {d.status === "offline" && <span className="badge badge-red">● Offline</span>}
                </td>
                <td className="muted">⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Device defaults" sub="Applied to newly paired devices.">
        <SRow label="Force auto-lock" hint="Lock the app after inactivity.">
          <select defaultValue="5"><option value="5">5 minutes</option><option>10 minutes</option><option>30 minutes</option></select>
        </SRow>
        <SRow label="Require login per shift">
          <Toggle on={true} />
        </SRow>
        <SRow label="Offline mode" hint="Allow scanning when disconnected (syncs on reconnect).">
          <Toggle on={true} />
        </SRow>
      </Section>

      {showPair && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowPair(false)}>
          <div style={{ background: "#fff", borderRadius: 8, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Pair new device</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPair(false)}>✕</button>
            </div>
            <div style={{ padding: 24, textAlign: "center" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Scan this QR code from the Monopilot Scanner app on the device.</div>
              <div style={{ display: "inline-block", padding: 20, background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }}>
                <svg width="160" height="160" viewBox="0 0 160 160">
                  {Array.from({ length: 400 }).map((_, i) => {
                    const x = (i % 20) * 8;
                    const y = Math.floor(i / 20) * 8;
                    const isCorner = (x < 24 && y < 24) || (x > 128 && y < 24) || (x < 24 && y > 128);
                    return <rect key={i} x={x} y={y} width="8" height="8" fill={isCorner ? "#0f172a" : (Math.random() > 0.55 ? "#0f172a" : "#fff")} />;
                  })}
                </svg>
              </div>
              <div className="mono" style={{ fontSize: 13, marginTop: 14 }}>Code: <strong>4829-2301</strong></div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Valid for 5 minutes</div>
            </div>
            <div style={{ padding: 14, borderTop: "1px solid var(--border)", background: "var(--gray-050)", display: "flex", justifyContent: "flex-end", gap: 8, borderRadius: "0 0 8px 8px" }}>
              <button className="btn btn-secondary" onClick={() => setShowPair(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- Notifications ----------
const NotificationsScreen = () => {
  const chanBadge = (c) => {
    const map = { email: "blue", "in-app": "violet", SMS: "amber" };
    return <span key={c} className={`badge badge-${map[c]}`} style={{ marginRight: 4 }}>{c}</span>;
  };

  return (
    <>
      <PageHead title="Notifications" sub="When and how the system sends alerts." />

      <Section title="Channels" sub="Outbound channels the system can use.">
        <SRow label="Email" hint="Sent from no-reply@monopilot.app">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Toggle on={true} />
            <span className="badge badge-green">✓ Verified</span>
          </div>
        </SRow>
        <SRow label="In-app banners" hint="Shown at the top of the UI.">
          <Toggle on={true} />
        </SRow>
        <SRow label="SMS" hint="Via Twilio — only used for critical alerts.">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Toggle on={true} />
            <span className="muted" style={{ fontSize: 11 }}>28 messages sent this month</span>
          </div>
        </SRow>
        <SRow label="Slack" hint="Post alerts to a Slack channel.">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Toggle on={false} />
            <a style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>Configure →</a>
          </div>
        </SRow>
      </Section>

      <Section title="Notification rules" sub="Which events trigger which notifications."
        action={<button className="btn btn-primary btn-sm">+ New rule</button>}>
        <table>
          <thead><tr><th>On</th><th>Trigger</th><th>Audience</th><th>Channels</th><th></th></tr></thead>
          <tbody>
            {window.SETTINGS_NOTIFICATION_RULES.map(r => (
              <tr key={r.id}>
                <td style={{ width: 40 }}><Toggle on={r.on} /></td>
                <td style={{ fontWeight: 500 }}>{r.trigger}</td>
                <td className="muted">{r.audience}</td>
                <td>{r.channel.map(chanBadge)}</td>
                <td className="muted">⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Digest emails">
        <SRow label="Daily plant summary" hint="Sent to Managers at 18:00.">
          <Toggle on={true} />
        </SRow>
        <SRow label="Weekly NPD digest" hint="Sent to NPD managers Monday 09:00.">
          <Toggle on={true} />
        </SRow>
        <SRow label="Monthly compliance report" hint="Sent to Admins on the 1st of each month.">
          <Toggle on={false} />
        </SRow>
      </Section>
    </>
  );
};

// ---------- Feature flags ----------
const FeaturesScreen = () => {
  const [dryRun, setDryRun] = React.useState(null);
  const features = (window.SETTINGS_FEATURES || []);
  const onCount = features.filter(f => f.on).length;

  const showDryRun = () => {
    // TUNING-PATTERN §3.6 — multi-object dry-run. Flag toggles fan out to
    // every user session + module surface, so preview is mandatory.
    setDryRun({
      total: features.length,
      on: onCount,
      affectedModules: ["NPD", "Planning", "Quality", "Shipping", "Warehouse", "OEE"].slice(0, Math.max(3, Math.min(6, onCount))),
      sessionCount: 28, // active MES users
    });
  };

  return (
    <>
      <PageHead title="Feature flags" sub="Turn modules and features on for your workspace."
        actions={<DryRunButton label="Dry-run activation" onClick={showDryRun}
          title="Preview affected modules + active sessions before saving flag changes" />} />

      <div className="alert alert-blue" style={{ marginBottom: 14 }}>
        You're on the <strong>Premium plan</strong>. All premium features are included. Beta features are released incrementally.
      </div>

      <Section title="Modules">
        {features.map((f, i) => (
          <div key={f.key} className="sg-row" style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="sg-label">{f.label}</div>
                {f.premium && <span className="badge badge-violet">Premium</span>}
                {f.beta && <span className="badge badge-amber">Beta</span>}
              </div>
              <div className="sg-hint">{f.desc}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Toggle on={f.on} />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Early access">
        <div className="muted" style={{ fontSize: 13 }}>
          Want to try a feature early? <a style={{ color: "var(--blue)", cursor: "pointer" }}>Join the preview program →</a>
        </div>
      </Section>

      {dryRun && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDryRun(null)}>
          <div style={{ background: "#fff", borderRadius: 8, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Dry-run — feature flag activation</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDryRun(null)}>✕</button>
            </div>
            <div style={{ padding: "18px 20px", fontSize: 13 }}>
              <div style={{ marginBottom: 12 }}>
                Activating this flag set affects <strong>{dryRun.affectedModules.length} modules</strong> across <strong>{dryRun.sessionCount} active sessions</strong>.
              </div>
              <div className="alert alert-amber" style={{ fontSize: 12, marginBottom: 12 }}>
                <strong>{dryRun.on} of {dryRun.total}</strong> flags currently on. Changes apply on next page load for each user.
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Affected modules</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {dryRun.affectedModules.map(m => <span key={m} className="badge badge-blue">{m}</span>)}
              </div>
            </div>
            <div style={{ padding: 14, borderTop: "1px solid var(--border)", background: "var(--gray-050)", display: "flex", justifyContent: "flex-end", gap: 8, borderRadius: "0 0 8px 8px" }}>
              <button className="btn btn-secondary" onClick={() => setDryRun(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => setDryRun(null)}>Save changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================
// SCREEN 4 — SET-029 Global Import / Export
// spec: § SET-029 "Global Import/Export hub — bulk Settings entity operations"
// ============================================================
const IMPORT_EXPORT_ENTITIES = [
  { key: "users",       label: "Users",               import: true,  export: true,  perm: "settings.users.invite",       async: false },
  { key: "roles",       label: "Roles & permissions", import: true,  export: true,  perm: "settings.roles.assign",       async: false },
  { key: "invitations", label: "Pending invitations", import: false, export: true,  perm: "settings.users.invite",       async: false },
  { key: "reference",   label: "Reference tables",    import: true,  export: true,  perm: "settings.reference.edit",     async: false },
  { key: "flags",       label: "Feature flags",       import: true,  export: true,  perm: "settings.flags.edit",         async: true  },
  { key: "auth_policy", label: "Auth policies",       import: true,  export: true,  perm: "settings.authorization.edit", async: true  },
];
const RECENT_IMPORT_EXPORT_JOBS = [
  { id: "IMP-0042", entity: "Reference tables", type: "import", status: "completed", rows: 48,   by: "K. Nowak",    at: "2026-05-10 14:33" },
  { id: "EXP-0041", entity: "Users",            type: "export", status: "completed", rows: 10,   by: "K. Nowak",    at: "2026-05-09 09:12" },
  { id: "IMP-0040", entity: "Auth policies",    type: "import", status: "failed",    rows: null, by: "T. Kowalski", at: "2026-05-08 17:05" },
];
const GlobalImportExportScreen = () => {
  const [tab, setTab] = React.useState("import");
  const [entity, setEntity] = React.useState(IMPORT_EXPORT_ENTITIES[0].key);
  const [file, setFile] = React.useState(null);
  const sel = IMPORT_EXPORT_ENTITIES.find(e => e.key === entity);
  const isAuthPolicy = entity === "auth_policy";
  return (
    <>
      <PageHead title="Import / Export" sub="Bulk import and export for Settings entities. All mutations are audited." />

      <div className="pills" style={{ marginBottom: 14 }}>
        <button className={`pill ${tab === "import" ? "on" : ""}`} onClick={() => setTab("import")}>⬆ Import</button>
        <button className={`pill ${tab === "export" ? "on" : ""}`} onClick={() => setTab("export")}>⬇ Export</button>
      </div>

      {tab === "import" && (
        <>
          {isAuthPolicy && (
            <div className="alert alert-amber" style={{ fontSize: 12, marginBottom: 12 }}>
              <strong>Authorization policy import</strong> requires <code>settings.authorization.edit</code>, an audit reason, and a successful dry-run before committing. V-SET-43 / V-SET-44 cannot be bypassed.
            </div>
          )}
          <Section title="Select entity to import">
            <SRow label="Entity">
              <select value={entity} onChange={e => setEntity(e.target.value)}>
                {IMPORT_EXPORT_ENTITIES.filter(e => e.import).map(e => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>
            </SRow>
            <SRow label="Required permission" hint="You must hold this permission to complete the import.">
              <code style={{ fontSize: 12, background: "var(--gray-100)", padding: "2px 6px", borderRadius: 4 }}>{sel.perm}</code>
            </SRow>
            <SRow label="Processing">
              <span className={`badge ${sel.async ? "badge-amber" : "badge-green"}`} style={{ fontSize: 11 }}>
                {sel.async ? "⏳ Async job — you will be notified" : "⚡ Synchronous"}
              </span>
            </SRow>
            <SRow label="Template">
              <button className="btn btn-secondary btn-sm">⬇ Download CSV template</button>
            </SRow>
          </Section>

          <Section title="Upload file">
            <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: 32, textAlign: "center", background: file ? "var(--green-050)" : "var(--gray-050)", cursor: "pointer" }}
                 onClick={() => setFile(file ? null : "entities.csv")}>
              {file ? (
                <>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
                  <div style={{ fontWeight: 600 }}>{file}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Click to remove</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>📄</div>
                  <div style={{ fontWeight: 500 }}>Drag & drop CSV or click to browse</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Max 10 MB · UTF-8 CSV only</div>
                </>
              )}
            </div>
            {file && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                {isAuthPolicy && <button className="btn btn-secondary">Run dry-run preflight</button>}
                <button className="btn btn-primary">Start import →</button>
              </div>
            )}
          </Section>
        </>
      )}

      {tab === "export" && (
        <Section title="Export entity">
          <SRow label="Entity">
            <select value={entity} onChange={e => setEntity(e.target.value)}>
              {IMPORT_EXPORT_ENTITIES.filter(e => e.export).map(e => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </SRow>
          <SRow label="Format">
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="fmt" defaultChecked /> CSV
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="fmt" /> XLSX
              </label>
            </div>
          </SRow>
          <SRow label="">
            <button className="btn btn-primary">⬇ Export now</button>
          </SRow>
        </Section>
      )}

      <Section title="Recent jobs" sub="Last 30 days. Click a job for the full audit log.">
        <table>
          <thead><tr><th>Job ID</th><th>Entity</th><th>Type</th><th>Status</th><th>Rows</th><th>By</th><th>Started at</th></tr></thead>
          <tbody>
            {RECENT_IMPORT_EXPORT_JOBS.map(j => (
              <tr key={j.id}>
                <td className="mono" style={{ fontWeight: 600 }}>{j.id}</td>
                <td>{j.entity}</td>
                <td><span className={`badge ${j.type === "import" ? "badge-blue" : "badge-gray"}`} style={{ fontSize: 10 }}>{j.type}</span></td>
                <td>
                  {j.status === "completed" && <span className="badge badge-green" style={{ fontSize: 10 }}>✓ completed</span>}
                  {j.status === "failed"    && <span className="badge badge-red"   style={{ fontSize: 10 }}>✕ failed</span>}
                  {j.status === "running"   && <span className="badge badge-blue"  style={{ fontSize: 10 }}>⟳ running</span>}
                </td>
                <td className="mono num">{j.rows ?? "—"}</td>
                <td>{j.by}</td>
                <td className="mono muted" style={{ fontSize: 11 }}>{j.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

Object.assign(window, { DevicesScreen, NotificationsScreen, FeaturesScreen, GlobalImportExportScreen });
