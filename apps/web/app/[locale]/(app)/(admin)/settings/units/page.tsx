import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { PageHead, Section } from '../_components';
import { UnitsManager, type UnitsManagerLabels } from './_components/UnitsManager';

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/data-screens.jsx:151-187';

export const dynamic = 'force-dynamic';

type UnitCategory = 'mass' | 'volume' | 'count';

type UnitOfMeasure = {
  id: string;
  category: UnitCategory;
  code: string;
  name: string;
  factorToBase: number;
  isBase: boolean;
};

type CustomConversion = {
  id: string;
  label: string;
  from: string;
  to: string;
  factor: number;
};

type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type UnitsLabels = {
  title: string;
  subtitle: string;
  addUnit: string;
  baseUnitPrefix: string;
  code: string;
  name: string;
  factorToBase: string;
  baseQuestion: string;
  actions: string;
  base: string;
  customConversions: string;
  customConversionsSubtitle: string;
  noCustomConversions: string;
  addCustomConversion: string;
  noUnits: string;
  loading: string;
  error: string;
  permissionDenied: string;
  saveUnit: string;
  cancel: string;
  category: string;
  label: string;
  fromUnit: string;
  toUnit: string;
  saveConversion: string;
  categoryMass: string;
  categoryVolume: string;
  categoryCount: string;
  errorAlreadyExists: string;
  errorForbidden: string;
  errorInvalidInput: string;
  errorGeneric: string;
};

type UnitsPageProps = {
  params?: Promise<{ locale: string }>;
  units?: UnitOfMeasure[];
  customConversions?: CustomConversion[];
  canEdit?: boolean;
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type UnitRow = {
  id: string | number;
  category: string | null;
  code: string | null;
  name: string | null;
  factor_to_base: string | number | null;
  is_base: boolean | null;
};

type ConversionRow = {
  id: string | number;
  label: string | null;
  from_unit_code: string | null;
  to_unit_code: string | null;
  factor: string | number | null;
};

const DEFAULT_LABELS: UnitsLabels = {
  title: 'Units & conversions',
  subtitle: 'Units of measure used across recipes, stock, and shipping.',
  addUnit: '+ Add unit',
  baseUnitPrefix: 'Base unit:',
  code: 'Code',
  name: 'Name',
  factorToBase: 'Factor to base',
  baseQuestion: 'Base?',
  actions: 'Actions',
  base: 'Base',
  customConversions: 'Custom conversions',
  customConversionsSubtitle: 'Define non-linear conversions (e.g. Flour: 1 cup = 120g).',
  noCustomConversions: 'No custom conversions yet.',
  addCustomConversion: '+ Add custom conversion',
  noUnits: 'No units configured yet.',
  loading: 'Loading units…',
  error: 'Unable to load units.',
  permissionDenied: 'You do not have permission to manage units.',
  saveUnit: 'Save unit',
  cancel: 'Cancel',
  category: 'Category',
  label: 'Label',
  fromUnit: 'From unit',
  toUnit: 'To unit',
  saveConversion: 'Save conversion',
  categoryMass: 'Mass',
  categoryVolume: 'Volume',
  categoryCount: 'Count',
  errorAlreadyExists: 'A unit or conversion with that code already exists.',
  errorForbidden: 'You do not have permission to manage units.',
  errorInvalidInput: 'Please check the values and try again.',
  errorGeneric: 'Could not save. Please try again.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof UnitsLabels>;
const LABEL_NAMESPACE = 'settings.units';

function isMissingTranslation(key: keyof UnitsLabels, value: string) {
  return value === key || value === `${LABEL_NAMESPACE}.${key}`;
}

const CATEGORY_ORDER: UnitCategory[] = ['mass', 'volume', 'count'];

function isUnitCategory(value: string | null | undefined): value is UnitCategory {
  return value === 'mass' || value === 'volume' || value === 'count';
}

function toNumber(value: string | number | null | undefined, fallback = 1) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatFactor(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');
}

function categoryOrder(category: UnitCategory) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function groupedUnits(units: UnitOfMeasure[]) {
  return units.reduce<Record<UnitCategory, UnitOfMeasure[]>>(
    (groups, unit) => {
      groups[unit.category].push(unit);
      return groups;
    },
    { mass: [], volume: [], count: [] },
  );
}

async function buildLabels(locale: string): Promise<UnitsLabels> {
  try {
    const t = await getTranslations({ locale, namespace: LABEL_NAMESPACE });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = isMissingTranslation(key, translated) ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as UnitsLabels);
  } catch (error) {
    console.error('[settings/units] labels_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ...DEFAULT_LABELS };
  }
}

function mapUnitRow(row: UnitRow): UnitOfMeasure | null {
  const category = isUnitCategory(row.category) ? row.category : null;
  const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim() : null;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : code;
  if (!category || !code || !name) return null;
  return {
    id: String(row.id),
    category,
    code,
    name,
    factorToBase: toNumber(row.factor_to_base),
    isBase: row.is_base === true,
  };
}

function mapConversionRow(row: ConversionRow): CustomConversion | null {
  const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null;
  const from = typeof row.from_unit_code === 'string' && row.from_unit_code.trim() ? row.from_unit_code.trim() : null;
  const to = typeof row.to_unit_code === 'string' && row.to_unit_code.trim() ? row.to_unit_code.trim() : null;
  if (!label || !from || !to) return null;
  return { id: String(row.id), label, from, to, factor: toNumber(row.factor) };
}

const MANAGE_PERMISSION = 'settings.units.manage';

async function readUnitsData(): Promise<{ units: UnitOfMeasure[]; customConversions: CustomConversion[]; canEdit: boolean; state: PageState }> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const [unitResult, conversionResult, permissionResult] = await Promise.all([
        queryClient.query<UnitRow>(
          `select id,
                  category,
                  code,
                  name,
                  factor_to_base,
                  is_base
             from public.unit_of_measure
            where org_id = app.current_org_id()
              and deleted_at is null
            order by category asc, is_base desc, code asc`,
        ),
        queryClient.query<ConversionRow>(
          `select id,
                  label,
                  from_unit_code,
                  to_unit_code,
                  factor
             from public.uom_custom_conversions
            where org_id = app.current_org_id()
              and deleted_at is null
            order by label asc`,
        ),
        // Real RBAC: canEdit derives from the seeded `settings.units.manage`
        // permission, never a hardcoded flag. Canonical dual-store check (matches
        // actions/infra/machine.ts / line.ts / warehouse.ts AND the manage-units
        // action): LEFT JOIN normalized role_permissions + fall back to the legacy
        // roles.permissions jsonb store and the admin role code/slug allowlist, so a
        // jsonb-only grant keeps the UI and the action in agreement.
        queryClient.query<{ ok: boolean }>(
          `select true as ok
             from public.user_roles ur
             join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
             left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
            where ur.user_id = $1::uuid
              and ur.org_id = $2::uuid
              and (rp.permission is not null or r.permissions ? $3 or r.code = any($4::text[]) or r.slug = any($4::text[]))
            limit 1`,
          [userId, orgId, MANAGE_PERMISSION, ['owner', 'admin', 'module_admin']],
        ),
      ]);
      const units = unitResult.rows.map(mapUnitRow).filter((row): row is UnitOfMeasure => row !== null);
      const customConversions = conversionResult.rows
        .map(mapConversionRow)
        .filter((row): row is CustomConversion => row !== null);
      const canEdit = permissionResult.rows.length > 0;
      return { units, customConversions, canEdit, state: units.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[settings/units] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { units: [], customConversions: [], canEdit: false, state: 'error' };
  }
}

function toManagerLabels(labels: UnitsLabels): UnitsManagerLabels {
  return {
    addUnit: labels.addUnit,
    addCustomConversion: labels.addCustomConversion,
    code: labels.code,
    name: labels.name,
    factorToBase: labels.factorToBase,
    category: labels.category,
    base: labels.base,
    baseQuestion: labels.baseQuestion,
    saveUnit: labels.saveUnit,
    cancel: labels.cancel,
    label: labels.label,
    fromUnit: labels.fromUnit,
    toUnit: labels.toUnit,
    saveConversion: labels.saveConversion,
    categoryMass: labels.categoryMass,
    categoryVolume: labels.categoryVolume,
    categoryCount: labels.categoryCount,
    errorAlreadyExists: labels.errorAlreadyExists,
    errorForbidden: labels.errorForbidden,
    errorInvalidInput: labels.errorInvalidInput,
    errorGeneric: labels.errorGeneric,
  };
}

function UnitsSection({ category, units, labels }: { category: UnitCategory; units: UnitOfMeasure[]; labels: UnitsLabels }) {
  const baseUnit = units.find((unit) => unit.isBase);
  // Parity: prototype renders each category as a `Section` (.sg-section frame +
  // .sg-section-head 14px/600) wrapping a bare prototype-style <table>
  // (grey th, td borders, "Base" badge). data-screens.jsx:163-180.
  return (
    <Section title={category} sub={`${labels.baseUnitPrefix} ${baseUnit?.name ?? '—'}`}>
      <table aria-label={`${category} units`}>
        <thead>
          <tr>
            <th scope="col">{labels.code}</th>
            <th scope="col">{labels.name}</th>
            <th scope="col" className="num">{labels.factorToBase}</th>
            <th scope="col">{labels.baseQuestion}</th>
            <th scope="col">{labels.actions}</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id}>
              <td className="mono">{unit.code}</td>
              <td style={{ fontWeight: 500 }}>{unit.name}</td>
              <td className="mono num" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatFactor(unit.factorToBase)}
              </td>
              {unit.isBase ? (
                <td>
                  <span className="badge badge-blue">{labels.base}</span>
                </td>
              ) : (
                <td>
                  <span className="muted">—</span>
                </td>
              )}
              <td className="muted" aria-label={`${unit.code} actions menu`}>
                ⋮
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function CustomConversionsSection({
  conversions,
  labels,
  canEdit,
  unitCodes,
}: {
  conversions: CustomConversion[];
  labels: UnitsLabels;
  canEdit: boolean;
  unitCodes: string[];
}) {
  const addConversionCta = canEdit ? (
    <UnitsManager labels={toManagerLabels(labels)} unitCodes={unitCodes} variant="conversion" />
  ) : (
    <a href="#add-custom-conversion" className="font-medium text-blue-600 underline-offset-4 hover:underline">
      {labels.addCustomConversion}
    </a>
  );

  // Parity: prototype "Custom conversions" Section with the empty-state line +
  // "+ Add conversion" link (data-screens.jsx:182-184).
  return (
    <Section title={labels.customConversions} sub={labels.customConversionsSubtitle}>
      {conversions.length > 0 ? (
        <div className="space-y-3">
          <ul className="space-y-2 text-sm">
            {conversions.map((conversion) => (
              <li key={conversion.id}>
                <span style={{ fontWeight: 500 }}>{conversion.label}</span>: {conversion.from} → {conversion.to} × {formatFactor(conversion.factor)}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 12 }}>{addConversionCta}</p>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          {labels.noCustomConversions} {addConversionCta}
        </p>
      )}
    </Section>
  );
}

function StateMessage({ state, labels }: { state: Exclude<PageState, 'ready'>; labels: UnitsLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label="Loading units" className="rounded-xl border bg-white px-6 py-8 text-sm text-muted-foreground">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {labels.permissionDenied}
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-white px-6 py-4 text-sm text-muted-foreground">
      {labels.noUnits}
    </div>
  );
}

export default async function UnitsPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as UnitsPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const [labels, loadedData] = await Promise.all([buildLabels(locale), props.units ? Promise.resolve(null) : readUnitsData()]);
  const units = props.units ?? loadedData?.units ?? [];
  const customConversions = props.customConversions ?? loadedData?.customConversions ?? [];
  const canEdit = props.canEdit ?? loadedData?.canEdit ?? false;
  const state = props.state ?? loadedData?.state ?? (units.length ? 'ready' : 'empty');
  const groups = groupedUnits(units);
  const visibleCategories = CATEGORY_ORDER.filter((category) => groups[category].length > 0).sort(
    (left, right) => categoryOrder(left) - categoryOrder(right),
  );
  const unitCodes = units.map((unit) => unit.code);
  const managerLabels = toManagerLabels(labels);

  return (
    <main data-screen="settings-units" data-prototype-source={PROTOTYPE_SOURCE} className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={canEdit ? <UnitsManager labels={managerLabels} unitCodes={unitCodes} variant="unit" /> : undefined}
      />

      {state === 'ready' ? (
        <>
          {visibleCategories.map((category) => (
            <UnitsSection key={category} category={category} units={groups[category]} labels={labels} />
          ))}
          <CustomConversionsSection conversions={customConversions} labels={labels} canEdit={canEdit} unitCodes={unitCodes} />
        </>
      ) : (
        <>
          <StateMessage state={state} labels={labels} />
          {state === 'empty' ? (
            <CustomConversionsSection conversions={customConversions} labels={labels} canEdit={canEdit} unitCodes={unitCodes} />
          ) : null}
        </>
      )}
    </main>
  );
}
