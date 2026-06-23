'use client';

/**
 * Wave-shipping — shipping module tab bar (Sales-orders / Shipments).
 *
 * The desktop sidebar exposes one link per module (lib/navigation/app-nav.ts), so the
 * "Shipments" entry is added as a TAB on the shipping landing (the parity-policy-allowed
 * alternative to a sidebar sub-entry). This is rendered at the top of both the shipping
 * SO list and the new shipments screens so the two sub-areas are reachable from each
 * other. Labels are i18n strings resolved by the caller (Shipping.shipments.tabs.*),
 * never inline literals.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type ShippingTabsLabels = {
  salesOrders: string;
  shipments: string;
};

export function ShippingTabs({
  locale,
  labels,
}: {
  locale: string;
  labels: ShippingTabsLabels;
}) {
  const pathname = usePathname() ?? '';
  const onShipments = pathname.includes('/shipping/shipments');

  const tabs = [
    { key: 'salesOrders', href: `/${locale}/shipping`, label: labels.salesOrders, active: !onShipments },
    { key: 'shipments', href: `/${locale}/shipping/shipments`, label: labels.shipments, active: onShipments },
  ];

  return (
    <div role="tablist" aria-label="Shipping" data-testid="shipping-tabs" className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          prefetch={false}
          role="tab"
          aria-selected={t.active}
          data-testid={`shipping-tab-${t.key}`}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium',
            t.active ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
