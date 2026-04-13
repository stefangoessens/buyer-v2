import type { CostInput, CostOutput, CostLineItem, CostAssumptions } from "./types";

const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  interestRate: 0.065,
  downPaymentPct: 0.20,
  propertyTaxRate: 0.0185,
  maintenancePct: 0.01,
  pmiRate: 0.005,
  closingCostPct: 0.03,
};

/** Monthly mortgage P&I via standard amortization formula */
export function calculateMortgagePayment(principal: number, annualRate: number, years: number = 30): number {
  if (principal <= 0 || annualRate <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const n = years * 12;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
}

/** FL hazard insurance estimation */
export function estimateFlInsurance(
  propertyValue: number,
  roofYear?: number,
  yearBuilt?: number,
  impactWindows?: boolean,
  stormShutters?: boolean,
  constructionType?: string,
): { low: number; mid: number; high: number } {
  // Base rate: ~$8.33 per $1,000 of value (FL avg ~$2,500/yr per $300k)
  const baseAnnual = propertyValue * 0.00833;

  // Roof age factor
  const currentYear = new Date().getFullYear();
  const roofAge = roofYear ? currentYear - roofYear : (yearBuilt ? currentYear - yearBuilt : 20);
  let roofFactor = 1.0;
  if (roofAge < 5) roofFactor = 1.0;
  else if (roofAge < 10) roofFactor = 1.2;
  else if (roofAge < 15) roofFactor = 1.5;
  else if (roofAge < 20) roofFactor = 2.0;
  else roofFactor = 2.5;

  // Wind mitigation discounts
  let windDiscount = 1.0;
  if (impactWindows || stormShutters) windDiscount -= 0.15;
  if (constructionType?.toUpperCase() === "CBS") windDiscount -= 0.05;

  const adjusted = baseAnnual * roofFactor * Math.max(windDiscount, 0.7);

  return {
    low: Math.round(adjusted * 0.8),
    mid: Math.round(adjusted),
    high: Math.round(adjusted * 1.3),
  };
}

/** FL flood insurance estimation by FEMA zone */
export function estimateFloodInsurance(floodZone?: string): { low: number; mid: number; high: number } {
  if (!floodZone) return { low: 0, mid: 0, high: 0 };
  // Normalize: strip trailing digits/suffixes (e.g., "AE1" → "AE", "X500" → "X")
  const zone = floodZone.toUpperCase().replace(/[0-9]+$/, "").trim();
  if (zone === "VE" || zone === "V") return { low: 3000, mid: 5000, high: 8000 };
  if (zone === "AE" || zone === "A" || zone === "AO" || zone === "AH" || zone === "AR") return { low: 1500, mid: 2500, high: 4000 };
  if (zone === "X" || zone === "B" || zone === "C" || zone === "D") return { low: 400, mid: 600, high: 900 };
  return { low: 0, mid: 0, high: 0 };
}

/** Compute full ownership cost breakdown */
export function computeOwnershipCosts(input: CostInput): CostOutput {
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...input.assumptions };
  const price = input.purchasePrice;

  const downPayment = price * assumptions.downPaymentPct;
  const loanAmount = price - downPayment;
  const closingCosts = price * assumptions.closingCostPct;

  const lineItems: CostLineItem[] = [];

  // 1. Mortgage P&I
  const monthlyPI = calculateMortgagePayment(loanAmount, assumptions.interestRate);
  lineItems.push({
    category: "mortgage", label: "Principal & Interest",
    monthlyLow: Math.round(monthlyPI), monthlyMid: Math.round(monthlyPI), monthlyHigh: Math.round(monthlyPI),
    annualMid: Math.round(monthlyPI * 12),
    source: "assumption", notes: `${(assumptions.interestRate * 100).toFixed(1)}% rate, ${(assumptions.downPaymentPct * 100)}% down, 30yr fixed`,
  });

  // 2. Property tax
  const annualTax = input.taxAnnual ?? (input.taxAssessedValue ?? price) * assumptions.propertyTaxRate;
  lineItems.push({
    category: "tax", label: "Property Tax",
    monthlyLow: Math.round(annualTax * 0.9 / 12), monthlyMid: Math.round(annualTax / 12), monthlyHigh: Math.round(annualTax * 1.1 / 12),
    annualMid: Math.round(annualTax),
    source: input.taxAnnual ? "fact" : "estimate", notes: input.taxAnnual ? "From listing data" : `Estimated at ${(assumptions.propertyTaxRate * 100).toFixed(2)}% rate`,
  });

  // 3. HOA
  if (input.hoaFee && input.hoaFee > 0) {
    const monthly = input.hoaFrequency === "annual" ? input.hoaFee / 12 : input.hoaFrequency === "quarterly" ? input.hoaFee / 3 : input.hoaFee;
    lineItems.push({
      category: "hoa", label: "HOA",
      monthlyLow: Math.round(monthly), monthlyMid: Math.round(monthly), monthlyHigh: Math.round(monthly),
      annualMid: Math.round(monthly * 12),
      source: "fact", notes: "From listing data",
    });
  }

  // 4. Homeowners insurance (FL-specific)
  const insurance = estimateFlInsurance(price, input.roofYear, input.yearBuilt, input.impactWindows, input.stormShutters, input.constructionType);
  lineItems.push({
    category: "insurance", label: "Homeowners Insurance (FL estimate)",
    monthlyLow: Math.round(insurance.low / 12), monthlyMid: Math.round(insurance.mid / 12), monthlyHigh: Math.round(insurance.high / 12),
    annualMid: insurance.mid,
    source: "estimate", notes: "FL hazard insurance estimate — not a quote. Based on value, roof age, wind mitigation.",
  });

  // 5. Flood insurance
  const flood = estimateFloodInsurance(input.floodZone);
  if (flood.mid > 0) {
    lineItems.push({
      category: "flood", label: "Flood Insurance",
      monthlyLow: Math.round(flood.low / 12), monthlyMid: Math.round(flood.mid / 12), monthlyHigh: Math.round(flood.high / 12),
      annualMid: flood.mid,
      source: "estimate", notes: `FEMA zone ${input.floodZone} — estimate, not a quote`,
    });
  }

  // 6. PMI (if < 20% down)
  if (assumptions.downPaymentPct < 0.20) {
    const monthlyPMI = loanAmount * assumptions.pmiRate / 12;
    lineItems.push({
      category: "pmi", label: "PMI",
      monthlyLow: Math.round(monthlyPMI * 0.8), monthlyMid: Math.round(monthlyPMI), monthlyHigh: Math.round(monthlyPMI * 1.2),
      annualMid: Math.round(monthlyPMI * 12),
      source: "estimate", notes: `Estimated at ${(assumptions.pmiRate * 100).toFixed(1)}% of loan/yr — removed at 20% equity`,
    });
  }

  // 7. Maintenance
  const monthlyMaint = price * assumptions.maintenancePct / 12;
  lineItems.push({
    category: "maintenance", label: "Maintenance Reserve",
    monthlyLow: Math.round(monthlyMaint * 0.5), monthlyMid: Math.round(monthlyMaint), monthlyHigh: Math.round(monthlyMaint * 1.5),
    annualMid: Math.round(monthlyMaint * 12),
    source: "assumption", notes: `${(assumptions.maintenancePct * 100)}% of value annually`,
  });

  const totalLow = lineItems.reduce((s, i) => s + i.monthlyLow, 0);
  const totalMid = lineItems.reduce((s, i) => s + i.monthlyMid, 0);
  const totalHigh = lineItems.reduce((s, i) => s + i.monthlyHigh, 0);

  return {
    lineItems,
    totalMonthlyLow: totalLow,
    totalMonthlyMid: totalMid,
    totalMonthlyHigh: totalHigh,
    totalAnnual: totalMid * 12,
    upfrontCosts: { downPayment: Math.round(downPayment), closingCosts: Math.round(closingCosts), total: Math.round(downPayment + closingCosts) },
    assumptions,
    disclaimers: [
      "All insurance figures are estimates, not quotes. Actual premiums may vary significantly.",
      "FL hazard insurance rates are volatile and subject to carrier availability.",
      "Property tax may change after reassessment following purchase.",
      "Consult a mortgage lender for precise payment calculations.",
    ],
  };
}
