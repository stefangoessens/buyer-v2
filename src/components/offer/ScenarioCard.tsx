// Single offer-engine scenario card: price, terms, competitiveness, pick CTA.
import type { OfferScenario } from "@/lib/ai/engines/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScoreBadge } from "@/components/product/ScoreBadge";
import { formatPriceVsList } from "@/lib/dealroom/offer-cockpit-validation";
import { cn } from "@/lib/utils";

interface ScenarioCardProps {
  scenario: OfferScenario;
  listPrice: number;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const riskStyles: Record<
  OfferScenario["riskLevel"],
  { className: string; label: string }
> = {
  low: {
    className: "bg-success-50 text-success-700 border-success-100",
    label: "Low risk",
  },
  medium: {
    className: "bg-warning-50 text-warning-700 border-warning-100",
    label: "Medium risk",
  },
  high: {
    className: "bg-error-50 text-error-700 border-error-100",
    label: "High risk",
  },
};

function vsListColorClass(offerPrice: number, listPrice: number): string {
  if (listPrice <= 0) return "text-neutral-500";
  if (offerPrice > listPrice) return "text-error-600";
  if (offerPrice < listPrice) return "text-success-600";
  return "text-neutral-500";
}

function formatContingencies(contingencies: string[]): string {
  if (contingencies.length === 0) return "Waived";
  return contingencies
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "))
    .join(", ");
}

export function ScenarioCard({
  scenario,
  listPrice,
  isSelected,
  isRecommended,
  onSelect,
}: ScenarioCardProps) {
  const risk = riskStyles[scenario.riskLevel];
  const vsListLabel = formatPriceVsList(scenario.price, listPrice);
  const vsListColor = vsListColorClass(scenario.price, listPrice);

  return (
    <Card
      className={cn(
        "relative flex h-full flex-col transition-all",
        isSelected
          ? "border-primary-400 ring-2 ring-primary-200 shadow-md"
          : "border-neutral-200 hover:border-neutral-300",
      )}
    >
      {isRecommended && !isSelected && (
        <span className="absolute right-4 top-4 inline-flex items-center rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 text-xs font-medium text-accent-700">
          Recommended
        </span>
      )}

      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl font-semibold text-neutral-900">
            {scenario.name}
          </CardTitle>
          {isRecommended && isSelected && (
            <Badge
              variant="outline"
              className="border-accent-200 bg-accent-50 text-accent-700"
            >
              Recommended
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn("font-medium", risk.className)}
          >
            {risk.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <p className="text-3xl font-bold text-neutral-900">
            {currencyFormatter.format(scenario.price)}
          </p>
          <p className={cn("mt-1 text-sm font-medium", vsListColor)}>
            {vsListLabel}
          </p>
        </div>

        <dl className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
          <div className="flex justify-between text-sm">
            <dt className="text-neutral-500">Earnest money</dt>
            <dd className="font-medium text-neutral-900">
              {currencyFormatter.format(scenario.earnestMoney)}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-neutral-500">Closing</dt>
            <dd className="font-medium text-neutral-900">
              {scenario.closingDays} days
            </dd>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <dt className="shrink-0 text-neutral-500">Contingencies</dt>
            <dd className="text-right font-medium text-neutral-900">
              {formatContingencies(scenario.contingencies)}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
          <span className="text-sm text-neutral-500">Competitiveness</span>
          <ScoreBadge
            score={scenario.competitivenessScore / 10}
            maxScore={10}
            size="sm"
          />
        </div>

        <p className="text-sm leading-relaxed text-neutral-600">
          {scenario.explanation}
        </p>
      </CardContent>

      <CardFooter className="mt-auto pt-2">
        <Button
          type="button"
          variant={isSelected ? "default" : "outline"}
          className="w-full"
          onClick={onSelect}
          aria-pressed={isSelected}
        >
          {isSelected ? "Selected" : "Pick this scenario"}
        </Button>
      </CardFooter>
    </Card>
  );
}
