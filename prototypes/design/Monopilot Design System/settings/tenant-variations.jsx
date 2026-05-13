// ============================================================
// SET-060 — Tenant Variations Dashboard
// route: /settings/tenant
// spec: design/02-SETTINGS-UX.md §SET-060 (line 896)
// ============================================================

const KpiCard = ({ label, value, accent, sub }) => (
  <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", flex: 1 }}>
    <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 600, color: accent || "var(--text)", marginTop: 4, lineHeight: 1.1 }}>{value}</div>
    {sub && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </div>
);

const DEPT_LABELS = {
  core: "Core", technical: "Technical", technical_rd: "Technical R&D", technical_qa: "Technical QA",
  packaging: "Packaging", mrp: "MRP", planning: "Planning", production: "Production", price: "Price",
  food_safety: "Food Safety",
};
const deptLabel = (c) => DEPT_LABELS[c] || c;

const DeptActionBadge = ({ action }) => {
  const map = { split: "badge-amber", merge: "badge-blue", add: "badge-green" };
  return <span className={"badge " + (map[action] || "badge-gray")} style={{ fontSize: 9, textTransform: "uppercase" }}>{action}</span>;
};

const AuthPolicyStatusBadge = ({ status }) => {
  if (status === "Enabled")       return <span className="badge badge-green" style={{ fontSize: 10 }}>● Enabled</span>;
  if (status === "Misconfigured") return <span className="badge badge-amber" style={{ fontSize: 10 }}>⚠ Misconfigured</span>;
  if (status === "Disabled")      return <span className="badge badge-gray"  style={{ fontSize: 10 }}>○ Disabled</span>;
  return <span className="badge badge-gray" style={{ fontSize: 10 }}>{status}</span>;
};

const TenantVariationsScreen = ({ openModal, onNav }) => {
  const t = window.SETTINGS_TENANT;

  return (
    <>
      <PageHead
        title="Tenant configuration"
        sub="Active L2 variations and L3 extensions for this tenant. All changes here scope to your organisation only."
        actions={<>
          <button className="btn btn-secondary btn-sm" onClick={() => onNav && onNav("tenant-history")}>View upgrade history →</button>
        </>}
      />

      {/* KPI row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <KpiCard label="Dept overrides" value={t.dept_overrides.length} accent="var(--blue)" sub="Active L2 dept variants." />
        <KpiCard label="Rule variants" value={t.rule_variants.filter(r => r.current !== r.available[0]).length}
                 sub={`${t.rule_variants.length} configurable · ${t.rule_variants.filter(r => r.current !== r.available[0]).length} customized`} />
        <KpiCard label="Schema extensions (L3)" value={t.schema_extensions_l3} sub="Org-specific column additions." />
        <KpiCard label="Last upgrade" value={t.last_upgrade} sub="rule_engine v2 progressive rollout." />
      </div>

      {/* Dept Overrides */}
      <Section
        title="Department overrides"
        sub={`${t.dept_overrides.length} active dept_overrides`}
        action={<button className="btn btn-secondary btn-sm" onClick={() => onNav && onNav("tenant-depts")}>Edit dept taxonomy →</button>}>
        {t.dept_overrides.length === 0 ? (
          <div className="muted" style={{ padding: 14, fontSize: 13 }}>
            No tenant variations configured. Your organization uses the standard baseline.
          </div>
        ) : (
          <table style={{ width: "100%" }}>
            <thead><tr><th style={{ width: 80 }}>Action</th><th>Source</th><th>Targets</th><th>Columns affected</th><th>Last modified</th><th>By</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {t.dept_overrides.map((d) => (
                <tr key={d.id}>
                  <td><DeptActionBadge action={d.action} /></td>
                  <td>{d.source ? <span style={{ fontSize: 13 }}>{deptLabel(d.source)}</span> : <span className="muted">—</span>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {d.targets.map((tg) => <span key={tg} className="badge badge-gray" style={{ fontSize: 10 }}>{deptLabel(tg)}</span>)}
                    </div>
                  </td>
                  <td className="mono num">{d.column_count}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{d.updated}</td>
                  <td style={{ fontSize: 12 }}>{d.by}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => onNav && onNav("tenant-depts")}>Edit →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Rule Variants */}
      <Section
        title="Rule variant overrides"
        sub={`${t.rule_variants.length} rules configurable`}
        action={<button className="btn btn-secondary btn-sm" onClick={() => onNav && onNav("tenant-rules")}>Change variants →</button>}>
        <table style={{ width: "100%" }}>
          <thead><tr><th>Rule code</th><th>Current variant</th><th>Available variants</th><th>Last changed</th></tr></thead>
          <tbody>
            {t.rule_variants.map((r) => {
              const customized = r.current !== r.available[0];
              return (
                <tr key={r.code}>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{r.code}</td>
                  <td>
                    <span className={"badge " + (customized ? "badge-amber" : "badge-gray")} style={{ fontSize: 10 }}>{r.current}</span>
                    {customized && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>(custom)</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {r.available.map((v) => (
                        <span key={v} className={"badge " + (v === r.current ? "badge-blue" : "badge-gray")} style={{ fontSize: 9 }}>{v}</span>
                      ))}
                    </div>
                  </td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{r.last_changed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* Authorization Policies — required by T-100 acceptance */}
      <Section
        title="Authorization policies"
        sub="Per-tenant policy state. Misconfigured policies block their workflows until resolved."
        action={<a href="#" onClick={(e) => { e.preventDefault(); onNav && onNav("authorization"); }} className="btn btn-secondary btn-sm">Open policy editor →</a>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, padding: "4px 0" }}>
          {t.authorization_policies.map((p) => (
            <div key={p.id} style={{ padding: 14, background: p.status === "Misconfigured" ? "var(--amber-050a)" : "#fff",
                                     border: "1px solid " + (p.status === "Misconfigured" ? "var(--amber)" : "var(--border)"),
                                     borderRadius: "var(--radius)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{p.id}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{p.label}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{p.desc}</div>
                </div>
                <AuthPolicyStatusBadge status={p.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span className="muted mono" style={{ fontSize: 10 }}>Updated {p.updated}</span>
                <a href={p.policy_route} onClick={(e) => { e.preventDefault(); onNav && onNav("authorization"); }}
                   style={{ color: "var(--blue)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                  Configure →
                </a>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Feature flags L2 callout */}
      <Section title="Tenant feature flags (L2 local)" sub="Per-tenant Phase 2/3 toggles. Full flag management is in the Feature Flags screen.">
        <div className="muted" style={{ padding: "8px 0", fontSize: 13 }}>
          For full flag management open <a onClick={() => onNav && onNav("flags")} style={{ color: "var(--blue)", cursor: "pointer" }}>Feature flags →</a>.
        </div>
      </Section>
    </>
  );
};

Object.assign(window, { TenantVariationsScreen });
