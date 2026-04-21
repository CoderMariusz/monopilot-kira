// ============ Shipping app — router + central modal state ============

const ShApp = () => {
  const [screen, setScreen] = React.useState(() => localStorage.getItem("sh_screen") || "dashboard");
  const [role, setRole] = React.useState("Coordinator");
  const [modal, setModal] = React.useState(null); // { name, data }

  React.useEffect(() => { localStorage.setItem("sh_screen", screen); }, [screen]);

  const openModal = (name, data) => setModal({ name, data });
  const closeModal = () => setModal(null);

  const onOpenCustomer = () => setScreen("customer_detail");
  const onOpenSO       = () => setScreen("so_detail");
  const onOpenPick     = () => setScreen("pick_detail");
  const onOpenStation  = () => setScreen("pack_station");

  let content;
  switch (screen) {
    case "dashboard":        content = <ShDashboard role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "customers":        content = <ShCustomerList onOpenCustomer={onOpenCustomer} onNav={setScreen} openModal={openModal}/>; break;
    case "customer_detail":  content = <ShCustomerDetail onBack={()=>setScreen("customers")} onNav={setScreen} openModal={openModal}/>; break;
    case "sos":              content = <ShSOList onOpenSO={onOpenSO} onNav={setScreen} openModal={openModal}/>; break;
    case "so_detail":        content = <ShSODetail onBack={()=>setScreen("sos")} onNav={setScreen} openModal={openModal}/>; break;
    case "allocations":      content = <ShAllocation role={role} onNav={setScreen} openModal={openModal}/>; break;
    case "picks":            content = <ShPickList onOpenPick={onOpenPick} onNav={setScreen} openModal={openModal}/>; break;
    case "pick_detail":      content = <ShPickDetail onBack={()=>setScreen("picks")} onNav={setScreen} openModal={openModal}/>; break;
    case "wave":             content = <ShWave onNav={setScreen} openModal={openModal}/>; break;
    case "packing":          content = <ShPackStations onOpenStation={onOpenStation} onNav={setScreen} openModal={openModal}/>; break;
    case "pack_station":     content = <ShPackStation onBack={()=>setScreen("packing")} onNav={setScreen} openModal={openModal}/>; break;
    case "sscc":             content = <ShSSCCQueue onNav={setScreen} openModal={openModal}/>; break;
    case "docs":             content = <ShDocs onNav={setScreen} openModal={openModal}/>; break;
    case "doc_slip":         content = <ShDocSlip onBack={()=>setScreen("docs")} onNav={setScreen} openModal={openModal}/>; break;
    case "doc_bol":          content = <ShDocBol onBack={()=>setScreen("docs")} onNav={setScreen} openModal={openModal}/>; break;
    case "shipments":        content = <ShShipments onNav={setScreen} openModal={openModal}/>; break;
    case "carriers":         content = <ShCarriers onNav={setScreen} openModal={openModal}/>; break;
    case "rma":              content = <ShRmas onNav={setScreen} openModal={openModal}/>; break;
    case "settings":         content = <ShSettings role={role} onNav={setScreen}/>; break;
    case "gallery":          content = <ModalGallery onNav={setScreen}/>; break;
    default:                 content = <ShDashboard role={role} onNav={setScreen} openModal={openModal}/>;
  }

  return (
    <>
      <PSidebar/>
      <PTopbar role={role} onRole={setRole}/>
      <ShNav current={screen} onNav={setScreen}/>
      <div id="prod-main">{content}</div>

      {/* Global modal mount — by name */}
      {modal?.name === "customerCreate"   && <CustomerCreateModal    open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "address"          && <AddressModal           open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "allergen"         && <AllergenRestrictionModal open={true} onClose={closeModal}/>}
      {modal?.name === "soCreate"         && <SoCreateModal          open={true} onClose={closeModal}/>}
      {modal?.name === "soLineAdd"        && <SoLineAddModal         open={true} onClose={closeModal}/>}
      {modal?.name === "allocOverride"    && <AllocOverrideModal     open={true} onClose={closeModal}/>}
      {modal?.name === "holdPlace"        && <HoldPlaceModal         open={true} onClose={closeModal}/>}
      {modal?.name === "holdRelease"      && <HoldReleaseModal       open={true} onClose={closeModal}/>}
      {modal?.name === "partialFulfil"    && <PartialFulfilModal     open={true} onClose={closeModal}/>}
      {modal?.name === "shortPick"        && <ShortPickModal         open={true} onClose={closeModal}/>}
      {modal?.name === "soCancel"         && <SoCancelModal          open={true} onClose={closeModal}/>}
      {modal?.name === "waveRelease"      && <WaveReleaseModal       open={true} onClose={closeModal}/>}
      {modal?.name === "pickReassign"     && <PickReassignModal      open={true} onClose={closeModal}/>}
      {modal?.name === "packClose"        && <PackCloseModal         open={true} onClose={closeModal}/>}
      {modal?.name === "shipConfirm"      && <ShipConfirmModal       open={true} onClose={closeModal}/>}
      {modal?.name === "ssccPreview"      && <SsccPreviewModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "ssccReprint"      && <SsccPreviewModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "slipRegen"        && <SlipRegenModal         open={true} onClose={closeModal}/>}
      {modal?.name === "bolSign"          && <BolSignModal           open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "carrierEdit"      && <CarrierEditModal       open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "releaseAlloc"     && <ReleaseAllocModal      open={true} onClose={closeModal} data={modal.data}/>}
      {modal?.name === "allergenOverride" && <AllergenOverrideModal  open={true} onClose={closeModal}/>}
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<ShApp/>);
