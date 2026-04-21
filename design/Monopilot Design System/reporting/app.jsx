// ============ Reporting app — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const RptApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("rpt_screen") || "home");
  const [role, setRole] = React.useState("Manager");
  const [modal, setModal] = React.useState(null);

  React.useEffect(() => { localStorage.setItem("rpt_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  let content;
  switch (screen) {
    case "home":                 content = <RptHome role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "factory_overview":     content = <RptFactoryOverview role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "yield_by_line":        content = <RptYieldByLine role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "yield_by_sku":         content = <RptYieldBySku role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "qc_holds":             content = <RptQcHolds role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "oee_summary":          content = <RptOeeSummary role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "inventory_aging":      content = <RptInventoryAging role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "wo_status":            content = <RptWoStatus role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "shipment_otd":         content = <RptShipmentOtd role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "integration_health":   content = <RptIntegrationHealth role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "rules_usage":          content = <RptRulesUsage role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "exports":              content = <RptExports role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "saved_filters":        content = <RptSavedFilters role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "scheduled":            content = <RptScheduled role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "scheduled_edit":       content = <RptScheduledEdit role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "settings":             content = <RptSettings role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "gallery":              content = <ModalGallery onNav={setScreen}/>; break;
    default:                     content = <RptHome role={role} onNav={setScreen} openModal={openModal}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <RptNav current={screen} onNav={setScreen} role={role}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount */}
      {modal?.name === "export"         && <ExportReportModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "savePreset"     && <SavePresetModal         open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "schedule"       && <ScheduleReportModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "share"          && <ShareReportModal        open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "deleteConfirm"  && <DeleteConfirmModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "errorLog"       && <ErrorLogModal           open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "regulatory"     && <RegulatorySignoffModal  open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "refreshConfirm" && <RefreshConfirmModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "recipientGroup" && <RecipientGroupModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "runNow"         && <RunNowConfirmModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "p2Toast"        && <P2ToastModal            open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "accessDenied"   && <AccessDeniedModal       open={true} onClose={closeModal} data={modal.data}/>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<RptApp/>);
