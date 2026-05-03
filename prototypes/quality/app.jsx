// ============ Quality app — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const QaApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("qa_screen") || "dashboard");
  const [role, setRole] = React.useState("Quality Lead");
  const [modal, setModal] = React.useState(null);
  const [holdId, setHoldId] = React.useState(null);
  const [specId, setSpecId] = React.useState(null);
  const [ncrId, setNcrId] = React.useState(null);
  const [inspId, setInspId] = React.useState(null);

  React.useEffect(() => { localStorage.setItem("qa_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const onOpenHold = (id) => { setHoldId(id); setScreen("hold_detail"); };
  const onOpenSpec = (id) => { setSpecId(id); setScreen("spec_detail"); };
  const onOpenNcr = (id) => { setNcrId(id); setScreen("ncr_detail"); };
  const onOpenInsp = (id) => { setInspId(id); setScreen("insp_detail"); };

  let content;
  switch (screen) {
    case "dashboard":     content = <QaDashboard role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "holds":         content = <QaHoldsList role={role} onOpenHold={onOpenHold} onNav={setScreen} openModal={openModal}/>; break;
    case "hold_detail":   content = <QaHoldDetail holdId={holdId} role={role} onBack={() => setScreen("holds")} onNav={setScreen} openModal={openModal}/>; break;
    case "specs":         content = <QaSpecsList onOpenSpec={onOpenSpec} onNav={setScreen} onNewSpec={() => setScreen("spec_new")} openModal={openModal}/>; break;
    case "spec_new":      content = <QaSpecWizard onCancel={() => setScreen("specs")} onNav={setScreen} openModal={openModal}/>; break;
    case "spec_detail":   content = <QaSpecDetail specId={specId} onBack={() => setScreen("specs")} onNav={setScreen} openModal={openModal}/>; break;
    case "templates":     content = <QaTemplates onNav={setScreen} openModal={openModal}/>; break;
    case "incoming":      content = <QaIncomingList onOpenInsp={onOpenInsp} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "insp_detail":   content = <QaInspectionDetail inspId={inspId} onBack={() => setScreen("incoming")} onNav={setScreen} openModal={openModal} role={role}/>; break;
    case "inprocess":     content = <QaInProcessP2 onNav={setScreen}/>; break;
    case "final":         content = <QaFinalP2 onNav={setScreen}/>; break;
    case "sampling":      content = <QaSamplingPlans onNav={setScreen} openModal={openModal}/>; break;
    case "ncr":           content = <QaNcrList onOpenNcr={onOpenNcr} onNav={setScreen} openModal={openModal}/>; break;
    case "ncr_detail":    content = <QaNcrDetail ncrId={ncrId} role={role} onBack={() => setScreen("ncr")} onNav={setScreen} openModal={openModal}/>; break;
    case "release":       content = <QaBatchReleaseP2 onNav={setScreen}/>; break;
    case "coa":           content = <QaCoaP2 onNav={setScreen}/>; break;
    case "haccp":         content = <QaHaccpPlans onNav={setScreen} openModal={openModal}/>; break;
    case "ccp":           content = <QaCcpMonitoring onNav={setScreen} openModal={openModal}/>; break;
    case "ccpdev":        content = <QaCcpDeviations onNav={setScreen} openModal={openModal}/>; break;
    case "allergen":      content = <QaAllergenGates role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "audit":         content = <QaAuditTrail onNav={setScreen} openModal={openModal}/>; break;
    case "scanner":       content = <QaScannerRef onNav={setScreen}/>; break;
    case "settings":      content = <QaSettings role={role} onNav={setScreen}/>; break;
    case "gallery":       content = <QaModalGallery onNav={setScreen}/>; break;
    default:              content = <QaDashboard role={role} onNav={setScreen} openModal={openModal}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <QaNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Central modal mount */}
      {modal?.name === "holdCreate"       && <HoldCreateModal       open={true} onClose={closeModal}/>}
      {modal?.name === "holdRelease"      && <HoldReleaseModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "specSign"         && <SpecSignModal         open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "templateCreate"   && <TemplateCreateModal   open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "sampleDraw"       && <SampleDrawModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "ncrCreate"        && <NcrCreateModal        open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "ncrClose"         && <NcrCloseModal         open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "ccpReading"       && <CcpReadingModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "ccpDeviationLog"  && <CcpDeviationLogModal  open={true} onClose={closeModal}/>}
      {modal?.name === "eSign"            && <ESignModal            open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "allergenDualSign" && <AllergenDualSignModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "auditExport"      && <AuditExportModal      open={true} onClose={closeModal}/>}
      {modal?.name === "deleteReason"     && <DeleteWithReasonModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "inspectionAssign" && <InspectionAssignModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "samplingCreate"   && <TemplateCreateModal   open={true} onClose={closeModal}/>} {/* P1 stub reuses template modal */}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<QaApp/>);
