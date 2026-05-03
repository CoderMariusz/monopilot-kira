// ============ Finance app — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const FinApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("fin_screen") || "dashboard");
  const [role, setRole] = React.useState("Finance Manager");
  const [modal, setModal] = React.useState(null); // { name, data }
  const [woId, setWoId] = React.useState("WO-2026-0042");

  React.useEffect(() => { localStorage.setItem("fin_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const onOpenWo = (id) => { setWoId(id); setScreen("wo_detail"); };

  let content;
  switch (screen) {
    case "dashboard":       content = <FinDashboard role={role} onNav={setScreen} onOpenWo={onOpenWo} openModal={openModal}/>; break;
    case "standard_costs":  content = <FinStandardCosts role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "wos":             content = <FinWoList role={role} onNav={setScreen} onOpenWo={onOpenWo} openModal={openModal}/>; break;
    case "wo_detail":       content = <FinWoDetail woId={woId} role={role} onBack={()=>setScreen("wos")} onNav={setScreen} openModal={openModal}/>; break;
    case "inventory_val":   content = <FinInventoryValuation onNav={setScreen} openModal={openModal}/>; break;
    case "fx":              content = <FinFxRates role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "var_material":    content = <FinVarMaterial onNav={setScreen} onOpenWo={onOpenWo} openModal={openModal}/>; break;
    case "var_labor":       content = <FinVarLabor onNav={setScreen} openModal={openModal}/>; break;
    case "var_drilldown":   content = <FinVarDrilldown onNav={setScreen} onOpenWo={onOpenWo}/>; break;
    case "var_realtime":    content = <FinVarRealtime onNav={setScreen}/>; break;
    case "reports":         content = <FinReports onNav={setScreen} openModal={openModal}/>; break;
    case "d365":            content = <FinD365 role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "gl_mappings":     content = <FinGlMappings role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "settings":        content = <FinSettings onNav={setScreen} openModal={openModal}/>; break;
    case "bom_costing":     content = <FinBomCosting onNav={setScreen}/>; break;
    case "simulation":      content = <FinSimulation onNav={setScreen}/>; break;
    case "margin":          content = <FinMargin onNav={setScreen}/>; break;
    case "budgets":         content = <FinBudgets onNav={setScreen}/>; break;
    case "gallery":         content = <ModalGallery onNav={setScreen}/>; break;
    default:                content = <FinDashboard role={role} onNav={setScreen} onOpenWo={onOpenWo} openModal={openModal}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <FinNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount — by name */}
      {modal?.name === "stdCostCreate"   && <StdCostCreateModal   open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "approveStdCost"  && <ApproveStdCostModal  open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "costHistory"     && <CostHistoryModal     open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "bulkImport"      && <BulkImportModal      open={true} onClose={closeModal}/>}
      {modal?.name === "fxOverride"      && <FxRateOverrideModal  open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "fifoLayers"      && <FifoLayersModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "varianceNote"    && <VarianceNoteModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "dlqReplay"       && <DlqReplayModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "dlqResolve"      && <DlqResolveModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "exportReport"    && <ExportReportModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "supersede"       && <SupersedeModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "periodLock"      && <PeriodLockModal      open={true} onClose={closeModal}/>}
      {modal?.name === "costCenter"      && <CostCenterModal      open={true} onClose={closeModal} data={modal.data}/>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<FinApp/>);
