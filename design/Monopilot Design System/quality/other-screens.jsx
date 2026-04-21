// ============ QA-004 Templates, QA-008 Sampling, QA-021 Audit, QA-025 Scanner, QA-099 Settings, P2 placeholders ============

const QaTemplates = ({ onNav, openModal }) => {
  const [category, setCategory] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const visible = QA_TEMPLATES.filter(t =>
    (category === "all" || t.category === category) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Test Templates</div>
          <h1 className="page-title">Test Templates</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_TEMPLATES.length} templates · reusable parameter blocks for specifications</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary btn-sm" onClick={() => openModal("templateCreate")}>＋ New Template</button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)} style={{width: 240}}/>
        <div className="pills">
          {["all", "Microbiological", "Chemical", "Physical", "Sensory"].map(c => (
            <button key={c} className={"pill " + (category === c ? "on" : "")} onClick={() => setCategory(c)}>{c === "all" ? "All" : c}</button>
          ))}
        </div>
      </div>

      <div className="gallery-grid">
        {visible.map(t => (
          <div key={t.id} className="gallery-card">
            <div className="gallery-pattern">{t.category}</div>
            <div className="gallery-name">{t.name}</div>
            <div className="muted" style={{fontSize: 11, marginTop: 6}}>
              <b>{t.params}</b> parameters: {t.preview.slice(0, 4).join(", ")}{t.params > 4 ? ` +${t.params - 4} more` : ""}
            </div>
            <div style={{fontSize: 10, color: "var(--muted)", marginTop: 8, display: "flex", justifyContent: "space-between"}}>
              <span>By {t.createdBy}</span><span className="mono">{t.updated}</span>
            </div>
            <div style={{marginTop: 8, display: "flex", gap: 4}}>
              <button className="btn btn-primary btn-sm">Use in spec</button>
              <button className="btn btn-secondary btn-sm" onClick={() => openModal("templateCreate", t)}>Edit</button>
              <button className="btn btn-ghost btn-sm">⋮</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// ============ QA-008 Sampling Plans ============
const QaSamplingPlans = ({ onNav, openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Sampling Plans</div>
        <h1 className="page-title">Sampling Plans</h1>
        <div className="muted" style={{fontSize: 12}}>{QA_SAMPLING_PLANS.length} plans · ISO 2859-1 / MIL-STD-105E AQL tables</div>
      </div>
      <div className="row-flex">
        <button className="btn btn-primary btn-sm" onClick={() => openModal("samplingCreate")}>＋ New Plan</button>
      </div>
    </div>

    <div className="filter-bar">
      <div className="pills">
        {["all", "iso2859", "ansi_z14", "custom"].map(t => <button key={t} className="pill">{t === "all" ? "All types" : t}</button>)}
      </div>
      <div className="pills">
        <button className="pill on">Active</button>
        <button className="pill">Archived</button>
      </div>
      <div className="pills">
        <button className="pill">All</button><button className="pill">Incoming</button><button className="pill">Final</button>
      </div>
    </div>

    <div className="card" style={{padding: 0}}>
      <table>
        <thead><tr><th>Plan code</th><th>Type</th><th>AQL</th><th>Level</th><th>Lot range</th><th>Sample n</th><th>Accept</th><th>Reject</th><th>Applies to</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {QA_SAMPLING_PLANS.map(p => (
            <tr key={p.code}>
              <td><span className="dcode">{p.code}</span></td>
              <td><span className="qa-badge badge-draft">{p.type}</span></td>
              <td className="mono">{p.aql || "—"}</td>
              <td className="mono">{p.level}</td>
              <td className="mono" style={{fontSize: 11}}>{p.lotMin}–{p.lotMax}</td>
              <td className="num mono">{p.sampleSize || "—"}</td>
              <td className="num mono">{p.accept}</td>
              <td className="num mono">{p.reject}</td>
              <td><span className="qa-badge badge-draft">{p.appliesTo}</span></td>
              <td><StatusBadge s={p.status}/></td>
              <td><button className="btn btn-ghost btn-sm">Edit</button><button className="btn btn-ghost btn-sm">⋮</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="alert-box alert-blue" style={{fontSize: 12, marginTop: 14}}>
      <span>ⓘ</span>
      <div>
        <b>AQL Reference:</b> ISO 2859-1 / MIL-STD-105E. Accept on zero (Ac=0) for critical attributes. Attach plans to product specifications in the <a style={{color: "var(--blue)", cursor: "pointer"}} onClick={() => onNav("specs")}>Specifications</a> screen.
        <br/><a style={{color: "var(--blue)", cursor: "pointer"}} href="https://en.wikipedia.org/wiki/Acceptable_quality_limit" target="_blank">Read ISO 2859-1 sampling procedure ↗</a>
      </div>
    </div>
  </>
);

// ============ QA-021 Audit Trail ============
const QaAuditTrail = ({ onNav, openModal }) => {
  const [expanded, setExpanded] = React.useState(new Set());
  const [opFilter, setOpFilter] = React.useState(new Set());
  const [tableFilter, setTableFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const toggle = i => { const n = new Set(expanded); if (n.has(i)) n.delete(i); else n.add(i); setExpanded(n); };
  const toggleOp = o => { const n = new Set(opFilter); if (n.has(o)) n.delete(o); else n.add(o); setOpFilter(n); };

  const visible = QA_AUDIT.filter(a =>
    (tableFilter === "all" || a.table === tableFilter) &&
    (opFilter.size === 0 || opFilter.has(a.op)) &&
    (!search || a.recordId.toLowerCase().includes(search.toLowerCase()) || a.user.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="audit-head">
        <div style={{display: "flex", alignItems: "flex-start", gap: 14}}>
          <div style={{fontSize: 32}}>🔒</div>
          <div style={{flex: 1}}>
            <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Audit Trail</div>
            <h1 className="page-title" style={{margin: "2px 0"}}>Audit Trail</h1>
            <div style={{fontSize: 12}}>
              This is an immutable audit record maintained per <b>BRCGS Issue 10 §3.11.1</b>, <b>21 CFR Part 11</b>, and <b>FSMA 204</b>. Records cannot be edited or deleted. Retention: 7 years minimum. <span className="qa-badge badge-signed" style={{marginLeft: 6}}>🔒 Signed</span>
            </div>
          </div>
          <div className="row-flex">
            <button className="btn btn-secondary btn-sm" onClick={() => openModal("auditExport")}>⇪ Export CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => openModal("auditExport")}>{"{ }"} Export JSON</button>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} style={{width: 240}}>
          <option value="all">All tables</option>
          <option>quality_holds</option><option>quality_inspections</option><option>quality_specifications</option>
          <option>ncr_reports</option><option>haccp_monitoring_records</option><option>ccp_monitoring_records</option>
          <option>allergen_changeover_validations</option>
        </select>
        <input type="text" placeholder="Search record ID or number…" value={search} onChange={e => setSearch(e.target.value)} style={{width: 220}}/>
        <select style={{width: 160}}>
          <option>All users</option>
          <option>QA.Lead</option><option>QA.Inspector1</option><option>QA.Inspector2</option>
          <option>Hygiene.Lead</option><option>Shift.Lead1</option><option>system</option>
        </select>
        <div className="pills">
          {["INSERT", "UPDATE", "DELETE", "SIGN", "RELEASE", "APPROVE", "CLOSE"].map(o => (
            <button key={o} className={"pill " + (opFilter.has(o) ? "on" : "")} onClick={() => toggleOp(o)}>{o}</button>
          ))}
        </div>
        <input type="date" style={{width: 140}} defaultValue="2026-04-15"/>
        <input type="date" style={{width: 140}} defaultValue="2026-04-21"/>
        <button className="btn btn-secondary btn-sm">Apply</button>
        <button className="clear-all" onClick={() => { setSearch(""); setOpFilter(new Set()); setTableFilter("all"); }}>Reset</button>
      </div>

      <div className="card" style={{padding: 0}}>
        <table>
          <thead><tr><th>Occurred at</th><th>Table</th><th>Record</th><th>Operation</th><th>User</th><th>Changed fields</th><th>IP address</th><th>Details</th></tr></thead>
          <tbody>
            {visible.map((a, i) => (
              <React.Fragment key={i}>
                <tr style={{borderLeft: a.op === "SIGN" ? "3px solid var(--blue)" : null}}>
                  <td className="mono" style={{fontSize: 11}}>{a.t}</td>
                  <td><span className="qa-badge badge-draft">{a.table}</span></td>
                  <td className="mono" style={{fontSize: 11, color: "var(--blue)"}}>{a.recordId}</td>
                  <td>
                    {a.op === "SIGN" && <span className="qa-badge badge-signed">🔒 {a.op}</span>}
                    {a.op === "INSERT" && <span className="qa-badge badge-released">{a.op}</span>}
                    {a.op === "UPDATE" && <span className="qa-badge badge-pending">{a.op}</span>}
                    {a.op === "DELETE" && <span className="qa-badge badge-fail">{a.op}</span>}
                    {a.op === "RELEASE" && <span className="qa-badge badge-released">{a.op}</span>}
                    {a.op === "APPROVE" && <span className="qa-badge badge-released">{a.op}</span>}
                    {a.op === "CLOSE" && <span className="qa-badge badge-closed">{a.op}</span>}
                  </td>
                  <td style={{fontSize: 11}}>{a.user}</td>
                  <td style={{fontSize: 11, maxWidth: 260}} title={a.fields}>{a.fields}</td>
                  <td className="mono" style={{fontSize: 11}}>{a.ip}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(i)}>{expanded.has(i) ? "▲ Collapse" : "▼ Expand"}</button></td>
                </tr>
                {expanded.has(i) && (
                  <tr><td colSpan={8} style={{background: "#f8fafc", padding: 10}}>
                    <div className="audit-diff">
                      <div>
                        <div className="audit-diff-head">Before (old_data)</div>
                        <pre>{a.oldData ? JSON.stringify(a.oldData, null, 2) : "(null — this was an INSERT)"}</pre>
                      </div>
                      <div>
                        <div className="audit-diff-head">After (new_data)</div>
                        <pre>{a.newData ? JSON.stringify(a.newData, null, 2) : "(null)"}</pre>
                      </div>
                    </div>
                    {a.op === "SIGN" && (
                      <div style={{marginTop: 8, fontSize: 11, padding: 8, background: "#e0e7ff", borderRadius: 4}}>
                        <b>Signature event</b> · meaning: <span className="mono">signed</span> · pin_verified: <span className="mono">true</span> · signature_hash: <span className="mono">{(a.newData?.signature_hash || "a3f9c2d1e4b7...").substring(0, 16)}…</span>
                      </div>
                    )}
                    <div style={{marginTop: 6, fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)"}}>request_id: req-{String(i * 7 + 1042).padStart(6, "0")}</div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{fontSize: 11, textAlign: "center", padding: "10px 0"}}>
        Showing 1–{visible.length} of {visible.length} events · Page 1
      </div>
    </>
  );
};

// ============ QA-025 Scanner QA ============
const QaScannerRef = ({ onNav }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Scanner QA</div>
        <h1 className="page-title">Scanner QA</h1>
      </div>
    </div>
    <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 14}}>
      <span>ⓘ</span>
      <div>QA sample entry and inspection scanning is performed via the <b>Scanner module</b> on shop-floor devices. Desktop access to scanner flows is for reference only.</div>
    </div>

    <div className="gallery-grid">
      {[
        { id: "SCN-070", name: "QA Inspect entry (pending list)", desc: "Queue of pending inspections on scanner kiosk.", api: "GET /api/quality/scanner/pending" },
        { id: "SCN-071", name: "QA Inspect (scan LP)",             desc: "Scan LP and record PASS / FAIL / HOLD with 3 large buttons.", api: "POST /api/quality/scanner/inspect" },
        { id: "SCN-072", name: "QA Fail reason",                    desc: "Select from 7 failure reason codes + notes. Auto-creates NCR draft.", api: "writes fail_reason_code_id" },
        { id: "SCN-073", name: "QA Done",                           desc: "Result confirmation with inspection_id + NCR ref if created.", api: "—" },
      ].map(f => (
        <div key={f.id} className="gallery-card">
          <div className="gallery-pattern">{f.id}</div>
          <div className="gallery-name">{f.name}</div>
          <div className="muted" style={{fontSize: 11, marginTop: 6}}>{f.desc}</div>
          <div style={{fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--muted)", marginTop: 6}}>API: {f.api}</div>
          <button className="btn btn-secondary btn-sm" style={{marginTop: 8}}>View in Scanner module →</button>
        </div>
      ))}
    </div>

    <div className="card" style={{padding: 14, marginTop: 14}}>
      <h4 style={{margin: 0, fontSize: 12, textTransform: "uppercase"}}>SCN-081 — Allergen Changeover Dual-Sign</h4>
      <div style={{fontSize: 12, marginTop: 6, lineHeight: 1.5}}>
        Allergen changeover sign-off is performed on the Scanner. It writes <span className="mono">first_signed_by</span> to <span className="mono">allergen_changeover_validations</span>. The second sign is performed on desktop in <a style={{color: "var(--blue)", cursor: "pointer"}} onClick={() => onNav("allergen")}>Allergen Changeover Gates</a>.
      </div>
    </div>
  </>
);

// ============ QA-099 Quality Settings ============
const QaSettings = ({ role, onNav }) => {
  const [tab, setTab] = React.useState("general");
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Settings</div>
          <h1 className="page-title">Quality Settings</h1>
          <div className="muted" style={{fontSize: 12}}>Accessible to Quality Lead and Admin only · Current role: {role}</div>
        </div>
      </div>

      <div className="tabs-bar">
        {["general", "regulations", "notifications", "retention", "rules"].map(t => (
          <button key={t} className={"tab-btn " + (tab === t ? "on" : "")} onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === "general" && (
        <div className="card" style={{padding: 18}}>
          <Field label="Auto-create incoming inspection on GRN for all items" help="Override per item in 03-TECHNICAL."><label><input type="checkbox"/> Enabled</label></Field>
          <Field label="Default inspection priority"><select><option>Normal</option><option>High</option><option>Urgent</option></select></Field>
          <Field label="Spec versioning policy" help="Clone-only creates a new draft version for any edit to an active spec."><select><option>Allow draft edits</option><option>Clone only</option></select></Field>
          <Field label="Sampling plan default"><select>{QA_SAMPLING_PLANS.filter(p => p.status === "active").map(p => <option key={p.code}>{p.code}</option>)}</select></Field>

          <h4 style={{margin: "14px 0 8px"}}>Hold default duration (by reason category)</h4>
          <div className="muted" style={{fontSize: 11, marginBottom: 8}}>Final values post-UAT per OQ-QA-01.</div>
          <table>
            <thead><tr><th>Reason code</th><th>Label</th><th>Category</th><th style={{textAlign: "right"}}>Default days</th></tr></thead>
            <tbody>
              {QA_HOLD_REASONS.map(r => (
                <tr key={r.code}>
                  <td className="mono" style={{fontSize: 11}}>{r.code}</td>
                  <td style={{fontSize: 12}}>{r.label}</td>
                  <td><span className="qa-badge badge-draft">{r.category}</span></td>
                  <td><input type="number" defaultValue={r.defaultDuration} className="num mono" style={{width: 60}}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "regulations" && (
        <div className="card" style={{padding: 18}}>
          <h4 style={{margin: "0 0 8px"}}>Active regulation presets</h4>
          {["EU FIC 1169/2011", "FSMA 204", "BRCGS Issue 10", "ISO 22000", "21 CFR Part 11", "Codex HACCP"].map(r => (
            <div key={r} style={{padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12}}>
              <label><input type="checkbox" defaultChecked/> {r}</label>
            </div>
          ))}
          <Field label="BRCGS version" help="v10 (Issue 10) requires digital dashboards and trend charts per §3.11.">
            <select defaultValue="v10"><option>v9</option><option>v10</option></select>
          </Field>

          <h4 style={{margin: "14px 0 8px"}}>Retention policy overrides</h4>
          <table>
            <thead><tr><th>Record type</th><th>Current (years)</th><th>Override</th><th>Note</th></tr></thead>
            <tbody>
              <tr><td className="mono">quality_inspections</td><td>7</td><td><input type="number" defaultValue={7} className="num mono" style={{width: 60}}/></td><td style={{fontSize: 11, color: "var(--muted)"}}>Cannot reduce below 7 (regulatory min.)</td></tr>
              <tr><td className="mono">ncr_reports</td><td>7</td><td><input type="number" defaultValue={7} className="num mono" style={{width: 60}}/></td><td style={{fontSize: 11, color: "var(--muted)"}}>BRCGS min 3 yrs, Forza internal 7</td></tr>
              <tr><td className="mono">haccp_monitoring_records</td><td>7</td><td><input type="number" defaultValue={7} className="num mono" style={{width: 60}}/></td><td style={{fontSize: 11, color: "var(--muted)"}}>ISO 22000 min 3 yrs</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "notifications" && (
        <div className="card" style={{padding: 18}}>
          <div className="muted" style={{fontSize: 11, marginBottom: 10}}>Matrix of notification events × channels</div>
          <table>
            <thead><tr><th>Event</th><th style={{textAlign: "center"}}>In-app</th><th style={{textAlign: "center"}}>Email</th><th style={{textAlign: "center"}}>Slack</th></tr></thead>
            <tbody>
              {["Inspection overdue", "CCP deviation detected", "NCR critical created", "Hold created", "Hold overdue (>3d)", "Allergen gate awaiting sign", "Spec version expiring (30d)"].map(e => (
                <tr key={e}>
                  <td style={{fontSize: 12}}>{e}</td>
                  <td style={{textAlign: "center"}}><input type="checkbox" defaultChecked/></td>
                  <td style={{textAlign: "center"}}><input type="checkbox" defaultChecked={e !== "Spec version expiring (30d)"}/></td>
                  <td style={{textAlign: "center"}}><input type="checkbox"/></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Field label="CCP deviation escalation delay (minutes)" help="Adjust per OQ-QA-02 post-30-day P1 run.">
            <input type="number" defaultValue={0} className="num mono" style={{width: 100}}/>
          </Field>
        </div>
      )}

      {tab === "retention" && (
        <div className="card" style={{padding: 18}}>
          <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 10}}>
            <span>ⓘ</span>
            <div>Retention policies are configured in the database schema and cannot be changed from the UI. Contact your system administrator to change retention policies.</div>
          </div>
          <table>
            <thead><tr><th>Table</th><th>Retention formula</th><th>Years</th></tr></thead>
            <tbody>
              <tr><td className="mono">quality_holds</td><td className="mono" style={{fontSize: 11}}>occurred_at + interval '7 years'</td><td className="num mono">7</td></tr>
              <tr><td className="mono">quality_inspections</td><td className="mono" style={{fontSize: 11}}>signed_at + interval '7 years'</td><td className="num mono">7</td></tr>
              <tr><td className="mono">ncr_reports</td><td className="mono" style={{fontSize: 11}}>closed_at + interval '7 years'</td><td className="num mono">7</td></tr>
              <tr><td className="mono">ccp_monitoring_records</td><td className="mono" style={{fontSize: 11}}>recorded_at + interval '7 years'</td><td className="num mono">7</td></tr>
              <tr><td className="mono">quality_audit_log</td><td className="mono" style={{fontSize: 11}}>occurred_at + interval '10 years'</td><td className="num mono">10</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "rules" && (
        <div className="card" style={{padding: 18}}>
          <div className="muted" style={{fontSize: 11, marginBottom: 10}}>Read-only display of DSL rules registered by 09-QUALITY. <a style={{color: "var(--blue)", cursor: "pointer"}}>View in 02-Settings Rule Registry →</a></div>
          <table>
            <thead><tr><th>Rule code</th><th>Type</th><th>Trigger</th><th>Version</th><th>Effective from</th><th>30d evaluations</th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{color: "var(--blue)"}}>qa_status_state_machine_v1</td><td><span className="qa-badge badge-draft">state_machine</span></td><td style={{fontSize: 11}}>on LP qa_status change</td><td className="mono">v1</td><td className="mono">2025-09-01</td><td className="num mono">4,182</td></tr>
              <tr><td className="mono" style={{color: "var(--blue)"}}>ccp_deviation_escalation_v1</td><td><span className="qa-badge badge-draft">escalation</span></td><td style={{fontSize: 11}}>on ccp_monitoring INSERT where within_limits=false</td><td className="mono">v1</td><td className="mono">2025-10-01</td><td className="num mono">28</td></tr>
              <tr style={{opacity: 0.6}}><td className="mono" style={{color: "var(--blue)"}}>batch_release_gate_v1</td><td><span className="qa-badge badge-draft">gate</span></td><td style={{fontSize: 11}}>on batch release attempt</td><td className="mono">v1 <span className="badge badge-blue" style={{fontSize: 9}}>P2</span></td><td className="mono">—</td><td className="num mono">—</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ============ P2 Placeholder screens ============
const QaBatchReleaseP2 = ({ onNav }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Batch Release</div>
        <h1 className="page-title">Batch Release <span className="badge badge-blue" style={{fontSize: 10, marginLeft: 8}}>P2</span></h1>
      </div>
    </div>
    <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 14}}>
      <span>ⓘ</span>
      <div>Batch Release gate will be available in Phase 2 (Epic 8F). The <span className="mono">batch_release_gate_v1</span> rule checks: all inspections pass, no open holds, all CCPs within limits, no critical open NCRs, allergen changeover validated. Only when all checks pass can the Production Manager release the batch to shipping.</div>
    </div>
    <div className="p2-overlay">
      <div className="p2-big">Coming in Phase 2</div>
      <div className="p2-sub">Pre-release checklist gate. Blocks shipment unless all QA evidence present (final inspection pass, no open NCRs, CCP compliance, CoA issued, allergen verified).</div>
    </div>
  </>
);

const QaCoaP2 = ({ onNav }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · CoA</div>
        <h1 className="page-title">Certificates of Analysis <span className="badge badge-blue" style={{fontSize: 10, marginLeft: 8}}>P2</span></h1>
      </div>
    </div>
    <div className="alert-box alert-blue" style={{fontSize: 12, marginBottom: 14}}>
      <span>ⓘ</span>
      <div>Certificates of Analysis will be available in Phase 2 (Epic 8J). PDF templates, automatic CoA generation at batch release, customer portal distribution.</div>
    </div>
    <div className="p2-overlay">
      <div className="p2-big">Coming in Phase 2</div>
      <div className="p2-sub">CoA templates per customer. Auto-population from inspection results and CCP records. Digitally signed with QA Lead e-signature.</div>
    </div>
  </>
);

Object.assign(window, { QaTemplates, QaSamplingPlans, QaAuditTrail, QaScannerRef, QaSettings, QaBatchReleaseP2, QaCoaP2 });
