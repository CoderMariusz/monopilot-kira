import React from 'react';
import { getTranslations } from 'next-intl/server';

import PromotionsScreen, {
  type CallerAccess,
  type Labels,
  type PageState,
  type PromotionRecord,
  type PromotionStage,
  type TenantMigrationRow,
} from './promotions-screen.client';

export const dynamic = 'force-dynamic';

type Props = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  callerAccess?: CallerAccess;
  promotionStages?: PromotionStage[];
  promotions?: PromotionRecord[];
  tenantMigrations?: TenantMigrationRow[];
  state?: PageState;
};

const DEFAULT_LABEL_KEYS: Labels = {
  title: 'settings.promotions.title',
  subtitle: 'settings.promotions.subtitle',
  startPromotion: 'settings.promotions.startPromotion',
  activeTab: 'settings.promotions.activeTab',
  historyTab: 'settings.promotions.historyTab',
  stageOverview: 'settings.promotions.stageOverview',
  activePromotions: 'settings.promotions.activePromotions',
  historyTitle: 'settings.promotions.historyTitle',
  loading: 'settings.promotions.loading',
  empty: 'settings.promotions.empty',
  error: 'settings.promotions.error',
  forbidden: 'settings.promotions.forbidden',
};

const DEFAULT_CALLER_ACCESS: CallerAccess = {
  roleCodes: [],
  permissions: [],
};

const DEFAULT_STAGES: PromotionStage[] = [
  { id: 'L3-tenant', label: 'L3 · Tenant', description: 'Tenant-local overrides and sandbox changes.', count: 0 },
  { id: 'L2-local', label: 'L2 · Shared local', description: 'Shared local changes available to multiple tenant sites.', count: 0 },
  { id: 'L1-core', label: 'L1 · Core / universal', description: 'Universal Monopilot defaults requiring controlled review.', count: 0 },
];

const LABEL_KEYS = Object.keys(DEFAULT_LABEL_KEYS) as Array<keyof Labels & string>;

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.promotions' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const labelKey = String(key);
        const translated = t(labelKey);
        labels[key] = translated && translated !== labelKey ? translated : DEFAULT_LABEL_KEYS[key];
      } catch {
        labels[key] = DEFAULT_LABEL_KEYS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABEL_KEYS };
  }
}

export default async function PromotionsPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as Props;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const searchParams = props.searchParams ? await props.searchParams : {};

  return React.createElement(PromotionsScreen, {
    labels: await buildLabels(locale),
    promotionStages: props.promotionStages ?? DEFAULT_STAGES,
    promotions: props.promotions ?? [],
    tenantMigrations: props.tenantMigrations ?? [],
    callerAccess: props.callerAccess ?? DEFAULT_CALLER_ACCESS,
    state: props.state ?? ((props.promotions ?? []).length === 0 ? 'empty' : 'ready'),
    initialTab: searchParams.tab === 'history' ? 'history' : 'active',
  });
}
