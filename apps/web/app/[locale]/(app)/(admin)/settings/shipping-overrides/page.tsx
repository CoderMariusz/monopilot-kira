import { SettingsRouteStub } from '../_components/settings-route-stub';
import { readShippingOverridesSettingsData } from './_actions/shipping-overrides';

export const dynamic = 'force-dynamic';

export default async function ShippingOverridesSettingsPage() {
  await readShippingOverridesSettingsData();
  return <SettingsRouteStub stubKey="ship_override_reasons" />;
}
