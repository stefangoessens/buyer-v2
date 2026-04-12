"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

function toNumber(value: string, fallback: number) {
  const n = Number(String(value).replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function SavingsCalculator() {
  const [homePrice, setHomePrice] = useState("650000");
  const [commissionPct, setCommissionPct] = useState("3");
  const [rebatePct, setRebatePct] = useState("1.5");

  const calc = useMemo(() => {
    const price = Math.max(0, toNumber(homePrice, 0));
    const commission = Math.max(0, toNumber(commissionPct, 0));
    const rebate = Math.max(0, toNumber(rebatePct, 0));

    const commissionDollars = (price * commission) / 100;
    const rebateDollars = (price * rebate) / 100;

    return {
      price,
      commission,
      rebate,
      commissionDollars,
      rebateDollars,
    };
  }, [homePrice, commissionPct, rebatePct]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[24px] border border-neutral-200/80 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-800">Estimate your potential savings</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          Adjust a few assumptions to get a quick back-of-the-envelope estimate.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-700">Home price</span>
            <Input
              inputMode="numeric"
              value={homePrice}
              onChange={(e) => setHomePrice(e.target.value)}
              placeholder="650000"
              className="h-12 rounded-[12px]"
            />
          </label>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-neutral-700">Buyer agent commission (%)</span>
              <Input
                inputMode="decimal"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                placeholder="3"
                className="h-12 rounded-[12px]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-neutral-700">Estimated rebate (%)</span>
              <Input
                inputMode="decimal"
                value={rebatePct}
                onChange={(e) => setRebatePct(e.target.value)}
                placeholder="1.5"
                className="h-12 rounded-[12px]"
              />
            </label>
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-neutral-400">
          Estimates are illustrative only and can vary by brokerage agreement, lender requirements, and transaction structure.
        </p>
      </div>

      <div className="rounded-[24px] bg-neutral-50 p-8">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Estimated rebate</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-neutral-800">{money.format(calc.rebateDollars)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-neutral-500">At {calc.rebate.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-neutral-400">Home price: {money.format(calc.price)}</p>
          </div>
        </div>

        <div className="mt-6 rounded-[20px] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>Commission at {calc.commission.toFixed(1)}%</span>
            <span className="font-semibold text-neutral-800">{money.format(calc.commissionDollars)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
            <span>Rebate portion</span>
            <span className="font-semibold text-primary-700">{money.format(calc.rebateDollars)}</span>
          </div>
        </div>

        <div className="mt-6 rounded-[20px] bg-primary-700 p-6 text-white">
          <p className="text-sm font-medium text-white/80">Want exact numbers for your deal?</p>
          <p className="mt-1 text-lg font-semibold">Paste a listing link and we’ll run the analysis.</p>
          <a
            href="/get-started"
            className="mt-5 inline-flex items-center justify-center rounded-[12px] bg-white px-4 py-3 text-sm font-medium text-primary-700 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-100"
          >
            Get started
          </a>
        </div>
      </div>
    </div>
  );
}

