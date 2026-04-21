// ============ OEE app — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const OeeApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("oee_screen") || "summary");
  const [lineId, setLineId] = React.useState(() => localStorage.getItem("oee_line") || "LINE-01");
  const [role, setRole] = React.useState("Shift Supervisor");
  const [modal, setModal] = React.useState(null); // { name, data }

  React.useEffect(() => { localStorage.setItem("oee_screen", screen); }, [screen]);
  React.useEffect(() => { localStorage.setItem("oee_line",   lineId); }, [lineId]);

  const openModal  = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);
  const onPickLine = (id) => { setLineId(id); setScreen("line"); };

  let content;
  switch (screen) {
    case "summary":      content = <OeeSummary       role={role} onNav={setScreen} openModal={openModal} onPickLine={onPickLine}/>; break;
    case "heatmap":      content = <OeeHeatmap       onNav={setScreen} openModal={openModal} onPickLine={onPickLine}/>; break;
    case "line":         content = <OeeLineTrend     role={role} onNav={setScreen} openModal={openModal} lineId={lineId} setLineId={setLineId}/>; break;
    case "pareto":       content = <OeePareto        onNav={setScreen} openModal={openModal}/>; break;
    case "losses":       content = <OeeLosses        onNav={setScreen} openModal={openModal}/>; break;
    case "changeover":   content = <OeeChangeover    onNav={setScreen} openModal={openModal}/>; break;
    case "availability": content = <OeeAvailability  onNav={setScreen} openModal={openModal} onPickLine={onPickLine}/>; break;
    case "performance":  content = <OeePerformance   onNav={setScreen} onPickLine={onPickLine}/>; break;
    case "quality":      content = <OeeQuality       onNav={setScreen} onPickLine={onPickLine}/>; break;
    case "settings":     content = <OeeSettings      role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "shifts":       content = <OeeShifts        role={role} onNav={setScreen}/>; break;
    case "anomalies":    content = <OeeAnomalies     onNav={setScreen}/>; break;
    case "equipment":    content = <OeeEquipmentHealth onNav={setScreen}/>; break;
    case "tv":           content = <OeeTV            onNav={setScreen}/>; break;
    case "gallery":      content = <ModalGallery     onNav={setScreen}/>; break;
    default:             content = <OeeSummary       role={role} onNav={setScreen} openModal={openModal} onPickLine={onPickLine}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <OeeNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Central modal mount (Pattern A) */}
      {modal?.name === "annotateDowntime" && <AnnotateDowntimeModal  open onClose={closeModal} data={modal.data} role={role}/>}
      {modal?.name === "export"           && <ExportModal            open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "lineOverride"     && <LineOverrideModal      open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "bigLossMapping"   && <BigLossMappingModal    open onClose={closeModal}/>}
      {modal?.name === "changeoverDetail" && <ChangeoverDetailModal  open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "cellDrill"        && <CellDrillModal         open onClose={closeModal} data={modal.data} onPickLine={onPickLine}/>}
      {modal?.name === "requestEdit"      && <RequestEditModal       open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "deleteOverride"   && <DeleteOverrideModal    open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "copyClipboard"    && <CopyClipboardModal     open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "compareWeeks"     && <CompareWeeksModal      open onClose={closeModal}/>}
      {modal?.name === "ackAnomaly"       && <AcknowledgeAnomalyModal open onClose={closeModal} data={modal.data}/>}
      {modal?.name === "autoRefresh"      && <AutoRefreshModal       open onClose={closeModal}/>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<OeeApp/>);
