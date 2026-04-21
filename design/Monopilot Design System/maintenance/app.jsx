// ============ Maintenance app — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const MntApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("mnt_screen") || "dashboard");
  const [role, setRole]     = React.useState("Technician");
  const [modal, setModal]   = React.useState(null); // { name, data }

  React.useEffect(() => { localStorage.setItem("mnt_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const onOpenAsset = (id) => setScreen("asset_detail");
  const onOpenSpare = (code) => setScreen("spare_detail");
  const onOpenTech  = (id) => setScreen("tech_detail");
  const onOpenMwo   = (id) => setScreen("mwo_detail");
  const onOpenCal   = (id) => setScreen("cal_detail");

  let content;
  switch (screen) {
    case "dashboard":       content = <MntDashboard role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "assets":          content = <MntAssetList onOpenAsset={onOpenAsset} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "asset_detail":    content = <MntAssetDetail onBack={()=>setScreen("assets")} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "work_requests":   content = <MntWRList onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "mwos":            content = <MntMWOList onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "mwo_detail":      content = <MntMWODetail onBack={()=>setScreen("mwos")} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "pm_schedules":    content = <MntPMList onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "calibration":     content = <MntCalList onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "cal_detail":      content = <MntCalDetail onBack={()=>setScreen("calibration")} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "spares":          content = <MntSparesList onOpenSpare={onOpenSpare} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "spare_detail":    content = <MntSpareDetail onBack={()=>setScreen("spares")} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "technicians":     content = <MntTechList onOpenTech={onOpenTech} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "tech_detail":     content = <MntTechDetail onBack={()=>setScreen("technicians")} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "loto":            content = <MntLotoList onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "analytics":       content = <MntAnalytics onNav={setScreen} role={role}/>; break;
    case "settings":        content = <MntSettings onNav={setScreen} role={role}/>; break;
    case "gallery":         content = <ModalGallery onNav={setScreen}/>; break;
    default:                content = <MntDashboard role={role} onNav={setScreen} openModal={openModal}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <MntNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount — by name */}
      {modal?.name === "assetEdit"       && <AssetEditModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "wrCreate"        && <WRCreateModal        open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "wrTriage"        && <WRTriageModal        open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "mwoCreate"       && <MwoCreateModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "taskCheckoff"    && <TaskCheckoffModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "mwoComplete"     && <MwoCompleteModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "pmEdit"          && <PMEditModal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "pmSkip"          && <PMSkipModal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "calReading"      && <CalReadingModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "certUpload"      && <CertUploadModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "sparReorder"     && <SpareReorderModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "techSkill"       && <TechSkillModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "lotoApply"       && <LotoApplyModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "lotoClear"       && <LotoClearModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "deleteConfirm"   && <DeleteConfirmModal   open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "critOverride"    && <CritOverrideModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "dtLink"          && <DtLinkModal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "stateTransition" && <StateTransitionModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "sparAdjust"      && <SpareAdjustModal     open={true} onClose={closeModal} data={modal.data}/>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<MntApp/>);
