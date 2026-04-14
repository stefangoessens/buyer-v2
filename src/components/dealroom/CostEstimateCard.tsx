"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  enableCustomize?: boolean;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const BASE_RATE_PCT = 7.0;
const BASE_INSURANCE_ANNUAL = 2400;
const TAX_RATIO_OF_ANNUAL = 0.012;

export function CostEstimateCard({
  status,
  data,
  reason,
  enableCustomize = false,
}: CostEstimateCardProps) {
  return (
    <section className="flex flex-col rounded-[24px] border border-border bg-white p-6 transition-shadow hover:shadow-md sm:p-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Cost of ownership
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          What you&apos;d actually pay monthly
        </h2>
      </header>

      {status === "available" && data ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Monthly — PITI + HOA + insurance
            </span>
            <span className="text-3xl font-bold text-foreground">
              {currency.format(data.monthlyMid)}
              <span className="ml-1 text-base font-medium text-muted-foreground">
                /mo
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              Range {currency.format(data.monthlyRange.low)} –{" "}
              {currency.format(data.monthlyRange.high)}
            </span>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-5 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Annual
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {currency.format(data.annualTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Down payment
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {currency.format(data.downPayment)}
              </dd>
            </div>
          </dl>

          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span className="font-semibold">Florida note:</span> hurricane
            exposure, roof age, and flood zone can shift insurance estimates
            meaningfully. We&apos;ll sharpen these once underwriting data lands.
          </p>

          {enableCustomize ? <CustomizeSection data={data} /> : null}
        </>
      ) : (
        <CostEmptyState status={status} reason={reason} />
      )}
    </section>
  );
}

function CustomizeSection({
  data,
}: {
  data: NonNullable<CostData>;
}) {
  const baseTaxes = useMemo(
    () => Math.round(data.annualTotal * TAX_RATIO_OF_ANNUAL),
    [data.annualTotal],
  );
  const baseInsurance = BASE_INSURANCE_ANNUAL;

  const [open, setOpen] = useState(false);
  const [interestRatePct, setInterestRatePct] = useState(BASE_RATE_PCT);
  const [propertyTaxAnnual, setPropertyTaxAnnual] = useState(baseTaxes);
  const [homeInsuranceAnnual, setHomeInsuranceAnnual] =
    useState(BASE_INSURANCE_ANNUAL);

  const customizedMonthly = useMemo(() => {
    const rateDelta = (interestRatePct - BASE_RATE_PCT) * 50;
    const taxDelta = (propertyTaxAnnual - baseTaxes) / 12;
    const insuranceDelta = (homeInsuranceAnnual - baseInsurance) / 12;
    return Math.max(
      0,
      Math.round(data.monthlyMid + rateDelta + taxDelta + insuranceDelta),
    );
  }, [
    interestRatePct,
    propertyTaxAnnual,
    homeInsuranceAnnual,
    baseTaxes,
    baseInsurance,
    data.monthlyMid,
  ]);

  const handleReset = () => {
    setInterestRatePct(BASE_RATE_PCT);
    setPropertyTaxAnnual(baseTaxes);
    setHomeInsuranceAnnual(BASE_INSURANCE_ANNUAL);
  };

  if (!open) {
    return (
      <div className="mt-5 border-t border-neutral-100 pt-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Customize
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-neutral-100 pt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Customize assumptions
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Hide
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Interest rate (%)
          </dt>
          <dd className="mt-1">
            <Input
              type="number"
              min={0}
              max={15}
              step={0.1}
              value={interestRatePct}
              onChange={(e) =>
                setInterestRatePct(Number(e.target.value) || 0)
              }
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Property taxes (yr)
          </dt>
          <dd className="mt-1">
            <Input
              type="number"
              min={0}
              max={30000}
              step={100}
              value={propertyTaxAnnual}
              onChange={(e) =>
                setPropertyTaxAnnual(Number(e.target.value) || 0)
              }
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Home insurance (yr)
          </dt>
          <dd className="mt-1">
            <Input
              type="number"
              min={0}
              max={12000}
              step={100}
              value={homeInsuranceAnnual}
              onChange={(e) =>
                setHomeInsuranceAnnual(Number(e.target.value) || 0)
              }
            />
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-1 rounded-2xl bg-muted p-4">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Customized monthly
        </span>
        <span className="text-2xl font-bold text-foreground">
          {currency.format(customizedMonthly)}
          <span className="ml-1 text-sm font-medium text-muted-foreground">
            /mo
          </span>
        </span>
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
        >
          Reset to estimates
        </Button>
      </div>
    </div>
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
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-muted p-6 text-center">
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className="text-xs text-muted-foreground">
        {reason ?? "Cost modeling will appear once property facts are gathered."}
      </p>
    </div>
  );
}
