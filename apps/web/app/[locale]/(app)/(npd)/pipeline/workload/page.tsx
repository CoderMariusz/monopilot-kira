import { getOwnerWorkload } from "../../_actions/get-owner-workload";

export const dynamic = "force-dynamic";

export default async function OwnerWorkloadPage() {
  const workload = await getOwnerWorkload();
  const owners = Array.from(new Set(workload.map((row) => row.owner))).sort((a, b) => a.localeCompare(b));
  const gates = Array.from(new Set(workload.map((row) => row.gate))).sort((a, b) => a.localeCompare(b));

  const counts = new Map(workload.map((row) => [`${row.owner}::${row.gate}`, row.count]));

  return (
    <main className="space-y-4 px-6 py-5">
      <div>
        <h1 className="text-xl font-semibold text-shell-fg">Owner workload</h1>
      </div>

      <div className="overflow-x-auto rounded-md border border-shell-border bg-white">
        <table className="min-w-full divide-y divide-shell-border text-left text-sm">
          <caption className="sr-only">Owner workload</caption>
          <thead className="bg-shell-muted/10 text-xs uppercase tracking-normal text-shell-muted">
            <tr>
              <th scope="col" rowSpan={2} className="px-4 py-3 font-medium">
                Owner
              </th>
              <th scope="colgroup" colSpan={Math.max(gates.length, 1)} className="px-4 py-3 text-center font-medium">
                Gate
              </th>
            </tr>
            <tr>
              {gates.length > 0 ? (
                gates.map((gate) => (
                  <th key={gate} scope="col" className="px-4 py-3 text-right font-medium">
                    <span>{gate}</span>
                    <span className="block normal-case text-shell-muted">Projects</span>
                  </th>
                ))
              ) : (
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Projects
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-shell-border">
            {owners.length > 0 ? (
              owners.map((owner) => (
                <tr key={owner} className="hover:bg-shell-muted/5">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium text-shell-fg">
                    {owner}
                  </th>
                  {gates.map((gate) => (
                    <td key={gate} className="px-4 py-3 text-right tabular-nums text-shell-fg">
                      {counts.get(`${owner}::${gate}`) ?? 0}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={Math.max(gates.length + 1, 2)} className="px-4 py-8 text-center text-shell-muted">
                  0 Projects
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
