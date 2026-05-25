import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

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
  capabilityMatrix: string;
  unitCrudCapability: string;
  conversionCrudCapability: string;
  deferredReadOnly: string;
  deferredReadOnlyDescription: string;
  saveUnit: string;
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
  capabilityMatrix: 'Units capability matrix',
  unitCrudCapability: 'Units CRUD',
  conversionCrudCapability: 'Custom conversions CRUD',
  deferredReadOnly: 'Read-only / deferred',
  deferredReadOnlyDescription:
    'Unit and conversion maintenance is deferred until the editable reference schema and RBAC action are available. Live rows are displayed read-only; no mock fallback data is used.',
  saveUnit: 'Save unit',
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

async function readUnitsData(): Promise<{ units: UnitOfMeasure[]; customConversions: CustomConversion[]; canEdit: boolean; state: PageState }> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as QueryClient;
      const [unitResult, conversionResult] = await Promise.all([
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
      ]);
      const units = unitResult.rows.map(mapUnitRow).filter((row): row is UnitOfMeasure => row !== null);
      const customConversions = conversionResult.rows
        .map(mapConversionRow)
        .filter((row): row is CustomConversion => row !== null);
      return { units, customConversions, canEdit: false, state: units.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[settings/units] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { units: [], customConversions: [], canEdit: false, state: 'error' };
  }
}

function AddUnitDisclosure({ labels }: { labels: UnitsLabels }) {
  return (
    <details open className="relative">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <Button type="button" aria-controls="settings-units-add-unit" data-modal-id="SM-UOM-ADD">
          {labels.addUnit}
        </Button>
      </summary>
      <div
        id="settings-units-add-unit"
        role="dialog"
        aria-label={labels.addUnit.replace(/^\+\s*/, '')}
        aria-modal="false"
        className="absolute right-0 z-10 mt-2 w-80 rounded-xl border bg-white p-4 text-sm shadow-lg"
      >
        <form className="space-y-3">
          <label className="block font-medium text-slate-700">
            {labels.code}
            <input tabIndex={-1} name="code" className="mt-1 w-full rounded-md border px-3 py-2 font-mono" />
          </label>
          <label className="block font-medium text-slate-700">
            {labels.name}
            <input tabIndex={-1} name="name" className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <label className="block font-medium text-slate-700">
            {labels.factorToBase}
            <input tabIndex={-1} name="factorToBase" inputMode="decimal" className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <input tabIndex={-1} type="submit" value={labels.saveUnit} className="rounded-md bg-blue-600 px-3 py-2 text-white" />
        </form>
      </div>
    </details>
  );
}

function UnitCapabilityMatrix({ labels }: { labels: UnitsLabels }) {
  return (
    <Card role="region" aria-label={labels.capabilityMatrix} className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader className="space-y-1 border-b border-amber-200 px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-amber-950">{labels.capabilityMatrix}</h2>
        <CardDescription className="text-sm text-amber-900">{labels.deferredReadOnlyDescription}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table aria-label={labels.capabilityMatrix}>
          <TableBody>
            {[labels.unitCrudCapability, labels.conversionCrudCapability].map((capability) => (
              <TableRow key={capability}>
                <TableCell className="font-medium">{capability}</TableCell>
                <TableCell className="text-amber-900">{labels.deferredReadOnly}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function UnitsSection({ category, units, labels }: { category: UnitCategory; units: UnitOfMeasure[]; labels: UnitsLabels }) {
  const baseUnit = units.find((unit) => unit.isBase);
  return (
    <Card role="region" aria-label={category} className="rounded-xl border bg-white shadow-sm">
      <CardHeader className="space-y-1 border-b px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{category}</h2>
        <CardDescription className="text-sm text-muted-foreground">
          {labels.baseUnitPrefix} {baseUnit?.name ?? '—'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table aria-label={`${category} units`}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.code}</TableHead>
              <TableHead scope="col">{labels.name}</TableHead>
              <TableHead scope="col">{labels.factorToBase}</TableHead>
              <TableHead scope="col">{labels.baseQuestion}</TableHead>
              <TableHead scope="col">{labels.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-mono text-sm">{unit.code}</TableCell>
                <TableCell className="font-medium">{unit.name}</TableCell>
                <TableCell className="font-mono text-sm tabular-nums">{formatFactor(unit.factorToBase)}</TableCell>
                {unit.isBase ? (
                  <TableCell>
                    <Badge variant="info">{labels.base}</Badge>
                  </TableCell>
                ) : (
                  <TableCell>
                    <span className="text-muted-foreground">—</span>
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground" aria-label={`${unit.code} actions menu`} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomConversionsSection({ conversions, labels }: { conversions: CustomConversion[]; labels: UnitsLabels }) {
  return (
    <Card role="region" aria-label={labels.customConversions} className="rounded-xl border bg-white shadow-sm">
      <CardHeader className="space-y-1 border-b px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{labels.customConversions}</h2>
        <CardDescription className="text-sm text-muted-foreground">{labels.customConversionsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="px-6 py-4 text-sm text-muted-foreground">
        {conversions.length > 0 ? (
          <ul className="space-y-2">
            {conversions.map((conversion) => (
              <li key={conversion.id}>
                <span className="font-medium text-slate-900">{conversion.label}</span>: {conversion.from} → {conversion.to} × {formatFactor(conversion.factor)}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {labels.noCustomConversions}{' '}
            <a href="#add-custom-conversion" className="font-medium text-blue-600 underline-offset-4 hover:underline">
              {labels.addCustomConversion}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
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
  const canEdit = props.canEdit ?? loadedData?.canEdit ?? true;
  const state = props.state ?? loadedData?.state ?? (units.length ? 'ready' : 'empty');
  const groups = groupedUnits(units);
  const visibleCategories = CATEGORY_ORDER.filter((category) => groups[category].length > 0).sort(
    (left, right) => categoryOrder(left) - categoryOrder(right),
  );

  return (
    <main data-screen="settings-units" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        {canEdit ? <AddUnitDisclosure labels={labels} /> : null}
      </header>

      {!canEdit ? <UnitCapabilityMatrix labels={labels} /> : null}

      {state === 'ready' ? (
        <>
          {visibleCategories.map((category) => (
            <UnitsSection key={category} category={category} units={groups[category]} labels={labels} />
          ))}
          <CustomConversionsSection conversions={customConversions} labels={labels} />
        </>
      ) : (
        <>
          <StateMessage state={state} labels={labels} />
          {state === 'empty' ? <CustomConversionsSection conversions={customConversions} labels={labels} /> : null}
        </>
      )}
    </main>
  );
}
