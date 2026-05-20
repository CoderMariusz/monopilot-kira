import { FaTabs } from './_components/fa-tabs';

type FaDetailPageProps = {
  params: Promise<{ productCode: string }>;
};

export default async function FaDetailPage({ params }: FaDetailPageProps) {
  const { productCode } = await params;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Factory Article
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{productCode}</h1>
        <p className="mt-2 text-sm text-slate-600">
          FA detail page shell. Department tab content is intentionally deferred in this slice.
        </p>
      </section>

      <FaTabs productCode={productCode} />
    </main>
  );
}
