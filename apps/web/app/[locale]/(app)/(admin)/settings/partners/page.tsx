import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

// DB-cleanup Phase 3 (owner-approved): the former schema-driven
// SingleReferenceScreen here was backed by the decorative reference_tables.partners
// store, which had ZERO operational readers and caused the "Settings shows 2,
// Planning shows 4" mismatch. Suppliers and customers now have a single source of
// truth in their operational modules, so this route is a minimal landing that
// points operators there.
//
// Parity sources (no new styling invented):
//  - page chrome: settings/scanner-auth/page.tsx (main.space-y-4.p-6 +
//    header[data-region=page-head] + h1.page-title + p.muted.text-[13px])
//  - cards + anchors: settings/tenant/page.tsx (section.card / card-head /
//    card-title and the a.btn.btn-secondary.btn-sm "{label} →" with /${locale}/…)

const FALLBACK = {
  movedTitle: 'Suppliers & customers',
  movedBody:
    'Suppliers and customers are managed in their operational modules — there is one source of truth for each. Use the links below to maintain them.',
  suppliersLink: 'Manage suppliers',
  suppliersDescription: 'Supplier master records, specs and scorecards (Planning).',
  customersLink: 'Manage customers',
  customersDescription: 'Customer master records used for sales orders and shipping.',
} as const;

type PartnerLabelKey = keyof typeof FALLBACK;

export default async function PartnersSettingsPage({ params }: PageProps) {
  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'settings.partners' });
  const label = (key: PartnerLabelKey): string => {
    try {
      const value = t(key);
      return value && value.length > 0 ? value : FALLBACK[key];
    } catch {
      return FALLBACK[key];
    }
  };

  const cards: ReadonlyArray<{ key: string; href: string; title: string; description: string }> = [
    {
      key: 'suppliers',
      href: `/${locale}/planning/suppliers`,
      title: label('suppliersLink'),
      description: label('suppliersDescription'),
    },
    {
      key: 'customers',
      href: `/${locale}/shipping/customers`,
      title: label('customersLink'),
      description: label('customersDescription'),
    },
  ];

  return (
    <main data-testid="settings-partners-page" data-screen="settings-partners" className="space-y-4 p-6">
      <header data-region="page-head" className="space-y-1">
        <h1 className="page-title">{label('movedTitle')}</h1>
        <p className="muted text-[13px]">{label('movedBody')}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <section
            key={card.key}
            role="region"
            aria-label={card.title}
            data-testid={`settings-partners-${card.key}-card`}
            className="card"
          >
            <div className="card-head">
              <div>
                <h2 className="card-title">{card.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              </div>
              <a className="btn btn-secondary btn-sm" href={card.href}>
                {card.title} →
              </a>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
