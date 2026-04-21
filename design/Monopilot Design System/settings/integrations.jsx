// ============ Integrations screen (category list + grid variation) ============

const IntLogo = ({ item }) => (
  <div className="int-logo" style={{ background: item.color }}>{item.logo}</div>
);

const IntegrationsScreen = ({ style }) => {
  const [expanded, setExpanded] = React.useState(null);

  if (style === "grid") {
    const all = window.SETTINGS_INTEGRATIONS.flatMap(c => c.items.map(i => ({ ...i, cat: c.cat })));
    return (
      <>
        <PageHead title="Integrations" sub="Connect Monopilot to your ERP, accounting, BI, and shipping tools." />
        <div className="sg-section">
          <div className="sg-section-head">
            <div className="sg-section-title">{all.filter(i => i.status === "connected").length} connected · {all.length} available</div>
            <div style={{ width: 220 }}><input type="text" placeholder="Search integrations…" /></div>
          </div>
          <div className="sg-section-body" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {all.map(it => (
              <div key={it.name} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, cursor: "pointer", background: "#fff" }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <IntLogo item={it} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{it.cat}</div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10, minHeight: 32 }}>{it.desc}</div>
                {it.status === "connected" ?
                  <button className="btn btn-secondary btn-sm" style={{ width: "100%" }}>✓ Connected · Configure</button> :
                  <button className="btn btn-primary btn-sm" style={{ width: "100%" }}>Connect</button>}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Category list (default)
  return (
    <>
      <PageHead title="Integrations" sub="Connect Monopilot to your ERP, accounting, BI, and shipping tools."
        actions={<button className="btn btn-secondary">Browse all (16)</button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Connected</div><div style={{ fontSize: 24, fontWeight: 700 }}>6</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Categories</div><div style={{ fontSize: 24, fontWeight: 700 }}>5</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Sync last 24h</div><div style={{ fontSize: 24, fontWeight: 700 }}>1,248</div></div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--red)" }}><div className="muted" style={{ fontSize: 11 }}>Failed syncs</div><div style={{ fontSize: 24, fontWeight: 700 }}>2</div></div>
      </div>

      {window.SETTINGS_INTEGRATIONS.map(c => {
        const connected = c.items.filter(i => i.status === "connected").length;
        const isExpanded = expanded === null ? true : expanded === c.cat;
        return (
          <div key={c.cat} className="sg-section">
            <div className="sg-section-head" onClick={() => setExpanded(e => e === c.cat ? null : c.cat)} style={{ cursor: "pointer" }}>
              <div>
                <div className="sg-section-title">{c.cat}</div>
                <div className="sg-section-sub">{connected} connected · {c.items.length} available</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {connected > 0 && <span className="badge badge-green">{connected} connected</span>}
                <span className="muted" style={{ fontSize: 14 }}>{isExpanded ? "▾" : "▸"}</span>
              </div>
            </div>
            {isExpanded && c.items.map(it => (
              <div key={it.name} className="int-row">
                <IntLogo item={it} />
                <div>
                  <div className="int-name">{it.name}</div>
                  <div className="int-desc">{it.desc}</div>
                </div>
                <div>
                  {it.status === "connected" && <span className="badge badge-green">● Connected</span>}
                  {it.status === "available" && <span className="badge badge-gray">— Available</span>}
                </div>
                {it.status === "connected" ?
                  <button className="btn btn-secondary btn-sm">Configure</button> :
                  <button className="btn btn-primary btn-sm">Connect</button>}
              </div>
            ))}
          </div>
        );
      })}

      <Section title="Recent sync activity">
        <table>
          <thead><tr><th>When</th><th>Integration</th><th>Direction</th><th>Records</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td className="mono">14:02</td><td>SAP S/4HANA</td><td>Inbound · Materials</td><td className="mono num">142</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">13:58</td><td>Xero</td><td>Outbound · Invoices</td><td className="mono num">8</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">13:45</td><td>WooCommerce</td><td>Inbound · Orders</td><td className="mono num">23</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">12:30</td><td>InPost</td><td>Outbound · Shipments</td><td className="mono num">18</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">11:15</td><td>SAP S/4HANA</td><td>Outbound · PO receipts</td><td className="mono num">5</td><td><span className="badge badge-red">✗ Failed · Auth</span></td></tr>
            <tr><td className="mono">09:00</td><td>Power BI</td><td>Pull · Daily snapshot</td><td className="mono num">—</td><td><span className="badge badge-green">✓ Success</span></td></tr>
          </tbody>
        </table>
      </Section>
    </>
  );
};

Object.assign(window, { IntegrationsScreen });
