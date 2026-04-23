// ============ Main App — router + Pattern A modal state (MODAL-SCHEMA §3) ============

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "pipelineView": "kanban",
  "editorLayout": "deep",
  "approvalMode": "single",
  "density": "comfortable"
}/*EDITMODE-END*/;

const App = () => {
  const [route, setRoute] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("npd-route")) || { screen: "dashboard" }; }
    catch { return { screen: "dashboard" }; }
  });
  const [role, setRole] = React.useState(() => localStorage.getItem("npd-role") || "rd");
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);

  // Pattern A — centralized modal switch
  const [modal, setModal] = React.useState(null); // { name, data }
  const openModal  = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  React.useEffect(() => { localStorage.setItem("npd-route", JSON.stringify(route)); }, [route]);
  React.useEffect(() => { localStorage.setItem("npd-role", role); }, [role]);
  React.useEffect(() => { document.body.className = tweaks.density === "compact" ? "density-compact" : ""; }, [tweaks.density]);

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
    if (s === "fa_detail" || s === "brief_detail" || s === "formulation_editor" || s === "d365_builder") return;
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
            <ProjectHeader project={project} onBack={() => setRoute({ screen: "pipeline" })} />
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

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} setTweaks={setTweaks} />
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
