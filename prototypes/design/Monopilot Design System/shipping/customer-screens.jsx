// ============ SHIP-001 Customer List + SHIP-002 Customer Detail ============

const ShCustomerList = ({ onOpenCustomer, onNav, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());

  const tabs = [
    { k: "all",      l: "All",      c: SH_CUSTOMERS.length },
    { k: "active",   l: "Active",   c: SH_CUSTOMERS.filter(c => c.active).length },
    { k: "inactive", l: "Inactive", c: SH_CUSTOMERS.filter(c => !c.active).length },
    { k: "pl",       l: "Polish",   c: SH_CUSTOMERS.filter(c => /Polska|Żabka|Biedronka|Makro|Dino|Bidfood|Eurocash/i.test(c.name)).length },
    { k: "uk",       l: "UK",       c: SH_CUSTOMERS.filter(c => /Tesco|Sainsbury|Morrisons/i.test(c.name)).length },
  ];

  const visible = SH_CUSTOMERS.filter(c =>
    (tab === "all" ? true :
     tab === "active" ? c.active :
     tab === "inactive" ? !c.active :
     tab === "pl" ? /Polska|Żabka|Biedronka|Makro|Dino|Bidfood|Eurocash/i.test(c.name) :
     tab === "uk" ? /Tesco|Sainsbury|Morrisons/i.test(c.name) : true) &&
    (!search ||
     c.name.toLowerCase().includes(search.toLowerCase()) ||
     c.code.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = id => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
  const toggleAll = () => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map(c => c.id)));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Customers</div>
          <h1 className="page-title">Customers</h1>
          <div className="muted" style={{fontSize:12}}>{SH_CUSTOMERS.length} customers · {SH_CUSTOMERS.filter(c=>c.active).length} active · {SH_CUSTOMERS.filter(c=>c.allergens>0).length} with allergen restrictions · Mixed PL + UK retail/wholesale</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Import CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("customerCreate")}>＋ Create customer</button>
        </div>
      </div>

      <div className="kpi-row-4">
        <div className="kpi blue"><div className="kpi-label">Total customers</div><div className="kpi-value">{SH_CUSTOMERS.length}</div><div className="kpi-sub">Across PL / UK / Wholesale</div></div>
        <div className="kpi green"><div className="kpi-label">Active</div><div className="kpi-value">{SH_CUSTOMERS.filter(c=>c.active).length}</div><div className="kpi-sub">Can receive orders</div></div>
        <div className="kpi"><div className="kpi-label">Inactive</div><div className="kpi-value">{SH_CUSTOMERS.filter(c=>!c.active).length}</div><div className="kpi-sub">Deactivated</div></div>
        <div className="kpi amber"><div className="kpi-label">New this month</div><div className="kpi-value">2</div><div className="kpi-sub">April 2026</div></div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>{t.l} <span className="count">{t.c}</span></button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search by name, code, or address…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:280}}/>
        <select style={{width:140}}><option>All categories</option><option>Retail</option><option>Wholesale</option><option>Distributor</option></select>
        <select style={{width:140}}><option>All payment terms</option><option>Net 7</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Net 90</option></select>
        <select style={{width:140}}><option>Credit status</option><option>Within limit</option><option>At risk (80%)</option><option>Exceeded</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{padding:"8px 14px", marginBottom:10, background:"var(--blue-050)", borderColor:"var(--blue)"}}>
          <div className="row-flex">
            <b>{selected.size} selected</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm">Activate</button>
            <button className="btn btn-secondary btn-sm">Deactivate</button>
            <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th style={{width:30}}><input type="checkbox" checked={selected.size > 0 && selected.size === visible.length} onChange={toggleAll}/></th>
              <th>Name</th>
              <th>Code</th>
              <th>Category</th>
              <th style={{textAlign:"right"}}>Credit limit</th>
              <th>Payment terms</th>
              <th>Allergen profile</th>
              <th style={{textAlign:"right"}}>Open orders</th>
              <th>Status</th>
              <th>Last order</th>
              <th style={{width:80}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(c => (
              <tr key={c.id} className={c.creditStatus === "exceeded" ? "row-warning" : ""} style={{cursor:"pointer"}} onClick={()=>onOpenCustomer(c.id)}>
                <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggle(c.id)}/></td>
                <td>
                  <div style={{fontWeight:500, fontSize:12, color:"var(--blue)"}}>{c.name}</div>
                </td>
                <td className="mono" style={{fontSize:11}}>{c.code}</td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{c.category}</span></td>
                <td className="num mono">{c.creditLimit}{c.creditStatus === "exceeded" && <span className="badge badge-red" style={{fontSize:9, marginLeft:4}}>exceeded</span>}</td>
                <td className="mono" style={{fontSize:11}}>{c.terms}</td>
                <td>
                  {c.allergens > 0 ? <span className="badge badge-amber" style={{fontSize:9}}>⚠ {c.allergens} restrictions</span> : <span className="muted" style={{fontSize:10}}>—</span>}
                </td>
                <td className="num mono">{c.ordersOpen}</td>
                <td>{c.active ? <span className="badge badge-green" style={{fontSize:9}}>Active</span> : <span className="badge badge-gray" style={{fontSize:9}}>Inactive</span>}</td>
                <td className="mono" style={{fontSize:11}}>{c.lastOrder}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" title="View orders">▤</button>
                  <button className="btn btn-ghost btn-sm" title="More">⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{marginTop:14, fontSize:12}}>
        <span>ⓘ</span>
        <div><b>Allergen restrictions</b> are checked at SO wizard step 3 (SHIP-006) using <span className="mono">allergen_cascade_v1</span> rule from 03-TECHNICAL. Conflicts block confirm unless <b>shipping_qa</b> overrides with reason code.</div>
      </div>
    </>
  );
};

// =================================================================
// SHIP-002 Customer Detail
// =================================================================
const ShCustomerDetail = ({ onBack, onNav, openModal }) => {
  const c = SH_CUSTOMER_DETAIL;
  const [tab, setTab] = React.useState("profile");

  const tabs = [
    { k: "profile",   l: "Profile" },
    { k: "addresses", l: "Addresses", c: c.addresses.length },
    { k: "allergens", l: "Allergens", c: c.allergens.refuses.length + c.allergens.requires_decl.length },
    { k: "pricing",   l: "Pricing (P2)" },
    { k: "credit",    l: "Credit" },
    { k: "history",   l: "Order history", c: c.orders.length },
  ];

  const creditPct = Math.round(c.creditUsed / c.creditLimit * 100);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Shipping</a> · <a onClick={onBack}>Customers</a> · {c.name}</div>
          <h1 className="page-title">{c.name}</h1>
          <div className="muted" style={{fontSize:12}}><span className="mono">{c.code}</span> · {c.category} · Net {c.terms} · GLN <span className="mono">{c.gln}</span> · Created {c.createdAt}</div>
        </div>
        <div className="row-flex">
          {c.active ? <span className="badge badge-green" style={{fontSize:10}}>● Active</span> : <span className="badge badge-gray" style={{fontSize:10}}>Inactive</span>}
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("customerCreate", c)}>✎ Edit</button>
          <button className="btn btn-ghost btn-sm">⋯</button>
        </div>
      </div>

      <div className="lp-tabs">
        {tabs.map(t => (
          <button key={t.k} className={tab === t.k ? "on" : ""} onClick={()=>setTab(t.k)}>
            {t.l}{t.c !== undefined && <span className="tab-count">{t.c}</span>}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card">
            <div className="card-head" style={{marginBottom:8}}><h3 className="card-title">Identity</h3></div>
            <Summary rows={[
              { label: "Customer code", value: c.code },
              { label: "Full name", value: c.name, mono: false },
              { label: "Trading name", value: c.tradingName, mono: false },
              { label: "Category", value: c.category, mono: false },
              { label: "Email", value: c.email, mono: false },
              { label: "Phone", value: c.phone },
              { label: "Tax ID", value: c.taxId },
              { label: "GS1 GLN", value: c.gln },
              { label: "Payment terms", value: "Net " + c.terms + " days" },
              { label: "Active", value: c.active ? "Yes" : "No", mono: false },
              { label: "Created at", value: c.createdAt },
              { label: "Last updated", value: c.updatedAt },
            ]}/>
          </div>
          <div className="card">
            <div className="card-head" style={{marginBottom:8}}><h3 className="card-title">Notes</h3></div>
            <div style={{fontSize:12, padding:"10px 12px", background:"var(--gray-050)", borderRadius:4, lineHeight:1.6}}>{c.notes}</div>

            <div className="label" style={{marginTop:16, marginBottom:6}}>Quick stats</div>
            <div style={{fontSize:12, lineHeight:1.8}}>
              <div className="row-flex"><span>Open orders</span><span className="spacer"></span><b className="mono">{c.orders.filter(o => !["delivered","cancelled"].includes(o.status)).length}</b></div>
              <div className="row-flex"><span>All-time orders</span><span className="spacer"></span><b className="mono">{c.orders.length + 220}</b></div>
              <div className="row-flex"><span>Shipping addresses</span><span className="spacer"></span><b className="mono">{c.addresses.filter(a => a.type === "shipping").length}</b></div>
              <div className="row-flex"><span>Allergen restrictions</span><span className="spacer"></span><b className="mono">{c.allergens.refuses.length + c.allergens.requires_decl.length}</b></div>
            </div>
          </div>
        </div>
      )}

      {tab === "addresses" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}>
            <h3 className="card-title">Addresses ({c.addresses.length})</h3>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("address")}>＋ Add address</button>
          </div>
          <table>
            <thead><tr><th>Type</th><th>Default</th><th>Address line 1</th><th>City</th><th>Postal</th><th>Country</th><th>Dock hours</th><th style={{width:140}}></th></tr></thead>
            <tbody>
              {c.addresses.map(a => (
                <tr key={a.id}>
                  <td><span className={"badge " + (a.type === "billing" ? "badge-blue" : "badge-green")} style={{fontSize:9}}>{a.type}</span></td>
                  <td>{a.isDefault ? <span style={{color:"var(--amber-700)"}}>★</span> : <span className="muted">—</span>}</td>
                  <td style={{fontSize:12}}>{a.line1}</td>
                  <td style={{fontSize:12}}>{a.city}</td>
                  <td className="mono" style={{fontSize:11}}>{a.postal}</td>
                  <td><span className="badge badge-gray" style={{fontSize:9}}>{a.country}</span></td>
                  <td style={{fontSize:11}}>{a.dock}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={()=>openModal("address", a)}>Edit</button>
                    {!a.isDefault && <button className="btn btn-ghost btn-sm">Set default</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", background:"var(--info-050a)"}}>
            ⓘ V-SHIP-SO-02: at least one shipping-type address is required before SO confirmation. Default address auto-selected on new SO.
          </div>
        </div>
      )}

      {tab === "allergens" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Allergen restrictions — {c.name}</h3>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("allergen")}>＋ Add restriction</button>
          </div>

          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
            <span>ⓘ</span>
            <div>
              Allergen data flows: <span className="mono">product.allergens</span> (03-TECHNICAL §10) → <span className="mono">allergen_cascade_v1</span> (02-SETTINGS §7) → customer restrictions (this screen) → SO confirm validation (V-SHIP-SO-03) → packing slip / BOL bold labelling per EU 1169/2011.
            </div>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:10}}>
            <div>
              <div className="label" style={{marginBottom:8, color:"var(--red-700)"}}>Refuses — Do not ship</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6}}>
                {SH_ALLERGENS.map(a => {
                  const on = c.allergens.refuses.includes(a);
                  return (
                    <label key={a} style={{display:"flex", alignItems:"center", gap:6, padding:"6px 10px", border:"1px solid var(--border)", borderRadius:4, background: on ? "var(--red-050a)" : "#fff", fontSize:11, cursor:"pointer"}}>
                      <input type="checkbox" defaultChecked={on}/>
                      <span style={{textTransform:"capitalize"}}>{a}</span>
                      {on && <span className="spacer"></span>}
                      {on && <span className="badge badge-red" style={{fontSize:9}}>REFUSE</span>}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="label" style={{marginBottom:8, color:"var(--amber-700)"}}>Requires declared — Must label bold</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6}}>
                {SH_ALLERGENS.map(a => {
                  const on = c.allergens.requires_decl.includes(a);
                  return (
                    <label key={a} style={{display:"flex", alignItems:"center", gap:6, padding:"6px 10px", border:"1px solid var(--border)", borderRadius:4, background: on ? "var(--amber-050a)" : "#fff", fontSize:11, cursor:"pointer"}}>
                      <input type="checkbox" defaultChecked={on}/>
                      <span style={{textTransform:"capitalize"}}>{a}</span>
                      {on && <span className="spacer"></span>}
                      {on && <span className="badge badge-amber" style={{fontSize:9}}>DECLARE</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="label" style={{marginTop:18, marginBottom:6}}>Current open SOs with conflicts (live check)</div>
          <table>
            <thead><tr><th>SO</th><th>Product</th><th>Conflict allergen</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{color:"var(--blue)"}}>SO-2026-2452</td><td>FA5301 · Pierogi ruskie 1kg</td><td><span className="badge badge-amber" style={{fontSize:9}}>sesame (refuse)</span></td><td><span className="so-status held">Blocked</span></td></tr>
            </tbody>
          </table>

          <div className="row-flex" style={{marginTop:12}}>
            <span className="spacer"></span>
            <button className="btn btn-primary btn-sm">Save allergen restrictions</button>
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <ScaffoldedScreen
          breadcrumb={<span>Shipping · {c.name} · Pricing</span>}
          title="Customer pricing agreements"
          spec="SHIP-002 §Pricing tab · Phase 2"
          phase="Phase 2"
          notes={"P1 fallback: Unit prices default to products.default_sell_price from 03-TECHNICAL. Custom per-customer pricing arrives with 10-FINANCE Phase 2."}/>
      )}

      {tab === "credit" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Credit summary</h3></div>
            <Summary rows={[
              { label: "Credit limit", value: "£" + c.creditLimit.toLocaleString() },
              { label: "Current balance used", value: "£" + c.creditUsed.toLocaleString() },
              { label: "Utilisation", value: creditPct + "%", emphasis: creditPct > 80 },
              { label: "Payment terms", value: "Net " + c.terms, mono: false },
              { label: "Credit status", value: creditPct > 100 ? "Exceeded" : creditPct > 80 ? "At risk" : "Within limit", mono: false },
            ]}/>
            <div style={{marginTop:10, height:10, background:"var(--gray-100)", borderRadius:5, overflow:"hidden"}}>
              <span style={{display:"block", height:"100%", width: Math.min(100, creditPct) + "%", background: creditPct > 100 ? "var(--red)" : creditPct > 80 ? "var(--amber)" : "var(--green)"}}></span>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Credit holds (history)</h3></div>
            <div className="alert-amber alert-box" style={{fontSize:12}}>
              <span>⚠</span>
              <div><b>P1: credit hold is warning-only.</b> Hard-block auto-trigger at exceeded limit arrives in Phase 2 (10-FINANCE EPIC 11-C). Credit control can place manual holds on SOs now.</div>
            </div>
            <div style={{marginTop:10, fontSize:11, color:"var(--muted)"}}>No prior holds recorded.</div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}>
            <h3 className="card-title">Order history ({c.orders.length + 220} total · showing last 4)</h3>
            <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          </div>
          <table>
            <thead><tr><th>SO#</th><th>Order date</th><th>Status</th><th style={{textAlign:"right"}}>Total</th><th>Ship date</th><th></th></tr></thead>
            <tbody>
              {c.orders.map(o => (
                <tr key={o.so} style={{cursor:"pointer"}} onClick={()=>onNav("so_detail")}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{o.so}</td>
                  <td className="mono" style={{fontSize:11}}>{o.date}</td>
                  <td><SOStatus s={o.status}/></td>
                  <td className="num mono">{o.total}</td>
                  <td className="mono" style={{fontSize:11}}>{o.shipDate}</td>
                  <td><button className="btn btn-ghost btn-sm">View →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

Object.assign(window, { ShCustomerList, ShCustomerDetail });
