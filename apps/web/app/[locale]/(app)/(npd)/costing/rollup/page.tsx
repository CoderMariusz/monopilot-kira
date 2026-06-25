import { getCostingRollup } from '../../_actions/get-costing-rollup';
import { RollupTable } from './_components/rollup-table';

export const dynamic = 'force-dynamic';

export default async function CostingRollupPage() {
  const rows = await getCostingRollup();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">NPD / Costing</p>
        <h1 className="text-2xl font-semibold text-slate-950">Costing roll-up</h1>
        <p className="text-sm text-slate-600">Target scenario costs across active NPD projects.</p>
      </header>

      <RollupTable rows={rows} />
    </main>
  );
}
