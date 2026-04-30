// ============ Planning+ App — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const PextApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("pext_screen") || "dashboard");
  const [role, setRole] = React.useState("Planner");
  const [modal, setModal] = React.useState(null); // { name, data }

  React.useEffect(() => { localStorage.setItem("pext_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  let content;
  switch (screen) {
    case "dashboard":   content = <PextDashboard role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "pending":     content = <PextPendingFullPage role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "capacity":    content = <PextCapacityProjection onNav={setScreen}/>; break;
    case "runs":        content = <PextRunHistory role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "matrix":      content = <PextMatrix role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "forecasts":   content = <PextForecasts role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "scenarios":   content = <PextScenarios role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "sequencing":  content = <PextSequencing role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "rules":       content = <PextRules role={role} onNav={setScreen}/>; break;
    case "settings":    content = <PextSettings role={role} onNav={setScreen}/>; break;
    case "gallery":     content = <ModalGallery onNav={setScreen}/>; break;
    default:            content = <PextDashboard role={role} onNav={setScreen} openModal={openModal}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <PextNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount — by name */}
      {modal?.name === "runScheduler"     && <RunSchedulerModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "override"          && <OverrideAssignmentModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "reschedule"        && <RescheduleWOModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "approveAll"        && <ApproveAllModal         open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "matrixCell"        && <MatrixCellEditModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "matrixPublish"     && <MatrixPublishModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "matrixImport"      && <MatrixImportModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "matrixDiff"        && <MatrixDiffModal         open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "matrixRestore"     && <RerunConfirmModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "forecastUpload"    && <ForecastUploadModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "disposition"       && <DispositionDecisionModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "rerunConfirm"      && <RerunConfirmModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "disableV2"         && <DisableV2Modal          open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "requestReview"     && <RequestReviewModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "capacityDetail"    && (() => { setTimeout(() => { closeModal(); setScreen("capacity"); }, 0); return null; })()}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<PextApp/>);
