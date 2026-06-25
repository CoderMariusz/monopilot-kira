import { getPoAging } from "../actions/get-po-aging";

const LABEL_AGING = "PO Aging Report";
const LABEL_COUNT = "open overdue";
const LABEL_TOTAL_VALUE = "Total value";

function formatDecimalValue(value: string): string {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionalPart = ""] = unsigned.split(".");
  const digits = `${fractionalPart}000`;
  const roundUp = Number(digits[2] ?? "0") >= 5;
  let cents = BigInt((digits.slice(0, 2) || "0").padEnd(2, "0"));
  let whole = BigInt(wholePart || "0");

  if (roundUp) cents += 1n;
  if (cents >= 100n) {
    whole += 1n;
    cents -= 100n;
  }

  const groupedWhole = whole
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative && (whole > 0n || cents > 0n) ? "-" : "";
  return `${sign}${groupedWhole}.${cents.toString().padStart(2, "0")}`;
}

export async function PoAgingReport() {
  const buckets = await getPoAging();

  return (
    <section aria-labelledby="po-aging-title" data-testid="planning-po-aging" className="flex flex-col gap-3">
      <div>
        <h2 id="po-aging-title" className="text-lg font-semibold text-slate-950">
          {LABEL_AGING}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((bucket) => (
          <article
            key={bucket.bucket}
            data-testid={`planning-po-aging-${bucket.bucket}`}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-sm font-medium text-slate-600">{bucket.bucket} days</div>
            <div className="mt-3 text-3xl font-semibold tabular-nums text-slate-950">{bucket.count}</div>
            <div className="mt-1 text-xs uppercase text-slate-500">{LABEL_COUNT}</div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500">{LABEL_TOTAL_VALUE}</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                {formatDecimalValue(bucket.total_value)}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
