// Editable form for offer terms (price, earnest, closing, credits, contingencies) with inline validation.
"use client";

import type {
  OfferCockpitValidation,
  OfferCockpitValidationError,
  OfferTerms,
} from "@/lib/dealroom/offer-cockpit-types";
import { AVAILABLE_CONTINGENCIES } from "@/lib/dealroom/offer-cockpit-types";
import { formatPriceVsList } from "@/lib/dealroom/offer-cockpit-validation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface OfferTermsEditorProps {
  terms: OfferTerms;
  listPrice: number;
  buyerMaxBudget?: number;
  disabled?: boolean;
  validation: OfferCockpitValidation;
  onChange: (next: OfferTerms) => void;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type NumericField = "offerPrice" | "earnestMoney" | "closingDays" | "buyerCredits" | "sellerCredits";

function findFieldError(
  validation: OfferCockpitValidation,
  field: keyof OfferTerms,
): { error: OfferCockpitValidationError | null; warning: OfferCockpitValidationError | null } {
  const error = validation.errors.find((e) => e.field === field) ?? null;
  const warning = validation.warnings.find((w) => w.field === field) ?? null;
  return { error, warning };
}

function FieldMessage({
  validation,
  field,
}: {
  validation: OfferCockpitValidation;
  field: keyof OfferTerms;
}) {
  const { error, warning } = findFieldError(validation, field);
  if (error) {
    return <p className="mt-1 text-xs text-error-700">{error.message}</p>;
  }
  if (warning) {
    return <p className="mt-1 text-xs text-warning-700">{warning.message}</p>;
  }
  return null;
}

export function OfferTermsEditor({
  terms,
  listPrice,
  buyerMaxBudget,
  disabled = false,
  validation,
  onChange,
}: OfferTermsEditorProps) {
  const handleNumberChange = (field: NumericField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseFloat(e.target.value) || 0;
    onChange({ ...terms, [field]: parsed });
  };

  const toggleContingency = (value: string) => {
    if (disabled) return;
    const has = terms.contingencies.includes(value);
    const nextContingencies = has
      ? terms.contingencies.filter((c) => c !== value)
      : [...terms.contingencies, value];
    onChange({ ...terms, contingencies: nextContingencies });
  };

  const handleWaiveAll = () => {
    if (disabled) return;
    onChange({ ...terms, contingencies: [] });
  };

  const earnestPct =
    terms.offerPrice > 0
      ? `${((terms.earnestMoney / terms.offerPrice) * 100).toFixed(1)}% of offer price`
      : "—";

  const selectedDescriptions = AVAILABLE_CONTINGENCIES.filter((c) =>
    terms.contingencies.includes(c.value),
  ).map((c) => c.description);

  const contingenciesHelper =
    selectedDescriptions.length > 0
      ? selectedDescriptions.join(" Also ")
      : "All contingencies waived — the offer is unconditional.";

  const budgetHint =
    buyerMaxBudget && buyerMaxBudget > 0
      ? `Max budget ${currencyFormatter.format(buyerMaxBudget)}`
      : null;

  return (
    <Card className={disabled ? "opacity-60" : undefined}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-neutral-900">Offer terms</CardTitle>
        <CardDescription className="text-sm text-neutral-500">
          Fine-tune the scenario you picked. Broker review happens before anything goes to the seller.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="offer-price"
            className="block text-sm font-medium text-neutral-700"
          >
            Offer price
          </label>
          <Input
            id="offer-price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={terms.offerPrice}
            disabled={disabled}
            onChange={handleNumberChange("offerPrice")}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-neutral-500">
            {formatPriceVsList(terms.offerPrice, listPrice)}
            {budgetHint ? ` · ${budgetHint}` : ""}
          </p>
          <FieldMessage validation={validation} field="offerPrice" />
        </div>

        <div>
          <label
            htmlFor="earnest-money"
            className="block text-sm font-medium text-neutral-700"
          >
            Earnest money
          </label>
          <Input
            id="earnest-money"
            type="number"
            inputMode="numeric"
            min={0}
            step={500}
            value={terms.earnestMoney}
            disabled={disabled}
            onChange={handleNumberChange("earnestMoney")}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-neutral-500">{earnestPct}</p>
          <FieldMessage validation={validation} field="earnestMoney" />
        </div>

        <div>
          <label
            htmlFor="closing-days"
            className="block text-sm font-medium text-neutral-700"
          >
            Closing window (days)
          </label>
          <Input
            id="closing-days"
            type="number"
            inputMode="numeric"
            min={7}
            max={120}
            step={1}
            value={terms.closingDays}
            disabled={disabled}
            onChange={handleNumberChange("closingDays")}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-neutral-500">Closing typically 30-45 days.</p>
          <FieldMessage validation={validation} field="closingDays" />
        </div>

        <div>
          <label
            htmlFor="buyer-credits"
            className="block text-sm font-medium text-neutral-700"
          >
            Buyer credits
          </label>
          <Input
            id="buyer-credits"
            type="number"
            inputMode="numeric"
            min={0}
            step={500}
            value={terms.buyerCredits}
            disabled={disabled}
            onChange={handleNumberChange("buyerCredits")}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-neutral-500">Money you agree to pay the seller at close.</p>
          <FieldMessage validation={validation} field="buyerCredits" />
        </div>

        <div>
          <label
            htmlFor="seller-credits"
            className="block text-sm font-medium text-neutral-700"
          >
            Seller credits
          </label>
          <Input
            id="seller-credits"
            type="number"
            inputMode="numeric"
            min={0}
            step={500}
            value={terms.sellerCredits}
            disabled={disabled}
            onChange={handleNumberChange("sellerCredits")}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-neutral-500">Concessions you want the seller to pay.</p>
          <FieldMessage validation={validation} field="sellerCredits" />
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-neutral-700">Contingencies</label>
            {terms.contingencies.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={handleWaiveAll}
              >
                Waive all
              </Button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVAILABLE_CONTINGENCIES.map((contingency) => {
              const selected = terms.contingencies.includes(contingency.value);
              return (
                <button
                  key={contingency.value}
                  type="button"
                  disabled={disabled}
                  data-selected={selected}
                  aria-pressed={selected}
                  onClick={() => toggleContingency(contingency.value)}
                  className={
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed " +
                    (selected
                      ? "border-primary-400 bg-primary-50 text-primary-700"
                      : "border-neutral-200 text-neutral-600 hover:border-neutral-300")
                  }
                >
                  {contingency.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{contingenciesHelper}</p>
          <FieldMessage validation={validation} field="contingencies" />
        </div>
      </CardContent>
    </Card>
  );
}
