'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';

export type Warehouse = { id: string; code: string; name: string };
export type LocationRow = { id: string; warehouseId: string; parentId: string | null; name: string; level: number; path: string; locationType?: string | null };
export type UpsertLocationInput = { id?: string; warehouseId: string; parentId: string | null; code: string; name: string; level: number; locationType: string; active?: boolean; barcode?: string | null };
export type UpsertLocationResult = { ok: true; data: { id: string; path: string; level: number } } | { ok: false; error: string };
export type DeleteLocationInput = { locationId: string; warehouseId: string };
export type DeleteLocationResult = { ok: true; data: { locationId: string; warehouseId: string } } | { ok: false; error: string };
export type LocationTreeLabels = {
  title: string;
  subtitle: string;
  workspace: string;
  settingsNavigation: string;
  sidebarLabel: string;
  sectionTitle: string;
  warehouse: string;
  allWarehouses: string;
  importCsv: string;
  addLocation: string;
  editLocation: string;
  addChild: string;
  deleteLocation: string;
  selectedLocation: string;
  selectedParent: string;
  selectedDepth: string;
  selectedType: string;
  selectedStatus: string;
  lpsHere: string;
  readOnly: string;
  dialogAddTitle: string;
  dialogEditTitle: string;
  dialogDeleteTitle: string;
  dialogDeleteBody: string;
  fieldCode: string;
  fieldName: string;
  fieldParent: string;
  fieldType: string;
  fieldActive: string;
  fieldBarcode: string;
  depthExceeded: string;
  cancel: string;
  createLocation: string;
  confirmDelete: string;
  saveChanges: string;
  csvFile: string;
  insufficientPermissions: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  provenance: string;
  expand: string;
  leaf: string;
  level: string;
  importSuccess: string;
  importError: string;
  active: string;
  lpsTableTitle: string;
  openFullLpList: string;
  lpColumn: string;
  productColumn: string;
  qtyColumn: string;
  batchColumn: string;
  expiryColumn: string;
  statusColumn: string;
  qaColumn: string;
  noLpsAtLocation: string;
  utilization: string;
  binOccupancyTitle: string;
  binOccupancyLegend: string;
  noBinsTitle: string;
  noBinsAdmin: string;
  fieldCodeHelp: string;
  fieldBarcodeHelp: string;
  upsertSuccess: string;
  upsertError: string;
  deleteSuccess: string;
  deleteError: string;
  deleteHasChildren: string;
};

type TreeNode = LocationRow & { children: TreeNode[] };

type DialogMode = 'add' | 'edit' | 'child';

export function LocationTreeScreen({
  labels,
  warehouses,
  locations,
  selectedWarehouseId,
  selectedLocationId,
  parentLocationId,
  canImport,
  canUpdateInfra,
  state,
  activeDialog,
  importCsvAction,
  importToast,
  upsertToast,
  upsertLocation,
  deleteLocation,
}: {
  labels: LocationTreeLabels;
  warehouses: Warehouse[];
  locations: LocationRow[];
  selectedWarehouseId: string;
  selectedLocationId: string | null;
  parentLocationId: string | null;
  canImport: boolean;
  canUpdateInfra: boolean;
  state: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
  activeDialog: DialogMode | null;
  importCsvAction: (formData: FormData) => Promise<void>;
  importToast: { role: 'status' | 'alert'; message: string } | null;
  upsertToast: { role: 'status' | 'alert'; message: string } | null;
  upsertLocation: (input: UpsertLocationInput) => Promise<UpsertLocationResult> | UpsertLocationResult;
  deleteLocation: (input: DeleteLocationInput) => Promise<DeleteLocationResult> | DeleteLocationResult;
}) {
  const [rows, setRows] = React.useState<LocationRow[]>(() => [...locations]);
  const visibleRows = rows.filter((location) => selectedWarehouseId === 'all' || location.warehouseId === selectedWarehouseId);
  const tree = buildTree(visibleRows);
  const firstSelected = visibleRows[0] ?? null;
  const [selected, setSelected] = React.useState<string | null>(selectedLocationId ?? firstSelected?.id ?? null);
  const selectedLocation = visibleRows.find((location) => location.id === selected) ?? firstSelected;
  const [dialogMode, setDialogMode] = React.useState<DialogMode | null>(activeDialog);
  const [deleteCandidate, setDeleteCandidate] = React.useState<LocationRow | null>(null);
  const [editingLocation, setEditingLocation] = React.useState<LocationRow | null>(null);
  const [form, setForm] = React.useState({ code: '', name: '', parentId: parentLocationId ?? selectedLocation?.id ?? '', locationType: 'storage', active: true, barcode: '' });
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => setRows([...locations]), [locations]);

  const parentLocation = visibleRows.find((location) => location.id === form.parentId) ?? null;
  const depthExceeded = parentLocation ? parentLocation.level >= 3 : false;
  const nextLevel = parentLocation ? parentLocation.level + 1 : 1;
  const valid = form.code.trim().length > 0 && form.name.trim().length > 0 && !depthExceeded;
  const warehouseOptions = [{ value: 'all', label: labels.allWarehouses }, ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))];
  const parentOptions = React.useMemo<SelectOption[]>(
    () => [{ value: 'root', label: '—' }, ...visibleRows.filter((location) => location.id !== editingLocation?.id).map((location) => ({ value: location.id, label: location.path.replace(/\./g, ' › ') }))],
    [editingLocation?.id, visibleRows],
  );
  const typeOptions = React.useMemo<SelectOption[]>(
    () => ['storage', 'transit', 'receiving', 'production_line'].map((value) => ({ value, label: value })),
    [],
  );
  const bins = selectedLocation && selectedLocation.level === 2 ? visibleRows.filter((location) => location.parentId === selectedLocation.id) : [];

  function openDialog(mode: DialogMode, location?: LocationRow | null) {
    if (!canUpdateInfra) return;
    const target = location ?? selectedLocation;
    setDialogMode(mode);
    setEditingLocation(mode === 'edit' ? target ?? null : null);
    setForm({
      code: mode === 'edit' && target ? locationCode(target) : '',
      name: mode === 'edit' && target ? target.name : '',
      parentId: mode === 'child' && target ? target.id : mode === 'edit' ? target?.parentId ?? '' : parentLocationId ?? selectedLocation?.id ?? '',
      locationType: mode === 'edit' && target ? target.locationType ?? 'storage' : 'storage',
      active: true,
      barcode: '',
    });
    setFormError(null);
  }

  async function submitDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdateInfra || !valid) return;
    const warehouseId = editingLocation?.warehouseId ?? parentLocation?.warehouseId ?? selectedLocation?.warehouseId ?? warehouses[0]?.id;
    if (!warehouseId) return;
    const input: UpsertLocationInput = {
      id: editingLocation?.id,
      warehouseId,
      parentId: parentLocation?.id ?? null,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      level: editingLocation && !parentLocation ? editingLocation.level : nextLevel,
      locationType: form.locationType,
      active: form.active,
      barcode: form.barcode.trim() || null,
    };
    const result = await upsertLocation(input);
    if (!result.ok) {
      setFormError(labels.upsertError);
      return;
    }
    const saved: LocationRow = { id: result.data.id, warehouseId, parentId: input.parentId, name: input.name, level: result.data.level, path: result.data.path, locationType: input.locationType };
    setRows((current) => sortByPath([saved, ...current.filter((row) => row.id !== saved.id)]));
    setSelected(saved.id);
    setDialogMode(null);
    setEditingLocation(null);
  }

  async function confirmDeleteLocation() {
    if (!deleteCandidate || !canUpdateInfra) return;
    const result = await deleteLocation({ locationId: deleteCandidate.id, warehouseId: deleteCandidate.warehouseId });
    if (!result.ok) {
      setFormError(result.error === 'has_child_locations' ? labels.deleteHasChildren : labels.deleteError);
      return;
    }
    setRows((current) => current.filter((row) => row.id !== deleteCandidate.id));
    setSelected((current) => (current === deleteCandidate.id ? null : current));
    setDeleteCandidate(null);
    setFormError(null);
  }

  return (
    <main data-testid="settings-location-tree-screen" data-screen="settings-location-tree" className="min-h-screen bg-slate-50 text-slate-950">
      <header data-region="page-head" className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500"><a href="/en/warehouse" className="text-blue-700 hover:underline">{labels.warehouse}</a> · {labels.sectionTitle}</div>
            <h1 className="text-2xl font-semibold">{labels.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
          </div>
          {canUpdateInfra ? (
            <Button type="button" onClick={() => openDialog('add')} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              {labels.addLocation}
            </Button>
          ) : (
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{labels.readOnly}</span>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-6" aria-label={labels.workspace}>
        <form action={importCsvAction} data-location-import-form="true" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">{labels.sectionTitle} ({visibleRows.length})</div>
              <p className="mt-1 text-xs text-slate-500">{labels.provenance}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1 text-sm font-medium">
                <span id="warehouse-filter-label">{labels.warehouse}</span>
                <details className="min-w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <summary role="combobox" aria-label={labels.warehouse} aria-haspopup="listbox" aria-expanded="false" className="cursor-pointer list-none">
                    {warehouseOptions.find((option) => option.value === selectedWarehouseId)?.label ?? labels.allWarehouses}
                  </summary>
                  <div role="listbox" className="mt-2 grid gap-1">
                    {warehouseOptions.map((option) => <a key={option.value} role="option" aria-selected={option.value === selectedWarehouseId} href={option.value === 'all' ? '?' : `?warehouseId=${encodeURIComponent(option.value)}`} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">{option.label}</a>)}
                  </div>
                </details>
              </div>
              <label className="grid gap-1 text-sm font-medium" htmlFor="location-csv-file">
                {labels.csvFile}
                <Input id="location-csv-file" name="csvFile" aria-label={labels.csvFile} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" type="file" accept=".csv,text/csv" disabled={!canImport} />
              </label>
              <Button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600" disabled={!canImport} aria-label={!canImport ? labels.insufficientPermissions : labels.importCsv}>{labels.importCsv}</Button>
            </div>
          </div>
        </form>

        {state === 'ready' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div role="tree" aria-label={labels.title} className="space-y-2">{tree.map((location) => renderLocationNode(location, labels, selected, setSelected))}</div>
            </section>
            <section role="region" aria-label={labels.selectedLocation} className="space-y-3">
              {selectedLocation ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-mono text-lg font-semibold">{locationCode(selectedLocation)} — {selectedLocation.name}</h2>
                      <p className="mt-1 font-mono text-xs text-slate-500">{selectedLocation.path.replace(/\./g, ' › ')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selectedLocation.locationType ?? 'storage'}</Badge>
                      <Badge variant="success">● {labels.active}</Badge>
                      {canUpdateInfra ? <><Button type="button" onClick={() => openDialog('edit', selectedLocation)}>{labels.editLocation}</Button><Button type="button" onClick={() => openDialog('child', selectedLocation)}>{labels.addChild}</Button><Button type="button" className="border border-red-200 bg-red-50 text-red-700" onClick={() => { setDeleteCandidate(selectedLocation); setFormError(null); }}>{labels.deleteLocation}</Button></> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
                    <SummaryItem label={labels.lpsHere} value="0" />
                    <SummaryItem label={labels.selectedParent} value={parentPathFor(selectedLocation, visibleRows)} mono />
                    <SummaryItem label={labels.selectedDepth} value={`L${selectedLocation.level}`} />
                    <SummaryItem label={labels.utilization} value="—" />
                  </div>
                </div>
              ) : null}

              {selectedLocation?.level === 2 ? <BinOccupancy labels={labels} bins={bins} canUpdateInfra={canUpdateInfra} /> : null}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><h3 className="text-sm font-semibold">{labels.lpsTableTitle} (0)</h3><a href="/en/warehouse/lps" className="text-sm font-medium text-blue-700 hover:underline">{labels.openFullLpList}</a></div>
                <table role="table" aria-label={labels.lpsTableTitle} className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3">{labels.lpColumn}</th><th scope="col" className="px-4 py-3">{labels.productColumn}</th><th scope="col" className="px-4 py-3 text-right">{labels.qtyColumn}</th><th scope="col" className="px-4 py-3">{labels.batchColumn}</th><th scope="col" className="px-4 py-3">{labels.expiryColumn}</th><th scope="col" className="px-4 py-3">{labels.statusColumn}</th><th scope="col" className="px-4 py-3">{labels.qaColumn}</th></tr></thead>
                  <tbody><tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>{labels.noLpsAtLocation}</td></tr></tbody>
                </table>
              </section>
            </section>
          </div>
        ) : renderState(state, labels)}

        {[importToast, upsertToast].filter(Boolean).map((toast, index) => toast ? <div key={`${toast.role}-${index}`} role={toast.role} aria-live={toast.role === 'alert' ? 'assertive' : 'polite'} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">{toast.message}</div> : null)}
      </section>

      {dialogMode && canUpdateInfra ? (
        <div role="dialog" aria-modal="true" aria-labelledby="location-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <form onSubmit={submitDialog} className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="location-dialog-title" className="text-lg font-semibold">{dialogMode === 'edit' ? labels.dialogEditTitle : labels.dialogAddTitle}</h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1 text-sm font-medium" htmlFor="location-code">{labels.fieldCode}<Input id="location-code" value={form.code} maxLength={20} required onChange={(event) => { const value = event.currentTarget.value.toUpperCase(); setForm((current) => ({ ...current, code: value })); }} className="font-mono" /><span className="text-xs text-slate-500">{labels.fieldCodeHelp}</span></label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="location-name">{labels.fieldName}<Input id="location-name" value={form.name} maxLength={80} required onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, name: value })); }} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1 text-sm font-medium">
                  <span id="location-parent-label">{labels.fieldParent}</span>
                  <Select value={form.parentId || 'root'} options={parentOptions} onValueChange={(value) => { setForm((current) => ({ ...current, parentId: value === 'root' ? '' : value })); }} aria-labelledby="location-parent-label" aria-label={labels.fieldParent}>
                    <SelectTrigger className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" aria-label={labels.fieldParent}><SelectValue /></SelectTrigger>
                    <SelectContent>{parentOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {depthExceeded ? <span className="text-xs font-medium text-red-700">{labels.depthExceeded}</span> : null}
                </div>
                <div className="grid gap-1 text-sm font-medium">
                  <span id="location-type-label">{labels.fieldType}</span>
                  <Select value={form.locationType} options={typeOptions} onValueChange={(value) => { setForm((current) => ({ ...current, locationType: value })); }} aria-labelledby="location-type-label" aria-label={labels.fieldType}>
                    <SelectTrigger className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" aria-label={labels.fieldType}><SelectValue /></SelectTrigger>
                    <SelectContent>{typeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="location-active"><input id="location-active" type="checkbox" checked={form.active} onChange={(event) => { const checked = event.currentTarget.checked; setForm((current) => ({ ...current, active: checked })); }} />{labels.fieldActive}</label>
              {form.code || form.name ? (
                <label className="grid gap-1 text-sm font-medium" htmlFor="location-barcode">{labels.fieldBarcode}<Input id="location-barcode" value={form.barcode} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, barcode: value })); }} className="font-mono" /><span className="text-xs text-slate-500">{labels.fieldBarcodeHelp}</span></label>
              ) : null}
              {formError ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2"><Button type="button" onClick={() => setDialogMode(null)}>{labels.cancel}</Button><Button type="submit" disabled={!valid}>{dialogMode === 'edit' ? labels.saveChanges : labels.createLocation}</Button></div>
          </form>
        </div>
      ) : null}

      {deleteCandidate && canUpdateInfra ? (
        <div role="dialog" aria-modal="true" aria-labelledby="location-delete-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="location-delete-dialog-title" className="text-lg font-semibold">{labels.dialogDeleteTitle}</h2>
            <p className="mt-3 text-sm text-slate-600">{formatLabel(labels.dialogDeleteBody, { name: deleteCandidate.name })}</p>
            {formError ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" onClick={() => { setDeleteCandidate(null); setFormError(null); }}>{labels.cancel}</Button>
              <Button type="button" className="border border-red-200 bg-red-600 text-white" onClick={() => void confirmDeleteLocation()}>{labels.confirmDelete}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className={mono ? 'font-mono text-sm font-semibold' : 'text-sm font-semibold'}>{value}</div></div>;
}

function BinOccupancy({ labels, bins, canUpdateInfra }: { labels: LocationTreeLabels; bins: LocationRow[]; canUpdateInfra: boolean }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{labels.binOccupancyTitle}</h3><span className="text-xs text-slate-500">{labels.binOccupancyLegend}</span></div>{bins.length === 0 ? <div role="status" className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-600"><div className="text-3xl opacity-30">▦</div><div className="mt-2 font-medium text-slate-900">{labels.noBinsTitle}</div><div className="mt-1">{canUpdateInfra ? labels.noBinsAdmin : labels.empty}</div></div> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{bins.map((bin) => <button key={bin.id} type="button" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm hover:bg-emerald-100"><div className="font-mono font-semibold">{locationCode(bin)}</div><div className="mt-1 text-xs text-slate-600">0 LPs · 0%</div></button>)}</div>}</section>;
}

function buildTree(rows: LocationRow[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });
  const roots: TreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parentId && nodes.has(row.parentId)) nodes.get(row.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function sortByPath(rows: LocationRow[]) {
  return [...rows].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.replace(`{${key}}`, String(value)), template);
}

function locationCode(location: LocationRow) {
  return location.path.split('.').filter(Boolean).at(-1)?.toUpperCase() ?? location.name.toUpperCase();
}

function parentPathFor(location: LocationRow, rows: LocationRow[]) {
  if (!location.parentId) return '—';
  return rows.find((candidate) => candidate.id === location.parentId)?.path ?? location.parentId;
}

function renderLocationNode(location: TreeNode, labels: LocationTreeLabels, selectedLocationId: string | null, onSelect: (id: string) => void): React.ReactNode {
  const selected = selectedLocationId === location.id;
  const content = <div className="flex items-center gap-2"><span aria-hidden="true" className="w-6 text-center text-xs font-medium text-slate-500">{location.children.length > 0 ? '▸' : '•'}</span><span aria-hidden="true" className="text-sm">{locationTypeIcon(location.locationType)}</span><span className="font-mono text-xs font-semibold">{locationCode(location)}</span><span className="text-xs text-slate-500">{location.name}</span><Badge variant={location.level === 1 ? 'info' : 'secondary'}>{formatLabel(labels.level, { level: location.level })}</Badge></div>;
  if (location.children.length === 0) {
    return <div key={location.id} role="treeitem" aria-level={location.level} aria-selected={selected} data-location-id={location.id} data-parent-id={location.parentId ?? undefined} data-warehouse-id={location.warehouseId} onClick={() => onSelect(location.id)} className={`rounded-lg border px-3 py-2 text-sm ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50'}`} style={{ marginLeft: `${Math.max(location.level - 1, 0) * 24}px` }}>{content}</div>;
  }
  return <details key={location.id} role="treeitem" aria-level={location.level} aria-selected={selected} data-location-id={location.id} data-parent-id={location.parentId ?? undefined} data-warehouse-id={location.warehouseId} className={`rounded-lg border px-3 py-2 text-sm ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50'}`} style={{ marginLeft: `${Math.max(location.level - 1, 0) * 24}px` }}><summary aria-label={formatLabel(labels.expand, { name: location.name })} onClick={() => onSelect(location.id)} className="cursor-pointer list-none">{content}</summary><div role="group" className="mt-2 space-y-2">{location.children.map((child) => renderLocationNode(child, labels, selectedLocationId, onSelect))}</div></details>;
}

function locationTypeIcon(type?: string | null) {
  if (type === 'transit') return '🚚';
  if (type === 'receiving') return '📦';
  if (type === 'production_line') return '⚙';
  return '▭';
}

function renderState(state: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied', labels: LocationTreeLabels) {
  if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{labels.loading}</section>;
  if (state === 'error') return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{labels.error}</section>;
  if (state === 'permission_denied') return <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">{labels.forbidden}</section>;
  if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">{labels.empty}</section>;
  return null;
}
