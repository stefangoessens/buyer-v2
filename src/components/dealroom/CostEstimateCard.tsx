"use client";

type CostData = {
  monthlyMid: number;
  monthlyRange: { low: number; high: number };
  annualTotal: number;
  downPayment: number;
} | null;

interface CostEstimateCardProps {
  status: "available" | "pending" | "unavailable";
  data: CostData;
  reason?: string;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CostEstimateCard({
  status,
  data,
  reason,
}: CostEstimateCardProps) {
  return (
    <section className="flex flex-col rounded-[24px] border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-md sm:p-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Cost of ownership
        </p>
        <h2 className="mt-1 text-lg font-semibold text-neutral-800">
          What you'd actually pay monthly
        </h2>
      </header>

      {status === "available" && data ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Monthly — PITI + HOA + insurance
            </span>
            <span className="text-3xl font-bold text-neutral-900">
              {currency.format(data.monthlyMid)}
              <span className="ml-1 text-base font-medium text-neutral-500">
                /mo
              </span>
            </span>
            <span className="text-xs text-neutral-500">
              Range {currency.format(data.monthlyRange.low)} –{" "}
              {currency.format(data.monthlyRange.high)}
            </span>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-5 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">
                Annual
              </dt>
              <dd className="mt-1 font-semibold text-neutral-800">
                {currency.format(data.annualTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">
                Down payment
              </dt>
              <dd className="mt-1 font-semibold text-neutral-800">
                {currency.format(data.downPayment)}
              </dd>
            </div>
          </dl>

          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span className="font-semibold">Florida note:</span> hurricane
            exposure, roof age, and flood zone can shift insurance estimates
            meaningfully. We'll sharpen these once underwriting data lands.
          </p>
        </>
      ) : (
        <CostEmptyState status={status} reason={reason} />
      )}
    </section>
  );
}

function CostEmptyState({
  status,
  reason,
}: {
  status: "pending" | "unavailable" | "available";
  reason?: string;
}) {
  const label =
    status === "pending" ? "Analysis in progress" : "Cost estimate unavailable";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className="text-xs text-neutral-500">
        {reason ?? "Cost modeling will appear once property facts are gathered."}
      </p>
    </div>
  );
}
