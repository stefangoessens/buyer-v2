"use client";

import { useMemo, useState } from "react";
import {
  calculateSavings,
  defaultCalculatorInput,
  formatUSD,
  type SavingsCalculatorInput,
} from "@/lib/pricing/savingsCalculator";
import {
  CALCULATOR_DISCLOSURES,
  getHeadlineDisclosures,
  type Disclosure,
} from "@/lib/pricing/disclosures";

/**
 * Interactive savings calculator + commission education module for
 * the public site (KIN-772).
 *
 * The component is intentionally thin: all math lives in
 * `src/lib/pricing/savingsCalculator.ts` and all legal copy lives in
 * `src/lib/pricing/disclosures.ts`. This file only owns UI state and
 * composition.
 *
 * Two variants:
 *   - "full"    — standalone pricing page layout (default)
 *   - "compact" — homepage teaser with fewer controls and inline headline
 */
export function SavingsCalculator({
  variant = "full",
  initialPurchasePrice = 500_000,
}: {
  variant?: "full" | "compact";
  initialPurchasePrice?: number;
}) {
  const [input, setInput] = useState<SavingsCalculatorInput>(
    defaultCalculatorInput(initialPurchasePrice)
  );

  const calculation = useMemo(() => calculateSavings(input), [input]);

  const updateField = <K extends keyof SavingsCalculatorInput>(
    field: K,
    raw: string
  ) => {
    // Parse the raw input into a number. An empty string produces NaN
    // which the calculator surfaces as a missingInput error — the UI
    // renders that as a field-level hint, which matches what users
    // expect when they clear a control.
    const parsed = raw === "" ? Number.NaN : Number(raw);
    setInput((prev) => ({ ...prev, [field]: parsed }));
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Controls */}
        <div className="lg:col-span-3">
          <CalculatorControls input={input} onChange={updateField} />
        </div>

        {/* Result + headline disclosures */}
        <div className="lg:col-span-2">
          <CalculatorResultPanel calculation={calculation} />
        </div>
      </div>

      {/* Commission education accordion (full variant only) */}
      {variant === "full" && <CommissionEducation />}

      {/* Full disclosure accordion (full variant only) */}
      {variant === "full" && <FullDisclosures />}
    </div>
  );
}

// MARK: - Controls

function CalculatorControls({
  input,
  onChange,
}: {
  input: SavingsCalculatorInput;
  onChange: <K extends keyof SavingsCalculatorInput>(
    field: K,
    raw: string
  ) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-200 lg:p-8">
      <h3 className="text-xl font-semibold text-neutral-900">
        Estimate your savings
      </h3>
      <p className="mt-1 text-sm text-neutral-600">
        Adjust the assumptions to see how buyer-v2 stacks up against a standard
        Florida commission.
      </p>

      <div className="mt-6 space-y-5">
        {/* Purchase price */}
        <FieldRow
          id="purchase-price"
          label="Purchase price"
          suffix="USD"
          value={valueString(input.purchasePrice)}
          onChange={(v) => onChange("purchasePrice", v)}
          placeholder="500000"
          inputMode="numeric"
        />

        {/* Total commission */}
        <FieldRow
          id="total-commission"
          label="Total commission"
          suffix="%"
          value={valueString(input.totalCommissionPercent)}
          onChange={(v) => onChange("totalCommissionPercent", v)}
          placeholder="6"
          inputMode="decimal"
          help="Historically 5–6% of purchase price. Always negotiable."
        />

        {/* Buyer-agent split */}
        <FieldRow
          id="buyer-agent"
          label="Buyer-agent commission"
          suffix="%"
          value={valueString(input.buyerAgentCommissionPercent)}
          onChange={(v) => onChange("buyerAgentCommissionPercent", v)}
          placeholder="3"
          inputMode="decimal"
          help="The portion of the total commission paid to the buyer's side."
        />

        {/* Buyer credit */}
        <FieldRow
          id="buyer-credit"
          label="Buyer credit (our rebate)"
          suffix="%"
          value={valueString(input.buyerCreditPercent)}
          onChange={(v) => onChange("buyerCreditPercent", v)}
          placeholder="33"
          inputMode="decimal"
          help="Percentage of the buyer-agent commission we return to you at closing."
        />
      </div>
    </div>
  );
}

function FieldRow({
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
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-800"
      >
        {label}
      </label>
      <div className="mt-1.5 flex items-center rounded-xl border border-neutral-300 bg-white focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl bg-transparent px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
        <span className="pr-4 text-sm font-medium text-neutral-500">
          {suffix}
        </span>
      </div>
      {help && (
        <p className="mt-1.5 text-xs text-neutral-500">{help}</p>
      )}
    </div>
  );
}

// MARK: - Result panel

function CalculatorResultPanel({
  calculation,
}: {
  calculation: ReturnType<typeof calculateSavings>;
}) {
  if (calculation.kind === "error") {
    return (
      <div className="rounded-2xl bg-neutral-50 p-6 shadow-md ring-1 ring-neutral-200 lg:p-8">
        <h3 className="text-base font-semibold text-neutral-900">
          Let&rsquo;s fix those inputs
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-neutral-700">
          {calculation.errors.map((err, i) => (
            <li
              key={`${err.kind}-${i}`}
              className="flex items-start gap-2 rounded-lg bg-white p-3 ring-1 ring-neutral-200"
            >
              <span className="mt-0.5 text-base" aria-hidden>
                !
              </span>
              <span>{err.message}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { result } = calculation;

  if (result.isZeroCommission) {
    return (
      <div className="rounded-2xl bg-neutral-50 p-6 shadow-md ring-1 ring-neutral-200 lg:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          No buyer-agent commission
        </p>
        <h3 className="mt-2 text-xl font-semibold text-neutral-900">
          This listing has no buyer-side commission
        </h3>
        <p className="mt-3 text-sm text-neutral-700">
          We&rsquo;ll tell you up front before we engage. No buyer credit to
          calculate because there&rsquo;s no commission to rebate.
        </p>
        <HeadlineDisclosures />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary-700 to-primary-800 p-6 text-white shadow-lg lg:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">
        Estimated buyer credit
      </p>
      <p className="mt-2 text-4xl font-bold lg:text-5xl">
        {formatUSD(result.buyerCreditAmount)}
      </p>
      <p className="mt-2 text-sm text-primary-100">
        at closing on a {formatUSD(result.input.purchasePrice)} purchase
      </p>

      <dl className="mt-6 space-y-3 border-t border-primary-600/50 pt-5 text-sm">
        <ResultRow
          label="Seller-paid commission"
          value={formatUSD(result.totalCommissionAmount)}
        />
        <ResultRow
          label="Buyer-agent share"
          value={formatUSD(result.buyerAgentCommissionAmount)}
        />
        <ResultRow
          label="Your credit back"
          value={formatUSD(result.buyerCreditAmount)}
          emphasized
        />
        <ResultRow
          label="Effective buyer commission"
          value={`${result.effectiveBuyerCommissionPercent}%`}
        />
      </dl>

      <HeadlineDisclosures dark />
    </div>
  );
}

function ResultRow({
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
      <dt className="text-primary-100">{label}</dt>
      <dd
        className={
          emphasized
            ? "text-lg font-semibold text-white"
            : "text-sm font-medium text-primary-50"
        }
      >
        {value}
      </dd>
    </div>
  );
}

// MARK: - Headline disclosures (inline)

function HeadlineDisclosures({ dark = false }: { dark?: boolean }) {
  const headlines = getHeadlineDisclosures();
  return (
    <div
      className={`mt-6 border-t pt-4 text-xs ${
        dark
          ? "border-primary-600/50 text-primary-100"
          : "border-neutral-200 text-neutral-600"
      }`}
    >
      <p className="font-semibold">Important</p>
      <ul className="mt-2 space-y-2">
        {headlines.map((d) => (
          <li key={d.id}>
            <span className={dark ? "text-white" : "text-neutral-900"}>
              {d.label}:
            </span>{" "}
            {d.body}
          </li>
        ))}
      </ul>
    </div>
  );
}

// MARK: - Commission education (full variant only)

function CommissionEducation() {
  return (
    <section className="mt-12 rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200 lg:p-10">
      <h3 className="text-xl font-semibold text-neutral-900">
        How commissions work in Florida
      </h3>
      <div className="mt-4 grid grid-cols-1 gap-6 text-sm text-neutral-700 md:grid-cols-3">
        <EducationBlock
          step="1"
          title="The seller pays at closing"
          body="Historically the seller pays a single total commission out of proceeds. That total is split between the listing side and the buyer's side."
        />
        <EducationBlock
          step="2"
          title="The split is always negotiable"
          body="After the 2024 NAR settlement, buyer-agent compensation is explicitly negotiated between the parties. No number is fixed in stone."
        />
        <EducationBlock
          step="3"
          title="We rebate part back to you"
          body="buyer-v2 credits a portion of the buyer-agent commission to you at closing. You keep the rebate; we keep a smaller service fee."
        />
      </div>
    </section>
  );
}

function EducationBlock({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="flex size-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
        {step}
      </div>
      <h4 className="mt-3 text-base font-semibold text-neutral-900">
        {title}
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">
        {body}
      </p>
    </div>
  );
}

// MARK: - Full disclosures (full variant only)

function FullDisclosures() {
  return (
    <section className="mt-12 rounded-2xl bg-white p-6 ring-1 ring-neutral-200 lg:p-10">
      <h3 className="text-lg font-semibold text-neutral-900">
        Full disclosures
      </h3>
      <p className="mt-1 text-sm text-neutral-600">
        These disclosures apply to every savings estimate on this page.
      </p>
      <dl className="mt-5 space-y-5">
        {CALCULATOR_DISCLOSURES.map((d) => (
          <DisclosureBlock key={d.id} disclosure={d} />
        ))}
      </dl>
    </section>
  );
}

function DisclosureBlock({ disclosure }: { disclosure: Disclosure }) {
  const severityClass =
    disclosure.severity === "strong"
      ? "border-l-4 border-accent-500 bg-accent-50"
      : disclosure.severity === "emphasis"
        ? "border-l-4 border-primary-500 bg-primary-50/60"
        : "border-l-4 border-neutral-300 bg-neutral-50";
  return (
    <div className={`rounded-r-lg p-4 ${severityClass}`}>
      <dt className="text-sm font-semibold text-neutral-900">
        {disclosure.label}
      </dt>
      <dd className="mt-1 text-sm text-neutral-700">{disclosure.body}</dd>
    </div>
  );
}

function valueString(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}
