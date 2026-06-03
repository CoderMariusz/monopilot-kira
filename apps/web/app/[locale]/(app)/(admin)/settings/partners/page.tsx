import {
  SingleReferenceScreen,
  type SingleReferenceScreenConfig,
} from '../_components/single-reference-screen';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

// Schema-driven business-partner reference (reference.partners — seeded by
// seeds/reference-schemas.sql T-093). Suppliers/customers as settings-shaped
// master data. Parity source: the shared reference-data screen at
// settings/reference (admin-screens.jsx:561-621 reference_data_screen).
const PARTNERS_CONFIG: SingleReferenceScreenConfig = {
  tableCode: 'partners',
  labelNamespace: 'partners',
  definition: {
    code: 'partners',
    name: 'Suppliers & customers',
    desc: 'Schema-driven business-partner reference data (suppliers, customers).',
    marker: 'TENANT',
  },
  fallbackColumns: [
    { key: 'partner_code', label: 'Partner code', type: 'badge' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'partner_type', label: 'Type', type: 'badge' },
    { key: 'status', label: 'Status', type: 'badge' },
  ],
};

export default async function PartnersSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  return SingleReferenceScreen({ locale, config: PARTNERS_CONFIG });
}
