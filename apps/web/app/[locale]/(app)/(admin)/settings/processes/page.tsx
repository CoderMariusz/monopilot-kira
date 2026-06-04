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
  ],
};

export default async function ProcessesSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  return SingleReferenceScreen({ locale, config: PROCESSES_CONFIG });
}
