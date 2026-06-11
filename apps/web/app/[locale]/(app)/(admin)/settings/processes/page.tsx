import {
  SingleReferenceScreen,
  type SingleReferenceScreenConfig,
} from '../_components/single-reference-screen';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

// Schema-driven process steps reference (reference.processes — seeded by
// seeds/reference-schemas.sql T-093). Parity source: the shared reference-data
// screen at settings/reference (admin-screens.jsx:561-621 reference_data_screen).
const PROCESSES_CONFIG: SingleReferenceScreenConfig = {
  tableCode: 'processes',
  labelNamespace: 'processes',
  definition: {
    code: 'processes',
    name: 'Process steps',
    desc: 'Schema-driven manufacturing process-step reference data.',
    marker: 'TENANT',
  },
  fallbackColumns: [
    { key: 'process_code', label: 'Process code', type: 'badge' },
    { key: 'name', label: 'Name', type: 'text' },
    // Category is a closed enum validated by the reference upsert Server Action
    // (reference_schemas: reference.processes.category, validation_json.enum_values
    // — packages/db/seeds/reference-schemas.sql:120 / migration 073). Free text
    // would yield invalid_input, so render a dropdown limited to these values.
    {
      key: 'category',
      label: 'Category',
      type: 'badge',
      enumOptions: ['preparation', 'processing', 'packaging', 'quality', 'logistics'],
    },
    {
      key: 'cost_mode',
      label: 'Cost mode',
      type: 'badge',
      enumOptions: ['per_hour', 'per_run'],
      formOnly: true,
    },
    { key: 'cost_rate', label: 'Rate', type: 'number', formOnly: true },
    { key: 'currency', label: 'Currency', type: 'text', formOnly: true },
    // Migration 276 — machine assignment + staffing + setup cost (reference.processes
    // jsonb keys, mirroring how 269 exposed cost_mode/cost_rate/currency).
    // machine_id is a soft text reference to public.machines (code or id): the
    // shared SingleReferenceScreen.enumOptions is a static string[] with no dynamic
    // dropdown source, so the machine is entered as text here and managed in the
    // dedicated Machines screen (/settings/machines). See deviation log in the
    // K4 report — a dynamic machines dropdown would require a non-trivial
    // enhancement to the concurrently-edited shared reference screen.
    { key: 'machine_id', label: 'Machine (code/id)', type: 'text', formOnly: true },
    { key: 'staffing_count', label: 'Staffing', type: 'number', formOnly: true },
    { key: 'setup_cost', label: 'Setup cost', type: 'number', formOnly: true },
    { key: 'process_cost', label: 'Cost', type: 'text', tableOnly: true },
  ],
};

export default async function ProcessesSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  return SingleReferenceScreen({ locale, config: PROCESSES_CONFIG });
}
