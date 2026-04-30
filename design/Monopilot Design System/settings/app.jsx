// ============ Main Settings App ============

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "usersView": "table",
  "intLayout": "categories",
  "density": "comfortable"
}/*EDITMODE-END*/;

// BomsScreen defined in data-screens.jsx (BL-SET-12 fix: removed duplicate stub)

const Placeholder = ({ title }) => (
  <div className="sg-section" style={{ padding: 40, textAlign: "center" }}>
    <div style={{ fontSize: 32, marginBottom: 8 }}>◇</div>
    <div className="sg-section-title">{title}</div>
    <div className="muted" style={{ fontSize: 12, maxWidth: 360, margin: "6px auto 0" }}>This section is reachable but not expanded in this prototype.</div>
  </div>
);

// ---------- Audit log (simple) ----------
const AuditLogScreen = () => (
  <>
    <PageHead title="Audit log" sub="Every configuration change, with who and when." />
    <Section title="Recent activity">
      <table>
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th><th>IP</th></tr></thead>
        <tbody>
          <tr><td className="mono">14:22</td><td>K. Nowak</td><td>Updated recipe</td><td>NPD-024 · v0.3</td><td className="mono muted">192.168.1.42</td></tr>
          <tr><td className="mono">13:58</td><td>A. Zając</td><td>Approved user invite</td><td>t.kowalski@forz.pl</td><td className="mono muted">192.168.1.88</td></tr>
          <tr><td className="mono">11:45</td><td>M. Wiśniewska</td><td>Paired device</td><td>DEV-005 · Line 3</td><td className="mono muted">192.168.1.66</td></tr>
          <tr><td className="mono">09:12</td><td>System</td><td>Sync failed</td><td>SAP S/4HANA</td><td className="mono muted">—</td></tr>
          <tr><td className="mono">08:30</td><td>A. Zając</td><td>Enabled feature flag</td><td>OEE Analytics</td><td className="mono muted">192.168.1.88</td></tr>
        </tbody>
      </table>
    </Section>
  </>
);

const App = () => {
  const [route, setRoute] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("settings-route")) || { screen: "profile" }; }
    catch { return { screen: "profile" }; }
  });
  const [role, setRole] = React.useState(() => localStorage.getItem("settings-role") || "admin");
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  // Pattern A — single switch for all settings modals (MODAL-SCHEMA §3)
  const [modal, setModal] = React.useState(null); // { name, data }
  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  React.useEffect(() => { localStorage.setItem("settings-route", JSON.stringify(route)); }, [route]);
  React.useEffect(() => { localStorage.setItem("settings-role", role); }, [role]);
  React.useEffect(() => { document.body.className = tweaks.density === "compact" ? "density-compact" : ""; }, [tweaks.density]);

  React.useEffect(() => {
    const h = (e) => {
      if (e.data?.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", h);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", h);
  }, []);

  const nav = (s) => setRoute({ screen: s });
  const openEditor = (id) => setRoute({ screen: "label-editor", templateId: id });
  const openRule   = (code) => setRoute({ screen: "rule-detail", ruleCode: code });

  const content = (() => {
    const s = route.screen;
    // admin-only guard: if role=user and admin-only screen, show profile
    const adminOnly = ["profile", "sites", "warehouses", "shifts", "products", "boms", "partners", "units",
                       "users", "security", "devices", "notifications", "features", "integrations",
                       "labels", "label-editor", "audit",
                       // Admin group
                       "d365-conn", "d365-mapping", "rules", "rule-detail", "flags", "schema",
                       "reference", "email-config", "email-vars", "promotions", "gallery"];
    if (role === "user" && adminOnly.includes(s) && s !== "my-profile" && s !== "my-notifications") {
      return (
        <>
          <div className="alert alert-amber"><strong>Admin-only section.</strong> Switched to your personal settings.</div>
          <MyProfileScreen />
        </>
      );
    }

    switch (s) {
      case "profile":        return <CompanyProfile />;
      case "sites":          return <SitesScreen />;
      case "warehouses":     return <WarehousesScreen />;
      case "shifts":         return <ShiftsScreen />;
      case "products":       return <ProductsScreen />;
      case "boms":           return <BomsScreen />;
      case "partners":       return <PartnersScreen />;
      case "units":          return <UnitsScreen />;
      case "users":          return <UsersScreen viewMode={tweaks.usersView} />;
      case "security":       return <SecurityScreen />;
      case "devices":        return <DevicesScreen />;
      case "notifications":  return <NotificationsScreen />;
      case "features":       return <FeaturesScreen />;
      case "integrations":   return <IntegrationsScreen style={tweaks.intLayout} />;
      case "labels":         return <LabelTemplatesScreen openEditor={openEditor} />;
      case "label-editor":   return <LabelEditor onBack={() => setRoute({ screen: "labels" })} />;
      case "audit":          return <AuditLogScreen />;
      // ---- Admin / cross-module group ----
      case "d365-conn":      return <D365ConnectionScreen openModal={openModal} />;
      case "d365-mapping":   return <D365MappingScreen openModal={openModal} />;
      case "rules":          return <RulesRegistryScreen onOpenRule={openRule} openModal={openModal} />;
      case "rule-detail":    return <RuleDetailScreen ruleCode={route.ruleCode} onBack={() => setRoute({ screen: "rules" })} openModal={openModal} />;
      case "flags":          return <FlagsAdminScreen openModal={openModal} />;
      case "schema":         return <SchemaBrowserScreen openModal={openModal} />;
      case "reference":      return <ReferenceDataScreen openModal={openModal} />;
      case "email-config":   return <EmailTemplatesScreen openModal={openModal} />;
      case "email-vars":     return <EmailVariablesScreen />;
      case "promotions":     return <PromotionsScreen openModal={openModal} />;
      case "gallery":        return <ModalGallery onNav={nav} />;
      case "my-profile":     return <MyProfileScreen />;
      case "my-notifications": return <MyNotificationsScreen />;
      default:               return <ScaffoldedScreen breadcrumb="Settings" title={s} spec="02-SETTINGS-UX.md" phase="Phase 2" notes="Designed in spec but not yet built. Use the nav to reach implemented screens." />;
    }
  })();

  return (
    <>
      <SSidebar current="settings" />
      <STopbar role={role} setRole={setRole} />
      <SettingsNav current={route.screen} onNav={nav} role={role} />
      <div id="settings-main">{content}</div>
      <SettingsTweaks open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} setTweaks={setTweaks} />

      {/* Pattern A: central modal mount — one place, switched by name */}
      {modal?.name === "ruleDryRun"        && <RuleDryRunModal            open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "flagEdit"          && <FlagEditModal              open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "schemaView"        && <SchemaViewModal            open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "emailTemplateEdit" && <EmailTemplateEditModal     open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "promoteL2"         && <PromoteToL2Modal           open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "userInvite"        && <UserInviteModal            open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "roleAssign"        && <RoleAssignModal            open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "d365Test"          && <D365TestConnectionModal    open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "passwordReset"     && <PasswordResetModal         open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "deleteRef"         && <DeleteReferenceDataModal   open={true} onClose={closeModal} data={modal.data} />}
      {modal?.name === "refRowEdit"        && <RefRowEditModal            open={true} onClose={closeModal} data={modal.data} />}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
