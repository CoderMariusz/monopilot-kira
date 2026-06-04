/**
 * T-044 — UI: TEC-084 Recipe Sheet print view — Server Component page.
 *
 * Route: /[locale]/(app)/technical/bom/[itemCode]/recipe
 *   `[itemCode]` resolves to `bom_headers.product_id` (the FG product_code).
 *
 * Standalone print route consuming the EXISTING merged BOM read API
 * (getBomDetailPage) for the recipe rows + header, plus getRecipeIndustry for the
 * INDUSTRY-CONFIG variant. Real, org-scoped data under RLS. No mocks. Cross-org /
 * unknown FG → notFound() (404).
 *
 * Prototype parity source: bom-detail.jsx:551-603. Red-lines: FG canonical;
 * private_jsonb never rendered (only the public `notes` is passed); read-only.
 */

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getBomDetailPage } from '../../_actions/detail-page';
import { getRecipeIndustry, type RecipeIndustry } from '../../_actions/recipe';
import {
  RecipeSheetTab,
  type IndustrySectionLabels,
  type RecipeLine,
  type RecipeSheetData,
  type RecipeSheetLabels,
} from '../../_tabs/recipe-sheet-tab';

export const dynamic = 'force-dynamic';

const DEFAULT_LABELS: RecipeSheetLabels = {
  print: 'Print',
  subhead: 'BOM {code} · v{version} · Yield {yield}% · {approved}',
  ingredientsTitle: 'Ingredients',
  processTitle: 'Process',
  notesTitle: 'Allergens & notes',
  colCode: 'Code',
  colName: 'Ingredient',
  colQty: 'Qty',
  colPct: '%',
  emptyLines: 'This BOM version has no ingredient lines.',
  approvedBy: 'Approved by',
  pendingApproval: 'Pending approval',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof RecipeSheetLabels>;

async function buildLabels(
  locale: string,
): Promise<{ labels: RecipeSheetLabels; industryLabels: Partial<Record<RecipeIndustry, IndustrySectionLabels>> }> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.bomRecipe' });
    const read = (key: string, fallback: string) => {
      try {
        const v = t(key);
        return v === key ? fallback : v;
      } catch {
        return fallback;
      }
    };
    const labels = LABEL_KEYS.reduce((acc, key) => {
      acc[key] = read(key, DEFAULT_LABELS[key]);
      return acc;
    }, {} as RecipeSheetLabels);
    const industryLabels: Partial<Record<RecipeIndustry, IndustrySectionLabels>> = {
      bakery: {
        ingredientsTitle: read('bakeryIngredientsTitle', 'Recipe ingredients'),
        processTitle: read('bakeryProcessTitle', 'Method'),
      },
      pharma: {
        ingredientsTitle: read('pharmaIngredientsTitle', 'Formulation'),
        processTitle: read('pharmaProcessTitle', 'Manufacturing procedure'),
      },
    };
    return { labels, industryLabels };
  } catch {
    return { labels: { ...DEFAULT_LABELS }, industryLabels: {} };
  }
}

/** Percent-of-batch from real line quantities (sum-relative), or null when 0. */
function computeLines(
  lines: { id: string; componentCode: string; componentType: string | null; quantity: string; uom: string; manufacturingOperationName: string | null }[],
): RecipeLine[] {
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  return lines.map((l) => {
    const q = Number(l.quantity) || 0;
    const pct = total > 0 ? ((q / total) * 100).toFixed(1) : null;
    return {
      id: l.id,
      code: l.componentCode,
      name: l.componentType,
      quantity: l.quantity,
      uom: l.uom,
      pct,
      operationName: l.manufacturingOperationName,
    };
  });
}

type RecipePageProps = {
  params?: Promise<{ locale: string; itemCode: string }>;
  searchParams?: Promise<{ v?: string }>;
  // Test-only injection seam.
  data?: RecipeSheetData;
  industry?: RecipeIndustry;
};

export default async function BomRecipePage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as RecipePageProps;
  const { locale, itemCode } = props.params
    ? await props.params
    : { locale: 'en', itemCode: '' };
  const sp = props.searchParams ? await props.searchParams : {};

  const { labels, industryLabels } = await buildLabels(locale);

  if (props.data !== undefined) {
    return (
      <main className="px-6 py-6">
        <RecipeSheetTab data={props.data} labels={labels} industry={props.industry ?? 'meat'} industryLabels={industryLabels} />
      </main>
    );
  }

  const productId = decodeURIComponent(itemCode);
  const versionParam = sp.v ? Number(sp.v) : undefined;
  const version = versionParam && Number.isFinite(versionParam) ? versionParam : undefined;

  const result = await getBomDetailPage(productId, version);
  if (!result.ok) {
    if (result.error === 'not_found') notFound();
    notFound();
  }
  const d = result.data;
  const industryRes = await getRecipeIndustry(productId);
  const industry: RecipeIndustry = industryRes.ok ? industryRes.industry : 'meat';

  const data: RecipeSheetData = {
    productCode: d.productId,
    productName: d.productName,
    version: d.selectedVersion,
    yieldPct: d.header.yieldPct,
    approvedByName: d.versions.find((v) => v.isSelected)?.approvedByName ?? null,
    approvedAt: d.versions.find((v) => v.isSelected)?.approvedAt ?? null,
    lines: computeLines(d.lines),
    notes: d.header.notes,
  };

  return (
    <main className="px-6 py-6">
      <RecipeSheetTab data={data} labels={labels} industry={industry} industryLabels={industryLabels} />
    </main>
  );
}
