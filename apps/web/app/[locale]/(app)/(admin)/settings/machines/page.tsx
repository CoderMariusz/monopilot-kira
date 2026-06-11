import { getTranslations } from 'next-intl/server';

import { listMachines, upsertMachine } from './_actions/machine-actions';
import MachinesScreen, { type MachinesLabels } from './_components/machines-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = { params?: Promise<{ locale: string }> };

const STATUS_KEYS = ['active', 'inactive', 'maintenance', 'retired'] as const;

const FALLBACK: MachinesLabels = {
  title: 'Machines',
  description: 'Production machines available for process assignment and line configuration.',
  add: 'Add machine',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  colCode: 'Code',
  colName: 'Name',
  colType: 'Type',
  colStatus: 'Status',
  colCapacity: 'Capacity / hour',
  colActions: 'Actions',
  modalCreateTitle: 'New machine',
  modalEditTitle: 'Edit machine',
  empty: 'No machines configured yet.',
  readOnly: 'You need admin rights to manage machines.',
  saved: 'Machine saved.',
  statusLabels: {
    active: 'Active',
    inactive: 'Inactive',
    maintenance: 'Maintenance',
    retired: 'Retired',
  },
};

async function buildLabels(locale: string): Promise<MachinesLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.machines' });
    const pick = (key: keyof MachinesLabels): string => {
      try {
        const value = t(key as string);
        return value && value.length > 0 ? value : (FALLBACK[key] as string);
      } catch {
        return FALLBACK[key] as string;
      }
    };
    const statusLabels: Record<string, string> = {};
    for (const k of STATUS_KEYS) {
      try {
        statusLabels[k] = t(`status.${k}`);
      } catch {
        statusLabels[k] = FALLBACK.statusLabels[k] ?? k;
      }
    }
    return {
      title: pick('title'),
      description: pick('description'),
      add: pick('add'),
      edit: pick('edit'),
      save: pick('save'),
      cancel: pick('cancel'),
      colCode: pick('colCode'),
      colName: pick('colName'),
      colType: pick('colType'),
      colStatus: pick('colStatus'),
      colCapacity: pick('colCapacity'),
      colActions: pick('colActions'),
      modalCreateTitle: pick('modalCreateTitle'),
      modalEditTitle: pick('modalEditTitle'),
      empty: pick('empty'),
      readOnly: pick('readOnly'),
      saved: pick('saved'),
      statusLabels,
    };
  } catch {
    return { ...FALLBACK };
  }
}

export default async function SettingsMachinesPage({ params }: PageProps = {}) {
  const { locale } = params ? await params : { locale: 'en' };
  const [labels, loaded] = await Promise.all([buildLabels(locale), listMachines()]);

  if (loaded.state === 'error') {
    return (
      <main data-testid="settings-machines-page" data-screen="settings-machines" className="space-y-3 p-6">
        <header data-region="page-head">
          <h1 className="page-title">{labels.title}</h1>
        </header>
        <section className="alert alert-red" role="alert">
          Unable to load machines.
        </section>
      </main>
    );
  }

  return (
    <main data-testid="settings-machines-page" data-screen="settings-machines" className="space-y-4 p-6">
      <header data-region="page-head" className="space-y-1">
        <h1 className="page-title">{labels.title}</h1>
        <p className="muted text-[13px]">{labels.description}</p>
      </header>
      <MachinesScreen
        machines={loaded.machines}
        canEdit={loaded.canEdit}
        labels={labels}
        upsertMachine={upsertMachine}
      />
    </main>
  );
}
