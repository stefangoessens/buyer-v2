"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateSavings,
  defaultCalculatorInput,
  formatUSD,
  parseRawField,
  type SavingsCalculatorInput,
} from "@/lib/pricing/savingsCalculator";

const DEFAULT_PURCHASE_PRICE = 500_000;

type RawInput = Record<keyof SavingsCalculatorInput, string>;

function toRawInput(input: SavingsCalculatorInput): RawInput {
  return {
    purchasePrice: String(input.purchasePrice),
    totalCommissionPercent: String(input.totalCommissionPercent),
    buyerAgentCommissionPercent: String(input.buyerAgentCommissionPercent),
    buyerCreditPercent: String(input.buyerCreditPercent),
  };
}

function parseRawInput(raw: RawInput): SavingsCalculatorInput {
  return {
    purchasePrice: parseRawField(raw.purchasePrice),
    totalCommissionPercent: parseRawField(raw.totalCommissionPercent),
    buyerAgentCommissionPercent: parseRawField(raw.buyerAgentCommissionPercent),
    buyerCreditPercent: parseRawField(raw.buyerCreditPercent),
  };
}

export function SavingsCalculatorSection() {
  const [raw, setRaw] = useState<RawInput>(() =>
    toRawInput(defaultCalculatorInput(DEFAULT_PURCHASE_PRICE)),
  );

  const input = useMemo(() => parseRawInput(raw), [raw]);
  const calculation = useMemo(() => calculateSavings(input), [input]);

  const updateField = (field: keyof SavingsCalculatorInput, next: string) => {
    setRaw((prev) => ({ ...prev, [field]: next }));
  };

  return (
    <section
      id="savings-calculator"
      className="w-full scroll-mt-24 bg-background py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Savings calculator
          </p>
          <h2 className="mt-3 font-heading text-3xl font-medium tracking-tight text-foreground lg:text-4xl">
            See what you could keep at closing
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Move the inputs to model a Florida purchase. We rebate part of the
            buyer-agent commission to you at closing.
          </p>
        </div>

        <Card className="mx-auto mt-12 max-w-5xl p-6 lg:p-10">
          <CardContent className="grid grid-cols-1 gap-10 px-0 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <CalculatorInputs raw={raw} onChange={updateField} />
            </div>
            <div className="lg:col-span-2">
              <CalculatorResult calculation={calculation} />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function CalculatorInputs({
  raw,
  onChange,
}: {
  raw: RawInput;
  onChange: (field: keyof SavingsCalculatorInput, next: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-heading text-lg font-medium text-foreground">
          Your assumptions
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults reflect a typical Florida transaction. Adjust to fit your
          home and market.
        </p>
      </div>

      <div className="space-y-5">
        <Field
          id="sc-purchase-price"
          label="Home price"
          suffix="USD"
          value={raw.purchasePrice}
          onChange={(v) => onChange("purchasePrice", v)}
          placeholder="500000"
          inputMode="numeric"
        />

        <Field
          id="sc-total-commission"
          label="Total commission"
          suffix="%"
          value={raw.totalCommissionPercent}
          onChange={(v) => onChange("totalCommissionPercent", v)}
          placeholder="6"
          inputMode="decimal"
          help="Historically 5–6%. Always negotiable."
        />

        <Field
          id="sc-buyer-agent"
          label="Buyer-agent share"
          suffix="%"
          value={raw.buyerAgentCommissionPercent}
          onChange={(v) => onChange("buyerAgentCommissionPercent", v)}
          placeholder="3"
          inputMode="decimal"
          help="Portion of the total paid to the buyer's side."
        />

        <Field
          id="sc-buyer-credit"
          label="Rebate to you"
          suffix="%"
          value={raw.buyerCreditPercent}
          onChange={(v) => onChange("buyerCreditPercent", v)}
          placeholder="33"
          inputMode="decimal"
          help="Percentage of the buyer-agent commission we credit you at closing."
        />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  suffix,
  value,
  onChange,
  placeholder,
  inputMode,
  help,
}: {
  id: string;
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode: "numeric" | "decimal";
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 pr-14 text-base"
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-muted-foreground">
          {suffix}
        </span>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function CalculatorResult({
  calculation,
}: {
  calculation: ReturnType<typeof calculateSavings>;
}) {
  if (calculation.kind === "error") {
    return (
      <div className="flex h-full flex-col justify-center rounded-3xl bg-muted/40 p-6 ring-1 ring-foreground/5 lg:p-8">
        <h3 className="text-base font-medium text-foreground">
          Let&rsquo;s fix those inputs
        </h3>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {calculation.errors.map((err, i) => (
            <li
              key={`${err.kind}-${i}`}
              className="rounded-xl bg-background p-3 ring-1 ring-foreground/5"
            >
              {err.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { result } = calculation;

  if (result.isZeroCommission) {
    return (
      <div className="flex h-full flex-col justify-center rounded-3xl bg-muted/40 p-6 ring-1 ring-foreground/5 lg:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          No buyer-agent commission
        </p>
        <h3 className="mt-2 font-heading text-xl font-medium text-foreground">
          Nothing to rebate on this listing
        </h3>
        <p className="mt-3 text-sm text-muted-foreground">
          We&rsquo;ll flag this before you engage. No buyer credit because
          there&rsquo;s no commission to share.
        </p>
      </div>
    );
  }

  const traditionalCost = result.buyerAgentCommissionAmount;
  const yourCost = traditionalCost - result.buyerCreditAmount;
  const traditionalPct = traditionalCost > 0 ? 100 : 0;
  const yourPct =
    traditionalCost > 0 ? Math.max(2, (yourCost / traditionalCost) * 100) : 0;

  return (
    <div className="flex h-full flex-col rounded-3xl bg-foreground p-6 text-background lg:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-background/70">
        You keep at closing
      </p>
      <p className="mt-2 font-heading text-4xl font-medium tracking-tight lg:text-5xl">
        {formatUSD(result.buyerCreditAmount)}
      </p>
      <p className="mt-2 text-sm text-background/70">
        on a {formatUSD(result.input.purchasePrice)} purchase
      </p>

      <div className="mt-6 space-y-3">
        <ComparisonBar
          label="Traditional cost"
          amount={formatUSD(traditionalCost)}
          widthPct={traditionalPct}
          tone="muted"
        />
        <ComparisonBar
          label="Your cost"
          amount={formatUSD(yourCost)}
          widthPct={yourPct}
          tone="accent"
        />
      </div>

      <dl className="mt-6 space-y-2.5 border-t border-background/15 pt-5 text-sm">
        <Row
          label="Buyer-agent commission"
          value={formatUSD(result.buyerAgentCommissionAmount)}
        />
        <Row
          label="Rebate back to you"
          value={formatUSD(result.buyerCreditAmount)}
          emphasized
        />
        <Row
          label="Effective buyer commission"
          value={`${result.effectiveBuyerCommissionPercent}%`}
        />
      </dl>
    </div>
  );
}

function ComparisonBar({
  label,
  amount,
  widthPct,
  tone,
}: {
  label: string;
  amount: string;
  widthPct: number;
  tone: "muted" | "accent";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-background/70">
        <span>{label}</span>
        <span className="font-medium text-background">{amount}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background/10">
        <div
          className={
            tone === "accent"
              ? "h-full rounded-full bg-background"
              : "h-full rounded-full bg-background/40"
          }
          style={{ width: `${Math.min(100, widthPct)}%` }}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-background/70">{label}</dt>
      <dd
        className={
          emphasized
            ? "text-base font-medium text-background"
            : "text-sm font-medium text-background/90"
        }
      >
        {value}
      </dd>
    </div>
  );
}
