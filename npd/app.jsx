// ============================================================================
// NPD module · app.jsx — Root app — routing + Pattern A modal mount
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============ Main App — router + Pattern A modal state (MODAL-SCHEMA §3) ============

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "pipelineView": "kanban",
  "editorLayout": "deep",
  "approvalMode": "single",
  "density": "comfortable"
}/*EDITMODE-END*/;

// ---- BL-NPD-03: permission matrix + role-aware helper ----
window.npd_can = (permission) => {
  const role = window.NPD_CURRENT_ROLE || 'npd_manager';
  const matrix = {
    'fa.create':            ['npd_manager', 'core_user', 'admin'],
    'fa.delete':            ['npd_manager', 'admin'],
    'brief.create':         ['npd_manager', 'core_user', 'admin'],
    'brief.convert_to_fa':  ['npd_manager', 'admin'],
    'core.write':           ['npd_manager', 'core_user', 'admin'],
    'dept.write':           ['npd_manager', 'dept_manager', 'dept_user', 'admin'],
    'dashboard.view':       ['npd_manager', 'core_user', 'dept_manager', 'dept_user', 'admin', 'viewer'],
    'd365_builder.execute': ['npd_manager'],
  };
  return (matrix[permission] || []).includes(role);
};

const NPD_ROLES = ['npd_manager', 'core_user', 'dept_manager', 'dept_user', 'admin', 'viewer'];

const App = () => {
  const [route, setRoute] = React.useState(() => {
    try {
      if (localStorage.getItem("npd-layout-v") !== "2") {
        localStorage.setItem("npd-layout-v", "2");
        localStorage.removeItem("npd-route");
        return { screen: "pipeline" };
      }
      return JSON.parse(localStorage.getItem("npd-route")) || { screen: "pipeline" };
    } catch { return { screen: "pipeline" }; }
  });
  const [role, setRole] = React.useState(() => localStorage.getItem("npd-role") || "rd");
  const [npdRole, setNpdRole] = React.useState(() => {
    const stored = localStorage.getItem("npd-current-role") || "npd_manager";
    window.NPD_CURRENT_ROLE = stored;
    return stored;
  });
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);

  const handleNpdRoleChange = (r) => {
    window.NPD_CURRENT_ROLE = r;
    localStorage.setItem("npd-current-role", r);
    setNpdRole(r);
  };

  // Pattern A — centralized modal switch
  const [modal, setModal] = React.useState(null); // { name, data }
  const openModal  = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  React.useEffect(() => { localStorage.setItem("npd-route", JSON.stringify(route)); }, [route]);
  React.useEffect(() => { localStorage.setItem("npd-role", role); }, [role]);
  React.useEffect(() => { document.body.className = tweaks.density === "compact" ? "density-compact" : ""; }, [tweaks.density]);
  // Keep window.NPD_CURRENT_ROLE in sync whenever npdRole state changes
  React.useEffect(() => { window.NPD_CURRENT_ROLE = npdRole; }, [npdRole]);

  // tweaks activation protocol
  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const nav = (s) => setRoute({ screen: s });
  const openFA = (fa_code) => setRoute({ screen: "fa_detail", fa_code });
  const openBrief = (brief_id) => setRoute({ screen: "brief_detail", brief_id });
  const openProject = (id) => setRoute({ screen: "project", projectId: id, stage: "brief" });

  const project = route.projectId ? window.NPD_PROJECTS.find(p => p.id === route.projectId) : null;

  // top-level sidebar nav
  const sidebarNav = (s) => setRoute({ screen: s });

  // subnav click
  const subnavNav = (s) => {
    if (s === "fa_detail" || s === "brief_detail" || s === "formulation_editor" || s === "d365_builder" || s === "config_detail") return;
    setRoute({ screen: s });
  };

  let content;
  switch (route.screen) {
    // --- FA-centric spec screens ---
    case "dashboard":        content = <NpdDashboard openModal={openModal} onOpenFA={openFA} />; break;
    case "fa_list":          content = <FAList onOpenFA={openFA} openModal={openModal} initialView="table" />; break;
    case "fa_kanban":        content = <FAList onOpenFA={openFA} openModal={openModal} initialView="kanban" />; break;
    case "fa_detail":        content = <FADetail faCode={route.fa_code} onBack={() => nav("fa_list")} openModal={openModal} />; break;
    case "briefs":           content = <BriefList onOpenBrief={openBrief} openModal={openModal} />; break;
    case "brief_detail":     content = <BriefDetail briefId={route.brief_id} onBack={() => nav("briefs")} openModal={openModal} />; break;
    case "formulations":     content = <FormulationList onOpenFA={openFA} />; break;
    case "formulation_editor": content = <FormulationEditor faCode={route.fa_code} onBack={() => nav("fa_list")} />; break;
    case "allergens":        content = <AllergenCascade onOpenFA={openFA} openModal={openModal} initialFa={route.fa_code} />; break;
    case "d365_builder":     content = <D365BuilderOutput faCode={route.fa_code} onBack={() => openFA(route.fa_code)} openModal={openModal} />; break;
    case "gallery":          content = <NpdModalGallery onNav={nav} />; break;

    // --- Configuration (workflow builder per tenant) ---
    case "config":           content = <ConfigList onOpenConfig={(id) => setRoute({ screen: "config_detail", configId: id })} openModal={openModal} />; break;
    case "config_detail":    content = <ConfigDetail configId={route.configId} onBack={() => nav("config")} openModal={openModal} />; break;

    // --- Legacy R&D pipeline flow (kept as parallel workflow) ---
    case "pipeline":
      content = <Pipeline
        onOpen={openProject}
        onNew={() => setRoute({ screen: "new" })}
        pipelineView={tweaks.pipelineView}
        setPipelineView={v => { setTweaks(t => ({ ...t, pipelineView: v })); window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { pipelineView: v } }, "*"); }}
        role={role} />;
      break;

    case "new":
      content = <CreateProjectWizard
        onCancel={() => setRoute({ screen: "pipeline" })}
        onComplete={() => setRoute({ screen: "project", projectId: "NPD-024", stage: "recipe" })} />;
      break;

    case "project":
      if (project) {
        content = (
          <>
            <ProjectHeader project={project} onBack={() => setRoute({ screen: "pipeline" })} openModal={openModal} />
            <StageRail project={project} current={route.stage} onNav={(stage) => setRoute(r => ({ ...r, stage }))} />
            {route.stage === "brief"      && <BriefScreen project={project} />}
            {route.stage === "recipe"     && <RecipeScreen project={project} />}
            {/* Fix-1 NPD: removed `nutrition` (Nutri-Score → 09-QUALITY/03-TECHNICAL)
                and `costing` (cost roll → 10-FINANCE Phase C4) — PRD §1.2 out-of-scope. */}
            {route.stage === "packaging"  && <PackagingScreen />}
            {route.stage === "trial"      && <TrialScreen />}
            {route.stage === "sensory"    && <SensoryScreen />}
            {route.stage === "pilot"      && <PilotScreen />}
            {route.stage === "approval"   && <ApprovalScreen approvalMode={tweaks.approvalMode} />}
            {route.stage === "handoff"    && <HandoffScreen />}
            {route.stage === "checklist"  && <GateChecklistPanel project={project} openModal={openModal} />}
            {route.stage === "history"    && <ApprovalHistoryTimeline project={project} />}
          </>
        );
      }
      break;

    default:
      content = <ScaffoldedScreen
        breadcrumb={<><a>NPD</a> / {route.screen}</>}
        title={route.screen[0].toUpperCase() + route.screen.slice(1)}
        spec="01-NPD-UX.md · not routed"
        phase="Phase A1"
        notes="This entry is reachable from sub-nav but no component is routed yet. Add a case in app.jsx switch to render a screen." />;
  }

  const activeModal = modal?.name;

  return (
    <>
      {/* BL-NPD-03 — dev-only role switcher banner */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
        background: "#fef3c7", borderBottom: "2px solid #f59e0b",
        padding: "4px 16px", display: "flex", alignItems: "center", gap: 10,
        fontSize: 12, fontWeight: 600, color: "#92400e"
      }}>
        <span>🔐 Prototype role:</span>
        <select
          value={npdRole}
          onChange={e => handleNpdRoleChange(e.target.value)}
          style={{ fontSize: 12, fontWeight: 600, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4, padding: "1px 6px", color: "#92400e" }}>
          {NPD_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontWeight: 400, color: "#b45309" }}>— permissions update instantly · not visible in production</span>
      </div>
      <div style={{ paddingTop: 30 }}>
      <Sidebar current={"npd"} onNav={sidebarNav} />
      <Topbar role={role} setRole={setRole} />
      <SubNav current={route.screen} onNav={subnavNav} role={role} />

      <div id="main">{content}</div>

      {/* Central modal mount — Pattern A */}
      {activeModal === "faCreate"         && <FACreateModal         open onClose={closeModal} data={modal.data} />}
      {activeModal === "briefCreate"      && <BriefCreateModal      open onClose={closeModal} data={modal.data} />}
      {activeModal === "briefConvert"     && <BriefConvertModal     open onClose={closeModal} data={modal.data} />}
      {activeModal === "deptClose"        && <DeptCloseModal        open onClose={closeModal} data={modal.data} />}
      {activeModal === "d365Build"        && <D365BuildModal        open onClose={closeModal} data={modal.data} />}
      {activeModal === "versionCompare"   && <VersionCompareModal   open onClose={closeModal} data={modal.data} />}
      {activeModal === "riskAdd"          && <RiskAddModal          open onClose={closeModal} data={modal.data} />}
      {activeModal === "faDelete"         && <FADeleteModal         open onClose={closeModal} data={modal.data} />}
      {activeModal === "allergenOverride" && <AllergenOverrideModal open onClose={closeModal} data={modal.data} />}
      {activeModal === "d365Wizard"       && <D365WizardModal       open onClose={closeModal} data={modal.data} />}
      {activeModal === "versionSave"      && <VersionSaveModal      open onClose={closeModal} data={modal.data} />}
      {activeModal === "formulationLock"  && <FormulationLockModal  open onClose={closeModal} data={modal.data} />}
      {activeModal === "allergenRefresh"  && <AllergenRefreshModal  open onClose={closeModal} data={modal.data} />}
      {activeModal === "docUpload"        && <DocUploadModal        open onClose={closeModal} data={modal.data} />}
      {activeModal === "refreshD365"      && <RefreshD365Modal      open onClose={closeModal} data={modal.data} />}
      {activeModal === "activateTemplate" && <ActivateTemplateModal open onClose={closeModal} data={modal.data} />}
      {activeModal === "addField"         && <AddFieldModal         open onClose={closeModal} data={modal.data} />}
      {activeModal === "addDepartment"    && <AddDepartmentModal    open onClose={closeModal} data={modal.data} />}
      {activeModal === "requestChanges"   && <RequestChangesModal   open onClose={closeModal} data={modal.data} />}
      {activeModal === "advanceGate"     && <AdvanceGateModal     open onClose={closeModal} data={modal.data} />}
      {activeModal === "gateApproval"    && <GateApprovalModal    open onClose={closeModal} data={modal.data} />}

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} setTweaks={setTweaks} />
      </div>
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
