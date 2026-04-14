// Side-by-side comparison of the 3 offer-engine scenarios with backend metadata.
import type { OfferScenario } from "@/lib/ai/engines/types";
import { ScenarioCard } from "./ScenarioCard";

interface ScenarioComparisonProps {
  scenarios: OfferScenario[];
  recommendedIndex: number;
  listPrice: number;
  selectedScenarioName: string | null;
  onSelectScenario: (scenario: OfferScenario) => void;
  inputSummary?: string;
  refreshedAt?: string;
  confidence?: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatRefreshedAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

export function ScenarioComparison({
  scenarios,
  recommendedIndex,
  listPrice,
  selectedScenarioName,
  onSelectScenario,
  inputSummary,
  refreshedAt,
  confidence,
}: ScenarioComparisonProps) {
  const refreshedLabel = refreshedAt ? formatRefreshedAt(refreshedAt) : null;
  const hasFooter = confidence != null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Offer scenarios
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick a starting scenario, then edit the terms below.
        </p>
        {inputSummary && (
          <p className="text-sm text-neutral-400">{inputSummary}</p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {scenarios.map((scenario, index) => (
          <ScenarioCard
            key={scenario.name}
            scenario={scenario}
            listPrice={listPrice}
            isSelected={selectedScenarioName === scenario.name}
            isRecommended={index === recommendedIndex}
            onSelect={() => onSelectScenario(scenario)}
          />
        ))}
      </div>

      {hasFooter && (
        <p className="text-xs text-neutral-400">
          Backend confidence: {Math.round((confidence ?? 0) * 100)}%
          {refreshedLabel ? ` · Refreshed ${refreshedLabel}` : ""}
        </p>
      )}
    </section>
  );
}
