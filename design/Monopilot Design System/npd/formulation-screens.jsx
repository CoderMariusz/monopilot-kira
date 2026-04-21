// ============================================================================
// SCR-06 Formulation list (module-level) + SCR-07 Formulation editor
// These are top-level sub-nav entries. SCR-06/07 reach same concept as
// per-FA Formulations tab (fa-screens.jsx) but listed across all FAs.
// ============================================================================

const FormulationList = ({ onOpenFA }) => {
  // Flatten all versions across FAs
  const rows = [];
  Object.entries(window.NPD_FORMULATION_VERSIONS).forEach(([fa, versions]) => {
    versions.forEach(v => rows.push({ ...v, fa }));
  });
  // Add synthesized rows for other FAs for plausibility
  window.NPD_FAS.forEach(f => {
    if (!window.NPD_FORMULATION_VERSIONS[f.fa_code]) {
      rows.push({ version: "v0.1", status: "draft", effective_from: f.created_at || "2026-03-01", effective_to: null, items: 8, allergens: "—", created_by: f.owner, fa: f.fa_code });
    }
  });

  const [fa, setFa]       = React.useState("All");
  const [status, setStat] = React.useState("All");

  const filtered = rows.filter(r => {
    if (fa !== "All" && r.fa !== fa) return false;
    if (status !== "All" && r.status !== status.toLowerCase()) return false;
    return true;
  });

  return (
    <>
      <div className="breadcrumb"><a>NPD</a> / Formulations</div>
      <div className="page-head">
        <div>
          <div className="page-title">Formulations</div>
          <div className="muted" style={{ fontSize: 12 }}>Cross-FA view of all formulation versions · {filtered.length} of {rows.length}</div>
        </div>
      </div>

      <div className="card" style={{ padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12 }}>FA:</label>
          <select value={fa} onChange={e => setFa(e.target.value)} style={{ width: "auto" }}>
            <option>All</option>
            {window.NPD_FAS.map(f => <option key={f.fa_code}>{f.fa_code}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>Status:</label>
          <select value={status} onChange={e => setStat(e.target.value)} style={{ width: "auto" }}>
            <option>All</option><option>Draft</option><option>Locked</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th>FA</th><th>Version</th><th>Status</th><th>Effective from</th><th>Effective to</th><th>Items</th><th>Allergens</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td className="mono"><a style={{ color: "var(--blue)", cursor: "pointer" }} onClick={() => onOpenFA(r.fa)}>{r.fa}</a></td>
                <td className="mono" style={{ fontWeight: 600 }}>{r.version}</td>
                <td>{r.status === "locked" ? <span className="badge badge-green">🔒 Locked</span> : <span className="badge badge-amber">Draft</span>}</td>
                <td className="mono">{r.effective_from}</td>
                <td className="mono">{r.effective_to || <span className="muted">current</span>}</td>
                <td className="mono num">{r.items}</td>
                <td>{r.allergens}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => onOpenFA(r.fa)}>Open FA</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// SCR-07 — Formulation editor (ProdDetail dedicated page for multi-component FAs)
const FormulationEditor = ({ faCode, onBack }) => {
  const fa = window.NPD_FAS.find(f => f.fa_code === faCode) || window.NPD_FAS.find(f => f.template.startsWith("Multi")) || window.NPD_FAS[2];
  const rows = window.NPD_PROD_DETAIL[fa.fa_code] || window.NPD_PROD_DETAIL.FA5603;
  const [expanded, setExpanded] = React.useState(new Set([0]));

  const toggle = (i) => setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <>
      <div className="breadcrumb"><a onClick={onBack}>NPD</a> / <a onClick={onBack}>Factory Articles</a> / {fa.fa_code} / Production Detail</div>
      <div className="page-head">
        <div>
          <div className="page-title">Production detail — {fa.fa_code}</div>
          <div className="muted" style={{ fontSize: 12 }}>{fa.product_name} · multi-component editor · auto-save on blur</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back to FA</button>
          <button className="btn btn-primary">Save all</button>
        </div>
      </div>

      {rows.map((r, i) => {
        const open = expanded.has(i);
        return (
          <div key={i} className="card" style={{ padding: 0 }}>
            <div onClick={() => toggle(i)} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", borderBottom: open ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
              <span className="mono" style={{ fontWeight: 600, color: "var(--blue)" }}>{r.pr_code}</span>
              <span>{r.component}</span>
              <span className="muted mono">{r.weight_g}g</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <span className="badge badge-gray">Line {r.line}</span>
                <span className="badge badge-gray">Yield {r.yield_line}%</span>
                {r.v06 === "pass" ? <span className="badge badge-green">V06 ✓</span> : <span className="badge badge-amber">V06 ⚠</span>}
              </span>
            </div>
            {open && (
              <div style={{ padding: 14 }}>
                <div className="form-grid">
                  {[1, 2, 3, 4].map(n => (
                    <React.Fragment key={n}>
                      <div className="field"><label>Process {n}</label>
                        <select defaultValue={r["process_" + n]}>
                          <option value="">—</option>
                          {window.NPD_REF.processes.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Yield P{n} %</label>
                        <input type="number" defaultValue={r["yield_p" + n] || ""} />
                      </div>
                    </React.Fragment>
                  ))}
                  <div className="field"><label>Line *</label>
                    <select defaultValue={r.line}>{window.NPD_REF.lines.map(l => <option key={l}>{l}</option>)}</select>
                  </div>
                  <div className="field"><label>Dieset (auto)</label>
                    <input className="mono" value={r.dieset} readOnly style={{ background: "#E0FFE0" }} />
                  </div>
                  <div className="field"><label>Yield Line % *</label><input type="number" defaultValue={r.yield_line} /></div>
                  <div className="field"><label>Staffing</label><input defaultValue={r.staffing} /></div>
                  <div className="field"><label>Rate *</label><input type="number" defaultValue={r.rate} /></div>
                  <div className="field"><label>PR Code Final (auto)</label>
                    <input className="mono" value={r.pr_code_final} readOnly style={{ background: "#E0FFE0" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

Object.assign(window, { FormulationList, FormulationEditor });
