'use client';

/**
 * SET-PRN / E1 — Printers settings screen (client island).
 *
 * Sibling-conformant with other infra settings screens (lines, warehouses):
 *   page head (eyebrow + title + subtitle) + primary CTA → Add-printer modal
 *   (name / type / address / location / site) → upsertPrinter; a per-row Edit
 *   (re-opens the modal pre-filled) and Activate/Deactivate (upsertPrinter with the
 *   flipped is_active). All five UI states are rendered (loading / empty-with-CTA /
 *   error / data + permission-denied). RBAC (settings.org.update) is resolved
 *   server-side and threaded in as `canManage`; the affordances are hidden/disabled
 *   when absent and the action re-checks the permission regardless.
 *
 * No raw UUIDs: site is shown by name, printer by name; ids stay in data-* hooks.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
export type PrinterType = 'pdf' | 'zpl';

export type PrinterRow = {
  id: string;
  site_id: string | null;
  name: string;
  printer_type: PrinterType;
  address: string | null;
  location: string | null;
  is_active: boolean;
};

export type SiteOption = { id: string; code: string; name: string };

export type UpsertPrinterInput = {
  id?: string;
  name: string;
  printer_type: PrinterType;
  address?: string | null;
  location?: string | null;
  site_id?: string | null;
  is_active?: boolean;
};

export type PrintersLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  sectionTitle: string;
  provenance: string;
  addPrinter: string;
  columnName: string;
  columnType: string;
  columnAddress: string;
  columnLocation: string;
  columnSite: string;
  columnStatus: string;
  columnActions: string;
  typePdf: string;
  typeZpl: string;
  statusActive: string;
  statusInactive: string;
  edit: string;
  deactivate: string;
  activate: string;
  addressNone: string;
  locationNone: string;
  siteNone: string;
  dialogAddTitle: string;
  dialogEditTitle: string;
  fieldName: string;
  fieldType: string;
  fieldAddress: string;
  fieldAddressHelp: string;
  fieldLocation: string;
  fieldLocationHelp: string;
  fieldSite: string;
  fieldSiteOrgWide: string;
  save: string;
  savePending: string;
  cancel: string;
  createSuccess: string;
  saveFailed: string;
  deactivateSuccess: string;
  activateSuccess: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  emptyCta: string;
  error: string;
  forbidden: string;
};

const ORG_WIDE = '__org_wide__';

type DraftPrinter = {
  id?: string;
  name: string;
  printer_type: PrinterType;
  address: string;
  location: string;
  site_id: string | null;
};

const EMPTY_DRAFT: DraftPrinter = { name: '', printer_type: 'pdf', address: '', location: '', site_id: null };

function typeLabel(type: PrinterType, labels: PrintersLabels) {
  return type === 'zpl' ? labels.typeZpl : labels.typePdf;
}

function siteName(siteId: string | null, sites: SiteOption[], labels: PrintersLabels) {
  if (!siteId) return labels.siteNone;
  return sites.find((site) => site.id === siteId)?.name ?? labels.siteNone;
}

function StateNotice({ state, labels }: { state: PageState; labels: PrintersLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

export default function PrintersScreen({
  initialPrinters,
  sites,
  labels,
  canManage,
  upsertPrinter,
  state = 'ready',
}: {
  initialPrinters: PrinterRow[];
  sites: SiteOption[];
  labels: PrintersLabels;
  canManage: boolean;
  upsertPrinter: (input: UpsertPrinterInput) => Promise<PrinterRow> | PrinterRow;
  state?: PageState;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<PrinterRow[]>(() => [...initialPrinters]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftPrinter>(EMPTY_DRAFT);
  const [pending, setPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const disabledReason = canManage ? undefined : labels.insufficientPermission;
  const editing = draft.id != null;

  function openAdd() {
    if (!canManage) return;
    setDraft(EMPTY_DRAFT);
    setActionError(null);
    setDialogOpen(true);
  }

  function openEdit(printer: PrinterRow) {
    if (!canManage) return;
    setDraft({
      id: printer.id,
      name: printer.name,
      printer_type: printer.printer_type,
      address: printer.address ?? '',
      location: printer.location ?? '',
      site_id: printer.site_id,
    });
    setActionError(null);
    setDialogOpen(true);
  }

  async function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending) return;
    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const saved = await upsertPrinter({
        id: draft.id,
        name: draft.name.trim(),
        printer_type: draft.printer_type,
        address: draft.address.trim() || null,
        location: draft.location.trim() || null,
        site_id: draft.site_id,
        is_active: true,
      });
      setRows((current) => {
        const without = current.filter((row) => row.id !== saved.id);
        return [saved, ...without];
      });
      setStatusMessage(labels.createSuccess);
      setDialogOpen(false);
      setDraft(EMPTY_DRAFT);
      // Reconcile the optimistic upsert with the server of record so a later
      // navigation/back can't show a stale printers list.
      router.refresh();
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(printer: PrinterRow) {
    if (!canManage || pending) return;
    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    const nextActive = !printer.is_active;
    try {
      const saved = await upsertPrinter({
        id: printer.id,
        name: printer.name,
        printer_type: printer.printer_type,
        address: printer.address,
        location: printer.location,
        site_id: printer.site_id,
        is_active: nextActive,
      });
      setRows((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      setStatusMessage(nextActive ? labels.activateSuccess : labels.deactivateSuccess);
      router.refresh();
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  const effectiveState: PageState = state === 'empty' && rows.length > 0 ? 'ready' : state;

  return (
    <main
      data-testid="settings-printers-screen"
      data-screen="settings-printers-list"
      aria-labelledby="settings-printers-title"
      className="settings-screen settings-screen--printers space-y-4"
    >
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <p className="settings-eyebrow">{labels.eyebrow}</p>
          <h1 id="settings-printers-title">{labels.title}</h1>
          <p className="muted">{labels.subtitle}</p>
        </div>
        <Button
          type="button"
          className="btn-primary"
          disabled={!canManage}
          aria-label={canManage ? labels.addPrinter : `${labels.addPrinter} — ${labels.insufficientPermission}`}
          onClick={openAdd}
        >
          + {labels.addPrinter}
        </Button>
      </header>

      {statusMessage ? (
        <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {statusMessage}
        </section>
      ) : null}

      <section className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="printer-section-title">
        <div className="settings-section__head">
          <h2 id="printer-section-title">{labels.sectionTitle}</h2>
          <p className="muted text-sm">{labels.provenance}</p>
        </div>
        {actionError ? <div role="alert" className="mt-3 text-sm text-red-700">{actionError}</div> : null}
      </section>

      {dialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="printer-dialog-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="printer-dialog-title" className="text-lg font-semibold text-slate-950">
                {editing ? labels.dialogEditTitle : labels.dialogAddTitle}
              </h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => setDialogOpen(false)} disabled={pending}>
                x
              </Button>
            </div>
            <form onSubmit={(event) => void submitDraft(event)} className="mt-4 space-y-4">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="printer-name">
                {labels.fieldName}
                <Input
                  id="printer-name"
                  aria-label={labels.fieldName}
                  value={draft.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, name: value }));
                  }}
                  required
                  disabled={pending}
                />
              </label>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="printer-type-label">{labels.fieldType}</span>
                <Select
                  value={draft.printer_type}
                  onValueChange={(value) => setDraft((current) => ({ ...current, printer_type: value as PrinterType }))}
                  options={[
                    { value: 'pdf', label: labels.typePdf },
                    { value: 'zpl', label: labels.typeZpl },
                  ]}
                >
                  <SelectTrigger aria-label={labels.fieldType}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">{labels.typePdf}</SelectItem>
                    <SelectItem value="zpl">{labels.typeZpl}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="printer-address">
                {labels.fieldAddress}
                <Input
                  id="printer-address"
                  aria-label={labels.fieldAddress}
                  value={draft.address}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, address: value }));
                  }}
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldAddressHelp}</span>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="printer-location">
                {labels.fieldLocation}
                <Input
                  id="printer-location"
                  aria-label={labels.fieldLocation}
                  value={draft.location}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, location: value }));
                  }}
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">{labels.fieldLocationHelp}</span>
              </label>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="printer-site-label">{labels.fieldSite}</span>
                <Select
                  value={draft.site_id ?? ORG_WIDE}
                  onValueChange={(value) => setDraft((current) => ({ ...current, site_id: value === ORG_WIDE ? null : value }))}
                  options={[
                    { value: ORG_WIDE, label: labels.fieldSiteOrgWide },
                    ...sites.map((site) => ({ value: site.id, label: site.name })),
                  ]}
                >
                  <SelectTrigger aria-label={labels.fieldSite}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ORG_WIDE}>{labels.fieldSiteOrgWide}</SelectItem>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => setDialogOpen(false)} disabled={pending}>
                  {labels.cancel}
                </Button>
                <Button
                  type="submit"
                  className="btn-primary"
                  disabled={!canManage || pending}
                  aria-label={canManage ? labels.save : `${labels.save} — ${labels.insufficientPermission}`}
                >
                  {pending ? labels.savePending : labels.save}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="printer-list-title">
        <h2 id="printer-list-title" className="sr-only">{labels.sectionTitle}</h2>
        {effectiveState === 'ready' ? (
          rows.length > 0 ? (
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnName}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnType}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnAddress}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnLocation}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnSite}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnStatus}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {rows.map((printer) => (
                  <TableRow
                    key={printer.id}
                    data-testid="settings-printer-row"
                    data-printer-id={printer.id}
                    className="align-top hover:bg-slate-50"
                  >
                    <TableCell className="px-4 py-3 font-medium text-slate-950">{printer.name}</TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="info" aria-label={typeLabel(printer.printer_type, labels)}>
                        {typeLabel(printer.printer_type, labels)}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-600">
                      {printer.address || labels.addressNone}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600">
                      {printer.location || labels.locationNone}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-600">
                      {siteName(printer.site_id, sites, labels)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant={printer.is_active ? 'success' : 'muted'} aria-label={printer.is_active ? labels.statusActive : labels.statusInactive}>
                        {printer.is_active ? labels.statusActive : labels.statusInactive}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="dry-run"
                          disabled={!canManage || pending}
                          aria-label={canManage ? `${labels.edit} ${printer.name}` : `${labels.edit} — ${labels.insufficientPermission}`}
                          onClick={() => openEdit(printer)}
                        >
                          {labels.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="dry-run"
                          disabled={!canManage || pending}
                          aria-label={
                            canManage
                              ? `${printer.is_active ? labels.deactivate : labels.activate} ${printer.name}`
                              : `${printer.is_active ? labels.deactivate : labels.activate} — ${labels.insufficientPermission}`
                          }
                          onClick={() => void toggleActive(printer)}
                        >
                          {printer.is_active ? labels.deactivate : labels.activate}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-start gap-3 p-6">
              <p role="status" className="text-sm text-slate-600">{labels.empty}</p>
              <Button
                type="button"
                className="btn-primary"
                disabled={!canManage}
                aria-label={canManage ? labels.emptyCta : `${labels.emptyCta} — ${labels.insufficientPermission}`}
                onClick={openAdd}
              >
                + {labels.emptyCta}
              </Button>
            </div>
          )
        ) : (
          <div className="p-4">
            <StateNotice state={effectiveState} labels={labels} />
          </div>
        )}
      </section>
    </main>
  );
}
