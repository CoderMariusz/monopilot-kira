import React from 'react';
import { getTranslations } from 'next-intl/server';

type LineStatus = 'draft' | 'active';

type MachinePreview = {
  id: string;
  code: string;
  name: string;
  seq: number;
};

type ProductionLine = {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  machines: MachinePreview[];
};

type ActivateLineInput = { lineId: string };

type ActivateLineResult =
  | { ok: true; data: { lineId: string; status: 'active' } }
  | { ok: false; code: 'NO_MACHINE'; validation: 'V-SET-62'; lineId: string; message: string };

type LinesPageProps = {
  params?: Promise<{ locale: string }>;
  lines?: ProductionLine[];
  canUpdateInfra?: boolean;
  activateLine?: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type LinesLabels = {
  title: string;
  subtitle: string;
  columnLine: string;
  columnStatus: string;
  columnMachines: string;
  bulkActivate: string;
  insufficientPermission: string;
  noMachineTitle: string;
  noMachineCode: string;
  noMachineBody: string;
  selectLine: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  provenance: string;
};

const DEFAULT_LABELS: LinesLabels = {
  title: 'Production lines',
  subtitle: 'Manage production lines and their assigned machine sequence.',
  columnLine: 'Line',
  columnStatus: 'Status',
  columnMachines: 'Machine sequence preview',
  bulkActivate: 'Bulk Activate',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to activate production lines.',
  noMachineTitle: 'No machines assigned',
  noMachineCode: 'NO_MACHINE',
  noMachineBody: 'Assign at least one machine before activating this line. V-SET-62',
  selectLine: 'Select {name}',
  loading: 'Loading production lines…',
  empty: 'No production lines are available for this workspace.',
  error: 'Unable to load production lines. Try again after the backend is available.',
  forbidden: 'You do not have permission to update production line infrastructure settings.',
  provenance: 'Data source: live loader props; empty fallback is used only when the runtime loader has no rows.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof LinesLabels>;

async function buildLabels(locale: string): Promise<LinesLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.infra.lines' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as LinesLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function unavailableActivateLine(input: ActivateLineInput): Promise<ActivateLineResult> {
  return {
    ok: false,
    code: 'NO_MACHINE',
    validation: 'V-SET-62',
    lineId: input.lineId,
    message: DEFAULT_LABELS.noMachineBody,
  };
}

function orderedMachines(line: ProductionLine) {
  return [...line.machines].sort((left, right) => left.seq - right.seq || left.code.localeCompare(right.code));
}

function statusClassName(status: LineStatus) {
  return status === 'active'
    ? 'inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200'
    : 'inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200';
}

function formatSelectLabel(template: string, line: ProductionLine) {
  return template.includes('{name}') ? template.replace('{name}', line.name) : `Select ${line.name}`;
}

export default async function LinesPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as LinesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const lines = props.lines ?? [];
  const state = props.state ?? (lines.length === 0 ? 'empty' : 'ready');

  return (
    <LinesScreen
      labels={labels}
      lines={lines}
      canUpdateInfra={props.canUpdateInfra ?? false}
      activateLine={props.activateLine ?? unavailableActivateLine}
      state={state}
    />
  );
}

function LinesScreen({
  labels,
  lines,
  canUpdateInfra,
  activateLine,
  state,
}: {
  labels: LinesLabels;
  lines: ProductionLine[];
  canUpdateInfra: boolean;
  activateLine: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult;
  state: NonNullable<LinesPageProps['state']>;
}) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [statusById, setStatusById] = React.useState<Record<string, LineStatus>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.status])),
  );
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setStatusById(Object.fromEntries(lines.map((line) => [line.id, line.status])));
    setSelectedIds([]);
    setRowErrors({});
  }, [lines]);

  const toggleSelected = (lineId: string, checked: boolean) => {
    setSelectedIds((current) => (checked ? [...new Set([...current, lineId])] : current.filter((id) => id !== lineId)));
  };

  const bulkActivate = async () => {
    if (!canUpdateInfra || selectedIds.length === 0) return;
    setPending(true);
    const nextErrors: Record<string, string> = {};

    for (const lineId of selectedIds) {
      const result = await activateLine({ lineId });
      if ('data' in result) {
        setStatusById((current) => ({ ...current, [result.data.lineId]: result.data.status }));
      } else {
        nextErrors[result.lineId] = `${labels.noMachineCode}: ${result.message || labels.noMachineBody} ${result.validation}`;
      }
    }

    setRowErrors(nextErrors);
    setPending(false);
  };

  const renderState = () => {
    if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{labels.loading}</section>;
    if (state === 'error') return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{labels.error}</section>;
    if (state === 'permission_denied') return <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">{labels.forbidden}</section>;
    if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">{labels.empty}</section>;
    return null;
  };

  return (
    <main data-testid="app-shell" className="min-h-screen bg-slate-50 text-slate-950">
      <aside data-testid="app-sidebar" aria-label="Settings navigation" className="border-b border-slate-200 bg-white px-6 py-3 text-sm text-slate-600">
        Settings / Infrastructure
      </aside>
      <header data-testid="app-topbar" className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SET-018</div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-6" aria-label="Production line workspace">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">{labels.title} ({lines.length})</div>
              <p className="mt-1 text-xs text-slate-500">{labels.provenance}</p>
            </div>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              disabled={!canUpdateInfra || pending || selectedIds.length === 0}
              aria-label={!canUpdateInfra ? labels.insufficientPermission : labels.bulkActivate}
              onClick={() => void bulkActivate()}
            >
              {labels.bulkActivate}
            </button>
          </div>
        </section>

        {state === 'ready' ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table aria-label={labels.title} className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
                  <th scope="col" className="px-4 py-3">{labels.columnLine}</th>
                  <th scope="col" className="px-4 py-3">{labels.columnMachines}</th>
                  <th scope="col" className="px-4 py-3">{labels.columnStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const status = statusById[line.id] ?? line.status;
                  const machines = orderedMachines(line);
                  const visibleMachines = machines.slice(0, 6);
                  const overflowCount = Math.max(machines.length - visibleMachines.length, 0);
                  const rowError = rowErrors[line.id];

                  return (
                    <tr key={line.id} className="align-top" data-testid="settings-line-row">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          aria-label={formatSelectLabel(labels.selectLine, line)}
                          checked={selectedIds.includes(line.id)}
                          onChange={(event) => toggleSelected(line.id, event.currentTarget.checked)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-950">{line.name}</div>
                        <div className="mt-1 font-mono text-xs text-slate-500">{line.code}</div>
                        {rowError ? (
                          <div role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                            <span className="font-semibold">{labels.noMachineTitle}</span>: {rowError}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div data-testid="settings-line-machine-preview" className="flex max-w-xl flex-wrap gap-2">
                          {visibleMachines.length > 0 ? visibleMachines.map((machine) => (
                            <span
                              key={machine.id}
                              data-testid="settings-line-machine-chip"
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700"
                              title={machine.name}
                            >
                              <span className="font-semibold text-slate-900">{machine.seq}</span> {machine.code}
                            </span>
                          )) : <span className="text-xs text-slate-500">{labels.noMachineTitle}</span>}
                          {overflowCount > 0 ? <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">+{overflowCount} more</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={statusClassName(status)}>{status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : renderState()}
      </section>
    </main>
  );
}
