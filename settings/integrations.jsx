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
          <div className="sg-section-body" style={{ display: "grid", gridTemplateColumns: all.length === 0 ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
            {all.length === 0 && (
              <EmptyState icon="🔌" title="No integrations configured"
                body="Browse the catalog to connect Monopilot to your ERP, accounting, BI, and shipping tools."
                action={{label:"Browse catalog", onClick:()=>{}}}/>
            )}
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
  const _all = window.SETTINGS_INTEGRATIONS.flatMap(c => c.items);
  const _connected = _all.filter(i => i.status === "connected").length;
  return (
    <>
      <PageHead title="Integrations" sub="D365 (Dynamics 365), Peppol e-invoicing and Developer API keys. Scope per 02-SETTINGS PRD §4 + §11."
        actions={<button className="btn btn-secondary">Browse all ({_all.length})</button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Connected</div><div style={{ fontSize: 24, fontWeight: 700 }}>{_connected}</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Categories</div><div style={{ fontSize: 24, fontWeight: 700 }}>{window.SETTINGS_INTEGRATIONS.length}</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Sync last 24h</div><div style={{ fontSize: 24, fontWeight: 700 }}>1,248</div></div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--red)" }}><div className="muted" style={{ fontSize: 11 }}>D365 DLQ (shipping)</div><div style={{ fontSize: 24, fontWeight: 700 }}>1</div></div>
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
            {isExpanded && c.items.length === 0 && (
              <div style={{padding:"12px 18px"}}>
                <EmptyState icon="🔌" title={`No ${c.cat.toLowerCase()} integrations yet`}
                  body="Request a connector from the Monopilot team or browse the catalog for alternatives." />
              </div>
            )}
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

      <Section title="Recent sync activity" sub="D365 outbox events (shipment.confirmed, wo.confirmation_pushed, cost.posted) + pull (items.imported, bom.imported).">
        <table>
          <thead><tr><th>When</th><th>Integration</th><th>Direction</th><th>Records</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td className="mono">14:02</td><td>D365 · ItemEntity</td><td>Inbound · Items (nightly refresh)</td><td className="mono num">142</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">13:58</td><td>D365 · BOMVersionEntity</td><td>Inbound · BOMs</td><td className="mono num">28</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">13:45</td><td>D365 · ProdJournalName</td><td>Outbound · WO confirmations</td><td className="mono num">12</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">12:30</td><td>D365 · SalesOrderEntity</td><td>Outbound · Shipment confirmed</td><td className="mono num">9</td><td><span className="badge badge-green">✓ Success</span></td></tr>
            <tr><td className="mono">11:15</td><td>D365 · SalesOrderEntity</td><td>Outbound · Shipment confirmed</td><td className="mono num">1</td><td><span className="badge badge-red">✗ Failed · Retry backoff (DLQ)</span></td></tr>
            <tr><td className="mono">09:00</td><td>D365 · GeneralJournalLineEntity</td><td>Outbound · Cost posting (daily)</td><td className="mono num">18</td><td><span className="badge badge-green">✓ Success</span></td></tr>
          </tbody>
        </table>
      </Section>
    </>
  );
};

Object.assign(window, { IntegrationsScreen });
