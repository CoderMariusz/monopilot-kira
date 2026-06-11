'use client';

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { Machine, UpsertMachineInput, UpsertMachineResult } from '../_actions/machine-actions';

const STATUS_VALUES = ['active', 'inactive', 'maintenance', 'retired'] as const;

export type MachinesLabels = {
  title: string;
  description: string;
  add: string;
  edit: string;
  save: string;
  cancel: string;
  colCode: string;
  colName: string;
  colType: string;
  colStatus: string;
  colCapacity: string;
  colActions: string;
  modalCreateTitle: string;
  modalEditTitle: string;
  empty: string;
  readOnly: string;
  saved: string;
  statusLabels: Record<string, string>;
};

type UpsertMachine = (input: UpsertMachineInput) => Promise<UpsertMachineResult>;

export type MachinesScreenProps = {
  machines: Machine[];
  canEdit: boolean;
  labels: MachinesLabels;
  upsertMachine: UpsertMachine;
};

type Draft = {
  id: string | null;
  code: string;
  name: string;
  machineType: string;
  status: string;
  capacityPerHour: string;
};

const EMPTY_DRAFT: Draft = { id: null, code: '', name: '', machineType: '', status: 'active', capacityPerHour: '' };

export function MachinesScreen({ machines, canEdit, labels, upsertMachine }: MachinesScreenProps) {
  const [rows, setRows] = React.useState<Machine[]>(machines);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const statusOptions = STATUS_VALUES.map((s) => ({ value: s, label: labels.statusLabels[s] ?? s }));

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function openEdit(machine: Machine) {
    setDraft({
      id: machine.id,
      code: machine.code,
      name: machine.name,
      machineType: machine.machineType,
      status: machine.status,
      capacityPerHour: machine.capacityPerHour == null ? '' : String(machine.capacityPerHour),
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const capacity = draft.capacityPerHour.trim() === '' ? null : Number(draft.capacityPerHour);
      const result = await upsertMachine({
        id: draft.id,
        code: draft.code,
        name: draft.name,
        machineType: draft.machineType,
        status: draft.status as (typeof STATUS_VALUES)[number],
        capacityPerHour: capacity,
      });
      if (result.ok) {
        setRows((current) => {
          const exists = current.some((m) => m.id === result.machine.id);
          return exists
            ? current.map((m) => (m.id === result.machine.id ? result.machine : m))
            : [...current, result.machine].sort((a, b) => a.code.localeCompare(b.code));
        });
        setMessage(labels.saved);
        setOpen(false);
        return;
      }
      setError(result.error);
    } catch {
      setError('persistence_failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="card" data-testid="settings-machines-screen">
      <CardHeader className="card-head !mb-0 !p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="card-title">{labels.title}</CardTitle>
            <CardDescription className="muted mt-1 text-[13px]">{labels.description}</CardDescription>
          </div>
          <Button type="button" disabled={!canEdit} onClick={openCreate} data-testid="machines-add">
            {labels.add}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="!p-0">
        {rows.length === 0 ? (
          <p role="status" className="alert alert-blue mt-3" data-testid="machines-empty">
            {labels.empty}
          </p>
        ) : (
          <Table className="mt-3 w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colCode}</TableHead>
                <TableHead>{labels.colName}</TableHead>
                <TableHead>{labels.colType}</TableHead>
                <TableHead>{labels.colStatus}</TableHead>
                <TableHead>{labels.colCapacity}</TableHead>
                <TableHead>{labels.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((machine) => (
                <TableRow key={machine.id} data-testid={`machine-row-${machine.code}`}>
                  <TableCell className="font-medium">{machine.code}</TableCell>
                  <TableCell>{machine.name}</TableCell>
                  <TableCell>{machine.machineType}</TableCell>
                  <TableCell>{labels.statusLabels[machine.status] ?? machine.status}</TableCell>
                  <TableCell>{machine.capacityPerHour ?? '—'}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      className="btn-secondary"
                      disabled={!canEdit}
                      onClick={() => openEdit(machine)}
                      data-testid={`machine-edit-${machine.code}`}
                    >
                      {labels.edit}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {!canEdit ? (
          <p role="status" className="muted mt-3 text-[11px]">
            {labels.readOnly}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="alert alert-green mt-3">
            {message}
          </p>
        ) : null}
      </CardContent>

      <Modal open={open} onOpenChange={setOpen} size="md" modalId="settings-machine-editor">
        <Modal.Header title={draft.id ? labels.modalEditTitle : labels.modalCreateTitle} />
        <Modal.Body>
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              {labels.colCode}
              <Input
                className="mt-1"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              {labels.colName}
              <Input
                className="mt-1"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              {labels.colType}
              <Input
                className="mt-1"
                value={draft.machineType}
                onChange={(e) => setDraft({ ...draft, machineType: e.target.value })}
              />
            </label>
            <div className="block text-sm font-medium">
              {labels.colStatus}
              <Select
                aria-label={labels.colStatus}
                className="mt-1"
                value={draft.status}
                options={statusOptions}
                onValueChange={(v) => setDraft({ ...draft, status: v })}
              />
            </div>
            <label className="block text-sm font-medium">
              {labels.colCapacity}
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={draft.capacityPerHour}
                onChange={(e) => setDraft({ ...draft, capacityPerHour: e.target.value })}
              />
            </label>
            {error ? (
              <div role="alert" className="alert alert-red">
                {error}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button type="button" disabled={pending} onClick={() => void save()} data-testid="machine-save">
            {labels.save}
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
}

export default MachinesScreen;
