import type { OfferInput, OfferScenario, OfferOutput } from "./types";

function computeBaseDiscount(input: OfferInput): number {
  let discount = 0;
  // Leverage score influence: high leverage = more seller pressure = bigger discount
  if (input.leverageScore) {
    discount -= (input.leverageScore - 50) * 0.1; // 50=neutral, 80=-3%, 20=+3%
  }
  // DOM influence: longer on market = more room
  if (input.daysOnMarket && input.daysOnMarket > 60) {
    discount += Math.min((input.daysOnMarket - 60) * 0.05, 3);
  }
  // Competition reduces discount
  if (input.competingOffers && input.competingOffers > 0) {
    discount -= input.competingOffers * 1.5;
  }
  return discount;
}

function buildScenario(
  name: string,
  input: OfferInput,
  pricePct: number, // % of list price (e.g., 0.95 = 5% below)
  earnestPct: number,
  closingDays: number,
  contingencies: string[],
  riskLevel: "low" | "medium" | "high",
): OfferScenario {
  const price = Math.round(input.listPrice * pricePct);
  const priceVsListPct = Number(((pricePct - 1) * 100).toFixed(1));
  const earnestMoney = Math.round(price * earnestPct);

  // Competitiveness: higher price + fewer contingencies + faster close = more competitive
  let competitiveness = 50;
  competitiveness += priceVsListPct * 3; // above list = more competitive
  competitiveness -= contingencies.length * 8; // fewer = more competitive
  competitiveness += (45 - closingDays) * 0.5; // faster = more competitive
  competitiveness = Math.max(0, Math.min(100, Math.round(competitiveness)));

  return {
    name,
    price,
    priceVsListPct,
    earnestMoney,
    closingDays,
    contingencies,
    competitivenessScore: competitiveness,
    riskLevel,
    explanation: "",
  };
}

export function generateOfferScenarios(input: OfferInput): OfferOutput {
  const baseDiscount = computeBaseDiscount(input);
  const reference = input.fairValue ?? input.listPrice;

  // Scenario 1: Aggressive — maximize savings
  const aggressivePct = Math.max(
    0.85,
    reference / input.listPrice - 0.03 + baseDiscount / 100,
  );
  const aggressive = buildScenario(
    "Aggressive",
    input,
    aggressivePct,
    0.01,
    45,
    ["inspection", "financing", "appraisal"],
    "low",
  );
  aggressive.explanation = `Opens ${Math.abs(aggressive.priceVsListPct)}% below list. Full contingency protection. Best savings if seller accepts, but higher rejection risk.`;

  // Scenario 2: Balanced — fair market
  const balancedPct = Math.max(
    0.9,
    reference / input.listPrice + baseDiscount / 200,
  );
  const balanced = buildScenario(
    "Balanced",
    input,
    balancedPct,
    0.02,
    35,
    ["inspection", "financing"],
    "medium",
  );
  balanced.explanation = `Near fair value at ${balanced.priceVsListPct > 0 ? "+" : ""}${balanced.priceVsListPct}% vs list. Standard terms. Good balance of savings and acceptance probability.`;

  // Scenario 3: Competitive — maximize win probability
  const competitivePct = Math.min(
    1.05,
    reference / input.listPrice + 0.02 + baseDiscount / 300,
  );
  const competitive = buildScenario(
    "Competitive",
    input,
    competitivePct,
    0.03,
    30,
    ["inspection"],
    "high",
  );
  competitive.explanation = `Strong offer at ${competitive.priceVsListPct > 0 ? "+" : ""}${competitive.priceVsListPct}% vs list. Minimal contingencies, fast close. Highest win probability but less protection.`;

  const scenarios = [aggressive, balanced, competitive];

  // Cap to buyer budget if set
  if (input.buyerMaxBudget) {
    for (const s of scenarios) {
      if (s.price > input.buyerMaxBudget) {
        s.price = input.buyerMaxBudget;
        s.priceVsListPct = Number(
          ((s.price / input.listPrice - 1) * 100).toFixed(1),
        );
        s.earnestMoney = Math.round(s.price * 0.02);
      }
    }
  }

  // Recommend balanced by default, competitive if competing offers
  const recommendedIndex =
    input.competingOffers && input.competingOffers > 0 ? 2 : 1;

  return {
    scenarios,
    recommendedIndex,
    inputSummary: `List: $${input.listPrice.toLocaleString()}, Fair value: $${(input.fairValue ?? input.listPrice).toLocaleString()}, Leverage: ${input.leverageScore ?? "N/A"}, DOM: ${input.daysOnMarket ?? "N/A"}`,
    refreshable: true,
  };
}
