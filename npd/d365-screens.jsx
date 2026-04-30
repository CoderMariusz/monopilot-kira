// ============================================================================
// NPD module · d365-screens.jsx — D365 build output preview
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============================================================================
// SCR-11 — D365 Builder Output
// Jane's page to initiate D365 Builder generation, see pre-flight status, and
// download the generated Excel handoff file.
// ============================================================================

const D365BuilderOutput = ({ faCode, onBack, openModal }) => {
  const fa = window.NPD_FAS.find(f => f.fa_code === faCode) || window.NPD_FAS.find(f => f.status_overall === "Complete") || window.NPD_FAS[2];
  const output = window.NPD_D365_OUTPUT[fa.fa_code];

  const validations = {
    V01: { ok: true,  label: "FG Code format"      },
    V02: { ok: true,  label: "Product Name"        },
    V03: { ok: true,  label: "Pack Size"           },
    V04: { ok: fa.status_overall === "Complete", label: "D365 material codes", warn: true },
    V05: { ok: fa.status_overall === "Complete" || fa.built, label: "All 7 depts closed" },
    V06: { ok: true,  label: "WIP Code suffix match" },
    V07: { ok: fa.closed_technical === "Yes", label: "Allergen declaration" },
    V08: { ok: true,  label: "Brief mapping"       }
  };
  const allPass = Object.values(validations).every(v => v.ok);
  const canBuild = fa.status_overall === "Complete" && allPass;

  return (
    <>
      <div className="breadcrumb"><a onClick={onBack}>NPD</a> / <a onClick={onBack}>Finished Goods</a> / {fa.fa_code} / D365 Builder</div>
      <div className="page-head">
        <div>
          <div className="page-title">D365 Builder — {fa.fa_code}</div>
          <div className="muted" style={{ fontSize: 12 }}>{fa.product_name} · single-click + MFA flow · ~5s generation</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back to FG</button>
          <button className="btn btn-ghost" onClick={() => openModal("d365Wizard", { fa })}>Guided build →</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Pre-flight panel */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Pre-flight status</div>
            {alertBadge(fa.status_overall)}
          </div>
          <table style={{ fontSize: 12 }}>
            <tbody>
              {window.NPD_VALIDATION_RULES.map(r => {
                const v = validations[r.id];
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ width: 38 }}>{r.id}</td>
                    <td>{v.label}</td>
                    <td style={{ width: 90, textAlign: "right" }}>
                      {v.ok ? <span className="badge badge-green">✓ PASS</span> : <span className="badge badge-red">✗ FAIL</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="alert alert-amber">
            <strong>MFA required.</strong> Executing D365 Builder requires re-authentication. Limit: 3 failed attempts, 60s lockout.
          </div>

          <button className="btn btn-success"
                  disabled={!canBuild}
                  style={{ width: "100%", padding: "12px 16px", fontSize: 14, marginTop: 6 }}
                  onClick={() => openModal("d365Build", { fa })}>
            {output ? "↻ Rebuild D365 output" : "Build D365 output →"}
          </button>
          {!canBuild && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6, textAlign: "center" }}>
              FG must be <strong>Complete</strong> with all 7 departments closed and V01-V08 all PASS/WARN.
            </div>
          )}
        </div>

        {/* Output panel */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Build output</div>
              {output && <div className="muted" style={{ fontSize: 11 }}>Generated {output.generated_at}</div>}
            </div>
            {output && <span className="badge badge-blue">⚡ Built</span>}
          </div>

          {!output && (
            <div className="muted" style={{ padding: 26, textAlign: "center", fontSize: 13 }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>◇</div>
              FG not yet built. Run pre-flight checks, then click <strong>Build D365 output</strong>.
            </div>
          )}

          {output && (
            <>
              <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>📄 {output.filename}</div>
                <div className="muted" style={{ fontSize: 11 }}>Paste-ready Excel for D365 import · <span className="mono">item.created_from_npd = true</span></div>
              </div>
              <table style={{ fontSize: 12 }}>
                <thead><tr><th>Tab</th><th style={{ textAlign: "right" }}>Rows generated</th></tr></thead>
                <tbody>
                  {output.tabs.map(t => (
                    <tr key={t.tab}>
                      <td className="mono">{t.tab}</td>
                      <td className="mono num" style={{ textAlign: "right" }}>{t.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }}>↓ Download Builder file</button>
                <button className="btn btn-secondary">View BOM →</button>
              </div>
              <div className="alert alert-amber" style={{ marginTop: 10, fontSize: 12 }}>
                <strong>V-NPD-BUILD-001:</strong> Built flag resets if any FG field is edited. Re-run Builder after changes.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>D365 Constants embedded in build</div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>Read-only from <span className="mono">Reference.D365_Constants</span>. Edit requires admin (Settings · Phase C1).</div>
        <table style={{ fontSize: 12 }}>
          <tbody>
            {window.NPD_D365_CONSTANTS.map(c => (
              <tr key={c.k}>
                <td className="mono" style={{ width: 260 }}>{c.k}</td>
                <td className="mono" style={{ color: "var(--blue)", fontWeight: 600 }}>{c.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

Object.assign(window, { D365BuilderOutput });
