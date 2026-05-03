// ============ Organization screens: Profile, Sites, Warehouses, Shifts ============

// ---------- Company profile ----------
const CompanyProfile = () => {
  const [form, setForm] = React.useState({
    name: "Apex Foods Sp. z o.o.",
    legalName: "Apex Foods Spółka z ograniczoną odpowiedzialnością",
    vat: "PL5213456789",
    regon: "123456789",
    industry: "Meat processing",
    street: "ul. Zakładowa 12",
    city: "Kraków", zip: "30-690", country: "Poland",
    email: "office@apex.pl", phone: "+48 12 345 67 89", website: "apex.pl",
    currency: "EUR", timezone: "Europe/Warsaw"
  });
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <PageHead title="Company profile" sub="Your company details, used across labels, invoices, and exports." />

      <Section title="Identity" foot={<><button className="btn btn-ghost">Cancel</button><button className="btn btn-primary">Save changes</button></>}>
        <SRow label="Trading name" hint="Short name used in the UI.">
          <input type="text" value={form.name} onChange={e => u("name", e.target.value)} />
        </SRow>
        <SRow label="Legal name" hint="Full registered name for documents.">
          <input type="text" value={form.legalName} onChange={e => u("legalName", e.target.value)} />
        </SRow>
        <SRow label="Logo" hint="Appears on labels, invoices, and the login page.">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 72, height: 72, background: "var(--text)", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>APEX</div>
            <div>
              <button className="btn btn-secondary btn-sm">Upload new</button>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>PNG or SVG · max 2MB · 400×400px recommended</div>
            </div>
          </div>
        </SRow>
        <SRow label="VAT / NIP" hint="Tax identification number.">
          <input type="text" value={form.vat} onChange={e => u("vat", e.target.value)} />
        </SRow>
        <SRow label="REGON">
          <input type="text" value={form.regon} onChange={e => u("regon", e.target.value)} />
        </SRow>
        <SRow label="Industry">
          <select value={form.industry} onChange={e => u("industry", e.target.value)}>
            <option>Meat processing</option><option>Dairy</option><option>Bakery</option>
            <option>Beverage</option><option>Ready meals</option><option>Fish & seafood</option>
          </select>
        </SRow>
      </Section>

      <Section title="Registered address">
        <SRow label="Street">
          <input type="text" value={form.street} onChange={e => u("street", e.target.value)} />
        </SRow>
        <SRow label="City / ZIP">
          <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
            <input type="text" value={form.city} onChange={e => u("city", e.target.value)} style={{ flex: 2 }} />
            <input type="text" value={form.zip} onChange={e => u("zip", e.target.value)} style={{ flex: 1 }} />
          </div>
        </SRow>
        <SRow label="Country">
          <select value={form.country} onChange={e => u("country", e.target.value)}>
            <option>Poland</option><option>Germany</option><option>Czech Republic</option><option>Slovakia</option>
          </select>
        </SRow>
      </Section>

      <Section title="Contact">
        <SRow label="Email">
          <input type="email" value={form.email} onChange={e => u("email", e.target.value)} />
        </SRow>
        <SRow label="Phone">
          <input type="text" value={form.phone} onChange={e => u("phone", e.target.value)} />
        </SRow>
        <SRow label="Website">
          <input type="text" value={form.website} onChange={e => u("website", e.target.value)} />
        </SRow>
      </Section>

      <Section title="Locale">
        <SRow label="Default currency" hint="Used for costing and reports.">
          <select value={form.currency} onChange={e => u("currency", e.target.value)}>
            <option>EUR</option><option>PLN</option><option>USD</option><option>GBP</option>
          </select>
        </SRow>
        <SRow label="Timezone">
          <select value={form.timezone} onChange={e => u("timezone", e.target.value)}>
            <option>Europe/Warsaw</option><option>Europe/Berlin</option><option>Europe/London</option><option>UTC</option>
          </select>
        </SRow>
        <SRow label="Date format">
          <select defaultValue="YYYY-MM-DD">
            <option>YYYY-MM-DD</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option>
          </select>
        </SRow>
      </Section>
    </>
  );
};

// ---------- Sites & lines ----------
const SitesScreen = () => {
  const [selSite, setSelSite] = React.useState("S1");
  const sites = window.SETTINGS_SITES;
  const lines = window.SETTINGS_LINES.filter(l => l.site === selSite);
  const sel = sites.find(s => s.id === selSite);

  return (
    <>
      <PageHead title="Sites & production lines" sub="Factories, lines, and work centers where production happens."
        actions={<><button className="btn btn-secondary">Import lines</button><button className="btn btn-primary">+ Add site</button></>} />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
        {/* Sites list + map */}
        <div className="sg-section">
          <div className="sg-section-head"><div className="sg-section-title">Sites ({sites.length})</div></div>
          <div style={{ padding: 12 }}>
            <div className="site-map">
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 40%, #fff, transparent 70%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)", backgroundSize: "20px 20px", backgroundPosition: "0 0, 10px 10px", opacity: 0.3 }}></div>
              <div style={{ position: "absolute", top: 12, left: 12, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Poland</div>
              {sites.map(s => (
                <div key={s.id} className="site-pin" style={{ left: `${s.x}%`, top: `${s.y}%` }} onClick={() => setSelSite(s.id)}>
                  <div className="dot" style={{ background: selSite === s.id ? "var(--blue)" : "var(--gray-400, #94a3b8)" }}></div>
                  <div className="pin-label">{s.name}</div>
                </div>
              ))}
            </div>
          </div>
          {sites.map(s => (
            <div key={s.id}
                 onClick={() => setSelSite(s.id)}
                 style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", cursor: "pointer", background: selSite === s.id ? "var(--blue-050)" : "#fff", borderLeft: selSite === s.id ? "3px solid var(--blue)" : "3px solid transparent" }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name} {s.primary && <span className="badge badge-blue" style={{ marginLeft: 4 }}>Primary</span>}</div>
              <div className="muted" style={{ fontSize: 11 }}>{s.addr}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{s.lines} lines · {s.workers} workers</div>
            </div>
          ))}
        </div>

        {/* Selected site detail */}
        <div>
          <div className="sg-section">
            <div className="sg-section-head">
              <div>
                <div className="sg-section-title">{sel.name}</div>
                <div className="sg-section-sub">{sel.addr}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm">Edit</button>
                <button className="btn btn-secondary btn-sm">+ Add line</button>
              </div>
            </div>
            <div className="sg-section-body" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Line</th><th>Type</th><th>Workers</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}><span className="mono muted" style={{ fontSize: 11, marginRight: 6 }}>{l.id}</span>{l.name}</td>
                      <td className="muted">{l.type}</td>
                      <td className="mono num">{l.workers}</td>
                      <td>{l.status === "active" ? <span className="badge badge-green">● Active</span> : <span className="badge badge-amber">⚒ Maintenance</span>}</td>
                      <td style={{ width: 30 }} className="muted">⋮</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Section title="Site settings">
            <SRow label="Primary site" hint="Used as default for new products and orders.">
              <Toggle on={sel.primary} />
            </SRow>
            <SRow label="Operating hours">
              <div className="mono">Mon–Fri 06:00–22:00 · Sat 08:00–16:00</div>
            </SRow>
            <SRow label="HACCP certification">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-green">✓ Valid</span>
                <span className="muted" style={{ fontSize: 12 }}>Expires 2026-09-14</span>
              </div>
            </SRow>
          </Section>
        </div>
      </div>
    </>
  );
};

// ---------- Warehouses ----------
const WarehousesScreen = () => (
  <>
    <PageHead title="Warehouses" sub="Zones, bin locations, and storage rules."
      actions={<button className="btn btn-primary">+ Add warehouse</button>} />

    <Section title="Warehouses (3)">
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Site</th><th>Zones</th><th>Bins</th><th>Capacity</th><th>Used</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td className="mono">WH-01</td><td style={{ fontWeight: 500 }}>Raw materials — Kraków</td><td>Kraków HQ</td><td className="num mono">6</td><td className="num mono">842</td><td className="num mono">1,200 plt</td><td>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 80, height: 5, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: "68%", height: "100%", background: "var(--blue)" }}></div>
              </div>
              <span className="mono" style={{ fontSize: 11 }}>68%</span>
            </div>
          </td><td><span className="badge badge-green">● Active</span></td></tr>
          <tr><td className="mono">WH-02</td><td style={{ fontWeight: 500 }}>Finished goods — Kraków</td><td>Kraków HQ</td><td className="num mono">4</td><td className="num mono">516</td><td className="num mono">800 plt</td><td>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 80, height: 5, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: "82%", height: "100%", background: "var(--amber)" }}></div>
              </div>
              <span className="mono" style={{ fontSize: 11 }}>82%</span>
            </div>
          </td><td><span className="badge badge-green">● Active</span></td></tr>
          <tr><td className="mono">WH-03</td><td style={{ fontWeight: 500 }}>Cold storage — Wrocław</td><td>Wrocław</td><td className="num mono">3</td><td className="num mono">280</td><td className="num mono">450 plt</td><td>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 80, height: 5, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: "41%", height: "100%", background: "var(--green)" }}></div>
              </div>
              <span className="mono" style={{ fontSize: 11 }}>41%</span>
            </div>
          </td><td><span className="badge badge-green">● Active</span></td></tr>
        </tbody>
      </table>
    </Section>

    <Section title="Storage rules" sub="How the system assigns bins and manages expiry.">
      <SRow label="Bin assignment strategy">
        <select defaultValue="FEFO">
          <option>FEFO (First expired, first out)</option>
          <option>FIFO (First in, first out)</option>
          <option>LIFO</option>
          <option>Manual</option>
        </select>
      </SRow>
      <SRow label="Mixed lot bins" hint="Allow different lots in the same bin.">
        <Toggle on={false} />
      </SRow>
      <SRow label="Expiry warning threshold" hint="Alert when stock is within this many days of expiry.">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" defaultValue="7" style={{ width: 80 }} />
          <span className="muted">days</span>
        </div>
      </SRow>
      <SRow label="Block expired stock" hint="Prevent movements of expired lots automatically.">
        <Toggle on={true} />
      </SRow>
    </Section>
  </>
);

// ---------- Shifts ----------
const ShiftsScreen = () => (
  <>
    <PageHead title="Shifts & calendar" sub="Work patterns, non-production days, and shift assignments."
      actions={<button className="btn btn-primary">+ New shift</button>} />

    <Section title="Shift patterns">
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Time</th><th>Days</th><th>Workers assigned</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {window.SETTINGS_SHIFTS.map(s => (
            <tr key={s.id}>
              <td className="mono">{s.id}</td>
              <td style={{ fontWeight: 500 }}>{s.name}</td>
              <td className="mono">{s.time}</td>
              <td>{s.days}</td>
              <td className="mono num">{s.workers}</td>
              <td><span className="badge badge-green">● Active</span></td>
              <td className="muted">⋮</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>

    <Section title="Calendar" sub="Days on which production is paused.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, maxWidth: 540, marginBottom: 12 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", textAlign: "center", padding: 4 }}>{d}</div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => {
          const day = i - 2;
          const inMonth = day > 0 && day <= 31;
          const weekend = i % 7 === 5 || i % 7 === 6;
          const isHoliday = [25, 26, 1].includes(day);
          return (
            <div key={i} style={{
              padding: 6, textAlign: "center", fontSize: 11, borderRadius: 3,
              background: !inMonth ? "transparent" : isHoliday ? "var(--red-050)" : weekend ? "var(--gray-050)" : "#fff",
              color: !inMonth ? "var(--gray-300, #cbd5e1)" : isHoliday ? "var(--red-700)" : weekend ? "var(--muted)" : "var(--text)",
              border: "1px solid " + (!inMonth ? "transparent" : "var(--border)"),
              fontWeight: isHoliday ? 600 : 400
            }}>{inMonth ? day : ""}</div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: "var(--red-050)", borderRadius: 2, border: "1px solid var(--red-300, #fca5a5)" }}></span>Public holiday</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: "var(--gray-050)", borderRadius: 2, border: "1px solid var(--border)" }}></span>Weekend</span>
      </div>
    </Section>
  </>
);

Object.assign(window, { CompanyProfile, SitesScreen, WarehousesScreen, ShiftsScreen });
