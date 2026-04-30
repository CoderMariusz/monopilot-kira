// ============================================================
// ADMIN / CROSS-MODULE SCREENS — 10 screens that gate other modules.
// Maps to spec sections SET-040 / SET-041 / SET-050 / SET-051
// SET-060 / SET-070 / SET-080 / SET-090 / SET-091 / SET-100.
// ============================================================

// Tiny helper for tier / type badges used across these screens.
const TierBadge = ({ tier }) => {
  const map = { L1: "badge-blue", L2: "badge-green", L3: "badge-amber", L4: "badge-red", "L1-core": "badge-blue", "L2-local": "badge-green", "L3-tenant": "badge-amber" };
  return <span className={"badge " + (map[tier] || "badge-gray")} style={{fontSize:10}}>{tier}</span>;
};

const TypeBadge = ({ type }) => {
  const map = { workflow: "badge-amber", cascading: "badge-blue", conditional: "badge-gray", gate: "badge-red" };
  return <span className={"badge " + (map[type] || "badge-gray")} style={{fontSize:10, textTransform:"uppercase"}}>{type}</span>;
};

const StatusPill = ({ status }) => {
  const map = { pending: "badge-amber", approved: "badge-blue", running: "badge-blue", completed: "badge-green", failed: "badge-red" };
  return <span className={"badge " + (map[status] || "badge-gray")} style={{fontSize:10}}>{status}</span>;
};

// ============================================================
// SCREEN 1 — SET-040 D365 connection config
// spec: 02-SETTINGS-UX.md § SET-080 (gates integration.d365.enabled flag)
// ============================================================
const D365ConnectionScreen = ({ openModal }) => {
  const d = window.SETTINGS_D365;
  const [url, setUrl] = React.useState(d.baseUrl);
  const [env, setEnv] = React.useState(d.env);
  const [tenantId, setTenantId] = React.useState(d.tenantId);
  const [clientId, setClientId] = React.useState(d.clientId);
  const [svcEmail, setSvcEmail] = React.useState(d.svcEmail);
  const [cron, setCron] = React.useState(d.pollCron);
  const [enabled, setEnabled] = React.useState(d.enabled);

  // V-rules
  const vUrl     = /^https:\/\/.+\.dynamics\.com/.test(url || "");
  const vTenant  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId || "");
  const vClient  = (clientId || "").length >= 8;
  const vCron    = /^(\S+\s+){4}\S+$/.test(cron || "");
  const allValid = vUrl && vTenant && vClient && vCron;

  return (
    <>
      <PageHead title="D365 connection" sub="Dynamics 365 Finance & Operations — endpoint, auth, polling schedule."
        actions={<><button className="btn btn-secondary" onClick={() => openModal("d365Test")}>Test connection</button>
                   <button className="btn btn-primary" disabled={!allValid}>Save configuration</button></>} />

      <div className="alert alert-amber" style={{marginBottom:14}}>
        <strong>LEGACY-D365.</strong> This integration will be retired when Monopilot replaces D365. Referenced by <span className="mono">integration.d365.so_trigger.enabled</span> (gates Planning SCREEN-13 + D365 Queue).
      </div>

      <Section title="Endpoint">
        <SRow label="Base URL" hint="e.g. https://apex.operations.dynamics.com">
          <input type="url" value={url} onChange={e=>setUrl(e.target.value)} style={{width:"100%", maxWidth:420}} />
          {!vUrl && url && <div style={{fontSize:11, color:"var(--red)", marginTop:4}}>Must be an https:// …dynamics.com URL.</div>}
        </SRow>
        <SRow label="Environment">
          <select value={env} onChange={e=>setEnv(e.target.value)}>
            <option>Production</option><option>Sandbox</option><option>Development</option>
          </select>
        </SRow>
      </Section>

      <Section title="Authentication (Azure AD)">
        <SRow label="Tenant ID" hint="UUID format, from Azure portal.">
          <input value={tenantId} onChange={e=>setTenantId(e.target.value)} className="mono" style={{width:360}} />
          {!vTenant && tenantId && <div style={{fontSize:11, color:"var(--red)", marginTop:4}}>Invalid UUID format.</div>}
        </SRow>
        <SRow label="Client ID" hint="Azure App Registration client ID.">
          <input value={clientId} onChange={e=>setClientId(e.target.value)} className="mono" style={{width:360}} />
          {!vClient && clientId && <div style={{fontSize:11, color:"var(--red)", marginTop:4}}>Too short.</div>}
        </SRow>
        <SRow label="Client Secret" hint="Never shown after save. Use 'Rotate' to update.">
          <input type="password" defaultValue="●●●●●●●●●●●●" style={{width:200}} readOnly />
          <button className="btn btn-secondary btn-sm" style={{marginLeft:8}}>Rotate secret</button>
        </SRow>
        <SRow label="Service account email" hint="Fallback basic-auth identity.">
          <input type="email" value={svcEmail} onChange={e=>setSvcEmail(e.target.value)} style={{width:320}} />
        </SRow>
      </Section>

      <Section title="Polling & sync">
        <SRow label="Pull cron schedule" hint="Standard 5-field cron. Example: '0 2 * * *' = daily 02:00.">
          <input value={cron} onChange={e=>setCron(e.target.value)} className="mono" style={{width:200}} />
          {!vCron && cron && <div style={{fontSize:11, color:"var(--red)", marginTop:4}}>Cron must have 5 space-separated fields.</div>}
        </SRow>
        <SRow label="Integration enabled" hint="Mirrors `integration.d365.enabled` flag. Pre-flight runs on toggle.">
          <Toggle on={enabled} onChange={(v) => { if (v) openModal("d365Test"); setEnabled(v); }} />
        </SRow>
      </Section>

      <Section title="Last test">
        {d.lastTest.ok ? (
          <div className="alert alert-green" style={{margin:0}}>✓ Connected at <span className="mono">{d.lastTest.at}</span> · Latency <span className="mono">{d.lastTest.latency}ms</span> · Env <span className="mono">{d.lastTest.env}</span></div>
        ) : (
          <div className="alert alert-red" style={{margin:0}}>✗ Failed — run 'Test connection' to retry.</div>
        )}
      </Section>
    </>
  );
};

// ============================================================
// SCREEN 2 — SET-041 D365 field mapping
// Read-only mapping of D365 → Monopilot fields (product, supplier, …)
// ============================================================
const D365MappingScreen = ({ openModal }) => {
  const rows = window.SETTINGS_D365_MAPPING;
  const [dir, setDir] = React.useState("all");
  const filtered = dir === "all" ? rows : rows.filter(r => r.dir === dir);
  return (
    <>
      <PageHead title="D365 field mapping" sub="How D365 entity fields map to Monopilot tables."
        actions={<><button className="btn btn-secondary">Export mapping CSV</button><button className="btn btn-secondary" onClick={()=>openModal("d365Test")}>Test connection</button></>} />

      <div className="alert alert-blue" style={{marginBottom:12, fontSize:12}}>
        Mapping is deployed via CI/CD. To change a mapping, raise a PR in the <span className="mono">monopilot/integrations-d365</span> repo.
      </div>

      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <button className={"btn btn-sm " + (dir==="all" ? "btn-primary":"btn-secondary")} onClick={()=>setDir("all")}>All ({rows.length})</button>
        <button className={"btn btn-sm " + (dir==="d365 → mp" ? "btn-primary":"btn-secondary")} onClick={()=>setDir("d365 → mp")}>D365 → Monopilot ({rows.filter(r=>r.dir==="d365 → mp").length})</button>
        <button className={"btn btn-sm " + (dir==="mp → d365" ? "btn-primary":"btn-secondary")} onClick={()=>setDir("mp → d365")}>Monopilot → D365 ({rows.filter(r=>r.dir==="mp → d365").length})</button>
      </div>

      <Section title="Field-level map">
        <table>
          <thead><tr><th>D365 field</th><th>Direction</th><th>Monopilot field</th><th>Type</th><th>Transform</th></tr></thead>
          <tbody>
            {filtered.map((r,i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11}}>{r.d365}</td>
                <td className="mono muted" style={{fontSize:11}}>{r.dir}</td>
                <td className="mono" style={{fontSize:11, fontWeight:600}}>{r.monopilot}</td>
                <td><span className="badge badge-gray" style={{fontSize:10}}>{r.type}</span></td>
                <td className="mono muted" style={{fontSize:11}}>{r.transform}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

// ============================================================
// SCREEN 3 — SET-050 Rules registry browser (read-only)
// spec: § SET-040 "Rule Definitions Registry"
// ============================================================
const RulesRegistryScreen = ({ onOpenRule, openModal }) => {
  const [typeF, setTypeF] = React.useState("all");
  const [covF,  setCovF]  = React.useState("all");
  const rules = window.SETTINGS_RULES.filter(r =>
    (typeF === "all" || r.type === typeF) &&
    (covF  === "all" || r.coverage === covF)
  );
  return (
    <>
      <PageHead title="Rules registry" sub="Read-only browser of deployed business rules (DSL-driven)."
        actions={<>
          {/* TUNING-PATTERN §3.6 — dry-run fan-out preview before activating a rule batch
              across the whole registry. Opens the shared ruleDryRun modal scoped to "all rules". */}
          <DryRunButton label="Dry-run all rules"
            title="Preview affected objects across all rules before activation"
            onClick={()=>openModal("ruleDryRun")} />
          <button className="btn btn-secondary">Export all (JSON)</button>
        </>} />

      <div className="alert alert-blue" style={{marginBottom:12, fontSize:12}}>
        Rules are authored by developers and deployed via CI/CD. This view is read-only — contact your Monopilot implementation team to request rule changes.
      </div>

      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)}>
          <option value="all">All types</option>
          <option value="workflow">Workflow</option>
          <option value="cascading">Cascading</option>
          <option value="conditional">Conditional</option>
          <option value="gate">Gate</option>
        </select>
        <select value={covF} onChange={e=>setCovF(e.target.value)}>
          <option value="all">All coverage</option>
          <option value="covered">Covered (dry-run &lt; 30d)</option>
          <option value="missing">Missing coverage</option>
        </select>
        <span className="muted" style={{fontSize:11, alignSelf:"center"}}>{rules.length} / {window.SETTINGS_RULES.length} rules</span>
      </div>

      <Section title="Deployed rules">
        <table>
          <thead><tr><th>Rule code</th><th>Type</th><th>Tier</th><th>Version</th><th>Active from</th><th>Deploy ref</th><th>Coverage</th><th>Consumers</th><th></th></tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.code} style={r.coverage === "missing" ? {background:"#fffbeb", borderLeft:"3px solid var(--amber)"} : null}>
                <td className="mono" style={{fontWeight:600}}>{r.code}</td>
                <td><TypeBadge type={r.type} /></td>
                <td><TierBadge tier={r.tier} /></td>
                <td className="mono num">v{r.version}</td>
                <td className="mono muted" style={{fontSize:11}}>{r.from}</td>
                <td className="mono muted" style={{fontSize:11}}>{r.sha}</td>
                <td>
                  {r.coverage === "covered"
                    ? <span className="badge badge-green" style={{fontSize:10}}>covered</span>
                    : <span className="badge badge-red" style={{fontSize:10}}>missing 30d</span>}
                </td>
                <td className="muted" style={{fontSize:11}}>{(r.consumers||[]).length} module refs</td>
                <td><button className="btn btn-secondary btn-sm" onClick={()=>onOpenRule(r.code)}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

// ============================================================
// SCREEN 4 — SET-051 Rule detail (DSL source view + dry-run trigger)
// spec: § SET-041 "Rule Detail"
// ============================================================
const RuleDetailScreen = ({ ruleCode, onBack, openModal }) => {
  const rule = window.SETTINGS_RULES.find(r => r.code === ruleCode) || window.SETTINGS_RULES[0];
  const dsl  = window.SETTINGS_RULE_DSL[rule.code];
  const runs = window.SETTINGS_DRY_RUNS[rule.code] || [];
  const [tab, setTab] = React.useState("def");

  return (
    <>
      <PageHead title={rule.code} sub={rule.desc}
        actions={<>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back to registry</button>
          <button className="btn btn-secondary btn-sm">Copy DSL</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("ruleDryRun", {rule})}>Trigger dry-run</button>
        </>} />

      <div className="breadcrumb" style={{marginBottom:10}}><a onClick={onBack}>Settings</a> · <a onClick={onBack}>Rules registry</a> · {rule.code}</div>

      <div style={{display:"flex", gap:8, marginBottom:12}}>
        <TypeBadge type={rule.type}/>
        <TierBadge tier={rule.tier}/>
        <span className="badge badge-green" style={{fontSize:10}}>ACTIVE</span>
        <span className="muted mono" style={{fontSize:11}}>v{rule.version} · {rule.from} · {rule.sha}</span>
      </div>

      <div style={{display:"flex", gap:2, borderBottom:"1px solid var(--border)", marginBottom:12}}>
        {[
          {k:"def", l:"Definition"},
          {k:"ver", l:"Version history"},
          {k:"dry", l:"Dry-run results (" + runs.length + ")"},
          {k:"cons", l:"Consumers"},
          {k:"aud", l:"Audit log"}
        ].map(t => (
          <button key={t.k} className={"btn-ghost btn-sm"} onClick={()=>setTab(t.k)}
            style={{padding:"8px 14px", borderBottom: tab === t.k ? "2px solid var(--blue)" : "2px solid transparent", borderRadius:0, fontWeight: tab === t.k ? 600 : 400}}>{t.l}</button>
        ))}
      </div>

      {tab === "def" && dsl && (
        <Section title="DSL source (read-only)" sub="Authored in the monopilot/rules repo — PR to change.">
          <div style={{position:"relative"}}>
            <span className="badge badge-gray" style={{position:"absolute", top:8, right:8, fontSize:9}}>READ ONLY</span>
            <pre className="mono" style={{background:"var(--gray-100)", padding:14, borderRadius:6, fontSize:11, maxHeight:380, overflow:"auto", lineHeight:1.55, margin:0}}>
{JSON.stringify(dsl, null, 2)}
            </pre>
          </div>
          <div style={{marginTop:10, display:"flex", gap:8}}>
            <button className="btn btn-secondary btn-sm">Copy DSL to clipboard</button>
            <button className="btn btn-secondary btn-sm">Download JSON</button>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("ruleDryRun", {rule})}>Dry-run against sample input →</button>
          </div>
        </Section>
      )}
      {tab === "def" && !dsl && (
        <Section title="DSL source"><div className="muted">DSL payload not yet indexed for this rule. Contact SRE.</div></Section>
      )}

      {tab === "ver" && (
        <Section title="Version history">
          <table>
            <thead><tr><th>Version</th><th>Deployed at</th><th>Deployed by</th><th>Deploy ref</th><th></th></tr></thead>
            <tbody>
              {Array.from({length: rule.version}).map((_, i) => {
                const v = rule.version - i;
                return (
                  <tr key={v}>
                    <td className="mono">v{v} {v === rule.version && <span className="badge badge-green" style={{fontSize:9, marginLeft:6}}>CURRENT</span>}</td>
                    <td className="mono muted" style={{fontSize:11}}>{rule.from}</td>
                    <td className="muted">{v === rule.version ? rule.by : "system (CI/CD)"}</td>
                    <td className="mono muted" style={{fontSize:11}}>{rule.sha}</td>
                    <td><button className="btn btn-secondary btn-sm" disabled={v === rule.version}>Diff vs current</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {tab === "dry" && (
        <Section title="Dry-run results" sub="Last 30 days of dry-run invocations against this rule.">
          {runs.length === 0 ? <div className="muted">No dry-runs in the last 30 days — coverage MISSING.</div> : (
            <table>
              <thead><tr><th>Ran at</th><th>Ran by</th><th>Result</th><th>Summary</th><th></th></tr></thead>
              <tbody>
                {runs.map((r,i) => (
                  <tr key={i}>
                    <td className="mono muted" style={{fontSize:11}}>{r.ranAt}</td>
                    <td className="muted">{r.ranBy}</td>
                    <td>
                      {r.result === "pass"    && <span className="badge badge-green" style={{fontSize:10}}>PASS</span>}
                      {r.result === "warning" && <span className="badge badge-amber" style={{fontSize:10}}>WARN</span>}
                      {r.result === "fail"    && <span className="badge badge-red" style={{fontSize:10}}>FAIL</span>}
                    </td>
                    <td style={{fontSize:12}}>{r.summary}</td>
                    <td><button className="btn btn-secondary btn-sm" onClick={()=>openModal("ruleDryRun", {rule, preload: r})}>View I/O →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {tab === "cons" && (
        <Section title="Module consumers" sub="Screens / flows that reference this rule.">
          {(rule.consumers || []).length === 0 ? <div className="muted">No tracked consumers.</div> : (
            <ul style={{margin:0, paddingLeft:18, lineHeight:2}}>
              {(rule.consumers || []).map((c,i) => (
                <li key={i} style={{fontSize:13}}><span className="mono" style={{fontSize:11, color:"var(--blue)"}}>→</span> {c}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "aud" && (
        <Section title="Deploy audit log">
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Deploy ref</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td className="mono muted">{rule.from}</td><td>{rule.by}</td><td>rule_deploy</td><td className="mono">{rule.sha}</td><td className="muted">Promoted from staging</td></tr>
              <tr><td className="mono muted">2025-12-03</td><td>system (CI/CD)</td><td>rule_deploy</td><td className="mono">a09f128</td><td className="muted">Hotfix for edge case</td></tr>
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
};

// ============================================================
// SCREEN 5 — SET-060 Feature flags admin (per-tenant toggle)
// spec: § SET-071 "Feature Flags"
// ============================================================
const FlagsAdminScreen = ({ openModal }) => {
  const flags = window.SETTINGS_FLAGS;
  const [tab, setTab] = React.useState("core");
  const [q,   setQ]   = React.useState("");
  const core = flags.filter(f => f.tenant === "L1-core");
  const local = flags.filter(f => f.tenant === "L2-local");
  const tenant = flags.filter(f => f.tenant === "L3-tenant");
  const list = tab === "core" ? core : tab === "local" ? local : tenant;
  const filtered = list.filter(f => !q || f.code.toLowerCase().includes(q.toLowerCase()) || f.desc.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead title="Feature flags" sub="Per-tenant toggles. L1 changes go through promotion; L2/L3 are editable here."
        actions={<><button className="btn btn-secondary">Open PostHog ↗</button></>} />

      <div className="alert alert-blue" style={{marginBottom:12, fontSize:12}}>
        Some flags trigger pre-flight checks. Example: enabling <span className="mono">integration.d365.enabled</span> validates 5 D365 constants + connection test.
      </div>

      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <button className={"btn btn-sm " + (tab==="core" ? "btn-primary":"btn-secondary")} onClick={()=>setTab("core")}>L1 core ({core.length})</button>
        <button className={"btn btn-sm " + (tab==="local" ? "btn-primary":"btn-secondary")} onClick={()=>setTab("local")}>L2 local ({local.length})</button>
        <button className={"btn btn-sm " + (tab==="tenant" ? "btn-primary":"btn-secondary")} onClick={()=>setTab("tenant")}>L3 tenant ({tenant.length})</button>
        <span className="spacer" style={{flex:1}}></span>
        <input placeholder="Search flag code or description…" value={q} onChange={e=>setQ(e.target.value)} style={{width:320}} />
      </div>

      <Section title={tab === "core" ? "Core flags" : tab === "local" ? "Local (L2) flags" : "Tenant-private (L3) flags"}>
        <table>
          <thead><tr><th>Flag code</th><th>Description</th><th>Status</th><th style={{width:100}}>Rollout %</th><th>Updated</th><th>Consumers</th><th></th></tr></thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.code}>
                <td className="mono" style={{fontWeight:600, fontSize:11}}>{f.code}</td>
                <td style={{fontSize:12, color:"var(--muted)", maxWidth:320}}>{f.desc}</td>
                <td>
                  {f.on
                    ? <span className="badge badge-green" style={{fontSize:10}}>● ON</span>
                    : <span className="badge badge-gray" style={{fontSize:10}}>○ OFF</span>}
                </td>
                <td>
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <div style={{width:50, height:4, background:"var(--gray-100)", borderRadius:2, overflow:"hidden"}}>
                      <div style={{width:`${f.rollout}%`, height:"100%", background:"var(--blue)"}}></div>
                    </div>
                    <span className="mono" style={{fontSize:11}}>{f.rollout}%</span>
                  </div>
                </td>
                <td className="mono muted" style={{fontSize:11}}>{f.updated}</td>
                <td className="muted" style={{fontSize:11}}>{(f.consumers || []).join(", ") || "—"}</td>
                <td><button className="btn btn-secondary btn-sm" onClick={()=>openModal("flagEdit", {flag:f})}>Edit →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

// ============================================================
// SCREEN 6 — SET-070 Schema browser (table / column inspector)
// spec: § SET-030 "Schema Browser"
// ============================================================
const SchemaBrowserScreen = ({ openModal }) => {
  const rows = window.SETTINGS_SCHEMA;
  const [tbl, setTbl] = React.useState("all");
  const [tier, setTier] = React.useState("all");
  const [q, setQ] = React.useState("");
  const tables = ["all", ...Array.from(new Set(rows.map(r => r.table)))];
  const filtered = rows.filter(r =>
    (tbl === "all" || r.table === tbl) &&
    (tier === "all" || r.tier === tier) &&
    (!q || r.col.includes(q.toLowerCase()) || (r.label || "").toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <>
      <PageHead title="Schema browser" sub="Read-only inspector for all column definitions, across L1/L2/L3 tiers."
        actions={<><button className="btn btn-secondary">Export schema CSV</button></>} />

      <div className="alert alert-blue" style={{marginBottom:12, fontSize:12}}>
        Columns scoped L1 are read-only here — raise an L1 tier-promotion request via the <a onClick={()=>{}} style={{color:"var(--blue)", cursor:"pointer"}}>schema promotion wizard (SM-05)</a>. L2/L3 columns can be edited.
      </div>

      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
        <select value={tbl} onChange={e=>setTbl(e.target.value)}>
          {tables.map(t => <option key={t} value={t}>{t === "all" ? "All tables" : t}</option>)}
        </select>
        <select value={tier} onChange={e=>setTier(e.target.value)}>
          <option value="all">All tiers</option><option>L1</option><option>L2</option><option>L3</option><option>L4</option>
        </select>
        <input placeholder="Search column code or label…" value={q} onChange={e=>setQ(e.target.value.toLowerCase())} style={{width:260}} />
        <span className="muted" style={{fontSize:11, alignSelf:"center"}}>{filtered.length} columns</span>
      </div>

      <Section title="Column definitions">
        <table>
          <thead><tr><th>Column code</th><th>Label</th><th>Table</th><th>Dept</th><th>Type</th><th>Tier</th><th>Storage</th><th>Req</th><th>Status</th><th>v</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r,i) => (
              <tr key={i}>
                <td className="mono" style={{fontWeight:600}}>{r.col}</td>
                <td style={{fontSize:12}}>{r.label}</td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{r.table}</span></td>
                <td className="muted" style={{fontSize:11}}>{r.dept}</td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{r.type}</span></td>
                <td><TierBadge tier={r.tier}/></td>
                <td className="muted" style={{fontSize:10}}>{r.storage}</td>
                <td>{r.req ? <span style={{color:"var(--green-700)"}}>✓</span> : <span className="muted">—</span>}</td>
                <td>{r.status === "active" ? <span className="badge badge-green" style={{fontSize:9}}>active</span> : <span className="badge badge-amber" style={{fontSize:9}}>{r.status}</span>}</td>
                <td className="mono num">v{r.version}</td>
                <td><button className="btn btn-secondary btn-sm" onClick={()=>openModal("schemaView", {col:r})}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

// ============================================================
// SCREEN 7 — SET-080 Reference data (allergens, UoM, currency, country ISO)
// spec: § SET-050 "Reference Tables Index"
// ============================================================
const ReferenceDataScreen = ({ openModal }) => {
  const tables = window.SETTINGS_REF_TABLES;
  const [active, setActive] = React.useState(tables[0].code);
  const sel = tables.find(t => t.code === active);

  // Hard-wire allergens as the showcase table
  const isAllergens = active === "allergens_reference";
  const allergens = window.SETTINGS_ALLERGENS;

  return (
    <>
      <PageHead title="Reference data" sub="Allergen families, UoM, currency, country ISO — configuration tables."
        actions={<><button className="btn btn-secondary">Import CSV</button><button className="btn btn-secondary">Export CSV</button>
                    <button className="btn btn-primary" onClick={()=>openModal("refRowEdit",{table:active})}>+ Add row</button></>} />

      <div className="sg-card-grid" style={{marginBottom:14}}>
        {tables.map(t => (
          <div key={t.code}
               className={"sg-card " + (active === t.code ? "active" : "")}
               onClick={()=>setActive(t.code)}
               style={{borderColor: active === t.code ? "var(--blue)" : undefined}}>
            <div className="sg-card-title">{t.name}</div>
            <div className="sg-card-desc" style={{marginTop:2}}>{t.desc}</div>
            <div style={{marginTop:8, display:"flex", gap:6, alignItems:"center"}}>
              <span className={"badge " + (t.marker === "UNIVERSAL" ? "badge-blue" : "badge-amber")} style={{fontSize:9}}>{t.marker}</span>
              <span className="mono muted" style={{fontSize:10}}>{t.rows} rows</span>
              <span className="muted" style={{fontSize:10, marginLeft:"auto"}}>Updated {t.updated}</span>
            </div>
          </div>
        ))}
      </div>

      <Section title={sel.name} sub={sel.desc}>
        {isAllergens ? (
          <table>
            <thead><tr><th>Code</th><th>Name (EN)</th><th>Name (PL)</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {allergens.map(a => (
                <tr key={a.code}>
                  <td className="mono" style={{fontWeight:600}}>{a.code}</td>
                  <td>{a.name_en}</td>
                  <td className="muted">{a.name_pl}</td>
                  <td>{a.active ? <span className="badge badge-green" style={{fontSize:9}}>active</span> : <span className="badge badge-gray" style={{fontSize:9}}>inactive</span>}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={()=>openModal("refRowEdit",{table:"allergens_reference", row:a})}>Edit</button>
                    {" "}
                    <button className="btn btn-secondary btn-sm" onClick={()=>openModal("deleteRef",{table:"allergens_reference", row:a})}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted" style={{padding:20, textAlign:"center"}}>
            Select the <b>Allergens reference</b> card above to see the fully-rendered reference-data grid pattern. Other tables use the same pattern with schema-driven columns.
          </div>
        )}
      </Section>
    </>
  );
};

// ============================================================
// SCREEN 8 — SET-090 Email templates (PO-to-supplier, approval, overdue)
// ============================================================
const EmailTemplatesScreen = ({ openModal }) => {
  const tpl = window.SETTINGS_EMAIL_TEMPLATES;
  return (
    <>
      <PageHead title="Email templates" sub="Trigger-driven transactional templates consumed by Planning, Shipping, QA."
        actions={<><button className="btn btn-secondary">Test send…</button><button className="btn btn-primary" onClick={()=>openModal("emailTemplateEdit")}>+ New template</button></>} />

      <Section title="Provider" sub="SMTP / API provider used to send all Monopilot transactional mail.">
        <SRow label="Provider">
          <select defaultValue="Resend"><option>Resend</option><option>Postmark</option><option>SES</option></select>
        </SRow>
        <SRow label="API key"><input type="password" defaultValue="●●●●●●●●●●●●" readOnly style={{width:200}}/><button className="btn btn-secondary btn-sm" style={{marginLeft:8}}>Rotate</button></SRow>
        <SRow label="From email"><input type="email" defaultValue="no-reply@monopilot.apex.pl" style={{width:300}}/></SRow>
        <SRow label="From name"><input defaultValue="Apex Foods · Monopilot" style={{width:300}}/></SRow>
      </Section>

      <Section title={`Templates (${tpl.length})`}>
        {tpl.length === 0 ? (
          <EmptyState icon="✉️" title="No email templates yet"
            body="Create a template to customize the emails Monopilot sends for POs, approvals, overdue reminders, and more."
            action={{label:"＋ New template", onClick:()=>openModal("emailTemplateEdit")}} />
        ) : (
          <table>
            <thead><tr><th>Trigger code</th><th>Name</th><th>Consumer</th><th>Subject preview</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {tpl.map(t => (
                <tr key={t.code}>
                  <td className="mono" style={{fontWeight:600}}>{t.code}</td>
                  <td>{t.name}</td>
                  <td className="muted" style={{fontSize:11}}>{t.consumer}</td>
                  <td className="muted" style={{fontSize:12, fontStyle:"italic", maxWidth:260}}>{t.subject}</td>
                  <td>{t.active ? <span className="badge badge-green" style={{fontSize:9}}>active</span> : <span className="badge badge-gray" style={{fontSize:9}}>off</span>}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={()=>openModal("emailTemplateEdit", {tpl:t})}>Edit →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="alert alert-blue" style={{marginTop:10, fontSize:12}}>
        Variables reference: open <b>Email variables</b> in the left nav for the full merge-field picker used inside each template body.
      </div>
    </>
  );
};

// ============================================================
// SCREEN 9 — SET-091 Email template variables (merge-field picker)
// ============================================================
const EmailVariablesScreen = () => {
  const groups = window.SETTINGS_EMAIL_VARIABLES;
  const [q, setQ] = React.useState("");
  return (
    <>
      <PageHead title="Email template variables" sub="Merge fields available inside email templates (Mustache syntax)." />

      <div className="alert alert-blue" style={{marginBottom:12, fontSize:12}}>
        Click any variable to copy to clipboard. Variables are resolved per-trigger: PO variables only populate when the trigger payload is a PO.
      </div>

      <div style={{marginBottom:10}}>
        <input placeholder="Search variable…" value={q} onChange={e=>setQ(e.target.value.toLowerCase())} style={{width:300}}/>
      </div>

      {groups.map(g => {
        const vars = g.vars.filter(v => !q || v.name.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q));
        if (vars.length === 0) return null;
        return (
          <Section key={g.group} title={g.group} sub={`${vars.length} variables`}>
            <table>
              <thead><tr><th style={{width:240}}>Variable</th><th>Description</th><th>Example value</th><th></th></tr></thead>
              <tbody>
                {vars.map(v => (
                  <tr key={v.name}>
                    <td><code className="mono" style={{background:"var(--gray-100)", padding:"2px 6px", borderRadius:3, fontSize:11}}>{v.name}</code></td>
                    <td style={{fontSize:12}}>{v.desc}</td>
                    <td className="muted mono" style={{fontSize:11}}>{v.example}</td>
                    <td><button className="btn btn-secondary btn-sm">Copy</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        );
      })}
    </>
  );
};

// ============================================================
// SCREEN — ADMIN-SHP-01 Shipping Override Reasons config
// spec: 11-SHIPPING PRD §12.7 + 02-SETTINGS §8 (v3.1 bundled delta)
// ============================================================
const ShippingOverrideReasonsScreen = ({ openModal }) => {
  const rows = window.SETTINGS_SHIP_OVERRIDE_REASONS || [];
  const rmaCodes = window.SETTINGS_RMA_REASON_CODES || [];
  const [type, setType] = React.useState("fefo_deviation");
  const types = [
    { k: "fefo_deviation",   label: "FEFO deviation" },
    { k: "expired_lp",       label: "Expired LP" },
    { k: "quality_override", label: "Quality override" },
    { k: "short_pick",       label: "Short pick" },
    { k: "hold_place",       label: "Hold · place" },
    { k: "hold_release",     label: "Hold · release" },
    { k: "cancel",           label: "SO cancel" },
    { k: "reprint",          label: "Label reprint" }
  ];
  const list = rows.filter(r => r.type === type);

  return (
    <>
      <PageHead title="Shipping override reasons" sub="Reason codes per override type. Consumed by Allocation wizard, Pack Close, SO cancel, Reprint flows in 11-SHIPPING. v3.1 delta · reference table."
        actions={<><button className="btn btn-secondary">Export CSV</button><button className="btn btn-primary" onClick={()=>openModal("refRowEdit", {table:"shipping_override_reasons"})}>+ Add reason</button></>} />

      <div className="alert alert-blue" style={{marginBottom:12, fontSize:12}}>
        ADMIN-SHP-01. Backing table: <code className="mono">shipping_override_reasons</code> (Reference data §8). Each override type resolves to a fixed enum of reason codes. "Other" supports free-text audit note.
      </div>

      <div className="sg-card-grid" style={{marginBottom:12}}>
        {types.map(t => (
          <div key={t.k}
               className={"sg-card " + (type === t.k ? "active" : "")}
               onClick={()=>setType(t.k)}
               style={{borderColor: type === t.k ? "var(--blue)" : undefined, cursor:"pointer"}}>
            <div className="sg-card-title">{t.label}</div>
            <div className="sg-card-desc" style={{marginTop:4}}>
              {rows.filter(r => r.type === t.k).length} codes
            </div>
          </div>
        ))}
      </div>

      <Section title={types.find(t => t.k === type).label + " — reason codes"} sub="Drag to reorder · Edit to rename · Deactivate to hide from new overrides (old audit rows retained).">
        <table>
          <thead><tr><th>Code</th><th>Label</th><th>Status</th><th style={{width:160}}></th></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.type + "/" + r.code}>
                <td className="mono" style={{fontWeight:600}}>{r.code}</td>
                <td>{r.label}</td>
                <td><span className="badge badge-green" style={{fontSize:9}}>active</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={()=>openModal("refRowEdit",{table:"shipping_override_reasons", row:r})}>Edit</button>
                  {" "}
                  <button className="btn btn-secondary btn-sm" onClick={()=>openModal("deleteRef",{table:"shipping_override_reasons", row:r})}>Deactivate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="RMA reason codes" sub="Backing table: rma_reason_codes · consumed by 11-SHIPPING RMA Create + QA disposition flows (v3.1 delta).">
        <table>
          <thead><tr><th>Code</th><th>Label (EN)</th><th>Label (PL)</th><th>Status</th><th style={{width:120}}></th></tr></thead>
          <tbody>
            {rmaCodes.map(r => (
              <tr key={r.code}>
                <td className="mono" style={{fontWeight:600}}>{r.code}</td>
                <td>{r.label_en}</td>
                <td className="muted">{r.label_pl}</td>
                <td>{r.active ? <span className="badge badge-green" style={{fontSize:9}}>active</span> : <span className="badge badge-gray" style={{fontSize:9}}>inactive</span>}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={()=>openModal("refRowEdit",{table:"rma_reason_codes", row:r})}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

// ============================================================
// SCREEN — ADMIN-SHP-02 D365 DLQ · Shipping view
// spec: 11-SHIPPING PRD §12.6 (reuse of 08-PROD DLQ filtered by source='shipping')
// route: /admin/integrations/d365/dlq?source=shipping
// ============================================================
const D365DlqShippingScreen = ({ openModal }) => {
  const sampleDlq = [
    { id: "outbox-2026-0421-0003", event: "shipment.confirmed", so: "SO-2026-2441", attempts: 5, firstFailed: "2026-04-21 11:18", lastFailed: "2026-04-21 13:14", err: "HTTP 401 · OAuth token expired mid-retry" }
  ];
  return (
    <>
      <PageHead title="D365 DLQ · Shipping"
        sub="Dead-letter queue for shipping-scoped outbox events. Reuse of 08-PROD DLQ ops screen filtered by source='shipping'. Route: /admin/integrations/d365/dlq?source=shipping."
        actions={<><button className="btn btn-secondary">← Back to Integrations</button><button className="btn btn-primary">Retry selected</button></>} />

      <div className="alert alert-amber" style={{marginBottom:12, fontSize:12}}>
        ADMIN-SHP-02. {sampleDlq.length} event(s) in DLQ (retry exhausted). Manual retry / discard with audit note required. Matches <code className="mono">shipping_outbox_events</code> D-SHP-14.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>In DLQ</div><div style={{ fontSize: 24, fontWeight: 700 }}>{sampleDlq.length}</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Last 24h failed</div><div style={{ fontSize: 24, fontWeight: 700 }}>3</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Last 24h delivered</div><div style={{ fontSize: 24, fontWeight: 700 }}>46</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 11 }}>Source filter</div><div style={{ fontSize: 14, fontWeight: 700 }}>source = shipping</div></div>
      </div>

      <Section title="Dead-letter events (shipping scope)" sub="Retry attempts exhausted. Manual intervention required — Admin or ops_admin role only.">
        <table>
          <thead><tr><th><input type="checkbox"/></th><th>Event</th><th>Event type</th><th>SO / Shipment</th><th>Attempts</th><th>First failed</th><th>Last failed</th><th>Error</th><th style={{width:160}}></th></tr></thead>
          <tbody>
            {sampleDlq.map(d => (
              <tr key={d.id}>
                <td><input type="checkbox"/></td>
                <td className="mono" style={{fontSize:11}}>{d.id}</td>
                <td className="mono" style={{fontSize:11}}>{d.event}</td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{d.so}</td>
                <td className="num mono">{d.attempts}/5</td>
                <td className="mono" style={{fontSize:11}}>{d.firstFailed}</td>
                <td className="mono" style={{fontSize:11}}>{d.lastFailed}</td>
                <td style={{fontSize:11}} className="muted">{d.err}</td>
                <td>
                  <button className="btn btn-primary btn-sm">Retry</button>
                  {" "}
                  <button className="btn btn-secondary btn-sm">Inspect payload</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Retry log (last 12 hours)">
        <table>
          <thead><tr><th>When</th><th>Event</th><th>Attempt</th><th>Outcome</th></tr></thead>
          <tbody>
            <tr><td className="mono">13:14</td><td className="mono" style={{fontSize:11}}>shipment.confirmed · SO-2026-2441</td><td className="num mono">5</td><td><span className="badge badge-red">✗ 401 Unauthorized · → DLQ</span></td></tr>
            <tr><td className="mono">12:48</td><td className="mono" style={{fontSize:11}}>shipment.confirmed · SO-2026-2447</td><td className="num mono">1</td><td><span className="badge badge-green">✓ Delivered</span></td></tr>
            <tr><td className="mono">12:30</td><td className="mono" style={{fontSize:11}}>shipment.confirmed · SO-2026-2446</td><td className="num mono">1</td><td><span className="badge badge-green">✓ Delivered</span></td></tr>
            <tr><td className="mono">11:18</td><td className="mono" style={{fontSize:11}}>shipment.confirmed · SO-2026-2441</td><td className="num mono">1</td><td><span className="badge badge-amber">↻ 429 Throttled · retrying</span></td></tr>
          </tbody>
        </table>
      </Section>
    </>
  );
};

Object.assign(window, {
  TierBadge, TypeBadge, StatusPill,
  D365ConnectionScreen, D365MappingScreen,
  RulesRegistryScreen, RuleDetailScreen,
  FlagsAdminScreen, SchemaBrowserScreen,
  ReferenceDataScreen, EmailTemplatesScreen, EmailVariablesScreen,
  ShippingOverrideReasonsScreen, D365DlqShippingScreen
});
