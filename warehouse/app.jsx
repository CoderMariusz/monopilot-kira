// ============ Warehouse app — router + central modal state (Pattern A per MODAL-SCHEMA §3) ============

const WhApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("wh_screen") || "dashboard");
  const [role, setRole] = React.useState("Operator");
  const [modal, setModal] = React.useState(null); // { name, data }

  React.useEffect(() => { localStorage.setItem("wh_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const onOpenLp  = (id) => setScreen("lp_detail");
  const onOpenGrn = (id) => setScreen("grn_detail");

  let content;
  switch (screen) {
    case "dashboard":    content = <WhDashboard role={role} onNav={setScreen} onOpenLp={onOpenLp} openModal={openModal}/>; break;
    case "lps":          content = <WhLPList onOpenLp={onOpenLp} onNav={setScreen} openModal={openModal}/>; break;
    case "lp_detail":    content = <WhLPDetail onBack={()=>setScreen("lps")} onNav={setScreen} openModal={openModal}/>; break;
    case "grn":          content = <WhGRNList onOpenGrn={onOpenGrn} onNav={setScreen} openModal={openModal}/>; break;
    case "grn_detail":   content = <WhGRNDetail onBack={()=>setScreen("grn")} onNav={setScreen} onOpenLp={onOpenLp}/>; break;
    case "movements":    content = <WhMovementList onNav={setScreen} onOpenLp={onOpenLp} openModal={openModal}/>; break;
    case "reservations": content = <WhReservations onNav={setScreen} onOpenLp={onOpenLp} openModal={openModal}/>; break;
    case "inventory":    content = <WhInventory role={role} onNav={setScreen} onOpenLp={onOpenLp}/>; break;
    case "int_buffer":   content = <WhIntermediateBuffer onNav={setScreen} onOpenLp={onOpenLp}/>; break;
    case "locations":    content = <WhLocations role={role} onNav={setScreen} onOpenLp={onOpenLp} openModal={openModal}/>; break;
    case "genealogy":    content = <WhGenealogy onNav={setScreen} onOpenLp={onOpenLp}/>; break;
    case "expiry":       content = <WhExpiry role={role} onNav={setScreen} onOpenLp={onOpenLp} openModal={openModal}/>; break;
    case "settings":     content = <WhSettings role={role} onNav={setScreen}/>; break;
    case "gallery":      content = <ModalGallery onNav={setScreen}/>; break;
    default:             content = <WhDashboard role={role} onNav={setScreen} onOpenLp={onOpenLp} openModal={openModal}/>;
  }

  // Find active modal component by name
  const activeModal = MODAL_CATALOG.find(m => m.name.toLowerCase().includes(modal?.name || "~nothing~")) || null;

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <WhNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount — by name */}
      {modal?.name === "grnPO"              && <GRNFromPOModal open={true} onClose={closeModal}/>}
      {modal?.name === "grnTO"              && <GRNFromTOModal open={true} onClose={closeModal}/>}
      {modal?.name === "stockMove"          && <StockMoveModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "split"              && <LPSplitModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "merge"              && <LPMergeModal open={true} onClose={closeModal}/>}
      {modal?.name === "qaStatus"           && <QAStatusModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "labelPrint"         && <LabelPrintModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "reserve"            && <ReserveModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "releaseReservation" && <ReleaseReservationModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "fefoDeviation"      && <FEFODeviationModal open={true} onClose={closeModal}/>}
      {modal?.name === "destroy"            && <DestroyLPModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "useByOverride"      && <UseByOverrideModal open={true} onClose={closeModal} data={modal.data} isManager={role === "Manager" || role === "Admin"}/>}
      {modal?.name === "locationEdit"       && <LocationEditModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "cycleCount"         && <CycleCountModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "stateTransition"    && <StateTransitionModal open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "forceUnlock"        && <ForceUnlockModal open={true} onClose={closeModal}/>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<WhApp/>);
